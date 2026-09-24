'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

const HOUR = 36e5;
const iso = (hoursFromNow) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

// Starts a fresh in-memory app and returns a tiny client with a cookie jar per user.
async function setup(options = {}) {
  const db = openDb(':memory:');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carshare-uploads-'));
  const app = createApp(db, { maxUsers: 3, uploadsDir, ...options });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  function client() {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => null) };
    };
  }

  async function user(name) {
    const c = client();
    const r = await c('POST', '/api/auth/register', {
      username: name,
      password: 'password123',
      displayName: name,
      inviteCode: options.inviteCode,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return c;
  }

  const close = () => {
    server.close();
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  };
  return { db, server, base, client, user, close };
}

const carBody = {
  make: 'Toyota',
  model: 'Corolla',
  year: 2020,
  seats: 5,
  fuel: 'Hybrid',
  transmission: 'Automatic',
  price_per_hour: 10,
  price_per_day: 50,
  lat: 51.5,
  lng: -0.12,
  address: 'Elm Road',
};

async function ownerWithCar(t) {
  const env = await setup();
  t.after(env.close);
  const owner = await env.user('owner');
  const renter = await env.user('renter');
  const { body } = await owner('POST', '/api/cars', carBody);
  const carId = body.car.id;
  await owner('POST', `/api/cars/${carId}/availability`, { start: iso(0), end: iso(72) });
  return { ...env, owner, renter, carId };
}

// ---------- authentication ----------

test('register, me, logout, login', async (t) => {
  const env = await setup();
  t.after(env.close);
  const c = await env.user('alice');
  assert.equal((await c('GET', '/api/auth/me')).body.user.username, 'alice');
  await c('POST', '/api/auth/logout');
  assert.equal((await c('GET', '/api/auth/me')).body.user, null);
  assert.equal((await c('POST', '/api/auth/login', { username: 'alice', password: 'wrong-password' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { username: 'ALICE', password: 'password123' })).status, 200);
  assert.equal((await c('GET', '/api/auth/me')).body.user.username, 'alice');
});

test('rejects weak passwords and duplicate usernames', async (t) => {
  const env = await setup();
  t.after(env.close);
  const c = env.client();
  assert.equal((await c('POST', '/api/auth/register', { username: 'bob', password: 'short' })).status, 400);
  await env.user('bob');
  assert.equal((await c('POST', '/api/auth/register', { username: 'Bob', password: 'password123' })).status, 409);
});

test('enforces the member limit', async (t) => {
  const env = await setup({ maxUsers: 2 });
  t.after(env.close);
  await env.user('user1');
  await env.user('user2');
  const r = await env.client()('POST', '/api/auth/register', { username: 'user3', password: 'password123' });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /full/);
});

test('requires the invite code when configured', async (t) => {
  const env = await setup({ inviteCode: 'ELM-ROAD' });
  t.after(env.close);
  const r = await env.client()('POST', '/api/auth/register', {
    username: 'xuser1',
    password: 'password123',
    inviteCode: 'nope',
  });
  assert.equal(r.status, 403);
  await env.user('xuser2'); // helper sends the correct code
});

test('API needs login', async (t) => {
  const env = await setup();
  t.after(env.close);
  assert.equal((await env.client()('GET', '/api/cars')).status, 401);
});

// ---------- cars ----------

test('owner can add, update price/listing and delete a car', async (t) => {
  const { owner, renter, carId } = await ownerWithCar(t);
  const r = await owner('PUT', `/api/cars/${carId}`, { price_per_hour: 12.5, is_listed: false });
  assert.equal(r.body.car.price_per_hour, 12.5);
  assert.equal(r.body.car.is_listed, false);
  // Unlisted cars disappear from others' browse list.
  assert.equal((await renter('GET', '/api/cars')).body.cars.length, 0);
  assert.equal((await renter('GET', `/api/cars/${carId}`)).status, 404);
  // Other users cannot edit.
  assert.equal((await renter('PUT', `/api/cars/${carId}`, { price_per_hour: 1 })).status, 403);
  assert.equal((await owner('DELETE', `/api/cars/${carId}`)).status, 200);
});

test('validates car input', async (t) => {
  const { owner } = await ownerWithCar(t);
  assert.equal((await owner('POST', '/api/cars', { ...carBody, price_per_hour: -1 })).status, 400);
  assert.equal((await owner('POST', '/api/cars', { ...carBody, lat: 200 })).status, 400);
  assert.equal((await owner('POST', '/api/cars', { ...carBody, make: '' })).status, 400);
  assert.equal((await owner('POST', '/api/cars', { ...carBody, image_url: 'javascript:alert(1)' })).status, 400);
});

test('browse filters by seats, price, text and free time', async (t) => {
  const { owner, renter, carId } = await ownerWithCar(t);
  await owner('POST', '/api/cars', { ...carBody, make: 'Ford', model: 'Transit', seats: 3, price_per_hour: 20 });
  assert.equal((await renter('GET', '/api/cars')).body.cars.length, 2);
  assert.equal((await renter('GET', '/api/cars?seats=5')).body.cars.length, 1);
  assert.equal((await renter('GET', '/api/cars?maxPrice=15')).body.cars.length, 1);
  assert.equal((await renter('GET', '/api/cars?q=transit')).body.cars[0].make, 'Ford');
  // Only the Toyota has availability set.
  const free = await renter('GET', `/api/cars?from=${iso(2)}&to=${iso(4)}`);
  assert.deepEqual(
    free.body.cars.map((c) => c.id),
    [carId],
  );
  assert.equal(free.body.cars[0].quote.total, 20);
});

// ---------- photos ----------

test('owner uploads a photo and attaches it to a car', async (t) => {
  const env = await ownerWithCar(t);
  const { owner, renter, carId } = env;
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
  const cookie = await sessionCookie(env.base);
  const up = await fetch(`${env.base}/api/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', Cookie: cookie },
    body: jpeg,
  });
  assert.equal(up.status, 201);
  const { url } = await up.json();
  assert.match(url, /^\/uploads\/[a-f0-9]+\.jpg$/);
  const file = await fetch(env.base + url);
  assert.equal(file.status, 200);
  assert.equal(Buffer.from(await file.arrayBuffer()).length, jpeg.length);
  // Owner attaches it; renters see it.
  assert.equal((await owner('PUT', `/api/cars/${carId}`, { image_url: url })).status, 200);
  assert.equal((await renter('GET', `/api/cars/${carId}`)).body.car.image_url, url);
  assert.equal((await fetch(`${env.base}/uploads/missing.jpg`)).status, 404);
});

test('rejects uploads that are not photos, and anonymous uploads', async (t) => {
  const env = await setup();
  t.after(env.close);
  await env.user('photog');
  const cookie = await sessionCookie(env.base, 'photog2');
  const fake = await fetch(`${env.base}/api/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Cookie: cookie },
    body: 'not really a png file',
  });
  assert.equal(fake.status, 400);
  const anon = await fetch(`${env.base}/api/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: Buffer.alloc(20),
  });
  assert.equal(anon.status, 401);
});

test('photo must be an uploaded file, a bundled photo or a web link', async (t) => {
  const { owner } = await ownerWithCar(t);
  assert.equal(
    (await owner('POST', '/api/cars', { ...carBody, image_url: '/images/cars/honda-jazz.jpg' })).status,
    201,
  );
  assert.equal(
    (await owner('POST', '/api/cars', { ...carBody, image_url: 'https://example.com/car.jpg' })).status,
    201,
  );
  assert.equal((await owner('POST', '/api/cars', { ...carBody, image_url: '/etc/passwd' })).status, 400);
  assert.equal((await owner('POST', '/api/cars', { ...carBody, image_url: '/uploads/../server.js' })).status, 400);
});

// Registers a fresh user and returns their raw session cookie, for non-JSON requests.
async function sessionCookie(base, username = 'uploader') {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  assert.equal(res.status, 201, await res.text());
  return res.headers.get('set-cookie').split(';')[0];
}

// ---------- availability ----------

test('overlapping availability windows are merged', async (t) => {
  const { owner, carId } = await ownerWithCar(t); // already has 0h..72h
  const r = await owner('POST', `/api/cars/${carId}/availability`, { start: iso(70), end: iso(100) });
  assert.equal(r.body.availability.length, 1);
  const r2 = await owner('POST', `/api/cars/${carId}/availability`, { start: iso(200), end: iso(210) });
  assert.equal(r2.body.availability.length, 2);
});

test('cannot remove an availability window that holds a booking', async (t) => {
  const { owner, renter, carId } = await ownerWithCar(t);
  await renter('POST', '/api/bookings', { carId, start: iso(5), end: iso(7) });
  const { body } = await owner('GET', `/api/cars/${carId}`);
  const w = body.availability[0];
  assert.equal((await owner('DELETE', `/api/cars/${carId}/availability/${w.id}`)).status, 409);
});

// ---------- bookings ----------

test('renter books a car; price is calculated; owner sees it', async (t) => {
  const { owner, renter, carId } = await ownerWithCar(t);
  const r = await renter('POST', '/api/bookings', { carId, start: iso(2), end: iso(5), note: 'shopping' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.booking.total_price, 30);
  const ob = await owner('GET', '/api/bookings');
  assert.equal(ob.body.asOwner.length, 1);
  assert.equal(ob.body.asOwner[0].other_name, 'renter');
  const rb = await renter('GET', '/api/bookings');
  assert.equal(rb.body.asRenter.length, 1);
});

test('rejects double bookings, bookings outside availability and own-car bookings', async (t) => {
  const { owner, renter, carId } = await ownerWithCar(t);
  assert.equal((await renter('POST', '/api/bookings', { carId, start: iso(2), end: iso(5) })).status, 201);
  assert.equal((await renter('POST', '/api/bookings', { carId, start: iso(4), end: iso(6) })).status, 409);
  // Back-to-back is fine.
  assert.equal((await renter('POST', '/api/bookings', { carId, start: iso(5), end: iso(6) })).status, 201);
  // Outside the 0..72h window.
  assert.equal((await renter('POST', '/api/bookings', { carId, start: iso(70), end: iso(80) })).status, 409);
  assert.equal((await owner('POST', '/api/bookings', { carId, start: iso(10), end: iso(11) })).status, 400);
  // End before start / in the past.
  assert.equal((await renter('POST', '/api/bookings', { carId, start: iso(12), end: iso(11) })).status, 400);
  assert.equal((await renter('POST', '/api/bookings', { carId, start: iso(-5), end: iso(1) })).status, 400);
});

test('cancelling frees the slot; strangers cannot cancel', async (t) => {
  const env = await ownerWithCar(t);
  const { owner, renter, carId } = env;
  const { body } = await renter('POST', '/api/bookings', { carId, start: iso(2), end: iso(5) });
  const stranger = await env.user('stranger');
  assert.equal((await stranger('POST', `/api/bookings/${body.booking.id}/cancel`)).status, 403);
  assert.equal((await owner('POST', `/api/bookings/${body.booking.id}/cancel`)).status, 200);
  assert.equal((await renter('POST', `/api/bookings/${body.booking.id}/cancel`)).status, 409);
  assert.equal((await stranger('POST', '/api/bookings', { carId, start: iso(2), end: iso(5) })).status, 201);
});

test('car with upcoming bookings cannot be deleted', async (t) => {
  const { owner, renter, carId } = await ownerWithCar(t);
  await renter('POST', '/api/bookings', { carId, start: iso(2), end: iso(5) });
  assert.equal((await owner('DELETE', `/api/cars/${carId}`)).status, 409);
});

test('detail hides renter names from other users', async (t) => {
  const env = await ownerWithCar(t);
  const { owner, renter, carId } = env;
  await renter('POST', '/api/bookings', { carId, start: iso(2), end: iso(5) });
  const other = await env.user('other');
  assert.equal((await owner('GET', `/api/cars/${carId}`)).body.bookings[0].renter_name, 'renter');
  assert.equal((await other('GET', `/api/cars/${carId}`)).body.bookings[0].renter_name, null);
});
