const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const db = require('./helpers/db');
const { makeUser, makeAdmin, fund, balances } = require('./helpers/factory');
const app = require('../app');
const User = require('../models/User');
const Spin = require('../models/Spin');
const SpinDay = require('../models/SpinDay');
const Transaction = require('../models/Transaction');
const HotelReview = require('../models/HotelReview');
const JobApplication = require('../models/JobApplication');
const { WHEEL, prizeForRoll, oddsTable, AVERAGE_PRIZE, dayKey } = require('../services/spinService');

before(db.connect);
beforeEach(db.clear);
after(db.disconnect);

const spin = (user) => request(app).post('/api/spin').set(user.auth).send({});
const fundBonus = (user, amount) => User.updateOne({ _id: user.id }, { $inc: { 'bonusWallet.balance': amount } });
const bonusOf = async (user) => (await User.findById(user.id)).bonusWallet.balance;

describe('odds', () => {
  test('rolls map to the 40 equal slices and the chances add up to 100%', () => {
    // slice = roll ÷ 250: 0-249 is slice 1 (30), 250-499 slice 2 (35), 1750-1999 slice 8 (300), 9750-9999 slice 40 (30)
    expect([0, 249, 250, 1750, 1999, 9750, 9999].map(prizeForRoll)).toEqual([30, 30, 35, 300, 300, 30, 30]);
    expect(() => prizeForRoll(10000)).toThrow();
    expect(() => prizeForRoll(-1)).toThrow();
    expect(WHEEL).toHaveLength(40);

    const odds = oddsTable();
    expect(odds.map((o) => o.amount)).toEqual([30, 35, 45, 50, 55, 60, 70, 80, 90, 100, 150, 210, 300]);
    expect(odds.reduce((s, o) => s + o.slices, 0)).toBe(40);
    expect(odds.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1);
    expect(odds.find((o) => o.amount === 30)).toMatchObject({ slices: 14, chance: 0.35 });
    expect(odds.find((o) => o.amount === 300)).toMatchObject({ slices: 1, chance: 0.025 });
    expect(AVERAGE_PRIZE).toBeCloseTo(58.25);
  });

  test('a Nairobi day starts at 21:00 UTC', () => {
    expect(dayKey(new Date('2026-10-02T20:59:00Z'))).toBe('2026-10-02');
    expect(dayKey(new Date('2026-10-02T21:00:00Z'))).toBe('2026-10-03');
  });
});

describe('spinning', () => {
  test('is free, credits the prize to bonus credit, and allows 3 a day', async () => {
    const alice = await makeUser('alice');
    const before = await request(app).get('/api/spin').set(alice.auth).expect(200);
    expect(before.body.data).toMatchObject({ spinsLeft: 3, prizesAvailable: true, bonusBalance: 0 });

    const won = [];
    for (let i = 1; i <= 3; i += 1) {
      const res = await spin(alice);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ number: i, spinsLeft: 3 - i });
      expect(prizeForRoll(res.body.data.roll)).toBe(res.body.data.prize); // every result is checkable
      expect(WHEEL[res.body.data.slice - 1]).toBe(res.body.data.prize);
      won.push(res.body.data.prize);
    }
    expect((await spin(alice)).status).toBe(429);

    const total = won.reduce((a, b) => a + b, 0);
    expect(await balances(alice)).toEqual({ main: 0, commission: 0, earned: 0 }); // nothing charged, nothing withdrawable
    expect(await bonusOf(alice)).toBe(total);
    expect(await Transaction.countDocuments({ user: alice.id, type: 'spin_prize', wallet: 'bonus' })).toBe(3);
    expect(await Transaction.countDocuments({ user: alice.id, wallet: { $in: ['main', 'commission'] } })).toBe(0);

    const after = await request(app).get('/api/spin').set(alice.auth);
    expect(after.body.data).toMatchObject({ spinsLeft: 0, totalWon: total });
    expect(after.body.data.history).toHaveLength(3);
    const dash = await request(app).get('/api/dashboard/summary').set(alice.auth);
    expect(dash.body.data.bonusBalance).toBe(total);
  });

  test('concurrent taps never exceed 3 spins', async () => {
    const alice = await makeUser('alice');
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => spin(alice)));
    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(3);
    expect(await Spin.countDocuments({ user: alice.id })).toBe(results.filter((r) => r.status === 201).length);
    while ((await Spin.countDocuments({ user: alice.id })) < 3) await spin(alice).expect(201);
    expect((await spin(alice)).status).toBe(429);
  });

  test("yesterday's spins don't count against today", async () => {
    const alice = await makeUser('alice');
    await Spin.create([1, 2, 3].map((number) => ({ user: alice.id, day: '2020-01-01', number, roll: 0, prize: 30 })));
    await spin(alice).expect(201);
  });

  test('stops when the daily budget cannot cover the biggest prize, without using up a spin', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await request(app).post('/api/admin/settings').set(admin.auth).send({ setting: 'spin_daily_budget', value: 320 }).expect(200);

    await spin(alice).expect(201); // 0 paid + 300 max <= 320
    const res = await spin(alice); // at least 30 paid: 330 > 320
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/all been given out/);
    expect(await Spin.countDocuments({ user: alice.id })).toBe(1);
    const status = await request(app).get('/api/spin').set(alice.auth);
    expect(status.body.data).toMatchObject({ spinsLeft: 2, prizesAvailable: false });
  });

  test('business and admin accounts cannot spin', async () => {
    const admin = await makeAdmin();
    expect((await spin(admin)).status).toBe(403);
  });
});

describe('spending bonus credit on fees', () => {
  async function hotel(admin) {
    const res = await request(app)
      .post('/api/admin/hotels')
      .set(admin.auth)
      .send({ name: 'Sarova', address: 'Kimathi St', lat: -1.2864, lng: 36.8172, reviewFee: 100, reviewBonus: 200, slots: 5 });
    return res.body.data.hotelId;
  }

  test('bonus credit is used first and a refund returns each part to its wallet', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fundBonus(alice, 60);
    await fund(alice, 100);
    const hotelId = await hotel(admin);

    await request(app).post(`/api/hotels/${hotelId}/start`).set(alice.auth).expect(201);
    expect(await bonusOf(alice)).toBe(0);
    expect((await balances(alice)).main).toBe(60);
    const charged = await Transaction.find({ user: alice.id, type: 'review_fee' }).sort('wallet');
    expect(charged.map((t) => [t.wallet, t.amount])).toEqual([['bonus', 60], ['main', 40]]);
    expect((await HotelReview.findOne({})).feeFromBonus).toBe(60);

    await HotelReview.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
    await request(app).get('/api/hotels').set(alice.auth).expect(200); // runs expiry
    expect(await bonusOf(alice)).toBe(60);
    expect((await balances(alice)).main).toBe(100);
    const refunds = await Transaction.find({ user: alice.id, type: 'refund' }).sort('wallet');
    expect(refunds.map((t) => [t.wallet, t.amount])).toEqual([['bonus', 60], ['main', 40]]);
  });

  test('bonus credit alone can pay a chat unlock, and a no-reply refund goes back to bonus credit', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fundBonus(alice, 150);
    const biz = await request(app).post('/api/admin/chat-businesses').set(admin.auth)
      .send({ name: 'Acme', unlockFee: 100, openings: 1, username: 'acme', phone: '0799123456', password: 'business123' });

    const res = await request(app).post(`/api/chat-jobs/${biz.body.data.businessId}/unlock`).set(alice.auth).expect(201);
    expect(await bonusOf(alice)).toBe(50);
    expect((await balances(alice)).main).toBe(0);

    await JobApplication.updateOne({ _id: res.body.data.applicationId }, { replyDeadline: new Date(Date.now() - 1000) });
    await request(app).get('/api/chat-jobs').set(alice.auth).expect(200);
    expect(await bonusOf(alice)).toBe(150);
    const dash = await request(app).get('/api/dashboard/summary').set(alice.auth);
    expect(dash.body.data.refunds).toEqual({ total: 100, count: 1 });
  });

  test('bonus credit is not enough on its own and cannot be withdrawn', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fundBonus(alice, 500);
    const hotelId = await hotel(admin);
    await fundBonus(alice, -450); // 50 left
    expect((await request(app).post(`/api/hotels/${hotelId}/start`).set(alice.auth)).status).toBe(402);
    expect(await bonusOf(alice)).toBe(50);
    expect((await request(app).post('/api/finance/withdraw').set(alice.auth).send({ amount: 300 })).status).toBe(402);
  });
});

describe('admin', () => {
  test('summary shows prizes given, credit still held, and credit spent on fees', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    const won = (await spin(alice)).body.data.prize;
    await fundBonus(alice, 100 - won); // exactly 100 credit
    const hotel = await request(app).post('/api/admin/hotels').set(admin.auth)
      .send({ name: 'Sarova', address: 'Kimathi St', lat: -1.2864, lng: 36.8172, reviewFee: 100, reviewBonus: 200, slots: 5 });
    await request(app).post(`/api/hotels/${hotel.body.data.hotelId}/start`).set(alice.auth).expect(201);

    const res = await request(app).get('/api/admin/spin/summary').set(admin.auth).expect(200);
    expect(res.body.data).toMatchObject({ budget: 2000, today: { paid: won, spins: 1 }, totalWon: won, spentOnFees: 100, creditOutstanding: 0, averagePrize: 58.25 });
    expect(await SpinDay.countDocuments({})).toBe(1);
    expect((await request(app).get('/api/admin/spin/summary').set(alice.auth)).status).toBe(403);
  });
});
