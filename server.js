// ============================================
// KANTIN PAYMENT SYSTEM - Node.js Server
// ============================================

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Data storage file
const DATA_FILE = './data/cards.json';

// In-memory data
let cards = [];
let pendingTransaction = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

function loadData() {
  try {
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data');
    }
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      cards = JSON.parse(data);
      console.log(`📂 Loaded ${cards.length} cards from database`);
    } else {
      cards = [];
      saveData();
    }
  } catch (err) {
    console.error('Error loading data:', err);
    cards = [];
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2));
    console.log('💾 Data saved');
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function findCardByUID(uid) {
  return cards.find(c => c.uid === uid);
}

function resetDailyBalance(card) {
  const today = getTodayDate();
  if (card.lastResetDate !== today) {
    card.balance = card.initialBalance;
    card.lastResetDate = today;
    console.log(`🔄 Daily reset applied for ${card.name}`);
    return true;
  }
  return false;
}

// ============================================
// API ENDPOINTS
// ============================================

// Card tap from ESP8266
app.post('/api/card-tap', (req, res) => {
  const { uid } = req.body;
  
  if (!uid) {
    return res.status(400).json({ error: 'UID required' });
  }
  
  console.log(`\n[CARD TAP] UID: ${uid}`);
  
  let card = findCardByUID(uid);
  
  if (!card) {
    console.log('❌ Card not registered');
    pendingTransaction = {
      uid: uid,
      status: 'not_registered',
      timestamp: Date.now()
    };
    return res.json({ 
      success: false, 
      message: 'Card not registered' 
    });
  }
  
  // Apply daily reset if needed
  resetDailyBalance(card);
  
  // Set pending transaction
  pendingTransaction = {
    uid: uid,
    name: card.name,
    balance: card.balance,
    status: 'waiting_amount',
    timestamp: Date.now()
  };
  
  console.log(`✅ Card found: ${card.name} | Balance: Rp ${card.balance.toLocaleString('id-ID')}`);
  
  res.json({ 
    success: true, 
    message: 'Card detected',
    card: {
      uid: card.uid,
      name: card.name,
      balance: card.balance
    }
  });
});

// Get pending transaction
app.get('/api/pending', (req, res) => {
  res.json(pendingTransaction);
});

// Clear pending transaction
app.post('/api/clear-pending', (req, res) => {
  pendingTransaction = null;
  res.json({ success: true });
});

// Process payment
app.post('/api/payment', (req, res) => {
  const { uid, amount } = req.body;
  
  if (!uid || !amount) {
    return res.status(400).json({ error: 'UID and amount required' });
  }
  
  const card = findCardByUID(uid);
  
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  
  // Apply daily reset if needed
  resetDailyBalance(card);
  
  const paymentAmount = parseInt(amount);
  
  if (card.balance < paymentAmount) {
    console.log(`❌ PAYMENT FAILED - Insufficient balance`);
    return res.json({
      success: false,
      message: 'Saldo tidak cukup',
      balance: card.balance
    });
  }
  
  // Process payment
  card.balance -= paymentAmount;
  card.lastTransaction = {
    amount: paymentAmount,
    timestamp: new Date().toISOString()
  };
  
  saveData();
  
  console.log(`✅ PAYMENT SUCCESS - ${card.name} paid Rp ${paymentAmount.toLocaleString('id-ID')}`);
  console.log(`   Remaining balance: Rp ${card.balance.toLocaleString('id-ID')}`);
  
  pendingTransaction = null;
  
  res.json({
    success: true,
    message: 'Pembayaran berhasil',
    balance: card.balance,
    paid: paymentAmount
  });
});

// Get all cards
app.get('/api/cards', (req, res) => {
  const cardsData = cards.map(c => {
    const today = getTodayDate();
    const needsReset = c.lastResetDate !== today;
    
    return {
      uid: c.uid,
      name: c.name,
      balance: needsReset ? c.initialBalance : c.balance,
      initialBalance: c.initialBalance,
      lastResetDate: c.lastResetDate,
      needsReset: needsReset
    };
  });
  
  res.json(cardsData);
});

// Register new card
app.post('/api/register', (req, res) => {
  const { uid, name, initialBalance } = req.body;
  
  if (!uid || !name || initialBalance === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (findCardByUID(uid)) {
    return res.status(400).json({ error: 'Card already registered' });
  }
  
  const today = getTodayDate();
  
  const newCard = {
    uid: uid,
    name: name,
    initialBalance: parseInt(initialBalance),
    balance: parseInt(initialBalance),
    lastResetDate: today,
    registeredAt: new Date().toISOString()
  };
  
  cards.push(newCard);
  saveData();
  
  console.log(`✅ New card registered: ${name} (${uid})`);
  
  res.json({ 
    success: true, 
    message: 'Card registered successfully',
    card: newCard
  });
});

// Delete card
app.delete('/api/cards/:uid', (req, res) => {
  const { uid } = req.params;
  
  const index = cards.findIndex(c => c.uid === uid);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Card not found' });
  }
  
  const deletedCard = cards.splice(index, 1)[0];
  saveData();
  
  console.log(`🗑️ Card deleted: ${deletedCard.name} (${uid})`);
  
  res.json({ 
    success: true, 
    message: 'Card deleted successfully' 
  });
});

// Top up card
app.post('/api/topup', (req, res) => {
  const { uid, amount } = req.body;
  
  if (!uid || !amount) {
    return res.status(400).json({ error: 'UID and amount required' });
  }
  
  const card = findCardByUID(uid);
  
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  
  const topupAmount = parseInt(amount);
  card.balance += topupAmount;
  
  saveData();
  
  console.log(`💰 Top up: ${card.name} +Rp ${topupAmount.toLocaleString('id-ID')}`);
  console.log(`   New balance: Rp ${card.balance.toLocaleString('id-ID')}`);
  
  res.json({
    success: true,
    message: 'Top up successful',
    balance: card.balance
  });
});

// Wipe all data
app.post('/api/wipe', (req, res) => {
  cards = [];
  saveData();
  console.log('⚠️ All data wiped');
  res.json({ success: true, message: 'All data deleted' });
});


// ============================================
// START SERVER
// ============================================

loadData();

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n============================================');
  console.log('🍽️  KANTIN PAYMENT SYSTEM SERVER');
  console.log('============================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT}`);
  console.log(`📱 From other devices: http://YOUR_IP:${PORT}`);
  console.log('============================================\n');
});