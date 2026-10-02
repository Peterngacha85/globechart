const SystemSettings = require('../models/SystemSettings');

// Defaults live here; the database only stores admin overrides.
const DEFAULTS = {
  min_withdrawal: { value: 220, category: 'withdrawal', description: 'Minimum withdrawal amount (KES)' },
  max_withdrawal_daily: { value: 100000, category: 'withdrawal', description: 'Maximum withdrawn per user per 24h (KES)' },
  min_deposit: { value: 50, category: 'deposit', description: 'Minimum M-Pesa deposit (KES)' },
  max_deposit: { value: 50000, category: 'deposit', description: 'Maximum M-Pesa deposit (KES)' },
  spin_daily_budget: { value: 2000, category: 'spin', description: 'Lucky spin: total prizes paid per day, all members (KES)' },
};

async function getSettings() {
  const overrides = await SystemSettings.find({ setting: { $in: Object.keys(DEFAULTS) } });
  const map = Object.fromEntries(overrides.map((s) => [s.setting, s.value]));
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, d]) => [key, map[key] ?? d.value]));
}

async function getSetting(key) {
  const doc = await SystemSettings.findOne({ setting: key });
  return doc ? doc.value : DEFAULTS[key].value;
}

module.exports = { DEFAULTS, getSettings, getSetting };
