'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { openDb } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3080;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'carshare.db');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = openDb(DB_FILE);

const app = createApp(db, {
  maxUsers: Number(process.env.MAX_USERS) || 10,
  inviteCode: process.env.INVITE_CODE || null,
  secureCookies: process.env.SECURE_COOKIES === '1',
  currency: process.env.CURRENCY || '$',
  defaultCenter: {
    lat: Number(process.env.DEFAULT_LAT) || 51.5074,
    lng: Number(process.env.DEFAULT_LNG) || -0.1278,
  },
});

app.listen(PORT, HOST, () => {
  console.log(`Neighbourhood Car Share running:`);
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Your network:   http://${a.address}:${PORT}`);
    }
  }
  if (!process.env.INVITE_CODE) console.log('  Tip: set INVITE_CODE so only neighbours with the code can sign up.');
});
