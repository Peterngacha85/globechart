const http = require('http');
const { config } = require('./config/env');
const { connectDatabase } = require('./config/database');
const { createSocketServer } = require('./config/socket');
const { syncAdminFromEnv } = require('./services/adminSync');
const app = require('./app');

async function start() {
  await connectDatabase();
  await syncAdminFromEnv(config);

  const server = http.createServer(app);
  const io = createSocketServer(server);
  app.locals.io = io;

  server.listen(config.port, () => {
    console.log(`Globechart API listening on port ${config.port} (${config.env})`);
  });
}

start().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
