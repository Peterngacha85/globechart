// Runs before any test file loads config/env.js. Values here never touch the real .env.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder/test';
process.env.JWT_SECRET = 'test_secret_test_secret_test_secret_1234';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PHONE = '0700000001';
process.env.ADMIN_PASSWORD = 'AdminPass#2026';
process.env.MPESA_MODE = 'simulate';
