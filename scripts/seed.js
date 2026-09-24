'use strict';

// Fills the database with demo neighbours, cars, available times and bookings.
// Usage: npm run seed            (adds demo data if the database is empty)
//        npm run seed -- --reset (wipes the database first)

const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { quote } = require('../src/pricing');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'carshare.db');
const LAT = Number(process.env.DEFAULT_LAT) || 51.5074;
const LNG = Number(process.env.DEFAULT_LNG) || -0.1278;
const PASSWORD = 'password123';

if (process.argv.includes('--reset')) {
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
}
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = openDb(DB_FILE);

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('Database already has users; nothing seeded. Use "npm run seed -- --reset" to start over.');
  process.exit(0);
}

const users = [
  ['alice', 'Alice (No. 4)'],
  ['bob', 'Bob (No. 11)'],
  ['chen', 'Chen (Flat 2B)'],
  ['dana', 'Dana (No. 27)'],
];
const userIds = {};
for (const [username, name] of users) {
  const { hash, salt } = hashPassword(PASSWORD);
  userIds[username] = Number(
    db
      .prepare('INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?)')
      .run(username, name, hash, salt).lastInsertRowid,
  );
}

// Photos are bundled in public/images/cars (credits in docs/IMAGE_CREDITS.md).
const cars = [
  {
    owner: 'alice',
    make: 'Toyota',
    model: 'Corolla Hybrid',
    year: 2023,
    seats: 5,
    fuel: 'Hybrid',
    transmission: 'Automatic',
    color: 'Bronze',
    price_per_hour: 8,
    price_per_day: 45,
    dLat: 0.0012,
    dLng: -0.0021,
    address: 'Outside No. 4, Elm Road',
    description: 'Clean and economical. Child seat available on request.',
    photo: 'toyota-corolla',
    credit: 'Alexander-93, CC BY-SA 4.0, via Wikimedia Commons',
  },
  {
    owner: 'alice',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    seats: 5,
    fuel: 'Electric',
    transmission: 'Automatic',
    color: 'White',
    price_per_hour: 15,
    price_per_day: 90,
    dLat: 0.0009,
    dLng: -0.0017,
    address: 'Driveway of No. 4, Elm Road',
    description: 'Please return with at least 40% charge.',
    photo: 'tesla-model3',
    credit: 'Alexander-93, CC BY-SA 4.0, via Wikimedia Commons',
  },
  {
    owner: 'bob',
    make: 'Ford',
    model: 'Transit Custom',
    year: 2023,
    seats: 3,
    fuel: 'Diesel',
    transmission: 'Manual',
    color: 'Silver',
    price_per_hour: 12,
    price_per_day: 70,
    dLat: -0.0018,
    dLng: 0.0026,
    address: 'Car park behind the corner shop',
    description: 'Van — great for moving furniture.',
    photo: 'ford-transit',
    credit: 'Alexander-93, CC BY-SA 4.0, via Wikimedia Commons',
  },
  {
    owner: 'chen',
    make: 'Honda',
    model: 'Jazz',
    year: 2018,
    seats: 5,
    fuel: 'Petrol',
    transmission: 'Automatic',
    color: 'Orange',
    price_per_hour: 6,
    price_per_day: 35,
    dLat: 0.0031,
    dLng: 0.0008,
    address: 'Bay 12, Oak Court',
    description: 'Small and easy to park.',
    photo: 'honda-jazz',
    credit: 'Vauxford, CC BY-SA 4.0, via Wikimedia Commons',
  },
  {
    owner: 'dana',
    make: 'Volkswagen',
    model: 'Touran',
    year: 2016,
    seats: 7,
    fuel: 'Petrol',
    transmission: 'Automatic',
    color: 'White',
    price_per_hour: 11,
    price_per_day: 60,
    dLat: -0.0007,
    dLng: -0.0035,
    address: 'Outside No. 27, Birch Lane',
    description: '7 seats — perfect for a family day out.',
    photo: 'vw-touran',
    credit: 'Jakub "Flyz1" Maciejewski, CC BY-SA 4.0, via Wikimedia Commons',
  },
  {
    owner: 'dana',
    make: 'Mini',
    model: 'Cooper',
    year: 2021,
    seats: 4,
    fuel: 'Petrol',
    transmission: 'Manual',
    color: 'Rebel Green',
    price_per_hour: 7,
    price_per_day: 40,
    dLat: -0.0024,
    dLng: -0.0011,
    address: 'Birch Lane, opposite the park',
    description: '',
    photo: 'mini-cooper',
    credit: 'Damian B Oh, CC BY-SA 4.0, via Wikimedia Commons',
  },
];

const insertCar = db.prepare(`
  INSERT INTO cars (owner_id, make, model, year, seats, fuel, transmission, color, price_per_hour, price_per_day, lat, lng, address, description, image_url, image_credit)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertWindow = db.prepare('INSERT INTO availability (car_id, start_at, end_at) VALUES (?, ?, ?)');
const insertBooking = db.prepare(
  'INSERT INTO bookings (car_id, renter_id, start_at, end_at, total_price, note) VALUES (?, ?, ?, ?, ?, ?)',
);

const today = new Date();
today.setHours(0, 0, 0, 0);
const at = (dayOffset, hour) => {
  const d = new Date(today);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour);
  return d.toISOString();
};

const carIds = [];
cars.forEach((c, i) => {
  const id = Number(
    insertCar.run(
      userIds[c.owner],
      c.make,
      c.model,
      c.year,
      c.seats,
      c.fuel,
      c.transmission,
      c.color,
      c.price_per_hour,
      c.price_per_day,
      LAT + c.dLat,
      LNG + c.dLng,
      c.address,
      c.description,
      `/images/cars/${c.photo}.jpg`,
      c.credit,
    ).lastInsertRowid,
  );
  carIds.push(id);
  // Varied availability patterns so the timeline looks realistic.
  if (i % 3 === 0)
    insertWindow.run(id, at(0, 0), at(14, 0)); // whole fortnight
  else if (i % 3 === 1)
    for (let d = 0; d < 10; d++) insertWindow.run(id, at(d, 7), at(d, 21)); // daytime
  else for (const d of [1, 2, 5, 6]) insertWindow.run(id, at(d, 9), at(d, 18)); // selected days
});

const book = (carIdx, renter, start, end, note) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(carIds[carIdx]);
  insertBooking.run(car.id, userIds[renter], start, end, quote(car, start, end).total, note);
};
book(0, 'bob', at(1, 9), at(1, 13), 'Trip to the garden centre');
book(0, 'chen', at(3, 10), at(4, 10), 'Weekend visit');
book(2, 'alice', at(2, 9), at(2, 12), 'Moving a sofa');
book(4, 'chen', at(1, 8), at(1, 18), null);

console.log(`Seeded ${users.length} users and ${cars.length} cars into ${DB_FILE}`);
console.log(`Log in as any of: ${users.map((u) => u[0]).join(', ')}  (password: ${PASSWORD})`);
