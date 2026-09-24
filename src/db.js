'use strict';

const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS cars (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make           TEXT    NOT NULL,
  model          TEXT    NOT NULL,
  year           INTEGER,
  seats          INTEGER NOT NULL DEFAULT 5,
  fuel           TEXT    NOT NULL DEFAULT 'Petrol',
  transmission   TEXT    NOT NULL DEFAULT 'Automatic',
  color          TEXT,
  image_url      TEXT,
  image_credit   TEXT,
  description    TEXT,
  price_per_hour REAL    NOT NULL CHECK (price_per_hour >= 0),
  price_per_day  REAL    NOT NULL CHECK (price_per_day >= 0),
  lat            REAL    NOT NULL,
  lng            REAL    NOT NULL,
  address        TEXT,
  is_listed      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS availability (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id   INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  start_at TEXT    NOT NULL,
  end_at   TEXT    NOT NULL,
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id      INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  renter_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_at    TEXT    NOT NULL,
  end_at      TEXT    NOT NULL,
  total_price REAL    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_avail_car    ON availability(car_id, start_at);
CREATE INDEX IF NOT EXISTS idx_booking_car  ON bookings(car_id, start_at);
CREATE INDEX IF NOT EXISTS idx_booking_user ON bookings(renter_id);
`;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Adds columns introduced after the first release to existing databases.
function migrate(db) {
  const cols = db
    .prepare('PRAGMA table_info(cars)')
    .all()
    .map((c) => c.name);
  if (!cols.includes('image_credit')) db.exec('ALTER TABLE cars ADD COLUMN image_credit TEXT');
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
