const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const { config } = require('../../config/env');
const { syncAdminFromEnv } = require('../../services/adminSync');

let counter = 0;
const silent = { log: () => {}, warn: () => {} };

// Registers through the real API so referral links are built the way production builds them
async function makeUser(username, referrer) {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      username,
      phone: `07${String(10000000 + counter).slice(-8)}`,
      password: 'secret123',
      agreeTerms: true,
      ...(referrer && { referralCode: referrer.referralCode }),
    });
  if (res.status !== 201) throw new Error(`makeUser failed: ${JSON.stringify(res.body)}`);
  const { userId, token, referralCode } = res.body.data;
  return { id: userId, token, referralCode, username, auth: { Authorization: `Bearer ${token}` } };
}

async function makeAdmin() {
  await syncAdminFromEnv(config, silent);
  const res = await request(app).post('/api/auth/login').send({ username: config.admin.username, password: config.admin.password });
  const { userId, token } = res.body.data;
  return { id: userId, token, auth: { Authorization: `Bearer ${token}` } };
}

const fund = (user, amount) => User.updateOne({ _id: user.id }, { $inc: { 'mainWallet.balance': amount } });
const fundCommission = (user, amount) =>
  User.updateOne({ _id: user.id }, { $inc: { 'commissionWallet.balance': amount, 'commissionWallet.totalEarned': amount } });

async function makeProduct(admin, overrides = {}) {
  const res = await request(app)
    .post('/api/admin/products')
    .set(admin.auth)
    .send({ name: 'Money Guide', category: 'ebook', price: 1000, originalPrice: 1500, content: 'https://example.com/file.pdf', ...overrides });
  if (res.status !== 201) throw new Error(`makeProduct failed: ${JSON.stringify(res.body)}`);
  return res.body.data.productId;
}

const balances = async (user) => {
  const u = await User.findById(user.id);
  return { main: u.mainWallet.balance, commission: u.commissionWallet.balance, earned: u.commissionWallet.totalEarned };
};

module.exports = { makeUser, makeAdmin, makeProduct, fund, fundCommission, balances };
