const path = require('path');
const { z } = require('zod');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const KENYA_PHONE = /^(\+254|254|0)[17]\d{8}$/;
const WEAK_ADMIN_PASSWORDS = ['admin123456', 'admin123', 'password', 'changeme', 'changeme!2026'];

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),
  // Used when the URI has no database name (Atlas URIs usually don't)
  MONGODB_DB: z.string().trim().default('globechart'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32).optional().or(z.literal('').transform(() => undefined)),
  JWT_EXPIRE: z.string().default('7d'),
  REFRESH_TOKEN_EXPIRE: z.string().default('30d'),

  ADMIN_USERNAME: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, 'ADMIN_USERNAME: 3-30 letters, numbers or underscore'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PHONE: z.string().regex(KENYA_PHONE, 'ADMIN_PHONE must be a Kenyan number, e.g. 0712345678'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),

  MPESA_MODE: z.enum(['simulate', 'sandbox', 'live', 'manual']).default('simulate'),
  // manual mode: users Send Money to this number and an admin confirms each deposit by its M-Pesa code
  MANUAL_PAY_NUMBER: z.string().regex(KENYA_PHONE, 'MANUAL_PAY_NUMBER must be a Kenyan number, e.g. 0712345678').optional().or(z.literal('').transform(() => undefined)),
  MANUAL_PAY_NAME: z.string().trim().max(60).optional(),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().default('174379'),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_CALLBACK_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Globechart <no-reply@globechart.com>'),
});

function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration (Backend/.env):\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';

  if (e.MPESA_MODE === 'manual' && (!e.MANUAL_PAY_NUMBER || !e.MANUAL_PAY_NAME)) {
    throw new Error('Invalid environment configuration: MPESA_MODE=manual needs MANUAL_PAY_NUMBER and MANUAL_PAY_NAME.');
  }

  if (isProd) {
    if (WEAK_ADMIN_PASSWORDS.includes(e.ADMIN_PASSWORD.toLowerCase()) || e.ADMIN_PASSWORD.length < 12) {
      throw new Error('Invalid environment configuration: ADMIN_PASSWORD is too weak for production (min 12 chars, not a common default).');
    }
    if (e.MPESA_MODE === 'simulate') {
      throw new Error('Invalid environment configuration: MPESA_MODE=simulate is not allowed in production.');
    }
  }

  return {
    env: e.NODE_ENV,
    isProd,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    corsOrigins: e.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    frontendUrl: e.FRONTEND_URL.replace(/\/$/, ''),
    mongoUri: e.MONGODB_URI,
    mongoDb: e.MONGODB_DB,
    jwt: {
      secret: e.JWT_SECRET,
      refreshSecret: e.JWT_REFRESH_SECRET || `${e.JWT_SECRET}:refresh`,
      expire: e.JWT_EXPIRE,
      refreshExpire: e.REFRESH_TOKEN_EXPIRE,
    },
    admin: {
      username: e.ADMIN_USERNAME.toLowerCase(),
      email: e.ADMIN_EMAIL.toLowerCase(),
      phone: e.ADMIN_PHONE,
      password: e.ADMIN_PASSWORD,
    },
    mpesa: {
      mode: e.MPESA_MODE,
      consumerKey: e.MPESA_CONSUMER_KEY,
      consumerSecret: e.MPESA_CONSUMER_SECRET,
      shortcode: e.MPESA_SHORTCODE,
      passkey: e.MPESA_PASSKEY,
      callbackUrl: e.MPESA_CALLBACK_URL,
      manual: { number: e.MANUAL_PAY_NUMBER, name: e.MANUAL_PAY_NAME },
    },
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
      from: e.EMAIL_FROM,
    },
  };
}

// A bad .env should print a readable message, not a stack trace
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

module.exports = { loadConfig, config };
