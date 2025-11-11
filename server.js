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
// HTML INTERFACE
// ============================================

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>Kantin Payment System</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      color: white;
      margin-bottom: 30px;
      font-size: 2.5em;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .card h2 {
      margin-bottom: 20px;
      color: #333;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }
    .pending-transaction {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      min-height: 150px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .pending-transaction.waiting {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    }
    .pending-transaction.idle {
      background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
      color: #666;
    }
    .pending-info {
      text-align: center;
      font-size: 1.2em;
    }
    .pending-info .name {
      font-size: 2em;
      font-weight: bold;
      margin: 10px 0;
    }
    .pending-info .balance {
      font-size: 1.5em;
      margin: 10px 0;
    }
    input[type="number"], input[type="text"], select {
      width: 100%;
      padding: 12px;
      margin: 8px 0;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      transition: border 0.3s;
    }
    input:focus, select:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      padding: 12px 24px;
      margin: 8px 8px 8px 0;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }
    .btn-success {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: white;
    }
    .btn-success:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(17, 153, 142, 0.4);
    }
    .btn-danger {
      background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
      color: white;
    }
    .btn-danger:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(235, 51, 73, 0.4);
    }
    .btn-large {
      width: 100%;
      padding: 20px;
      font-size: 20px;
    }
    .card-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .card-item {
      background: #f8f9fa;
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border-left: 4px solid #667eea;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-info {
      flex: 1;
    }
    .card-info strong {
      font-size: 1.1em;
      color: #333;
    }
    .card-info .balance {
      color: #667eea;
      font-weight: bold;
      margin-top: 5px;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
      color: #555;
    }
    .quick-amount {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 10px 0;
    }
    .quick-amount button {
      margin: 0;
    }
    .alert {
      padding: 15px;
      border-radius: 8px;
      margin: 10px 0;
      font-weight: bold;
    }
    .alert-success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .alert-danger {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
  </style>
</head>
<body>
  <div class='container'>
    <h1>🍽️ Kantin Payment System</h1>
    
    <div class='pending-transaction idle' id='pendingBox'>
      <div class='pending-info'>
        <div>Menunggu kartu di-tap...</div>
      </div>
    </div>

    <div class='grid'>
      <div class='card'>
        <h2>💳 Input Pembayaran</h2>
        <div id='paymentForm'>
          <p style='color: #999; text-align: center; padding: 40px 0;'>
            Silakan tap kartu terlebih dahulu
          </p>
        </div>
      </div>

      <div class='card'>
        <h2>📋 Daftar Kartu Terdaftar</h2>
        <button class='btn-primary' onclick='loadCards()'>🔄 Refresh</button>
        <div class='card-list' id='cardList'></div>
      </div>
    </div>

    <div class='grid'>
      <div class='card'>
        <h2>➕ Daftar Kartu Baru</h2>
        <div class='form-group'>
          <label>UID:</label>
          <input type='text' id='regUID' placeholder='Tap kartu untuk mengisi otomatis'>
        </div>
        <div class='form-group'>
          <label>Nama:</label>
          <input type='text' id='regName' placeholder='Masukkan nama'>
        </div>
        <div class='form-group'>
          <label>Saldo Harian (Rp):</label>
          <input type='number' id='regBalance' value='40000' step='1000'>
        </div>
        <button class='btn-success btn-large' onclick='registerCard()'>✅ Daftarkan Kartu</button>
      </div>

      <div class='card'>
        <h2>💰 Top Up Saldo</h2>
        <div class='form-group'>
          <label>Pilih Kartu:</label>
          <select id='topupUID'></select>
        </div>
        <div class='form-group'>
          <label>Jumlah Top Up (Rp):</label>
          <input type='number' id='topupAmount' placeholder='10000' step='1000'>
        </div>
        <button class='btn-success btn-large' onclick='topupCard()'>💵 Top Up</button>
      </div>
    </div>

    <div class='grid'>
      <div class='card'>
        <h2>🗑️ Hapus Kartu</h2>
        <div class='form-group'>
          <label>Pilih Kartu:</label>
          <select id='deleteUID'></select>
        </div>
        <button class='btn-danger btn-large' onclick='deleteCard()'>🗑️ Hapus Kartu</button>
      </div>

      <div class='card'>
        <h2>⚠️ Danger Zone</h2>
        <button class='btn-danger btn-large' onclick='wipeAll()'>🗑️ HAPUS SEMUA DATA</button>
      </div>
    </div>
  </div>

  <script>
    let currentPending = null;

    function formatRupiah(amount) {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(amount);
    }

    async function checkPending() {
      // Jangan refresh kalau user sedang mengetik
      const paymentInput = document.getElementById('paymentAmount');
      if (paymentInput && document.activeElement === paymentInput) {
        return; // Skip refresh kalau sedang input
      }
      
      try {
        const res = await fetch('/api/pending');
        const pending = await res.json();
        
        const box = document.getElementById('pendingBox');
        const form = document.getElementById('paymentForm');
        
        if (pending && pending.status === 'waiting_amount') {
          currentPending = pending;
          
          // Update pending box
          box.className = 'pending-transaction waiting';
          box.innerHTML = \`
            <div class='pending-info'>
              <div>Kartu Terdeteksi!</div>
              <div class='name'>\${pending.name}</div>
              <div class='balance'>Saldo: \${formatRupiah(pending.balance)}</div>
            </div>
          \`;
          
          // Show payment form
          form.innerHTML = \`
            <div class='form-group'>
              <label>Jumlah Pembayaran (Rp):</label>
              <input type='number' id='paymentAmount' placeholder='15000' step='1000' autofocus>
            </div>
            <div class='quick-amount'>
              <button class='btn-primary' onclick='setAmount(5000)'>Rp 5.000</button>
              <button class='btn-primary' onclick='setAmount(10000)'>Rp 10.000</button>
              <button class='btn-primary' onclick='setAmount(15000)'>Rp 15.000</button>
              <button class='btn-primary' onclick='setAmount(20000)'>Rp 20.000</button>
              <button class='btn-primary' onclick='setAmount(25000)'>Rp 25.000</button>
              <button class='btn-primary' onclick='setAmount(30000)'>Rp 30.000</button>
            </div>
            <button class='btn-success btn-large' onclick='processPayment()'>✅ PROSES PEMBAYARAN</button>
            <button class='btn-danger' onclick='cancelPayment()'>❌ Batal</button>
          \`;
          
          // Auto-fill UID for registration
          document.getElementById('regUID').value = pending.uid;
          
        } else if (pending && pending.status === 'not_registered') {
          box.className = 'pending-transaction';
          box.innerHTML = \`
            <div class='pending-info'>
              <div>⚠️ Kartu Belum Terdaftar!</div>
              <div class='name'>UID: \${pending.uid}</div>
              <div>Silakan daftarkan kartu terlebih dahulu</div>
            </div>
          \`;
          form.innerHTML = \`
            <p style='color: #999; text-align: center; padding: 40px 0;'>
              Kartu belum terdaftar. Silakan daftarkan di form "Daftar Kartu Baru"
            </p>
          \`;
          
          // Auto-fill UID for registration
          document.getElementById('regUID').value = pending.uid;
          
        } else {
          currentPending = null;
          box.className = 'pending-transaction idle';
          box.innerHTML = \`
            <div class='pending-info'>
              <div>Menunggu kartu di-tap...</div>
            </div>
          \`;
          form.innerHTML = \`
            <p style='color: #999; text-align: center; padding: 40px 0;'>
              Silakan tap kartu terlebih dahulu
            </p>
          \`;
        }
      } catch (err) {
        console.error('Error checking pending:', err);
      }
    }

    function setAmount(amount) {
      document.getElementById('paymentAmount').value = amount;
    }

    async function processPayment() {
      if (!currentPending) {
        alert('Tidak ada transaksi pending!');
        return;
      }
      
      const amount = document.getElementById('paymentAmount').value;
      
      if (!amount || amount <= 0) {
        alert('Masukkan jumlah pembayaran!');
        return;
      }
      
      try {
        const res = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentPending.uid,
            amount: parseInt(amount)
          })
        });
        
        const data = await res.json();
        
        if (data.success) {
          alert(\`✅ PEMBAYARAN BERHASIL!\\n\\nNama: \${currentPending.name}\\nDibayar: \${formatRupiah(data.paid)}\\nSisa Saldo: \${formatRupiah(data.balance)}\`);
          await fetch('/api/clear-pending', { method: 'POST' });
          loadCards();
        } else {
          alert(\`❌ PEMBAYARAN GAGAL!\\n\\n\${data.message}\\nSaldo saat ini: \${formatRupiah(data.balance)}\`);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function cancelPayment() {
      await fetch('/api/clear-pending', { method: 'POST' });
      checkPending();
    }

    async function loadCards() {
      try {
        const res = await fetch('/api/cards');
        const cards = await res.json();
        
        const list = document.getElementById('cardList');
        
        if (cards.length === 0) {
          list.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Belum ada kartu terdaftar</p>';
        } else {
          list.innerHTML = cards.map(c => \`
            <div class='card-item'>
              <div class='card-info'>
                <strong>\${c.name}</strong> <small>(\${c.uid})</small>
                <div class='balance'>Saldo: \${formatRupiah(c.balance)}</div>
                <small style='color: #999;'>Saldo Harian: \${formatRupiah(c.initialBalance)}</small>
              </div>
            </div>
          \`).join('');
        }
        
        // Update dropdowns
        const options = '<option value="">-- Pilih Kartu --</option>' + 
          cards.map(c => \`<option value="\${c.uid}">\${c.name} (\${c.uid})</option>\`).join('');
        
        document.getElementById('topupUID').innerHTML = options;
        document.getElementById('deleteUID').innerHTML = options;
        
      } catch (err) {
        console.error('Error loading cards:', err);
      }
    }

    async function registerCard() {
      const uid = document.getElementById('regUID').value.trim();
      const name = document.getElementById('regName').value.trim();
      const balance = document.getElementById('regBalance').value;
      
      if (!uid || !name || !balance) {
        alert('Lengkapi semua field!');
        return;
      }
      
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: uid,
            name: name,
            initialBalance: parseInt(balance)
          })
        });
        
        const data = await res.json();
        
        if (data.success) {
          alert('✅ Kartu berhasil didaftarkan!');
          document.getElementById('regUID').value = '';
          document.getElementById('regName').value = '';
          document.getElementById('regBalance').value = '40000';
          await fetch('/api/clear-pending', { method: 'POST' });
          loadCards();
        } else {
          alert('❌ ' + data.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function topupCard() {
      const uid = document.getElementById('topupUID').value;
      const amount = document.getElementById('topupAmount').value;
      
      if (!uid || !amount) {
        alert('Pilih kartu dan masukkan jumlah!');
        return;
      }
      
      try {
        const res = await fetch('/api/topup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: uid,
            amount: parseInt(amount)
          })
        });
        
        const data = await res.json();
        
        if (data.success) {
          alert(\`✅ Top up berhasil!\\nSaldo baru: \${formatRupiah(data.balance)}\`);
          document.getElementById('topupAmount').value = '';
          loadCards();
        } else {
          alert('❌ ' + data.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function deleteCard() {
      const uid = document.getElementById('deleteUID').value;
      
      if (!uid) {
        alert('Pilih kartu yang akan dihapus!');
        return;
      }
      
      if (!confirm('Yakin ingin menghapus kartu ini?')) return;
      
      try {
        const res = await fetch(\`/api/cards/\${uid}\`, {
          method: 'DELETE'
        });
        
        const data = await res.json();
        
        if (data.success) {
          alert('✅ Kartu berhasil dihapus!');
          loadCards();
        } else {
          alert('❌ ' + data.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function wipeAll() {
      if (!confirm('HAPUS SEMUA DATA?\\nTindakan ini tidak bisa dibatalkan!')) return;
      if (!confirm('Anda yakin? Data tidak bisa dikembalikan!')) return;
      
      try {
        const res = await fetch('/api/wipe', {
          method: 'POST'
        });
        
        const data = await res.json();
        
        if (data.success) {
          alert('⚠️ Semua data telah dihapus!');
          loadCards();
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    // Auto refresh
    loadCards();
    setInterval(checkPending, 5000);  // Check pending setiap 2 detik
    setInterval(loadCards, 10000);    // Refresh card list setiap 10 detik
  </script>
</body>
</html>
  `);
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