const { getFirestore } = require("./firebase-admin");

async function getUsers() {
  const snap = await getFirestore().collection("users").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getUserProfile(uid) {
  const doc = await getFirestore().collection("users").doc(uid).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function isUsernameTaken(username) {
  const doc = await getFirestore().collection("usernames").doc(username).get();
  return doc.exists;
}

async function createUserProfile(uid, { username, displayName }) {
  const db = getFirestore();
  const name = username.trim().toLowerCase();
  const userRef = db.collection("users").doc(uid);
  const existingUser = await userRef.get();
  if (existingUser.exists) {
    return { id: uid, ...existingUser.data() };
  }
  const nameRef = db.collection("usernames").doc(name);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(nameRef);
    if (existing.exists) {
      throw new Error("此帳號已被使用");
    }
    const profile = {
      username: name,
      displayName: (displayName || name).trim() || name,
      createdAt: new Date().toISOString(),
    };
    tx.set(userRef, profile);
    tx.set(nameRef, { uid });
  });

  return getUserProfile(uid);
}

async function getCheckins() {
  const snap = await getFirestore().collection("checkins").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function findCheckinToday(userId, date) {
  const snap = await getFirestore()
    .collection("checkins")
    .where("userId", "==", userId)
    .where("date", "==", date)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function addCheckin(record) {
  const ref = await getFirestore().collection("checkins").add(record);
  return { id: ref.id, ...record };
}

async function getMonthlyWinners() {
  const snap = await getFirestore()
    .collection("monthly_winners")
    .orderBy("month")
    .get();
  return snap.docs.map((d) => d.data());
}

async function saveMonthlyWinner(record) {
  await getFirestore()
    .collection("monthly_winners")
    .doc(record.month)
    .set(record);
}

async function hasMonthlyWinner(month) {
  const doc = await getFirestore().collection("monthly_winners").doc(month).get();
  return doc.exists;
}

module.exports = {
  getUsers,
  getUserProfile,
  isUsernameTaken,
  createUserProfile,
  getCheckins,
  findCheckinToday,
  addCheckin,
  getMonthlyWinners,
  saveMonthlyWinner,
  hasMonthlyWinner,
};
