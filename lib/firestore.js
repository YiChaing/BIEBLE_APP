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

async function createGoogleUserProfile(uid, { email, displayName, photoURL }) {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const existing = await userRef.get();

  const profile = {
    email: email || "",
    displayName: (displayName || email?.split("@")[0] || "使用者").trim(),
    photoURL: photoURL || "",
    provider: "google",
    createdAt: existing.exists
      ? existing.data().createdAt
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existing.exists) {
    await userRef.update({
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      email: profile.email,
      updatedAt: profile.updatedAt,
    });
  } else {
    await userRef.set(profile);
  }

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
  createGoogleUserProfile,
  getCheckins,
  findCheckinToday,
  addCheckin,
  getMonthlyWinners,
  saveMonthlyWinner,
  hasMonthlyWinner,
};
