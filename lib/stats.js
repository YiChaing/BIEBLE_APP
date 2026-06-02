const { getUsers, getCheckins, getMonthlyWinners, saveMonthlyWinners } = require("./db");

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthlyCheckinCounts(checkins, yearMonth) {
  const counts = {};
  for (const c of checkins) {
    if (!c.date.startsWith(yearMonth)) continue;
    counts[c.userId] = (counts[c.userId] || 0) + 1;
  }
  return counts;
}

function buildLeaderboard(users, checkins, yearMonth) {
  const counts = getMonthlyCheckinCounts(checkins, yearMonth);
  return users
    .map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      username: u.username,
      monthlyCheckins: counts[u.id] || 0,
    }))
    .sort((a, b) => b.monthlyCheckins - a.monthlyCheckins);
}

function getTop3(leaderboard) {
  return leaderboard.filter((r) => r.monthlyCheckins > 0).slice(0, 3);
}

function ensureMonthlyWinnersRecorded(yearMonth) {
  const now = new Date();
  const current = monthKey(now);
  if (yearMonth >= current) return null;

  const winners = getMonthlyWinners();
  if (winners.some((w) => w.month === yearMonth)) {
    return winners.find((w) => w.month === yearMonth);
  }

  const users = getUsers();
  const checkins = getCheckins();
  const board = buildLeaderboard(users, checkins, yearMonth);
  const top3 = getTop3(board);
  if (top3.length === 0) return null;

  const record = {
    month: yearMonth,
    recordedAt: new Date().toISOString(),
    winners: top3.map((w, i) => ({
      rank: i + 1,
      userId: w.userId,
      displayName: w.displayName,
      checkins: w.monthlyCheckins,
    })),
  };
  winners.push(record);
  saveMonthlyWinners(winners);
  return record;
}

function archivePastMonths() {
  const winners = getMonthlyWinners();
  const recorded = new Set(winners.map((w) => w.month));
  const checkins = getCheckins();
  if (checkins.length === 0) return;

  const months = new Set(checkins.map((c) => c.date.slice(0, 7)));
  const current = monthKey();
  for (const m of months) {
    if (m < current && !recorded.has(m)) {
      ensureMonthlyWinnersRecorded(m);
    }
  }
}

function getAllProgress(users, checkins, planDay) {
  const today = new Date().toISOString().slice(0, 10);
  return users.map((u) => {
    const userCheckins = checkins.filter((c) => c.userId === u.id);
    const total = userCheckins.length;
    const checkedToday = userCheckins.some(
      (c) => c.date === today && c.planDay === planDay
    );
    const streak = calcStreak(userCheckins);
    return {
      userId: u.id,
      displayName: u.displayName,
      username: u.username,
      totalCheckins: total,
      checkedToday,
      streak,
      recentDays: userCheckins
        .slice(-7)
        .map((c) => ({ date: c.date, planDay: c.planDay })),
    };
  });
}

function calcStreak(checkins) {
  if (checkins.length === 0) return 0;
  const dates = [...new Set(checkins.map((c) => c.date))].sort().reverse();
  let streak = 0;
  let expect = new Date();
  for (const d of dates) {
    const expected = expect.toISOString().slice(0, 10);
    if (d === expected) {
      streak++;
      expect.setDate(expect.getDate() - 1);
    } else if (streak === 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (d === yesterday.toISOString().slice(0, 10)) {
        streak = 1;
        expect = new Date(yesterday);
        expect.setDate(expect.getDate() - 1);
      } else break;
    } else break;
  }
  return streak;
}

module.exports = {
  monthKey,
  buildLeaderboard,
  getTop3,
  ensureMonthlyWinnersRecorded,
  archivePastMonths,
  getAllProgress,
  getMonthlyWinners,
};
