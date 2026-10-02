const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { config } = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
// Review submissions carry a compressed photo; everything else stays small
app.use('/api/hotels', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '100kb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, message: 'Too many requests', statusCode: 429 },
});

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/finance', require('./routes/finance.routes'));
app.use('/api/products', require('./routes/products.routes'));
app.use('/api/hotels', require('./routes/hotels.routes'));
app.use('/api/chat-jobs', require('./routes/chatJobs.routes'));
app.use('/api/spin', require('./routes/spin.routes'));
app.use('/api/trainings', require('./routes/trainings.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
