const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const db = require('./helpers/db');
const { makeUser, makeAdmin, makeProduct, fund, fundCommission, balances } = require('./helpers/factory');
const app = require('../app');
const User = require('../models/User');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Commission = require('../models/Commission');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { callbackSecret } = require('../services/mpesa');

before(db.connect);
beforeEach(db.clear);
after(db.disconnect);

const stkCallback = (checkoutRequestId, { amount, code = 0 } = {}) => ({
  Body: {
    stkCallback: {
      MerchantRequestID: 'm1',
      CheckoutRequestID: checkoutRequestId,
      ResultCode: code,
      ResultDesc: code === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user',
      ...(code === 0 && {
        CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: 'QGH123ABC' }] },
      }),
    },
  },
});

describe('M-Pesa deposits', () => {
  test('a confirmed callback credits the main wallet exactly once', async () => {
    const alice = await makeUser('alice');
    const res = await request(app).post('/api/finance/recharge').set(alice.auth).send({ amount: 500 });
    expect(res.status).toBe(200);
    const { checkoutRequestId } = res.body.data;
    expect((await balances(alice)).main).toBe(0); // still pending

    // Without our secret the callback is acknowledged but ignored
    await request(app).post('/api/finance/mpesa/callback').send(stkCallback(checkoutRequestId, { amount: 500 })).expect(200);
    expect((await balances(alice)).main).toBe(0);

    const url = `/api/finance/mpesa/callback?s=${callbackSecret()}`;
    await request(app).post(url).send(stkCallback(checkoutRequestId, { amount: 500 })).expect(200);
    expect((await balances(alice)).main).toBe(500);

    await request(app).post(url).send(stkCallback(checkoutRequestId, { amount: 500 })).expect(200); // replay
    expect((await balances(alice)).main).toBe(500);

    const tx = await Transaction.findOne({ checkoutRequestId });
    expect(tx.status).toBe('completed');
    expect(tx.mpesaReceiptNumber).toBe('QGH123ABC');
    expect(await Notification.countDocuments({ user: alice.id, title: 'Deposit received' })).toBe(1);
  });

  test('a cancelled payment or a mismatched amount never credits the wallet', async () => {
    const alice = await makeUser('alice');
    const url = `/api/finance/mpesa/callback?s=${callbackSecret()}`;

    const a = await request(app).post('/api/finance/recharge').set(alice.auth).send({ amount: 100 });
    await request(app).post(url).send(stkCallback(a.body.data.checkoutRequestId, { code: 1032 }));
    const b = await request(app).post('/api/finance/recharge').set(alice.auth).send({ amount: 100 });
    await request(app).post(url).send(stkCallback(b.body.data.checkoutRequestId, { amount: 1 }));

    expect((await balances(alice)).main).toBe(0);
    expect((await Transaction.findById(a.body.data.transactionId)).status).toBe('failed');
    expect((await Transaction.findById(b.body.data.transactionId)).status).toBe('failed');
  });

  test('validates amount limits and whole shillings', async () => {
    const alice = await makeUser('alice');
    expect((await request(app).post('/api/finance/recharge').set(alice.auth).send({ amount: 10 })).status).toBe(422);
    expect((await request(app).post('/api/finance/recharge').set(alice.auth).send({ amount: 60000 })).status).toBe(422);
    expect((await request(app).post('/api/finance/recharge').set(alice.auth).send({ amount: 100.5 })).status).toBe(422);
    expect((await request(app).post('/api/finance/recharge').send({ amount: 100 })).status).toBe(401);
  });
});

describe('store purchases and referral commissions', () => {
  test('pays L1/L2/L3 commissions out of a real sale and nothing beyond level 3', async () => {
    const admin = await makeAdmin();
    const a = await makeUser('usera');
    const b = await makeUser('userb', a);
    const c = await makeUser('userc', b);
    const d = await makeUser('userd', c);
    const buyer = await makeUser('buyer', d);
    await fund(buyer, 1500);
    const productId = await makeProduct(admin, { commission: { referralLevel1: 10, referralLevel2: 5, referralLevel3: 2 } });

    const res = await request(app).post(`/api/products/${productId}/purchase`).set(buyer.auth).send({});
    expect(res.status).toBe(201);

    expect((await balances(buyer)).main).toBe(500);
    expect((await balances(d)).commission).toBe(100); // L1: 10% of 1000
    expect((await balances(c)).commission).toBe(50); // L2: 5%
    expect((await balances(b)).commission).toBe(20); // L3: 2%
    expect((await balances(a)).commission).toBe(0); // beyond level 3
    expect((await balances(buyer)).commission).toBe(0); // buyers never earn from their own purchase

    const product = await Product.findById(productId);
    expect(product.sold).toBe(1);
    expect(await Commission.countDocuments({ purchase: res.body.data.purchaseId })).toBe(3);
    const purchase = await Purchase.findById(res.body.data.purchaseId);
    expect(purchase.commissionPaid).toBe(170);

    // Every credited naira has a matching ledger entry
    const commissionTx = await Transaction.aggregate([{ $match: { type: 'commission' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]);
    expect(commissionTx[0].t).toBe(170);
    expect(await Notification.countDocuments({ user: d.id, title: 'Commission earned' })).toBe(1);
  });

  test('a suspended referrer earns nothing, but the chain above them still can', async () => {
    const admin = await makeAdmin();
    const top = await makeUser('top');
    const mid = await makeUser('mid', top);
    const buyer = await makeUser('buyer', mid);
    await User.updateOne({ _id: mid.id }, { status: 'suspended' });
    await fund(buyer, 1000);
    const productId = await makeProduct(admin);

    await request(app).post(`/api/products/${productId}/purchase`).set(buyer.auth).expect(201);
    expect((await balances(mid)).commission).toBe(0);
    expect((await balances(top)).commission).toBe(50); // L2 = 5%
  });

  test('rejects purchases without enough balance and leaves no side effects', async () => {
    const admin = await makeAdmin();
    const referrer = await makeUser('ref');
    const buyer = await makeUser('buyer', referrer);
    await fund(buyer, 999);
    const productId = await makeProduct(admin);

    const res = await request(app).post(`/api/products/${productId}/purchase`).set(buyer.auth);
    expect(res.status).toBe(402);
    expect((await balances(buyer)).main).toBe(999);
    expect((await balances(referrer)).commission).toBe(0);
    expect((await Product.findById(productId)).sold).toBe(0);
    expect(await Purchase.countDocuments({})).toBe(0);
  });

  test('a product can be bought once; concurrent double-clicks charge once', async () => {
    const admin = await makeAdmin();
    const buyer = await makeUser('buyer');
    await fund(buyer, 5000);
    const productId = await makeProduct(admin);

    const results = await Promise.all([1, 2, 3].map(() => request(app).post(`/api/products/${productId}/purchase`).set(buyer.auth)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Purchase.countDocuments({ user: buyer.id })).toBe(1);
    expect((await balances(buyer)).main).toBe(4000);
    expect((await Product.findById(productId)).sold).toBe(1);
  });

  test('limited stock sells out and reports out of stock', async () => {
    const admin = await makeAdmin();
    const [one, two] = [await makeUser('one'), await makeUser('two')];
    await fund(one, 1000);
    await fund(two, 1000);
    const productId = await makeProduct(admin, { stockQuantity: 1 });

    await request(app).post(`/api/products/${productId}/purchase`).set(one.auth).expect(201);
    const res = await request(app).post(`/api/products/${productId}/purchase`).set(two.auth);
    expect(res.status).toBe(404);
    expect((await balances(two)).main).toBe(1000);
  });

  test('content is only served to owners, and the library and listing reflect ownership', async () => {
    const admin = await makeAdmin();
    const buyer = await makeUser('buyer');
    const other = await makeUser('other');
    await fund(buyer, 1000);
    const productId = await makeProduct(admin);

    expect((await request(app).get(`/api/products/${productId}/access`).set(buyer.auth)).status).toBe(403);
    await request(app).post(`/api/products/${productId}/purchase`).set(buyer.auth).expect(201);

    const access = await request(app).get(`/api/products/${productId}/access`).set(buyer.auth);
    expect(access.body.data.content).toBe('https://example.com/file.pdf');
    expect((await request(app).get(`/api/products/${productId}/access`).set(other.auth)).status).toBe(403);

    const detail = await request(app).get(`/api/products/${productId}`).set(buyer.auth);
    expect(detail.body.data.owned).toBe(true);
    expect(detail.body.data.content).toBeUndefined(); // never leaked in the catalogue
    expect(detail.body.data.discount).toBe(33);

    const list = await request(app).get('/api/products?category=ebook').set(other.auth);
    expect(list.body.data.products[0].owned).toBe(false);
    expect(list.body.data.categories.ebook).toBe(1);

    const library = await request(app).get('/api/products/my-library').set(buyer.auth);
    expect(library.body.data).toMatchObject({ owned: 1, totalSpent: 1000 });
  });
});

describe('withdrawals', () => {
  test('reserves the amount, enforces the minimum, and blocks overdrawing', async () => {
    const alice = await makeUser('alice');
    await fundCommission(alice, 1000);

    expect((await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 100 })).status).toBe(422);
    expect((await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 5000 })).status).toBe(402);

    const ok = await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 400 });
    expect(ok.status).toBe(201);
    expect((await balances(alice)).commission).toBe(600);
  });

  test('simultaneous withdrawals of the whole balance only succeed once', async () => {
    const alice = await makeUser('alice');
    await fundCommission(alice, 1000);

    const results = await Promise.all([1, 2, 3, 4].map(() => request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 1000 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await balances(alice)).commission).toBe(0);
  });

  test('admin approval records the payout; a second decision is refused', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fundCommission(alice, 1000);
    const { withdrawalId } = (await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 500 })).body.data;

    expect((await request(app).put(`/api/admin/withdrawals/${withdrawalId}/approve`).set(alice.auth).send({})).status).toBe(403);
    expect((await request(app).put(`/api/admin/withdrawals/${withdrawalId}/approve`).set(admin.auth).send({})).status).toBe(422);

    const ok = await request(app).put(`/api/admin/withdrawals/${withdrawalId}/approve`).set(admin.auth).send({ transactionReference: 'QGH999XYZ' });
    expect(ok.status).toBe(200);
    expect((await User.findById(alice.id)).totalWithdrawn).toBe(500);
    expect((await balances(alice)).commission).toBe(500);

    expect((await request(app).put(`/api/admin/withdrawals/${withdrawalId}/approve`).set(admin.auth).send({ transactionReference: 'QGH999XYZ' })).status).toBe(409);
    expect((await request(app).put(`/api/admin/withdrawals/${withdrawalId}/reject`).set(admin.auth).send({ reason: 'too late' })).status).toBe(409);

    const history = await request(app).get('/api/finance/withdrawal-history').set(alice.auth);
    expect(history.body.data.counts.approved).toBe(1);
    expect(history.body.data.withdrawals[0].transactionReference).toBe('QGH999XYZ');
  });

  test('rejection refunds the wallet and tells the user why', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fundCommission(alice, 1000);
    const { withdrawalId } = (await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 700 })).body.data;
    expect((await balances(alice)).commission).toBe(300);

    await request(app).put(`/api/admin/withdrawals/${withdrawalId}/reject`).set(admin.auth).send({ reason: 'Phone number mismatch' }).expect(200);
    expect((await balances(alice)).commission).toBe(1000);
    expect((await User.findById(alice.id)).totalWithdrawn).toBe(0);
    const note = await Notification.findOne({ user: alice.id, title: 'Withdrawal rejected' });
    expect(note.message).toContain('Phone number mismatch');
  });

  test('the main (deposit) wallet is not withdrawable', async () => {
    const alice = await makeUser('alice');
    await fund(alice, 5000);
    expect((await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 1000 })).status).toBe(402);
  });
});

describe('admin API', () => {
  test('is closed to regular users and open to the env admin', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    for (const path of ['/api/admin/users', '/api/admin/withdrawals', '/api/admin/products', '/api/admin/settings', '/api/admin/analytics/finance']) {
      expect((await request(app).get(path).set(alice.auth)).status).toBe(403);
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set(admin.auth)).status).toBe(200);
    }
  });

  test('suspends and reactivates members but never admins', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');

    await request(app).put(`/api/admin/users/${alice.id}/suspend`).set(admin.auth).send({ reason: 'fraud' }).expect(200);
    expect((await request(app).get('/api/users/profile').set(alice.auth)).status).toBe(403);
    await request(app).put(`/api/admin/users/${alice.id}/reactivate`).set(admin.auth).expect(200);
    expect((await request(app).get('/api/users/profile').set(alice.auth)).status).toBe(200);
    expect((await request(app).put(`/api/admin/users/${admin.id}/suspend`).set(admin.auth).send({})).status).toBe(403);

    const list = await request(app).get('/api/admin/users?search=ali').set(admin.auth);
    expect(list.body.data.users.map((u) => u.username)).toEqual(['alice']);
  });

  test('settings override the built-in defaults without seeding', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fundCommission(alice, 1000);

    const before = await request(app).get('/api/finance/limits').set(alice.auth);
    expect(before.body.data.minWithdrawal).toBe(220);

    await request(app).post('/api/admin/settings').set(admin.auth).send({ setting: 'min_withdrawal', value: 500 }).expect(200);
    expect((await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 300 })).status).toBe(422);
    expect((await request(app).post('/api/admin/settings').set(admin.auth).send({ setting: 'made_up', value: 1 })).status).toBe(422);
  });

  test('product validation caps total commission and keeps sold products archived, not deleted', async () => {
    const admin = await makeAdmin();
    const tooGenerous = await request(app)
      .post('/api/admin/products')
      .set(admin.auth)
      .send({ name: 'X', category: 'ebook', price: 100, commission: { referralLevel1: 30, referralLevel2: 20, referralLevel3: 10 } });
    expect(tooGenerous.status).toBe(422);

    const productId = await makeProduct(admin);
    await request(app).put(`/api/admin/products/${productId}`).set(admin.auth).send({ price: 800 }).expect(200);
    expect((await Product.findById(productId)).discount).toBe(47);
    await request(app).delete(`/api/admin/products/${productId}`).set(admin.auth).expect(200);
    expect((await Product.findById(productId)).status).toBe('archived');

    const alice = await makeUser('alice');
    expect((await request(app).get(`/api/products/${productId}`).set(alice.auth)).status).toBe(404);
  });

  test('analytics add up from real sales, commissions and payouts', async () => {
    const admin = await makeAdmin();
    const ref = await makeUser('ref');
    const buyer = await makeUser('buyer', ref);
    await fund(buyer, 1000);
    const productId = await makeProduct(admin);
    await request(app).post(`/api/products/${productId}/purchase`).set(buyer.auth).expect(201);

    const res = await request(app).get('/api/admin/analytics/finance?period=month').set(admin.auth);
    expect(res.body.data).toMatchObject({ totalSales: 1000, salesCount: 1, totalCommissions: 100, netRevenue: 900, activeBuyers: 1 });
    expect(res.body.data.topEarners[0]).toEqual({ username: 'ref', earnings: 100 });

    const dash = await request(app).get('/api/dashboard/summary').set(ref.auth);
    expect(dash.body.data).toMatchObject({ availableBalance: 100, lifetimeConfirmed: 100, todaysEarnings: 100, activeDownlines: 1 });
    const earnings = await request(app).get('/api/dashboard/earnings').set(ref.auth);
    expect(earnings.body.data.level1).toEqual({ amount: 100, count: 1 });
  });
});
