const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const db = require('./helpers/db');
const { makeUser, makeAdmin } = require('./helpers/factory');
const app = require('../app');
const { config, loadConfig } = require('../config/env');

before(db.connect);
beforeEach(async () => {
  config.comingSoon.enabled = false;
  config.comingSoon.launchDate = undefined;
  await db.clear();
});
after(async () => {
  config.comingSoon.enabled = false;
  await db.disconnect();
});

describe('COMING_SOON in .env', () => {
  test('reads ON/OFF in any case, defaults to OFF, and validates LAUNCH_DATE', () => {
    const load = (extra) => loadConfig({ ...process.env, ...extra }).comingSoon;
    expect(load({ COMING_SOON: 'ON' }).enabled).toBe(true);
    expect(load({ COMING_SOON: 'on' }).enabled).toBe(true);
    expect(load({ COMING_SOON: 'true' }).enabled).toBe(true);
    expect(load({ COMING_SOON: 'OFF' }).enabled).toBe(false);
    expect(load({ COMING_SOON: undefined }).enabled).toBe(false);
    expect(() => load({ COMING_SOON: 'maybe' })).toThrow(/COMING_SOON must be ON or OFF/);
    expect(load({ LAUNCH_DATE: '2026-11-01T09:00:00+03:00' }).launchDate.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(() => load({ LAUNCH_DATE: 'next week' })).toThrow(/LAUNCH_DATE/);
  });
});

describe('coming soon mode', () => {
  test('the public site endpoint reports the mode and launch date', async () => {
    expect((await request(app).get('/api/site')).body.data).toEqual({ comingSoon: false, launchDate: null });
    config.comingSoon.enabled = true;
    config.comingSoon.launchDate = new Date('2026-11-01T06:00:00Z');
    expect((await request(app).get('/api/site')).body.data).toEqual({ comingSoon: true, launchDate: '2026-11-01T06:00:00.000Z' });
  });

  test('members cannot sign up, sign in or use the API while ON', async () => {
    const alice = await makeUser('alice'); // registered while the site was open
    config.comingSoon.enabled = true;

    const reg = await request(app).post('/api/auth/register').send({ username: 'bob', phone: '0712000999', password: 'secret123', agreeTerms: true });
    expect(reg.status).toBe(503);
    expect(reg.body.comingSoon).toBe(true);

    const login = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'secret123' });
    expect(login.status).toBe(503);
    expect(login.body.comingSoon).toBe(true);

    const profile = await request(app).get('/api/users/profile').set(alice.auth);
    expect(profile.status).toBe(503);
    expect(profile.body.comingSoon).toBe(true);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  test('keeps its message in production, where other 5xx errors are hidden', async () => {
    const alice = await makeUser('alice');
    config.comingSoon.enabled = true;
    const wasProd = config.isProd;
    config.isProd = true;
    try {
      const res = await request(app).get('/api/users/profile').set(alice.auth);
      expect(res.body).toMatchObject({ statusCode: 503, comingSoon: true, message: 'Globechart is launching soon. Please check back shortly.' });
    } finally {
      config.isProd = wasProd;
    }
  });

  test('the admin is closed out too while ON: no dashboard for anyone', async () => {
    const admin = await makeAdmin(); // signed in while the site was open
    config.comingSoon.enabled = true;
    const { config: env } = require('../config/env');
    const login = await request(app).post('/api/auth/login').send({ username: env.admin.username, password: env.admin.password });
    expect(login.status).toBe(503);
    expect(login.body.comingSoon).toBe(true);
    expect((await request(app).get('/api/admin/users').set(admin.auth)).status).toBe(503);
    expect((await request(app).get('/api/users/profile').set(admin.auth)).status).toBe(503);
  });

  test('turning it OFF opens everything again', async () => {
    const alice = await makeUser('alice');
    config.comingSoon.enabled = true;
    expect((await request(app).get('/api/users/profile').set(alice.auth)).status).toBe(503);
    config.comingSoon.enabled = false;
    await request(app).get('/api/users/profile').set(alice.auth).expect(200);
    await request(app).post('/api/auth/login').send({ username: 'alice', password: 'secret123' }).expect(200);
  });
});
