const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

const USERS_FILE = 'users.json';
const TRANSACTIONS_FILE = 'transactions.json';
const INVESTMENTS_FILE = 'investments.json';

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(TRANSACTIONS_FILE)) fs.writeFileSync(TRANSACTIONS_FILE, '[]');
if (!fs.existsSync(INVESTMENTS_FILE)) fs.writeFileSync(INVESTMENTS_FILE, '[]');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'delux-secret', resave: false, saveUninitialized: true }));

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function logTransaction(email, type, amount) {
  const transaction = { email, type, amount, date: new Date().toISOString() };
  let transactions = [];
  if (fs.existsSync(TRANSACTIONS_FILE)) {
    transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE));
  }
  transactions.push(transaction);
  fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
}

function readInvestments() {
  return JSON.parse(fs.readFileSync(INVESTMENTS_FILE));
}

function saveInvestments(investments) {
  fs.writeFileSync(INVESTMENTS_FILE, JSON.stringify(investments, null, 2));
}

// Register
app.post('/register', (req, res) => {
  const { fullName, email, phoneNumber, pin } = req.body;
  let users = readUsers();

  if (users.find(u => u.email === email || u.phoneNumber === phoneNumber)) {
    return res.send("Email or phone number already registered.");
  }

  const newUser = {
    fullName,
    email,
    phoneNumber,
    pin,
    balance: 1800,
    transactions: [
      {
        type: 'Credit',
        description: 'Delux Welcome Bonus',
        amount: 1800,
        date: new Date().toLocaleString(),
        balanceAfterTransaction: 150,
      }
    ]
  };

  users.push(newUser);
  saveUsers(users);

  req.session.user = email;

  res.send(`<h2>Registration Successful!</h2> <p>Redirecting to dashboard...</p> <script>setTimeout(() => window.location.href = '/dashboard.html', 2000);</script>`);
});

// Login
app.post('/login', (req, res) => {
  const { email, pin } = req.body;
  const users = readUsers();
  const user = users.find(u => (u.email === email || u.phoneNumber === email) && u.pin === pin);

  if (!user) return res.send("Invalid credentials.");

  req.session.user = user.email;

  res.send(`<h2>Login Successful!</h2> <p>Redirecting to dashboard...</p> <script>setTimeout(() => window.location.href = '/dashboard.html', 2000);</script>`);
});

// User Info
app.get('/user-info', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  const users = readUsers();
  const user = users.find(u => u.email === req.session.user);

  res.json({ fullName: user.fullName, balance: user.balance });
});

// Withdraw
app.post('/withdraw', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  const { amount } = req.body;
  const withdrawalAmount = parseFloat(amount);

  const users = readUsers();
  const user = users.find(u => u.email === req.session.user);

  if (user.balance < withdrawalAmount || withdrawalAmount < 100) {
    return res.send("Insufficient funds or amount below the minimum withdrawal limit of 200€.");
  }

  user.balance -= withdrawalAmount;
  user.transactions.push({ type: "Withdrawal", amount: withdrawalAmount, date: new Date().toISOString() });

  saveUsers(users);
  logTransaction(user.email, 'Withdrawal', withdrawalAmount);

  res.send(`<h2>Withdrawal Successful!</h2> <p>${withdrawalAmount}€ has been debited from your account.</p> <p>Redirecting to transaction history...</p> <script>setTimeout(() => window.location.href = '/transaction-history.html', 2000);</script>`);
});

// Wire Transfer without login (senderEmail required in form)
app.post('/wire', (req, res) => {
  const { senderEmail, recipientEmail, amount } = req.body;
  const wireAmount = parseFloat(amount);

  if (!senderEmail || !recipientEmail || isNaN(wireAmount) || wireAmount <= 0) {
    return res.send("Invalid input.");
  }

  let users = readUsers();
  const sender = users.find(u => u.email === senderEmail);
  const recipient = users.find(u => u.email === recipientEmail);

  if (!sender) {
    return res.send("Invalid sender email.");
  }

  if (!recipient) {
    return res.send("Invalid recipient email.");
  }

  if (sender.balance < wireAmount) {
    return res.send("Sender has insufficient funds.");
  }

  sender.balance -= wireAmount;
  recipient.balance += wireAmount;

  const now = new Date().toISOString();

  sender.transactions.push({ type: "Wire Sent", to: recipientEmail, amount: wireAmount, date: now });
  recipient.transactions.push({ type: "Wire Received", from: senderEmail, amount: wireAmount, date: now });

  saveUsers(users);
  logTransaction(sender.email, 'Wire Sent', wireAmount);
  logTransaction(recipient.email, 'reward Received', wireAmount);

  res.send(`<h2>Wire Transfer Successful!</h2> <p>${wireAmount}€ sent from ${senderEmail} to ${recipientEmail}.</p> <script>setTimeout(() => window.location.href = '/wire.html', 3000);</script>`);
});

// Transaction History
app.get('/transaction-history', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  const users = readUsers();
  const user = users.find(u => u.email === req.session.user);

  res.json({ transactions: user.transactions });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Invest
app.post('/invest', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  const { amount, duration } = req.body;
  const investAmount = parseFloat(amount);
  const investDays = parseInt(duration);

  if (investAmount < 100) {
    return res.send("Minimum investment is 100€.");
  }

  const users = readUsers();
  const user = users.find(u => u.email === req.session.user);

  if (user.balance < investAmount) {
    return res.send("Insufficient balance for investment.");
  }

  const investments = readInvestments();
  const now = new Date();
  const completeDate = new Date(now);
  completeDate.setDate(completeDate.getDate() + investDays);
  const returnAmount = investAmount * 3;

  user.balance -= investAmount;
  user.transactions.push({ type: "Investment", amount: investAmount, date: now.toISOString() });

  investments.push({
    email: user.email,
    amount: investAmount,
    returnAmount,
    duration: investDays,
    startDate: now.toISOString(),
    completeDate: completeDate.toISOString(),
    status: 'running'
  });

  saveUsers(users);
  saveInvestments(investments);
  logTransaction(user.email, 'Investment', investAmount);

  res.send(`<h2>Investment Started!</h2> <p>You have invested ${investAmount}€ for ${investDays} days.</p> <p>Total Return: ${returnAmount}€ after ${investDays} days.</p> <p>Loading...</p> <script> setTimeout(() => window.location.href = '/investments.html', 5000); </script>`);
});

// My Investments
app.get('/my-investments', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  const investments = readInvestments();
  const userInvests = investments.filter(i => i.email === req.session.user);

  res.json({ investments: userInvests });
});

// Process Investments (Manual Trigger)
app.get('/process-investments', (req, res) => {
  const investments = readInvestments();
  const users = readUsers();
  let changesMade = false;
  const now = new Date();

  for (let invest of investments) {
    if (invest.status === 'running' && new Date(invest.completeDate) <= now) {
      invest.status = 'completed';
      const user = users.find(u => u.email === invest.email);
      if (user) {
        user.balance += invest.returnAmount;
        user.transactions.push({ type: "Investment Return", amount: invest.returnAmount, date: now.toISOString() });
        logTransaction(user.email, 'Investment Return', invest.returnAmount);
        changesMade = true;
      }
    }
  }

  if (changesMade) {
    saveInvestments(investments);
    saveUsers(users);
  }

  res.send("Investment processing complete.");
});

app.listen(PORT, () => {
  console.log(`Delux Euro Wallet is running on http://localhost:${PORT}`);
});