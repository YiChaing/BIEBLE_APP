const crypto = require("crypto");
const { getUsers, saveUsers, getSessions, saveSessions } = require("./db");

const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

function registerUser({ username, password, displayName }) {
  const users = getUsers();
  const name = username.trim().toLowerCase();
  if (!name || name.length < 2) {
    return { ok: false, error: "帳號至少需要 2 個字元" };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: "密碼至少需要 4 個字元" };
  }
  if (users.some((u) => u.username === name)) {
    return { ok: false, error: "此帳號已被使用" };
  }
  const user = {
    id: crypto.randomUUID(),
    username: name,
    displayName: (displayName || username).trim() || name,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return { ok: true, user: publicUser(user) };
}

function loginUser({ username, password }) {
  const users = getUsers();
  const name = username.trim().toLowerCase();
  const user = users.find((u) => u.username === name);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: "帳號或密碼錯誤" };
  }
  const token = crypto.randomBytes(32).toString("hex");
  const sessions = getSessions();
  sessions[token] = {
    userId: user.id,
    expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  saveSessions(sessions);
  return { ok: true, token, user: publicUser(user) };
}

function logoutUser(token) {
  if (!token) return;
  const sessions = getSessions();
  delete sessions[token];
  saveSessions(sessions);
}

function getUserByToken(token) {
  if (!token) return null;
  const sessions = getSessions();
  const session = sessions[token];
  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      delete sessions[token];
      saveSessions(sessions);
    }
    return null;
  }
  const users = getUsers();
  const user = users.find((u) => u.id === session.userId);
  return user ? publicUser(user) : null;
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
  registerUser,
  loginUser,
  logoutUser,
  getUserByToken,
};
