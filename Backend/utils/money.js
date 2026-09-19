const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// 00:00 today in Africa/Nairobi (UTC+3, no DST), as a UTC Date
const startOfDayNairobi = (now = new Date()) => {
  const offsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
};

module.exports = { round2, startOfDayNairobi };
