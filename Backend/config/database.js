const mongoose = require('mongoose');
const { config } = require('./env');

async function connectDatabase(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  // dbName only applies when the URI itself has no database path
  const hasDbInUri = /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    ...(hasDbInUri ? {} : { dbName: config.mongoDb }),
  });
  const { host, name } = mongoose.connection;
  console.log(`MongoDB connected: ${host}/${name}`);
}

module.exports = { connectDatabase };
