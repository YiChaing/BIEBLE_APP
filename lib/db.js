const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  ensureDataDir();
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  const p = path.join(DATA_DIR, file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

function getUsers() {
  return readJson("users.json", []);
}

function saveUsers(users) {
  writeJson("users.json", users);
}

function getCheckins() {
  return readJson("checkins.json", []);
}

function saveCheckins(checkins) {
  writeJson("checkins.json", checkins);
}

function getSessions() {
  return readJson("sessions.json", {});
}

function saveSessions(sessions) {
  writeJson("sessions.json", sessions);
}

function getMonthlyWinners() {
  return readJson("monthly-winners.json", []);
}

function saveMonthlyWinners(winners) {
  writeJson("monthly-winners.json", winners);
}

module.exports = {
  getUsers,
  saveUsers,
  getCheckins,
  saveCheckins,
  getSessions,
  saveSessions,
  getMonthlyWinners,
  saveMonthlyWinners,
};
