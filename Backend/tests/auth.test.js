const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const db = require('./helpers/db');
const app = require('../app');
const User = require('../models/User');
const { config } = require('../config/env');
const { syncAdminFromEnv } = require('../services/adminSync');

const silent = { log: () => {}, warn: () => {} };

const newUser = (overrides = {}) => ({
  username: 'alice',
  phone: '0712345678',
  password: 'secret123',
  country: 'Kenya',
  agreeTerms: true,
  ...overrides,
});

const register = (body) => request(app).post('/api/auth/register').send(newUser(body));
const login = (username, password, extra = {}) => request(app).post('/api/auth/login').send({ username, password, ...extra });

before(db.connect);
beforeEach(db.clear);
after(db.disconnect);

describe('registration', () => {
  test('creates a user without an email and returns tokens', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.data.username).toBe('alice');
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.referralCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(res.body.data.role).toBe('user');
  });

  test('normalizes phone formats and lowercases the username', async () => {
    const res = await register({ username: 'Bob_1', phone: '+254712345678' });
    expect(res.status).toBe(201);
    const user = await User.findOne({ username: 'bob_1' });
    expect(user.phone).toBe('0712345678');
  });

  test('ignores a role sent in the body', async () => {
    const res = await register({ role: 'super_admin', isSystemAdmin: true });
    expect(res.status).toBe(201);
    const user = await User.findOne({ username: 'alice' });
    expect(user.role).toBe('user');
    expect(user.isSystemAdmin).toBe(false);
  });

  test('rejects duplicates with 409, invalid input with 422, missing consent with 422', async () => {
    await register();
    expect((await register({ phone: '0798765432' })).status).toBe(409); // same username
    expect((await register({ username: 'other' })).status).toBe(409); // same phone
    expect((await register({ username: 'x y', phone: '0722222222' })).status).toBe(422);
    expect((await register({ username: 'carol', phone: '12345' })).status).toBe(422);
    expect((await register({ username: 'dave', phone: '0733333333', password: '123' })).status).toBe(422);
    expect((await register({ username: 'erin', phone: '0744444444', agreeTerms: false })).status).toBe(422);
  });

  test('links referrals by code or username and counts up to 5 levels', async () => {
    const chain = [];
    let ref;
    for (let i = 0; i < 6; i += 1) {
      const body = newUser({ username: `user${i}`, phone: `071000000${i}`, ...(ref && { referralCode: ref }) });
      const res = await request(app).post('/api/auth/register').send(body);
      expect(res.status).toBe(201);
      chain.push(res.body.data);
      // alternate between referral code and username to cover both lookups
      ref = i % 2 === 0 ? res.body.data.referralCode : res.body.data.username;
    }

    const top = await User.findOne({ username: 'user0' });
    expect(top.networkTree.level1Count).toBe(1);
    expect(top.networkTree.level5Count).toBe(1); // user5 is 5 levels below user0
    const second = await User.findOne({ username: 'user1' });
    expect(second.networkTree.level4Count).toBe(1);
    expect(second.networkTree.level5Count).toBe(0);

    const child = await User.findOne({ username: 'user1' });
    expect(String(child.referredBy)).toBe(String(chain[0].userId));
  });

  test('rejects an unknown referral code', async () => {
    const res = await register({ referralCode: 'NOSUCH' });
    expect(res.status).toBe(422);
  });
});

describe('login and tokens', () => {
  beforeEach(async () => {
    await register();
  });

  test('logs in (case-insensitive username) and rejects wrong credentials with the same message', async () => {
    const ok = await login('ALICE', 'secret123');
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
    expect(ok.body.data.refreshToken).toBeTruthy();

    const wrongPass = await login('alice', 'nope-nope');
    const unknown = await login('ghost', 'secret123');
    expect(wrongPass.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPass.body.message).toBe(unknown.body.message);
  });

  test('protects routes and serves the profile', async () => {
    expect((await request(app).get('/api/users/profile')).status).toBe(401);
    expect((await request(app).get('/api/users/profile').set('Authorization', 'Bearer garbage')).status).toBe(401);

    const { body } = await login('alice', 'secret123');
    const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('alice');
    expect(res.body.data.password).toBeUndefined();
  });

  test('a suspended user is locked out immediately, even with a valid token', async () => {
    const { body } = await login('alice', 'secret123');
    await User.updateOne({ username: 'alice' }, { status: 'suspended' });

    const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${body.data.token}`);
    expect(res.status).toBe(403);
    expect((await login('alice', 'secret123')).status).toBe(403);
  });

  test('refresh token issues a new access token; an access token is not accepted as refresh', async () => {
    const { body } = await login('alice', 'secret123', { rememberMe: true });
    const ok = await request(app).post('/api/auth/refresh-token').send({ refreshToken: body.data.refreshToken });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();

    const bad = await request(app).post('/api/auth/refresh-token').send({ refreshToken: body.data.token });
    expect(bad.status).toBe(401);
  });

  test('changing the password signs out old sessions', async () => {
    const { body } = await login('alice', 'secret123');
    const auth = { Authorization: `Bearer ${body.data.token}` };

    const wrong = await request(app).post('/api/users/change-password').set(auth).send({ currentPassword: 'bad', newPassword: 'newsecret1' });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/api/users/change-password').set(auth).send({ currentPassword: 'secret123', newPassword: 'newsecret1' });
    expect(ok.status).toBe(200);

    expect((await request(app).get('/api/users/profile').set(auth)).status).toBe(401);
    expect((await login('alice', 'newsecret1')).status).toBe(200);
  });

  test('password reset flow (email stubbed) and no email enumeration', async () => {
    await User.updateOne({ username: 'alice' }, { email: 'alice@example.com' });

    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'alice@example.com' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);

    const stored = await User.findOne({ username: 'alice' }).select('+passwordResetToken');
    expect(stored.passwordResetToken).toBeTruthy();

    const bad = await request(app).post('/api/auth/reset-password/not-a-real-token').send({ newPassword: 'whatever1' });
    expect(bad.status).toBe(400);
  });
});

describe('env-managed admin', () => {
  beforeEach(async () => {
    await syncAdminFromEnv(config, silent);
  });

  test('the admin from .env can log in and is a super_admin', async () => {
    const res = await login(config.admin.username, config.admin.password);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('super_admin');
  });

  test('the admin password and email cannot be changed through the API', async () => {
    const { body } = await login(config.admin.username, config.admin.password);
    const auth = { Authorization: `Bearer ${body.data.token}` };

    const pw = await request(app).post('/api/users/change-password').set(auth).send({ currentPassword: config.admin.password, newPassword: 'newsecret1' });
    expect(pw.status).toBe(403);

    const email = await request(app).put('/api/users/profile').set(auth).send({ email: 'other@example.com' });
    expect(email.status).toBe(403);

    const reset = await request(app).post('/api/auth/forgot-password').send({ email: config.admin.email });
    expect(reset.status).toBe(200);
    const admin = await User.findOne({ isSystemAdmin: true }).select('+passwordResetToken');
    expect(admin.passwordResetToken).toBeUndefined();
  });
});
