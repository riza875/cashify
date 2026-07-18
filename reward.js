// /api/reward.js
// Endpoint ini dipanggil oleh Adsgram (GET request) setiap kali user
// selesai menonton reward ad sampai habis.
//
// URL yang didaftarkan di Adsgram (kolom "Reward URL"):
//   https://cashify-phi.vercel.app/api/reward?userid=[userId]
//
// Adsgram akan otomatis mengganti [userId] dengan Telegram user ID
// dari user yang menonton iklan.

const admin = require('firebase-admin');

// ==== Inisialisasi Firebase Admin (sekali saja) ====
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Private key disimpan di env var, perlu replace \n karena env var
      // biasanya menyimpannya sebagai string literal "\n"
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// ==== Konfigurasi reward ====
// Ubah sesuai kebutuhan CASHIFY, misal: setiap nonton iklan dapat 100 poin
const REWARD_AMOUNT = 100;

module.exports = async (req, res) => {
  // Adsgram mengirim GET request
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { userid } = req.query;

  if (!userid) {
    return res.status(400).json({ success: false, message: 'Missing userid parameter' });
  }

  try {
    const userRef = db.collection('users').doc(String(userid));
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      // Kalau user belum ada di Firestore, kamu bisa pilih:
      // - buat user baru dengan saldo awal reward, atau
      // - tolak request
      // Di sini kita buat user baru sebagai contoh default.
      await userRef.set(
        {
          balance: REWARD_AMOUNT,
          lastRewardAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      // Tambahkan reward ke saldo user yang sudah ada
      await userRef.update({
        balance: admin.firestore.FieldValue.increment(REWARD_AMOUNT),
        lastRewardAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Opsional: catat log reward untuk histori/anti-fraud
    await db.collection('rewardLogs').add({
      userId: String(userid),
      amount: REWARD_AMOUNT,
      source: 'adsgram',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Reward callback error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
