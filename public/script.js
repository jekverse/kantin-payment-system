/* ===================================================
   Kantin Payment System - Frontend Logic (script.js)
   Terhubung ke server Node.js lewat REST API
   =================================================== */

// Variabel global
let currentPending = null;

// =======================
// 🔹 Format helper
// =======================
function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

// =======================
// 🔹 Mengecek kartu yang di-tap (dari ESP8266)
// =======================
async function checkPending() {
  // Jika user sedang mengetik jumlah pembayaran, jangan auto-refresh
  const paymentInput = document.getElementById("paymentAmount");
  if (paymentInput && document.activeElement === paymentInput) return;

  try {
    const res = await fetch("/api/pending");
    const pending = await res.json();

    const box = document.getElementById("pendingBox");
    const form = document.getElementById("paymentForm");

    // Kartu terdeteksi & menunggu input nominal
    if (pending && pending.status === "waiting_amount") {
      currentPending = pending;

      box.className = "pending-transaction waiting";
      box.innerHTML = `
        <div class='pending-info'>
          <div>Kartu Terdeteksi!</div>
          <div class='name'>${pending.name}</div>
          <div class='balance'>Saldo: ${formatRupiah(pending.balance)}</div>
        </div>
      `;

      form.innerHTML = `
        <div class='form-group'>
          <label>Jumlah Pembayaran (Rp):</label>
          <input type='number' id='paymentAmount' placeholder='15000' step='1000' autofocus>
        </div>
        <div class='quick-amount'>
          ${[5000, 10000, 15000, 20000, 25000, 30000]
            .map(
              (amt) => `<button class='btn-primary' onclick='setAmount(${amt})'>${formatRupiah(amt)}</button>`
            )
            .join("")}
        </div>
        <button class='btn-success btn-large' onclick='processPayment()'>✅ PROSES PEMBAYARAN</button>
        <button class='btn-danger' onclick='cancelPayment()'>❌ Batal</button>
      `;

      // Auto-fill UID untuk form register
      document.getElementById("regUID").value = pending.uid;

    // Kartu belum terdaftar
    } else if (pending && pending.status === "not_registered") {
      box.className = "pending-transaction";
      box.innerHTML = `
        <div class='pending-info'>
          <div>⚠️ Kartu Belum Terdaftar!</div>
          <div class='name'>UID: ${pending.uid}</div>
          <div>Silakan daftarkan kartu terlebih dahulu</div>
        </div>
      `;
      form.innerHTML = `
        <p style='color: #999; text-align: center; padding: 40px 0;'>
          Kartu belum terdaftar. Silakan daftarkan di form "Daftar Kartu Baru"
        </p>
      `;

      document.getElementById("regUID").value = pending.uid;

    // Tidak ada kartu
    } else {
      currentPending = null;
      box.className = "pending-transaction idle";
      box.innerHTML = `
        <div class='pending-info'>
          <div>Menunggu kartu di-tap...</div>
        </div>
      `;
      form.innerHTML = `
        <p style='color: #999; text-align: center; padding: 40px 0;'>
          Silakan tap kartu terlebih dahulu
        </p>
      `;
    }

  } catch (err) {
    console.error("❌ Error checking pending:", err);
  }
}

// =======================
// 🔹 Fungsi bantu nominal cepat
// =======================
function setAmount(amount) {
  document.getElementById("paymentAmount").value = amount;
}

// =======================
// 🔹 Proses pembayaran
// =======================
async function processPayment() {
  if (!currentPending) {
    alert("Tidak ada transaksi pending!");
    return;
  }

  const amount = document.getElementById("paymentAmount").value;
  if (!amount || amount <= 0) {
    alert("Masukkan jumlah pembayaran!");
    return;
  }

  try {
    const res = await fetch("/api/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: currentPending.uid,
        amount: parseInt(amount),
      }),
    });

    const data = await res.json();

    if (data.success) {
      alert(
        `✅ PEMBAYARAN BERHASIL!\n\nNama: ${currentPending.name}\nDibayar: ${formatRupiah(
          data.paid
        )}\nSisa Saldo: ${formatRupiah(data.balance)}`
      );
      await fetch("/api/clear-pending", { method: "POST" });
      loadCards();
    } else {
      alert(
        `❌ PEMBAYARAN GAGAL!\n\n${data.message}\nSaldo saat ini: ${formatRupiah(
          data.balance
        )}`
      );
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// =======================
// 🔹 Batalkan transaksi
// =======================
async function cancelPayment() {
  await fetch("/api/clear-pending", { method: "POST" });
  checkPending();
}

// =======================
// 🔹 Muat ulang daftar kartu
// =======================
async function loadCards() {
  try {
    const res = await fetch("/api/cards");
    const cards = await res.json();
    const list = document.getElementById("cardList");

    if (cards.length === 0) {
      list.innerHTML =
        '<p style="color: #999; text-align: center; padding: 20px;">Belum ada kartu terdaftar</p>';
    } else {
      list.innerHTML = cards
        .map(
          (c) => `
          <div class='card-item'>
            <div class='card-info'>
              <strong>${c.name}</strong> <small>(${c.uid})</small>
              <div class='balance'>Saldo: ${formatRupiah(c.balance)}</div>
              <small style='color: #999;'>Saldo Harian: ${formatRupiah(
                c.initialBalance
              )}</small>
            </div>
          </div>`
        )
        .join("");
    }

    // Update dropdowns
    const options =
      '<option value="">-- Pilih Kartu --</option>' +
      cards
        .map(
          (c) => `<option value="${c.uid}">${c.name} (${c.uid})</option>`
        )
        .join("");

    document.getElementById("topupUID").innerHTML = options;
    document.getElementById("deleteUID").innerHTML = options;
  } catch (err) {
    console.error("Error loading cards:", err);
  }
}

// =======================
// 🔹 Registrasi kartu baru
// =======================
async function registerCard() {
  const uid = document.getElementById("regUID").value.trim();
  const name = document.getElementById("regName").value.trim();
  const balance = document.getElementById("regBalance").value;

  if (!uid || !name || !balance) {
    alert("Lengkapi semua field!");
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: uid,
        name: name,
        initialBalance: parseInt(balance),
      }),
    });

    const data = await res.json();

    if (data.success) {
      alert("✅ Kartu berhasil didaftarkan!");
      document.getElementById("regUID").value = "";
      document.getElementById("regName").value = "";
      document.getElementById("regBalance").value = "40000";
      await fetch("/api/clear-pending", { method: "POST" });
      loadCards();
    } else {
      alert("❌ " + data.error);
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// =======================
// 🔹 Top Up saldo
// =======================
async function topupCard() {
  const uid = document.getElementById("topupUID").value;
  const amount = document.getElementById("topupAmount").value;

  if (!uid || !amount) {
    alert("Pilih kartu dan masukkan jumlah!");
    return;
  }

  try {
    const res = await fetch("/api/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: uid,
        amount: parseInt(amount),
      }),
    });

    const data = await res.json();

    if (data.success) {
      alert(`✅ Top up berhasil!\nSaldo baru: ${formatRupiah(data.balance)}`);
      document.getElementById("topupAmount").value = "";
      loadCards();
    } else {
      alert("❌ " + data.error);
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// =======================
// 🔹 Hapus kartu
// =======================
async function deleteCard() {
  const uid = document.getElementById("deleteUID").value;
  if (!uid) {
    alert("Pilih kartu yang akan dihapus!");
    return;
  }

  if (!confirm("Yakin ingin menghapus kartu ini?")) return;

  try {
    const res = await fetch(`/api/cards/${uid}`, { method: "DELETE" });
    const data = await res.json();

    if (data.success) {
      alert("✅ Kartu berhasil dihapus!");
      loadCards();
    } else {
      alert("❌ " + data.error);
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// =======================
// 🔹 Hapus semua data
// =======================
async function wipeAll() {
  if (!confirm("HAPUS SEMUA DATA?\nTindakan ini tidak bisa dibatalkan!")) return;
  if (!confirm("Anda yakin? Data tidak bisa dikembalikan!")) return;

  try {
    const res = await fetch("/api/wipe", { method: "POST" });
    const data = await res.json();

    if (data.success) {
      alert("⚠️ Semua data telah dihapus!");
      loadCards();
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// =======================
// 🔹 Inisialisasi otomatis
// =======================
loadCards();
setInterval(checkPending, 5000);  // cek kartu setiap 5 detik
setInterval(loadCards, 10000);    // refresh daftar kartu setiap 10 detik
