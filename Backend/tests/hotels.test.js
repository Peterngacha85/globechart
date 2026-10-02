const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const db = require('./helpers/db');
const { makeUser, makeAdmin, fund, balances } = require('./helpers/factory');
const app = require('../app');
const Hotel = require('../models/Hotel');
const HotelReview = require('../models/HotelReview');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { distanceMeters } = require('../services/hotelReviewService');

before(db.connect);
beforeEach(db.clear);
after(db.disconnect);

const HOTEL = { lat: -1.2864, lng: 36.8172 };
const AT_HOTEL = { lat: -1.2860, lng: 36.8172 }; // ~45 m away
const FAR_AWAY = { lat: -1.2964, lng: 36.8172 }; // ~1.1 km away
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

async function makeHotel(admin, overrides = {}) {
  const res = await request(app)
    .post('/api/admin/hotels')
    .set(admin.auth)
    .send({ name: 'Sarova Stanley', address: 'Kimathi St', city: 'Nairobi', ...HOTEL, reviewFee: 100, reviewBonus: 200, slots: 5, ...overrides });
  if (res.status !== 201) throw new Error(`makeHotel failed: ${JSON.stringify(res.body)}`);
  return res.body.data.hotelId;
}

const start = (user, hotelId) => request(app).post(`/api/hotels/${hotelId}/start`).set(user.auth).send({});
const submit = (user, hotelId, overrides = {}) =>
  request(app)
    .post(`/api/hotels/${hotelId}/submit`)
    .set(user.auth)
    .send({ rating: 4, comment: 'Clean rooms, friendly staff at reception.', photo: PHOTO, ...AT_HOTEL, accuracy: 15, ...overrides });

async function submittedReview(admin, user, hotelOverrides) {
  const hotelId = await makeHotel(admin, hotelOverrides);
  await fund(user, 100);
  await start(user, hotelId).expect(201);
  const res = await submit(user, hotelId);
  if (res.status !== 200) throw new Error(`submit failed: ${JSON.stringify(res.body)}`);
  return { hotelId, reviewId: res.body.data.reviewId };
}

describe('distance', () => {
  test('matches known distances', () => {
    expect(Math.round(distanceMeters(HOTEL, AT_HOTEL))).toBe(44);
    expect(Math.round(distanceMeters(HOTEL, FAR_AWAY))).toBe(1112);
  });
});

describe('starting a review', () => {
  test('charges the fee from the main wallet and holds a slot', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 150);
    const hotelId = await makeHotel(admin);

    const res = await start(alice, hotelId);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'reserved', fee: 100, bonus: 200 });
    expect((await balances(alice)).main).toBe(50);
    expect((await Hotel.findById(hotelId)).slotsUsed).toBe(1);
    expect(await Transaction.countDocuments({ user: alice.id, type: 'review_fee', amount: 100 })).toBe(1);

    const list = await request(app).get('/api/hotels').set(alice.auth).expect(200);
    expect(list.body.data.hotels[0]).toMatchObject({ slotsLeft: 4, myReview: { status: 'reserved' } });
  });

  test('without enough balance nothing is charged or reserved', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 99);
    const hotelId = await makeHotel(admin);

    expect((await start(alice, hotelId)).status).toBe(402);
    expect((await balances(alice)).main).toBe(99);
    expect((await Hotel.findById(hotelId)).slotsUsed).toBe(0);
    expect(await HotelReview.countDocuments({})).toBe(0);
  });

  test('one review per member per hotel, even with concurrent taps', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 1000);
    const hotelId = await makeHotel(admin);

    const results = await Promise.all([1, 2, 3].map(() => start(alice, hotelId)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await balances(alice)).main).toBe(900);
    expect((await Hotel.findById(hotelId)).slotsUsed).toBe(1);
  });

  test('never reserves more slots than the admin funded', async () => {
    const admin = await makeAdmin();
    const hotelId = await makeHotel(admin, { slots: 2 });
    const users = await Promise.all(['one', 'two', 'three', 'four'].map((n) => makeUser(n)));
    await Promise.all(users.map((u) => fund(u, 100)));

    const results = await Promise.all(users.map((u) => start(u, hotelId)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect((await Hotel.findById(hotelId)).slotsUsed).toBe(2);
    const charged = await Transaction.countDocuments({ type: 'review_fee' });
    expect(charged).toBe(2);
  });

  test('paused or archived hotels cannot be started', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const hotelId = await makeHotel(admin, { status: 'paused' });
    expect((await start(alice, hotelId)).status).toBe(404);
    expect((await balances(alice)).main).toBe(100);
  });
});

describe('submitting a review', () => {
  test('is refused away from the hotel and accepted on site', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const hotelId = await makeHotel(admin);
    await start(alice, hotelId).expect(201);

    const far = await submit(alice, hotelId, FAR_AWAY);
    expect(far.status).toBe(422);
    expect(far.body.message).toContain('1112 m away');

    const ok = await submit(alice, hotelId);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'submitted', rating: 4, distanceMeters: 44 });
    expect((await submit(alice, hotelId)).status).toBe(404); // nothing reserved any more
  });

  test('validates rating, comment and photo, and requires a reservation', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const hotelId = await makeHotel(admin);

    expect((await submit(alice, hotelId)).status).toBe(404);
    await start(alice, hotelId).expect(201);
    expect((await submit(alice, hotelId, { rating: 6 })).status).toBe(422);
    expect((await submit(alice, hotelId, { comment: 'nice' })).status).toBe(422);
    expect((await submit(alice, hotelId, { photo: 'https://example.com/a.jpg' })).status).toBe(422);
    expect((await HotelReview.findOne({})).status).toBe('reserved');
  });

  test('an expired reservation is refunded, frees the slot, and can be retried', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const hotelId = await makeHotel(admin);
    await start(alice, hotelId).expect(201);
    await HotelReview.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });

    expect((await submit(alice, hotelId)).status).toBe(410);
    expect((await HotelReview.findOne({})).status).toBe('expired');
    expect((await balances(alice)).main).toBe(100);
    expect((await Hotel.findById(hotelId)).slotsUsed).toBe(0);
    expect(await Notification.countDocuments({ user: alice.id, title: 'Review reservation expired' })).toBe(1);

    await start(alice, hotelId).expect(201);
  });
});

describe('admin decisions', () => {
  test('approval pays the bonus into the withdrawable wallet exactly once', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    const { hotelId, reviewId } = await submittedReview(admin, alice);

    expect((await request(app).put(`/api/admin/hotel-reviews/${reviewId}/approve`).set(alice.auth)).status).toBe(403);
    await request(app).put(`/api/admin/hotel-reviews/${reviewId}/approve`).set(admin.auth).expect(200);
    expect((await request(app).put(`/api/admin/hotel-reviews/${reviewId}/approve`).set(admin.auth)).status).toBe(409);

    expect(await balances(alice)).toEqual({ main: 0, commission: 200, earned: 200 });
    expect(await Transaction.countDocuments({ user: alice.id, type: 'review_bonus', amount: 200 })).toBe(1);

    const hotel = await request(app).get(`/api/hotels/${hotelId}`).set(alice.auth).expect(200);
    expect(hotel.body.data).toMatchObject({ reviewCount: 1, averageRating: 4, slotsLeft: 4 });
    expect(hotel.body.data.reviews[0]).toMatchObject({ username: 'alice', rating: 4, sponsored: true });

    const dash = await request(app).get('/api/dashboard/summary').set(alice.auth);
    expect(dash.body.data).toMatchObject({ availableBalance: 200, todaysEarnings: 200, lifetimeConfirmed: 200 });
    const earnings = await request(app).get('/api/dashboard/earnings').set(alice.auth);
    expect(earnings.body.data.hotelReviews).toEqual({ amount: 200, count: 1 });

    expect((await request(app).post(`/api/hotels/${hotelId}/start`).set(alice.auth)).status).toBe(409);
  });

  test('a normal rejection refunds the fee, frees the slot, and allows another try', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    const { hotelId, reviewId } = await submittedReview(admin, alice);

    expect((await request(app).put(`/api/admin/hotel-reviews/${reviewId}/reject`).set(admin.auth).send({})).status).toBe(422);
    const res = await request(app).put(`/api/admin/hotel-reviews/${reviewId}/reject`).set(admin.auth).send({ reason: 'Photo is too blurry' });
    expect(res.body.data).toMatchObject({ status: 'rejected', feeRefunded: true });

    expect(await balances(alice)).toEqual({ main: 100, commission: 0, earned: 0 });
    expect((await Hotel.findById(hotelId)).slotsUsed).toBe(0);
    const note = await Notification.findOne({ user: alice.id, title: 'Review rejected' });
    expect(note.message).toContain('Photo is too blurry');
    await start(alice, hotelId).expect(201);
  });

  test('a fraud rejection keeps the fee and blocks that hotel for the member', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    const { hotelId, reviewId } = await submittedReview(admin, alice);

    await request(app).put(`/api/admin/hotel-reviews/${reviewId}/reject`).set(admin.auth).send({ reason: 'Photo copied from the internet', fraud: true }).expect(200);
    expect(await balances(alice)).toEqual({ main: 0, commission: 0, earned: 0 });
    expect((await Hotel.findById(hotelId)).slotsUsed).toBe(0);

    await fund(alice, 100);
    expect((await start(alice, hotelId)).status).toBe(409);
  });

  test('the review queue hides photos; the detail view shows the photo and location', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    const { reviewId } = await submittedReview(admin, alice);

    const list = await request(app).get('/api/admin/hotel-reviews?status=submitted').set(admin.auth).expect(200);
    expect(list.body.data.reviews).toHaveLength(1);
    expect(list.body.data.reviews[0].photo).toBeUndefined();

    const detail = await request(app).get(`/api/admin/hotel-reviews/${reviewId}`).set(admin.auth).expect(200);
    expect(detail.body.data).toMatchObject({ photo: PHOTO, distanceMeters: 44, user: { username: 'alice' }, location: { accuracy: 15 } });
  });

  test('the summary separates fees from bonuses and shows what is still owed', async () => {
    const admin = await makeAdmin();
    const [a, b, c] = [await makeUser('alice'), await makeUser('bob'), await makeUser('carol')];
    const hotelId = await makeHotel(admin, { slots: 5 });
    await Promise.all([a, b, c].map((u) => fund(u, 100)));
    await Promise.all([a, b, c].map((u) => start(u, hotelId).expect(201)));
    const ra = (await submit(a, hotelId)).body.data.reviewId;
    const rb = (await submit(b, hotelId)).body.data.reviewId;
    await request(app).put(`/api/admin/hotel-reviews/${ra}/approve`).set(admin.auth).expect(200);
    await request(app).put(`/api/admin/hotel-reviews/${rb}/reject`).set(admin.auth).send({ reason: 'Wrong hotel in photo' }).expect(200);

    const res = await request(app).get('/api/admin/hotels/summary').set(admin.auth).expect(200);
    expect(res.body.data).toMatchObject({
      bonusesPaid: 200,
      approvedReviews: 1,
      feesCollected: 200, // 300 charged - 100 refunded
      awaitingApproval: { count: 0, bonuses: 0 },
      reserved: { count: 1, bonuses: 200 }, // carol
      openSlotBonuses: 600, // 5 slots - 2 in use
      outstandingCommitment: 800,
    });

    const hotels = await request(app).get('/api/admin/hotels').set(admin.auth).expect(200);
    expect(hotels.body.data.hotels[0]).toMatchObject({ slots: 5, slotsUsed: 2, reserved: 1, awaitingApproval: 0, fundingCommitted: 1000 });
  });

  test('slots cannot be lowered below what is in use, and admin routes are closed to members', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const hotelId = await makeHotel(admin, { slots: 3 });
    await start(alice, hotelId).expect(201);

    expect((await request(app).put(`/api/admin/hotels/${hotelId}`).set(admin.auth).send({ slots: 0 })).status).toBe(422);
    await request(app).put(`/api/admin/hotels/${hotelId}`).set(admin.auth).send({ slots: 1 }).expect(200);
    expect((await request(app).put(`/api/admin/hotels/${hotelId}`).set(admin.auth).send({ lat: 1 })).status).toBe(422);

    for (const path of ['/api/admin/hotels', '/api/admin/hotels/summary', '/api/admin/hotel-reviews']) {
      expect((await request(app).get(path).set(alice.auth)).status).toBe(403);
    }
    expect((await request(app).post('/api/admin/hotels').set(alice.auth).send({})).status).toBe(403);
  });
});
