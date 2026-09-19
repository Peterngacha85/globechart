const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replSet;

// A single-node replica set, so multi-document transactions behave exactly as on Atlas
async function connect() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function clear() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
  await replSet.stop();
}

module.exports = { connect, clear, disconnect };
