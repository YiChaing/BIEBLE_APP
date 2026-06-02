const { getAuth } = require("./firebase-admin");
const { getUserProfile, createGoogleUserProfile } = require("./firestore");

async function getUserByToken(idToken) {
  if (!idToken) return null;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    let profile = await getUserProfile(decoded.uid);

    if (!profile) {
      profile = await createGoogleUserProfile(decoded.uid, {
        email: decoded.email,
        displayName: decoded.name,
        photoURL: decoded.picture,
      });
    }

    return publicUser(profile);
  } catch {
    return null;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL || "",
    createdAt: user.createdAt,
  };
}

module.exports = {
  getUserByToken,
  publicUser,
};
