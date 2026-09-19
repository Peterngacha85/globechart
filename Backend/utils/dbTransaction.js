const mongoose = require('mongoose');

const isUnsupported = (err) =>
  err?.code === 20 || /replica set member|mongos|Transaction numbers/i.test(err?.message || '');

/**
 * Runs fn(session) atomically. Atlas is a replica set so this is a real transaction there.
 * On a standalone mongod (local dev) transactions are unavailable, so fn runs with session = null.
 */
async function runInTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isUnsupported(err)) return fn(null);
    throw err;
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
