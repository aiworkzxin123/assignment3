'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { transaction } = require('./db');
const auth = require('./auth');
const { quote } = require('./pricing');
const rules = require('./rules');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);

// ---------- validation helpers ----------

function toIso(value, field) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw bad(`${field} must be a valid date/time.`);
  return d.toISOString();
}

function text(value, field, { required = false, max = 200 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`${field} is required.`);
    return null;
  }
  const s = String(value).trim();
  if (required && !s) throw bad(`${field} is required.`);
  if (s.length > max) throw bad(`${field} must be at most ${max} characters.`);
  return s;
}

function num(value, field, { min = -Infinity, max = Infinity, required = false, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`${field} is required.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw bad(`${field} must be a ${integer ? 'whole ' : ''}number between ${min} and ${max}.`);
  }
  return n;
}

function range(body) {
  const start = toIso(body.start, 'Start');
  const end = toIso(body.end, 'End');
  if (end <= start) throw bad('End must be after start.');
  return { start, end };
}

const CAR_FIELDS = {
  make: (v) => text(v, 'Make', { required: true, max: 50 }),
  model: (v) => text(v, 'Model', { required: true, max: 50 }),
  year: (v) => num(v, 'Year', { min: 1950, max: 2100, integer: true }),
  seats: (v) => num(v, 'Seats', { min: 1, max: 12, integer: true, required: true }),
  fuel: (v) => text(v, 'Fuel', { required: true, max: 20 }),
  transmission: (v) => text(v, 'Transmission', { required: true, max: 20 }),
  color: (v) => text(v, 'Colour', { max: 30 }),
  image_url: (v) => {
    const s = text(v, 'Photo', { max: 500 });
    // A web link, a bundled photo, or a photo uploaded through /api/uploads.
    if (s && !/^https?:\/\//i.test(s) && !/^\/(images\/cars|uploads)\/[\w.-]+$/.test(s)) {
      throw bad('Photo must be an uploaded picture or a link starting with http:// or https://');
    }
    return s;
  },
  description: (v) => text(v, 'Description', { max: 1000 }),
  price_per_hour: (v) => num(v, 'Price per hour', { min: 0, max: 10000, required: true }),
  price_per_day: (v) => num(v, 'Price per day', { min: 0, max: 100000, required: true }),
  lat: (v) => num(v, 'Latitude', { min: -90, max: 90, required: true }),
  lng: (v) => num(v, 'Longitude', { min: -180, max: 180, required: true }),
  address: (v) => text(v, 'Address', { max: 200 }),
  is_listed: (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0),
};

const CAR_DEFAULTS = { seats: 5, fuel: 'Petrol', transmission: 'Automatic', is_listed: 1 };

function parseCar(body, { partial }) {
  const out = {};
  for (const [key, parse] of Object.entries(CAR_FIELDS)) {
    if (partial && !(key in body)) continue;
    const raw = key in body ? body[key] : CAR_DEFAULTS[key];
    out[key] = parse(raw);
  }
  return out;
}

// ---------- app ----------

function createApp(db, options = {}) {
  const maxUsers = options.maxUsers ?? 10;
  const inviteCode = options.inviteCode || null;
  const secureCookies = !!options.secureCookies;
  const now = options.now || (() => new Date());
  const currency = options.currency || '$';
  const defaultCenter = options.defaultCenter || { lat: 51.5074, lng: -0.1278 };
  const uploadsDir = options.uploadsDir || path.join(__dirname, '..', 'data', 'uploads');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(auth.loadUser(db));

  const q = {
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    insertUser: db.prepare('INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    car: db.prepare(`SELECT c.*, u.display_name AS owner_name FROM cars c JOIN users u ON u.id = c.owner_id WHERE c.id = ?`),
    listedCars: db.prepare(`SELECT c.*, u.display_name AS owner_name FROM cars c JOIN users u ON u.id = c.owner_id WHERE c.is_listed = 1 ORDER BY c.make, c.model`),
    myCars: db.prepare(`SELECT c.*, u.display_name AS owner_name FROM cars c JOIN users u ON u.id = c.owner_id WHERE c.owner_id = ? ORDER BY c.created_at DESC`),
    windows: db.prepare('SELECT id, start_at, end_at FROM availability WHERE car_id = ? AND end_at > ? ORDER BY start_at'),
    window: db.prepare('SELECT * FROM availability WHERE id = ? AND car_id = ?'),
    allWindows: db.prepare('SELECT * FROM availability WHERE car_id = ?'),
    insertWindow: db.prepare('INSERT INTO availability (car_id, start_at, end_at) VALUES (?, ?, ?)'),
    deleteWindow: db.prepare('DELETE FROM availability WHERE id = ?'),
    carBookings: db.prepare(`
      SELECT b.id, b.start_at, b.end_at, b.renter_id, u.display_name AS renter_name
      FROM bookings b JOIN users u ON u.id = b.renter_id
      WHERE b.car_id = ? AND b.status = 'confirmed' AND b.end_at > ? ORDER BY b.start_at`),
    upcomingInWindow: db.prepare(`SELECT id FROM bookings WHERE car_id = ? AND status = 'confirmed' AND start_at < ? AND end_at > ? AND end_at > ? LIMIT 1`),
    insertBooking: db.prepare('INSERT INTO bookings (car_id, renter_id, start_at, end_at, total_price, note) VALUES (?, ?, ?, ?, ?, ?)'),
    booking: db.prepare('SELECT b.*, c.owner_id FROM bookings b JOIN cars c ON c.id = b.car_id WHERE b.id = ?'),
    cancelBooking: db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`),
    futureBookingsForCar: db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE car_id = ? AND status = 'confirmed' AND end_at > ?`),
    deleteCar: db.prepare('DELETE FROM cars WHERE id = ?'),
    renterBookings: db.prepare(`
      SELECT b.*, c.make, c.model, c.image_url, c.address, c.lat, c.lng, u.display_name AS other_name
      FROM bookings b JOIN cars c ON c.id = b.car_id JOIN users u ON u.id = c.owner_id
      WHERE b.renter_id = ? ORDER BY b.start_at DESC`),
    ownerBookings: db.prepare(`
      SELECT b.*, c.make, c.model, c.image_url, c.address, c.lat, c.lng, u.display_name AS other_name
      FROM bookings b JOIN cars c ON c.id = b.car_id JOIN users u ON u.id = b.renter_id
      WHERE c.owner_id = ? ORDER BY b.start_at DESC`),
  };

  const nowIso = () => now().toISOString();

  function getCarOr404(id) {
    const car = q.car.get(Number(id));
    if (!car) throw new HttpError(404, 'Car not found.');
    return car;
  }

  function getOwnCar(req) {
    const car = getCarOr404(req.params.id);
    if (car.owner_id !== req.user.id) throw new HttpError(403, 'Only the owner can change this car.');
    return car;
  }

  const interval = (row) => ({ start: row.start_at, end: row.end_at, row });

  // Is the car bookable for [start, end)? Returns null if yes, or a reason.
  function unavailableReason(carId, start, end) {
    const windows = q.allWindows.all(carId).map(interval);
    const bookings = q.carBookings.all(carId, start).map(interval);
    const conflict = rules.bookingConflict(windows, bookings, start, end);
    if (conflict === 'not-offered') return 'The car is not available for the whole of that time.';
    if (conflict === 'already-booked') return 'The car is already booked during that time.';
    return null;
  }

  function carSummary(car, viewer) {
    const t = nowIso();
    const windows = q.windows.all(car.id, t);
    const bookings = q.carBookings.all(car.id, t);
    const availableNow =
      !!car.is_listed &&
      windows.some((w) => rules.contains(interval(w), t)) &&
      !bookings.some((b) => rules.contains(interval(b), t));
    const next = windows.find((w) => w.end_at > t);
    return {
      ...car,
      is_listed: !!car.is_listed,
      is_mine: viewer ? car.owner_id === viewer.id : false,
      available_now: availableNow,
      next_window: next ? { start_at: next.start_at < t ? t : next.start_at, end_at: next.end_at } : null,
    };
  }

  // ---------- auth routes ----------

  app.post('/api/auth/register', (req, res) => {
    const username = text(req.body.username, 'Username', { required: true, max: 30 });
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
      throw bad('Username must be 3-30 characters: letters, numbers, dot, dash or underscore.');
    }
    const displayName = text(req.body.displayName, 'Display name', { max: 50 }) || username;
    const password = String(req.body.password || '');
    if (password.length < 8) throw bad('Password must be at least 8 characters.');
    if (inviteCode && req.body.inviteCode !== inviteCode) throw new HttpError(403, 'Invite code is incorrect.');

    const user = transaction(db, () => {
      if (q.userCount.get().n >= maxUsers) {
        throw new HttpError(403, `This neighbourhood group is full (maximum ${maxUsers} members).`);
      }
      if (q.userByName.get(username)) throw new HttpError(409, 'That username is taken.');
      const { hash, salt } = auth.hashPassword(password);
      const info = q.insertUser.run(username, displayName, hash, salt);
      return { id: Number(info.lastInsertRowid), username, display_name: displayName };
    });

    const s = auth.createSession(db, user.id);
    res.setHeader('Set-Cookie', auth.sessionCookie(s.token, s.expires, secureCookies));
    res.status(201).json({ user });
  });

  app.post('/api/auth/login', (req, res) => {
    const row = q.userByName.get(String(req.body.username || ''));
    const ok = row && auth.verifyPassword(String(req.body.password || ''), row.password_salt, row.password_hash);
    if (!ok) throw new HttpError(401, 'Wrong username or password.');
    q.purgeSessions.run(nowIso());
    const s = auth.createSession(db, row.id);
    res.setHeader('Set-Cookie', auth.sessionCookie(s.token, s.expires, secureCookies));
    res.json({ user: { id: row.id, username: row.username, display_name: row.display_name } });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.sessionToken) q.deleteSession.run(req.sessionToken);
    res.setHeader('Set-Cookie', auth.sessionCookie('', null, secureCookies));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({
      user: req.user,
      members: q.userCount.get().n,
      maxUsers,
      inviteRequired: !!inviteCode,
      currency,
      defaultCenter,
    });
  });

  // Everything below requires login.
  app.use('/api', auth.requireUser);

  // ---------- cars ----------

  app.get('/api/cars', (req, res) => {
    const search = (req.query.q || '').toString().toLowerCase().trim();
    const minSeats = num(req.query.seats, 'Seats', { min: 1, max: 12 }) || 0;
    const maxPrice = num(req.query.maxPrice, 'Max price', { min: 0 });
    const fuel = (req.query.fuel || '').toString();
    let want = null;
    if (req.query.from || req.query.to) want = range({ start: req.query.from, end: req.query.to });

    const cars = q.listedCars
      .all()
      .filter((c) => !search || `${c.make} ${c.model} ${c.color || ''} ${c.address || ''}`.toLowerCase().includes(search))
      .filter((c) => c.seats >= minSeats)
      .filter((c) => maxPrice === null || c.price_per_hour <= maxPrice)
      .filter((c) => !fuel || c.fuel === fuel)
      .filter((c) => !want || !unavailableReason(c.id, want.start, want.end))
      .map((c) => {
        const s = carSummary(c, req.user);
        if (want) s.quote = quote(c, want.start, want.end);
        return s;
      });
    res.json({ cars });
  });

  app.get('/api/my/cars', (req, res) => {
    res.json({ cars: q.myCars.all(req.user.id).map((c) => carSummary(c, req.user)) });
  });

  app.get('/api/cars/:id', (req, res) => {
    const car = getCarOr404(req.params.id);
    const mine = car.owner_id === req.user.id;
    if (!car.is_listed && !mine) throw new HttpError(404, 'Car not found.');
    const t = nowIso();
    const bookings = q.carBookings.all(car.id, t).map((b) => ({
      id: b.id,
      start_at: b.start_at,
      end_at: b.end_at,
      // Only the owner and the renter themselves see who booked.
      renter_name: mine || b.renter_id === req.user.id ? b.renter_name : null,
      is_mine: b.renter_id === req.user.id,
    }));
    res.json({ car: carSummary(car, req.user), availability: q.windows.all(car.id, t), bookings });
  });

  app.get('/api/cars/:id/quote', (req, res) => {
    const car = getCarOr404(req.params.id);
    const { start, end } = range({ start: req.query.start, end: req.query.end });
    res.json({ quote: quote(car, start, end), unavailable: unavailableReason(car.id, start, end) });
  });

  app.post('/api/cars', (req, res) => {
    const c = parseCar(req.body, { partial: false });
    const info = db
      .prepare(`INSERT INTO cars (owner_id, ${Object.keys(c).join(', ')}) VALUES (?, ${Object.keys(c).map(() => '?').join(', ')})`)
      .run(req.user.id, ...Object.values(c));
    res.status(201).json({ car: carSummary(q.car.get(Number(info.lastInsertRowid)), req.user) });
  });

  app.put('/api/cars/:id', (req, res) => {
    const car = getOwnCar(req);
    const c = parseCar(req.body, { partial: true });
    // A photo credit belongs to the photo it came with.
    if ('image_url' in c && c.image_url !== car.image_url) c.image_credit = null;
    const keys = Object.keys(c);
    if (keys.length) {
      db.prepare(`UPDATE cars SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(c), car.id);
    }
    res.json({ car: carSummary(q.car.get(car.id), req.user) });
  });

  app.delete('/api/cars/:id', (req, res) => {
    const car = getOwnCar(req);
    if (q.futureBookingsForCar.get(car.id, nowIso()).n > 0) {
      throw new HttpError(409, 'This car has upcoming bookings. Cancel them or unlist the car instead.');
    }
    q.deleteCar.run(car.id);
    res.json({ ok: true });
  });

  // ---------- availability ----------

  app.post('/api/cars/:id/availability', (req, res) => {
    const car = getOwnCar(req);
    const { start, end } = range(req.body);
    if (end <= nowIso()) throw bad('Availability must end in the future.');
    // Merge with any window that overlaps or touches the new one.
    transaction(db, () => {
      const { merged, absorbed } = rules.mergeWindow(q.allWindows.all(car.id).map(interval), start, end);
      for (const w of absorbed) q.deleteWindow.run(w.row.id);
      q.insertWindow.run(car.id, merged.start, merged.end);
    });
    res.status(201).json({ availability: q.windows.all(car.id, nowIso()) });
  });

  app.delete('/api/cars/:id/availability/:windowId', (req, res) => {
    const car = getOwnCar(req);
    const w = q.window.get(Number(req.params.windowId), car.id);
    if (!w) throw new HttpError(404, 'Availability slot not found.');
    if (q.upcomingInWindow.get(car.id, w.end_at, w.start_at, nowIso())) {
      throw new HttpError(409, 'There is an upcoming booking inside this slot. Cancel the booking first.');
    }
    q.deleteWindow.run(w.id);
    res.json({ availability: q.windows.all(car.id, nowIso()) });
  });

  // ---------- bookings ----------

  app.post('/api/bookings', (req, res) => {
    const car = getCarOr404(req.body.carId);
    const { start, end } = range(req.body);
    const note = text(req.body.note, 'Note', { max: 300 });
    if (car.owner_id === req.user.id) throw bad('You cannot book your own car.');
    if (!car.is_listed) throw new HttpError(409, 'This car is not currently listed for rental.');
    // Allow a few minutes of slack so "start now" bookings are accepted.
    if (start < new Date(now().getTime() - rules.START_GRACE_MS).toISOString()) throw bad('Start time is in the past.');

    const booking = transaction(db, () => {
      const reason = unavailableReason(car.id, start, end);
      if (reason) throw new HttpError(409, reason);
      const { total } = quote(car, start, end);
      const info = q.insertBooking.run(car.id, req.user.id, start, end, total, note);
      return q.booking.get(Number(info.lastInsertRowid));
    });
    delete booking.owner_id;
    res.status(201).json({ booking });
  });

  app.get('/api/bookings', (req, res) => {
    res.json({
      asRenter: q.renterBookings.all(req.user.id),
      asOwner: q.ownerBookings.all(req.user.id),
    });
  });

  app.post('/api/bookings/:id/cancel', (req, res) => {
    const b = q.booking.get(Number(req.params.id));
    if (!b) throw new HttpError(404, 'Booking not found.');
    if (b.renter_id !== req.user.id && b.owner_id !== req.user.id) {
      throw new HttpError(403, 'You can only cancel your own bookings or bookings of your cars.');
    }
    if (b.status !== 'confirmed') throw new HttpError(409, 'Booking is already cancelled.');
    if (b.end_at <= nowIso()) throw new HttpError(409, 'This booking has already finished.');
    q.cancelBooking.run(b.id);
    res.json({ ok: true });
  });

  // ---------- photo uploads ----------

  // Identify the image type from its first bytes rather than trusting the header.
  const IMAGE_SIGNATURES = [
    { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  ];

  app.post(
    '/api/uploads',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
    (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length < 12) throw bad('Choose a JPEG, PNG or WebP photo.');
      const kind = IMAGE_SIGNATURES.find((s) => s.test(buf));
      if (!kind) throw bad('That file isn’t a JPEG, PNG or WebP photo.');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const name = `${crypto.randomBytes(12).toString('hex')}.${kind.ext}`;
      fs.writeFileSync(path.join(uploadsDir, name), buf);
      res.status(201).json({ url: `/uploads/${name}` });
    },
  );

  // ---------- static + errors ----------

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/uploads', express.static(uploadsDir, { fallthrough: false, index: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That photo is too big. The limit is 5 MB.' });
    if (err.status === 404) return res.status(404).json({ error: 'Not found.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

module.exports = { createApp };
