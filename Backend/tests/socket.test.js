const { describe, test, before, beforeEach, after } = require('node:test');
const { expect } = require('expect');
const http = require('http');
const { io: connectClient } = require('socket.io-client');
const db = require('./helpers/db');
const User = require('../models/User');
const { config } = require('../config/env');
const { generateAccessToken } = require('../config/jwt');
const { createSocketServer } = require('../config/socket');
const { syncAdminFromEnv } = require('../services/adminSync');
const NotificationEmitter = require('../utils/notificationEmitter');

let server;
let io;
let url;
const clients = [];

const connect = (token) =>
  new Promise((resolve, reject) => {
    const client = connectClient(url, { auth: token ? { token } : {}, reconnection: false, transports: ['websocket'] });
    clients.push(client);
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
  });

const nextEvent = (client, event) => new Promise((resolve) => client.once(event, resolve));

before(async () => {
  await db.connect();
  server = http.createServer();
  io = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});
beforeEach(db.clear);
after(async () => {
  clients.forEach((c) => c.disconnect());
  io.close();
  await db.disconnect();
});

describe('socket authentication and rooms', () => {
  test('rejects connections without a valid token', async () => {
    await expect(connect()).rejects.toThrow(/Unauthorized/);
    await expect(connect('garbage')).rejects.toThrow(/Unauthorized/);
  });

  test('a user only receives events for their own room', async () => {
    const alice = await User.create({ username: 'alice', phone: '0711111111', password: 'secret123' });
    const bob = await User.create({ username: 'bob', phone: '0722222222', password: 'secret123' });
    const aliceSocket = await connect(generateAccessToken(alice));
    const bobSocket = await connect(generateAccessToken(bob));

    const emitter = new NotificationEmitter(io);
    let bobReceived = false;
    bobSocket.on('balance:updated', () => {
      bobReceived = true;
    });

    const received = nextEvent(aliceSocket, 'balance:updated');
    emitter.emitBalanceUpdate(alice._id, 500);
    expect((await received).newBalance).toBe(500);

    await new Promise((r) => setTimeout(r, 100));
    expect(bobReceived).toBe(false);
  });

  test('admin alerts reach only the admin, not regular members', async () => {
    await syncAdminFromEnv(config, { log: () => {}, warn: () => {} });
    const admin = await User.findOne({ isSystemAdmin: true });
    const member = await User.create({ username: 'carol', phone: '0733333333', password: 'secret123' });
    const adminSocket = await connect(generateAccessToken(admin));
    const memberSocket = await connect(generateAccessToken(member));

    let memberReceived = false;
    memberSocket.on('admin:notification', () => {
      memberReceived = true;
    });

    const received = nextEvent(adminSocket, 'admin:notification');
    new NotificationEmitter(io).notifyAdmins({ title: 'New withdrawal request' });
    expect((await received).title).toBe('New withdrawal request');

    await new Promise((r) => setTimeout(r, 100));
    expect(memberReceived).toBe(false);
  });
});
