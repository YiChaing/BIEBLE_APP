const { getAuth } = require("./firebase-admin");
const { getUserProfile } = require("./firestore");

async function getUserByToken(idToken) {
  if (!idToken) return null;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const profile = await getUserProfile(decoded.uid);
    if (!profile) {
      return {
        id: decoded.uid,
        username: "",
        displayName: decoded.name || "使用者",
        createdAt: null,
        needsProfile: true,
      };
    }
    return publicUser(profile);
  } catch {
    return null;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

module.exports = {
  getUserByToken,
  publicUser,
};
