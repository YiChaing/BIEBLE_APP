const admin = require("firebase-admin");

let app = null;

function isConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

function getPrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
}

function getApp() {
  if (!isConfigured()) {
    throw new Error("Firebase 尚未設定，請設定環境變數");
  }
  if (!app) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
    });
  }
  return app;
}

function getAuth() {
  return getApp().auth();
}

function getFirestore() {
  return getApp().firestore();
}

function getPublicConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
  };
}

module.exports = {
  isConfigured,
  getApp,
  getAuth,
  getFirestore,
  getPublicConfig,
};
