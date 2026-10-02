const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const db = require('./helpers/db');
const { makeUser, makeAdmin, fund, balances } = require('./helpers/factory');
const app = require('../app');
const Business = require('../models/Business');
const JobApplication = require('../models/JobApplication');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');

before(db.connect);
beforeEach(db.clear);
after(db.disconnect);

let phoneCounter = 0;
async function makeBusiness(admin, overrides = {}) {
  phoneCounter += 1;
  const username = overrides.username || `biz${phoneCounter}`;
  const res = await request(app)
    .post('/api/admin/chat-businesses')
    .set(admin.auth)
    .send({
      name: 'Acme Online Shop',
      payInfo: 'Ksh 500 per day, paid by Globechart',
      unlockFee: 100,
      openings: 1,
      username,
      phone: `0799${String(100000 + phoneCounter).slice(-6)}`,
      password: 'business123',
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`makeBusiness failed: ${JSON.stringify(res.body)}`);
  const login = await request(app).post('/api/auth/login').send({ username, password: 'business123' });
  return { businessId: res.body.data.businessId, auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

const unlock = (user, businessId) => request(app).post(`/api/chat-jobs/${businessId}/unlock`).set(user.auth).send({});
const say = (who, applicationId, text) => request(app).post(`/api/chat-jobs/applications/${applicationId}/messages`).set(who.auth).send({ text });
const decide = (who, applicationId, outcome, note) => request(app).put(`/api/chat-jobs/applications/${applicationId}/decide`).set(who.auth).send({ outcome, note });

describe('unlocking a business', () => {
  test('charges the fee and opens a chat both sides can use', async () => {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin);
    const alice = await makeUser('alice');
    await fund(alice, 150);

    const res = await unlock(alice, biz.businessId);
    expect(res.status).toBe(201);
    const id = res.body.data.applicationId;
    expect(res.body.data).toMatchObject({ status: 'pending', fee: 100, refunded: false });
    expect((await balances(alice)).main).toBe(50);
    expect(await Transaction.countDocuments({ user: alice.id, type: 'unlock_fee', amount: 100 })).toBe(1);

    await say(alice, id, 'Hello, I would like the chat support job').expect(201);
    await say(biz, id, 'Hi Alice, tell me about your experience').expect(201);
    const msgs = await request(app).get(`/api/chat-jobs/applications/${id}/messages`).set(biz.auth).expect(200);
    expect(msgs.body.data.messages.map((m) => m.senderRole)).toEqual(['member', 'business']);
    expect((await JobApplication.findById(id)).respondedAt).toBeTruthy();

    const inbox = await request(app).get('/api/chat-jobs/inbox').set(biz.auth).expect(200);
    expect(inbox.body.data.applications[0].member.username).toBe('alice');
  });

  test('outsiders cannot read or write the chat', async () => {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin);
    const other = await makeBusiness(admin, { name: 'Other Ltd' });
    const alice = await makeUser('alice');
    const mallory = await makeUser('mallory');
    await fund(alice, 100);
    const id = (await unlock(alice, biz.businessId)).body.data.applicationId;

    expect((await request(app).get(`/api/chat-jobs/applications/${id}/messages`).set(mallory.auth)).status).toBe(404);
    expect((await say(other, id, 'hi')).status).toBe(404);
    expect((await request(app).get(`/api/chat-jobs/applications/${id}/messages`).set(admin.auth)).status).toBe(200);
    expect((await request(app).get('/api/chat-jobs/inbox').set(alice.auth)).status).toBe(403);
  });

  test('only one open application at a time, even with concurrent taps', async () => {
    const admin = await makeAdmin();
    const a = await makeBusiness(admin, { openings: 5 });
    const b = await makeBusiness(admin, { name: 'Beta', openings: 5 });
    const alice = await makeUser('alice');
    await fund(alice, 1000);

    const results = await Promise.all([unlock(alice, a.businessId), unlock(alice, a.businessId), unlock(alice, b.businessId)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await balances(alice)).main).toBe(900);
  });

  test('without enough balance nothing is charged or opened', async () => {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin);
    const alice = await makeUser('alice');
    await fund(alice, 50);
    expect((await unlock(alice, biz.businessId)).status).toBe(402);
    expect((await balances(alice)).main).toBe(50);
    expect((await Business.findById(biz.businessId)).pendingCount).toBe(0);
  });

  test('accepts at most 3 applicants per unfilled opening', async () => {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin, { openings: 1 });
    const users = await Promise.all(['user1', 'user2', 'user3', 'user4'].map((n) => makeUser(n)));
    await Promise.all(users.map((u) => fund(u, 100)));

    const results = await Promise.all(users.map((u) => unlock(u, biz.businessId)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await Transaction.countDocuments({ type: 'unlock_fee' })).toBe(3);
  });

  test('business and admin accounts cannot unlock', async () => {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin);
    const other = await makeBusiness(admin, { name: 'Other' });
    expect((await unlock(other, biz.businessId)).status).toBe(403);
    expect((await unlock(admin, biz.businessId)).status).toBe(403);
  });
});

describe('outcomes and refunds', () => {
  async function applied(openings = 1) {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin, { openings });
    const alice = await makeUser('alice');
    await fund(alice, 100);
    const id = (await unlock(alice, biz.businessId)).body.data.applicationId;
    return { admin, biz, alice, id };
  }

  test('hired keeps the fee and fills an opening', async () => {
    const { biz, alice, id } = await applied();
    expect((await decide(alice, id, 'hired')).status).toBe(403); // members can't hire themselves
    await decide(biz, id, 'hired', 'Start Monday 8am').expect(200);

    expect((await balances(alice)).main).toBe(0);
    expect(await Business.findById(biz.businessId)).toMatchObject({ hiredCount: 1, pendingCount: 0 });
    const note = await Notification.findOne({ user: alice.id, title: /hired/ });
    expect(note.message).toContain('Start Monday 8am');
    await say(alice, id, 'Thank you!').expect(201); // the chat stays open after hiring
    expect((await decide(biz, id, 'not_selected')).status).toBe(409);
  });

  test('not selected refunds the fee and records it as a refund', async () => {
    const { biz, alice, id } = await applied();
    await decide(biz, id, 'not_selected', 'We need someone with Swahili and French').expect(200);

    expect((await balances(alice)).main).toBe(100);
    const refund = await Transaction.findOne({ user: alice.id, type: 'refund' });
    expect(refund).toMatchObject({ amount: 100, status: 'completed' });
    expect(refund.description).toBe('Refund: Acme Online Shop unlock fee (not selected)');
    expect((await say(alice, id, 'ok')).status).toBe(409); // chat closed

    const dash = await request(app).get('/api/dashboard/summary').set(alice.auth);
    expect(dash.body.data).toMatchObject({ refunds: { total: 100, count: 1 }, feesAwaitingOutcome: 0 });
    const mine = await request(app).get('/api/chat-jobs/my-applications').set(alice.auth);
    expect(mine.body.data).toMatchObject({ totalRefunded: 100 });
    expect(mine.body.data.applications[0]).toMatchObject({ status: 'not_selected', refunded: true });

    await fund(alice, 100);
    expect((await unlock(alice, biz.businessId)).status).toBe(409); // can't pay again for the same business
  });

  test('no business reply within 48 hours refunds automatically', async () => {
    const { biz, alice, id } = await applied();
    const dash = await request(app).get('/api/dashboard/summary').set(alice.auth);
    expect(dash.body.data.feesAwaitingOutcome).toBe(100);

    await say(alice, id, 'Hello?').expect(201); // the member's own messages don't count as a reply
    await JobApplication.updateOne({ _id: id }, { replyDeadline: new Date(Date.now() - 1000) });

    expect((await say(biz, id, 'Sorry, late reply')).status).toBe(409); // too late to stop the refund
    expect((await JobApplication.findById(id)).status).toBe('no_response');
    expect((await balances(alice)).main).toBe(100);
    expect((await Transaction.findOne({ user: alice.id, type: 'refund' })).description).toContain('no reply within 48 hours');
    expect(await Notification.countDocuments({ user: alice.id, title: 'Unlock fee refunded' })).toBe(1);
    expect((await Business.findById(biz.businessId)).pendingCount).toBe(0);

    await fund(alice, 100);
    await unlock(alice, biz.businessId).expect(201); // may try the same business again
  });

  test('a reply stops the 48-hour refund, but no decision in 7 days still refunds', async () => {
    const { biz, alice, id } = await applied();
    await say(biz, id, 'Hi! Let me review your profile').expect(201);
    await JobApplication.updateOne({ _id: id }, { replyDeadline: new Date(Date.now() - 1000) });
    await request(app).get('/api/chat-jobs/my-applications').set(alice.auth).expect(200);
    expect((await JobApplication.findById(id)).status).toBe('pending');

    await JobApplication.updateOne({ _id: id }, { decisionDeadline: new Date(Date.now() - 1000) });
    await request(app).get('/api/chat-jobs/my-applications').set(alice.auth).expect(200);
    expect((await JobApplication.findById(id)).status).toBe('expired');
    expect((await balances(alice)).main).toBe(100);
    expect((await decide(biz, id, 'hired')).status).toBe(409);
  });

  test('a refund is paid once even if expiry and a decision race', async () => {
    const { biz, alice, id } = await applied();
    await JobApplication.updateOne({ _id: id }, { replyDeadline: new Date(Date.now() - 1000) });
    await Promise.all([
      decide(biz, id, 'not_selected'),
      request(app).get('/api/chat-jobs/my-applications').set(alice.auth),
      request(app).get('/api/chat-jobs').set(alice.auth),
    ]);
    expect((await balances(alice)).main).toBe(100);
    expect(await Transaction.countDocuments({ user: alice.id, type: 'refund' })).toBe(1);
  });

  test('hiring is refused once every opening is filled', async () => {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin, { openings: 1 });
    const [a, b] = [await makeUser('alice'), await makeUser('bob')];
    await fund(a, 100);
    await fund(b, 100);
    const ia = (await unlock(a, biz.businessId)).body.data.applicationId;
    const ib = (await unlock(b, biz.businessId)).body.data.applicationId;

    await decide(biz, ia, 'hired').expect(200);
    expect((await decide(biz, ib, 'hired')).status).toBe(409);
    await decide(admin, ib, 'not_selected').expect(200); // the admin can decide too
    expect((await balances(b)).main).toBe(100);

    const list = await request(app).get('/api/chat-jobs').set(b.auth);
    expect(list.body.data.businesses[0]).toMatchObject({ openingsLeft: 0, accepting: false });
  });
});

describe('admin', () => {
  test('creates a business with its own login and reports fees and refunds', async () => {
    const admin = await makeAdmin();
    const biz = await makeBusiness(admin, { username: 'acme_support', openings: 2 });
    const profile = await request(app).get('/api/users/profile').set(biz.auth).expect(200);
    expect(profile.body.data.role).toBe('business');

    const [a, b] = [await makeUser('alice'), await makeUser('bob')];
    await fund(a, 100);
    await fund(b, 100);
    const ia = (await unlock(a, biz.businessId)).body.data.applicationId;
    const ib = (await unlock(b, biz.businessId)).body.data.applicationId;
    await decide(biz, ia, 'hired').expect(200);
    await decide(biz, ib, 'not_selected').expect(200);

    const res = await request(app).get('/api/admin/chat-businesses/summary').set(admin.auth).expect(200);
    expect(res.body.data).toMatchObject({ feesCharged: 200, refunded: { total: 100, count: 1 }, feesKept: 100, pending: { count: 0 }, hired: 1 });

    const list = await request(app).get('/api/admin/chat-businesses').set(admin.auth).expect(200);
    expect(list.body.data.businesses[0]).toMatchObject({ hiredCount: 1, pendingCount: 0, account: { username: 'acme_support' } });
    const apps = await request(app).get('/api/admin/job-applications?status=hired').set(admin.auth).expect(200);
    expect(apps.body.data.applications.map((x) => x.member.username)).toEqual(['alice']);
  });

  test('validates the login, openings and password reset; closed to members', async () => {
    const admin = await makeAdmin();
    const alice = await makeUser('alice');
    expect((await request(app).post('/api/admin/chat-businesses').set(admin.auth).send({ name: 'Xyz Ltd', unlockFee: 100, openings: 1, username: 'alice', phone: '0799000111', password: 'business123' })).status).toBe(409);

    const biz = await makeBusiness(admin, { username: 'acme', openings: 1 });
    await fund(alice, 100);
    const id = (await unlock(alice, biz.businessId)).body.data.applicationId;
    await decide(biz, id, 'hired').expect(200);
    expect((await request(app).put(`/api/admin/chat-businesses/${biz.businessId}`).set(admin.auth).send({ openings: 0 })).status).toBe(422);

    await request(app).put(`/api/admin/chat-businesses/${biz.businessId}`).set(admin.auth).send({ newPassword: 'newpass123' }).expect(200);
    expect((await request(app).get('/api/chat-jobs/inbox').set(biz.auth)).status).toBe(401); // old session signed out
    await request(app).post('/api/auth/login').send({ username: 'acme', password: 'newpass123' }).expect(200);

    for (const path of ['/api/admin/chat-businesses', '/api/admin/chat-businesses/summary', '/api/admin/job-applications']) {
      expect((await request(app).get(path).set(alice.auth)).status).toBe(403);
    }
  });
});
