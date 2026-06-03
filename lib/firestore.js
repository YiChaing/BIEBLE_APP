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

async function findCheckinByUserPlanDay(userId, planDay) {
  const docId = `${userId}_${planDay}`;
  const doc = await getFirestore().collection("checkins").doc(docId).get();
  if (doc.exists) return { id: doc.id, ...doc.data() };
  const snap = await getFirestore()
    .collection("checkins")
    .where("userId", "==", userId)
    .where("planDay", "==", planDay)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function getUserCheckinPlanDays(userId) {
  const snap = await getFirestore()
    .collection("checkins")
    .where("userId", "==", userId)
    .get();
  const days = new Set();
  for (const d of snap.docs) {
    const pd = d.data().planDay;
    if (pd) days.add(pd);
  }
  return days;
}

async function addCheckin(record) {
  const docId = `${record.userId}_${record.planDay}`;
  const ref = getFirestore().collection("checkins").doc(docId);
  await ref.set(record, { merge: true });
  return { id: docId, ...record };
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

/** 每日靈修心得（僅本人，docId = userId_planDay） */
async function getDevotion(userId, planDay) {
  const docId = `${userId}_${planDay}`;
  const doc = await getFirestore().collection("devotions").doc(docId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.userId !== userId) return null;
  return { id: doc.id, ...data };
}

async function saveDevotion(userId, planDay, content) {
  const docId = `${userId}_${planDay}`;
  const now = new Date().toISOString();
  const record = {
    userId,
    planDay: Number(planDay),
    content: (content || "").trim(),
    updatedAt: now,
  };
  const ref = getFirestore().collection("devotions").doc(docId);
  const existing = await ref.get();
  if (!existing.exists) {
    record.createdAt = now;
  } else {
    record.createdAt = existing.data().createdAt || now;
  }
  await ref.set(record, { merge: true });
  return { id: docId, ...record };
}

module.exports = {
  getUsers,
  getUserProfile,
  createGoogleUserProfile,
  getCheckins,
  findCheckinByUserPlanDay,
  getUserCheckinPlanDays,
  addCheckin,
  getMonthlyWinners,
  saveMonthlyWinner,
  hasMonthlyWinner,
  getDevotion,
  saveDevotion,
};
