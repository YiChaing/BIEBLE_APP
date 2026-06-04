const {
  getUsers,
  getCheckins,
  getMonthlyWinners,
  saveMonthlyWinner,
} = require("./firestore");

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
      username: u.username || u.email || "",
      monthlyCheckins: counts[u.id] || 0,
    }))
    .sort((a, b) => b.monthlyCheckins - a.monthlyCheckins);
}

function getTop3(leaderboard) {
  return leaderboard.filter((r) => r.monthlyCheckins > 0).slice(0, 3);
}

function winnerMonthsSet(winners) {
  return new Set((winners || []).map((w) => w.month));
}

/** 使用已載入的 users / checkins / winners，避免重複掃描 Firestore */
async function ensureMonthlyWinnersRecorded(yearMonth, ctx = {}) {
  const current = monthKey();
  if (yearMonth >= current) return null;

  const winners = ctx.winners ?? (await getMonthlyWinners());
  const existing = winners.find((w) => w.month === yearMonth);
  if (existing) return existing;

  const users = ctx.users ?? (await getUsers());
  const checkins = ctx.checkins ?? (await getCheckins());
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
  await saveMonthlyWinner(record);
  winners.push(record);
  return record;
}

async function archivePastMonths(checkins, winners, users) {
  if (!checkins.length) return;

  const recorded = winnerMonthsSet(winners);
  const months = new Set(checkins.map((c) => c.date.slice(0, 7)));
  const current = monthKey();
  for (const m of months) {
    if (m < current && !recorded.has(m)) {
      const record = await ensureMonthlyWinnersRecorded(m, {
        users,
        checkins,
        winners,
      });
      if (record) recorded.add(m);
    }
  }
}

function getUserPlanDaysFromCheckins(checkins, userId) {
  const days = new Set();
  for (const c of checkins) {
    if (c.userId === userId && c.planDay) days.add(c.planDay);
  }
  return days;
}

function getAllProgress(users, checkins, calendarPlanDay) {
  return users.map((u) => {
    const userCheckins = checkins.filter((c) => c.userId === u.id);
    const total = userCheckins.length;
    const checkedToday = userCheckins.some((c) => c.planDay === calendarPlanDay);
    const streak = calcStreakByPlanDay(userCheckins, calendarPlanDay);
    return {
      userId: u.id,
      displayName: u.displayName,
      username: u.username || u.email || "",
      photoURL: u.photoURL || "",
      totalCheckins: total,
      checkedToday,
      streak,
      recentDays: userCheckins
        .slice(-7)
        .map((c) => ({ date: c.date, planDay: c.planDay })),
    };
  });
}

function calcStreakByPlanDay(checkins, calendarPlanDay) {
  const days = new Set(checkins.map((c) => c.planDay).filter(Boolean));
  let streak = 0;
  for (let d = calendarPlanDay; d >= 1; d--) {
    if (days.has(d)) streak++;
    else break;
  }
  return streak;
}

function getSuggestedPlanDay(checkedPlanDays, calendarPlanDay) {
  const set = checkedPlanDays instanceof Set ? checkedPlanDays : new Set(checkedPlanDays);
  for (let d = 1; d <= calendarPlanDay; d++) {
    if (!set.has(d)) return d;
  }
  return Math.min(calendarPlanDay + 1, 365);
}

module.exports = {
  monthKey,
  buildLeaderboard,
  getTop3,
  ensureMonthlyWinnersRecorded,
  archivePastMonths,
  getAllProgress,
  getMonthlyWinners,
  getSuggestedPlanDay,
  getUserPlanDaysFromCheckins,
  calcStreakByPlanDay,
};
