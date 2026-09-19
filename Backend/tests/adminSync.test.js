const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const db = require('./helpers/db');
const User = require('../models/User');
const { loadConfig } = require('../config/env');
const { syncAdminFromEnv } = require('../services/adminSync');

const silent = { log: () => {}, warn: () => {} };
const cfgWith = (overrides = {}) => loadConfig({ ...process.env, ...overrides });

before(db.connect);
beforeEach(db.clear);
after(db.disconnect);

describe('syncAdminFromEnv', () => {
  test('creates the admin from .env values when none exists', async () => {
    const result = await syncAdminFromEnv(cfgWith(), silent);
    expect(result.action).toBe('created');

    const admin = await User.findOne({ isSystemAdmin: true }).select('+password');
    expect(admin.username).toBe('admin');
    expect(admin.email).toBe('admin@example.com');
    expect(admin.role).toBe('super_admin');
    expect(admin.password).not.toBe('AdminPass#2026'); // stored hashed
    expect(await admin.comparePassword('AdminPass#2026')).toBe(true);
  });

  test('is a no-op when nothing changed', async () => {
    await syncAdminFromEnv(cfgWith(), silent);
    const before = await User.findOne({ isSystemAdmin: true }).select('+password');
    const result = await syncAdminFromEnv(cfgWith(), silent);
    const after = await User.findOne({ isSystemAdmin: true }).select('+password');

    expect(result.action).toBe('unchanged');
    expect(after.password).toBe(before.password);
    expect(after.tokenVersion).toBe(before.tokenVersion);
  });

  test('changing the password in .env updates the same admin and revokes old tokens', async () => {
    await syncAdminFromEnv(cfgWith(), silent);
    const before = await User.findOne({ isSystemAdmin: true });

    await syncAdminFromEnv(cfgWith({ ADMIN_PASSWORD: 'BrandNew#Pass1' }), silent);

    expect(await User.countDocuments({ role: 'super_admin' })).toBe(1);
    const after = await User.findOne({ isSystemAdmin: true }).select('+password');
    expect(after._id.equals(before._id)).toBe(true);
    expect(await after.comparePassword('BrandNew#Pass1')).toBe(true);
    expect(await after.comparePassword('AdminPass#2026')).toBe(false);
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
  });

  test('changing the username in .env renames the admin instead of adding a second one', async () => {
    await syncAdminFromEnv(cfgWith(), silent);
    const before = await User.findOne({ isSystemAdmin: true });

    await syncAdminFromEnv(cfgWith({ ADMIN_USERNAME: 'Boss_Peter', ADMIN_EMAIL: 'boss@example.com' }), silent);

    expect(await User.countDocuments({ role: 'super_admin' })).toBe(1);
    const after = await User.findOne({ isSystemAdmin: true });
    expect(after._id.equals(before._id)).toBe(true);
    expect(after.username).toBe('boss_peter');
    expect(after.email).toBe('boss@example.com');
  });

  test('repairs a demoted or suspended admin', async () => {
    await syncAdminFromEnv(cfgWith(), silent);
    await User.updateOne({ isSystemAdmin: true }, { role: 'user', status: 'suspended' });

    await syncAdminFromEnv(cfgWith(), silent);

    const admin = await User.findOne({ isSystemAdmin: true });
    expect(admin.role).toBe('super_admin');
    expect(admin.status).toBe('active');
  });

  test('refuses to take over a regular member with the same username', async () => {
    await User.create({ username: 'admin', phone: '0711111111', password: 'secret123' });
    await expect(syncAdminFromEnv(cfgWith(), silent)).rejects.toThrow(/clash/);
  });
});

describe('loadConfig', () => {
  test('fails fast with a readable message when required values are missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(/MONGODB_URI/);
  });

  test('rejects weak admin password and simulated M-Pesa in production', () => {
    expect(() => loadConfig({ ...process.env, NODE_ENV: 'production', ADMIN_PASSWORD: 'admin123456' })).toThrow(/too weak/);
    expect(() =>
      loadConfig({ ...process.env, NODE_ENV: 'production', ADMIN_PASSWORD: 'A-Long-Strong-Pass-1', MPESA_MODE: 'simulate' })
    ).toThrow(/MPESA_MODE/);
  });
});
