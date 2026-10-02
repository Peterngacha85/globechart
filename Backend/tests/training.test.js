const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const db = require('./helpers/db');
const { makeUser, makeAdmin, fund, balances } = require('./helpers/factory');
const app = require('../app');
const User = require('../models/User');
const Training = require('../models/Training');
const TrainingRegistration = require('../models/TrainingRegistration');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');

before(db.connect);
beforeEach(db.clear);
after(db.disconnect);

const inHours = (h) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

async function makeTraining(admin, overrides = {}) {
  const res = await request(app)
    .post('/api/admin/trainings')
    .set(admin.auth)
    .send({ title: 'Prompt Writing 101', venue: 'Hilton, Nairobi CBD', startsAt: inHours(72), fee: 100, seats: 20, ...overrides });
  if (res.status !== 201) throw new Error(`makeTraining failed: ${JSON.stringify(res.body)}`);
  return res.body.data.trainingId;
}

const register = (user, id) => request(app).post(`/api/trainings/${id}/register`).set(user.auth).send({});

describe('registering', () => {
  test('charges the fee, takes a seat and issues a ticket', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 150);
    const id = await makeTraining(admin);

    const res = await register(alice, id);
    expect(res.status).toBe(201);
    expect(res.body.data.ticketCode).toMatch(/^[A-Z0-9]{8}$/);
    expect((await balances(alice)).main).toBe(50);
    expect((await Training.findById(id)).seatsTaken).toBe(1);
    expect(await Transaction.countDocuments({ user: alice.id, type: 'training_fee', amount: 100 })).toBe(1);
    const note = await Notification.findOne({ user: alice.id, title: 'Training seat booked' });
    expect(note.message).toContain(res.body.data.ticketCode);

    expect((await register(alice, id)).status).toBe(409);
    const list = await request(app).get('/api/trainings').set(alice.auth);
    expect(list.body.data.trainings[0]).toMatchObject({ seatsLeft: 19, myRegistration: { status: 'registered' } });
  });

  test('bonus credit pays first; full sessions and past sessions refuse', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await makeUser('alice'), await makeUser('bob')];
    await User.updateOne({ _id: a.id }, { $inc: { 'bonusWallet.balance': 100 } });
    await fund(b, 100);
    const id = await makeTraining(admin, { seats: 1 });

    await register(a, id).expect(201);
    expect((await User.findById(a.id)).bonusWallet.balance).toBe(0);
    expect((await register(b, id)).status).toBe(409);
    expect((await balances(b)).main).toBe(100);

    await Training.updateOne({ _id: id }, { startsAt: new Date(Date.now() - 1000), seats: 5 });
    expect((await register(b, id)).status).toBe(404);
  });

  test('concurrent registrations never overfill the room', async () => {
    const admin = await makeAdmin();
    const id = await makeTraining(admin, { seats: 2 });
    const users = await Promise.all(['user1', 'user2', 'user3', 'user4'].map((n) => makeUser(n)));
    await Promise.all(users.map((u) => fund(u, 100)));
    const results = await Promise.all(users.map((u) => register(u, id)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect((await Training.findById(id)).seatsTaken).toBe(2);
    expect(await Transaction.countDocuments({ type: 'training_fee' })).toBe(2);
  });
});

describe('cancelling', () => {
  test('a member is refunded when cancelling 24h+ before, and may register again', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const id = await makeTraining(admin, { startsAt: inHours(30) });
    const reg = (await register(alice, id)).body.data;

    await request(app).post(`/api/trainings/registrations/${reg.registrationId}/cancel`).set(alice.auth).expect(200);
    expect((await balances(alice)).main).toBe(100);
    expect((await Training.findById(id)).seatsTaken).toBe(0);
    expect((await Transaction.findOne({ user: alice.id, type: 'refund' })).description).toBe('Refund: Prompt Writing 101 registration (you cancelled)');
    await register(alice, id).expect(201);
  });

  test('no member refund inside 24 hours, and nobody can cancel someone else', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await fund(alice, 100);
    const id = await makeTraining(admin, { startsAt: inHours(10) });
    const reg = (await register(alice, id)).body.data;

    expect((await request(app).post(`/api/trainings/registrations/${reg.registrationId}/cancel`).set(bob.auth)).status).toBe(404);
    const late = await request(app).post(`/api/trainings/registrations/${reg.registrationId}/cancel`).set(alice.auth);
    expect(late.status).toBe(409);
    expect(late.body.message).toContain('24 hours');
    expect((await balances(alice)).main).toBe(0);
  });

  test('the admin cancelling a session refunds every member, whatever the timing', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await makeUser('alice'), await makeUser('bob')];
    await fund(a, 100);
    await User.updateOne({ _id: b.id }, { $inc: { 'bonusWallet.balance': 100 } });
    const id = await makeTraining(admin, { startsAt: inHours(2) });
    await register(a, id).expect(201);
    await register(b, id).expect(201);

    expect((await request(app).post(`/api/admin/trainings/${id}/cancel`).set(admin.auth).send({})).status).toBe(422);
    const res = await request(app).post(`/api/admin/trainings/${id}/cancel`).set(admin.auth).send({ reason: 'Venue unavailable' }).expect(200);
    expect(res.body.data.refunded).toBe(2);
    expect((await balances(a)).main).toBe(100);
    expect((await User.findById(b.id)).bonusWallet.balance).toBe(100); // back to bonus credit
    expect((await Notification.findOne({ user: a.id, title: 'Session cancelled' })).message).toContain('Venue unavailable');
    expect((await request(app).post(`/api/admin/trainings/${id}/cancel`).set(admin.auth).send({ reason: 'again' })).status).toBe(409);

    const dash = await request(app).get('/api/dashboard/summary').set(a.auth);
    expect(dash.body.data.refunds).toEqual({ total: 100, count: 1 });
  });
});

describe('programmes', () => {
  test('AI prompt and Y99 sessions are listed separately, defaulting to AI prompt', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const ai = await makeTraining(admin);
    const y99 = await makeTraining(admin, { program: 'y99', title: 'Y99: Start a side hustle' });
    expect((await request(app).post('/api/admin/trainings').set(admin.auth).send({ program: 'other', title: 'X class', venue: 'Somewhere', startsAt: inHours(48), fee: 100, seats: 5 })).status).toBe(422);

    const onlyY99 = await request(app).get('/api/trainings?program=y99').set(alice.auth);
    expect(onlyY99.body.data.trainings.map((t) => [t.trainingId, t.program])).toEqual([[y99, 'y99']]);
    const onlyAi = await request(app).get('/api/trainings?program=ai_prompt').set(alice.auth);
    expect(onlyAi.body.data.trainings.map((t) => t.trainingId)).toEqual([ai]);
    expect((await request(app).get('/api/trainings').set(alice.auth)).body.data.trainings).toHaveLength(2);

    await register(alice, y99).expect(201);
    expect((await Notification.findOne({ user: alice.id, title: 'Training seat booked' })).actionUrl).toBe('/dashboard/y99');
    expect((await request(app).get('/api/trainings/my?program=y99').set(alice.auth)).body.data.registrations).toHaveLength(1);
    expect((await request(app).get('/api/trainings/my?program=ai_prompt').set(alice.auth)).body.data.registrations).toHaveLength(0);
    expect((await request(app).get('/api/admin/trainings?program=y99').set(admin.auth)).body.data.trainings).toHaveLength(1);
  });
});

describe('class day', () => {
  async function setup() {
    const admin = await makeAdmin();
    const [a, b] = [await makeUser('alice'), await makeUser('bob')];
    await fund(a, 100);
    await fund(b, 100);
    const id = await makeTraining(admin, { startsAt: inHours(48) });
    const ra = (await register(a, id)).body.data;
    const rb = (await register(b, id)).body.data;
    return { admin, a, b, id, ra, rb };
  }

  test('check-in by ticket code, then complete marks the rest absent', async () => {
    const { admin, id, ra, rb } = await setup();
    expect((await request(app).post(`/api/admin/trainings/${id}/check-in`).set(admin.auth).send({ ticketCode: 'NOPE1234' })).status).toBe(404);
    const ok = await request(app).post(`/api/admin/trainings/${id}/check-in`).set(admin.auth).send({ ticketCode: ra.ticketCode.toLowerCase() }).expect(200);
    expect(ok.body.data).toMatchObject({ status: 'attended', member: { username: 'alice' } });
    const again = await request(app).post(`/api/admin/trainings/${id}/check-in`).set(admin.auth).send({ ticketCode: ra.ticketCode });
    expect(again.body.message).toBe('Already checked in');

    expect((await request(app).post(`/api/admin/trainings/${id}/complete`).set(admin.auth)).status).toBe(409); // not started yet
    await Training.updateOne({ _id: id }, { startsAt: new Date(Date.now() - 1000) });
    const done = await request(app).post(`/api/admin/trainings/${id}/complete`).set(admin.auth).expect(200);
    expect(done.body.data.absent).toBe(1);
    expect((await TrainingRegistration.findById(rb.registrationId)).status).toBe('absent');
    expect(await Transaction.countDocuments({ type: 'refund' })).toBe(0); // absent members are not refunded
  });

  test('certificates go only to attendees and can be verified publicly', async () => {
    const { admin, a, id, ra, rb } = await setup();
    expect((await request(app).post(`/api/admin/trainings/${id}/certify`).set(admin.auth).send({ registrationId: ra.registrationId })).status).toBe(409);
    await request(app).post(`/api/admin/trainings/${id}/check-in`).set(admin.auth).send({ registrationId: ra.registrationId }).expect(200);
    const cert = await request(app).post(`/api/admin/trainings/${id}/certify`).set(admin.auth).send({ registrationId: ra.registrationId }).expect(200);
    const code = cert.body.data.certificateCode;
    expect(code).toMatch(/^GC-[A-Z0-9]{10}$/);
    expect((await request(app).post(`/api/admin/trainings/${id}/certify`).set(admin.auth).send({ registrationId: ra.registrationId })).status).toBe(409);
    expect((await request(app).post(`/api/admin/trainings/${id}/certify`).set(admin.auth).send({ registrationId: rb.registrationId })).status).toBe(409);
    expect((await request(app).post(`/api/admin/trainings/${id}/undo-check-in`).set(admin.auth).send({ registrationId: ra.registrationId })).status).toBe(409);

    const verify = await request(app).get(`/api/trainings/certificates/${code.toLowerCase()}`).expect(200); // no login needed
    expect(verify.body.data).toMatchObject({ holder: 'alice', course: 'Prompt Writing 101', certificateCode: code });
    expect((await request(app).get('/api/trainings/certificates/GC-FAKE000000')).status).toBe(404);

    const mine = await request(app).get('/api/trainings/my').set(a.auth);
    expect(mine.body.data.registrations[0]).toMatchObject({ status: 'attended', certificateCode: code });
  });

  test('admin list counts seats and outcomes; members are kept out', async () => {
    const { admin, a, id, ra } = await setup();
    await request(app).post(`/api/admin/trainings/${id}/check-in`).set(admin.auth).send({ ticketCode: ra.ticketCode }).expect(200);
    const list = await request(app).get('/api/admin/trainings').set(admin.auth).expect(200);
    expect(list.body.data).toMatchObject({ feesKept: 200 });
    expect(list.body.data.trainings[0]).toMatchObject({ seatsTaken: 2, registered: 1, attended: 1 });
    const regs = await request(app).get(`/api/admin/trainings/${id}/registrations`).set(admin.auth).expect(200);
    expect(regs.body.data.registrations.map((r) => r.member.username)).toEqual(['alice', 'bob']);

    for (const path of ['/api/admin/trainings', `/api/admin/trainings/${id}/registrations`]) {
      expect((await request(app).get(path).set(a.auth)).status).toBe(403);
    }
    expect((await request(app).post('/api/admin/trainings').set(admin.auth).send({ title: 'Old', venue: 'Somewhere', startsAt: inHours(-1), fee: 100, seats: 5 })).status).toBe(422);
  });
});
