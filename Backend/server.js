const http = require('http');
const { config } = require('./config/env');
const { connectDatabase } = require('./config/database');
const { createSocketServer } = require('./config/socket');
const { syncAdminFromEnv } = require('./services/adminSync');
const { expireOverdue } = require('./services/hotelReviewService');
const { expireOverdue: expireOverdueApplications } = require('./services/chatJobService');
const app = require('./app');

async function start() {
  await connectDatabase();
  await syncAdminFromEnv(config);

  const server = http.createServer(app);
  const io = createSocketServer(server);
  app.locals.io = io;

  // Refund hotel reservations and chat job applications whose deadlines ran out, even when nobody opens the app
  setInterval(() => {
    expireOverdue(io).catch((err) => console.error('Review expiry failed:', err.message));
    expireOverdueApplications(io).catch((err) => console.error('Application expiry failed:', err.message));
  }, 10 * 60 * 1000).unref();

  server.listen(config.port, () => {
    console.log(`Globechart API listening on port ${config.port} (${config.env})`);
  });
}

start().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
