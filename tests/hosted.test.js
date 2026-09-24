'use strict';

// The hosted page (hosted/index.html) must run the same rules as the server.
// These tests check the inlined copy is current, then load the page's rules
// section in a sandbox and run the shared pricing cases against it.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { build, read, HOSTED } = require('../scripts/build-hosted');
const serverRules = require('../src/rules');
const quoteCases = require('./fixtures/quote-cases');

const HOUR = 36e5;
const t0 = Date.parse('2030-01-01T09:00:00.000Z');
const at = (h) => t0 + h * HOUR;
// Values from the sandbox have its own Object/Array prototypes; copy them out.
const plain = (v) => JSON.parse(JSON.stringify(v));

// Evaluates the page's "pricing & availability" section on its own, with just
// enough of the page's globals for it to run.
function loadHosted(uid = 'me') {
  const html = read(HOSTED);
  const from = html.indexOf('// ---------- pricing & availability');
  const to = html.indexOf('// ---------- people');
  assert.ok(from > 0 && to > from, 'hosted/index.html is missing its rules section markers');
  const S = { uid, bookings: [] };
  const context = vm.createContext({ S, DAY: 864e5, fmt: (t) => new Date(t).toISOString() });
  const api = vm.runInContext(
    `'use strict';\n${html.slice(from, to)}\n({ Rules, quote, whyNot, status, mergeWindow });`,
    context,
  );
  return { ...api, S };
}

test('hosted/index.html inlines the current src/rules.js (run `npm run build:hosted`)', () => {
  assert.equal(read(HOSTED), build());
});

test('hosted page exposes the same rules module as the server', () => {
  const { Rules } = loadHosted();
  assert.deepEqual(Object.keys(Rules).sort(), Object.keys(serverRules).sort());
  assert.equal(Rules.START_GRACE_MS, serverRules.START_GRACE_MS);
});

test('hosted quote() matches the server pricing cases', () => {
  const { quote } = loadHosted();
  const car = { pricePerHour: 10, pricePerDay: 50 };
  for (const { name, hours, expected } of quoteCases) {
    assert.deepEqual(plain(quote(car, t0, at(hours))), expected, name);
  }
});

test('hosted whyNot() applies the window and overlap rules', () => {
  const { whyNot } = loadHosted();
  const car = { id: 'c1', ownerId: 'owner', listed: true, windows: [{ s: at(0), e: at(10) }] };
  const booked = [{ start: at(4), end: at(6) }];
  assert.equal(whyNot(car, at(0), at(4), booked), null, 'ends as a booking starts');
  assert.equal(whyNot(car, at(6), at(10), booked), null, 'starts as a booking ends, ends with the window');
  assert.match(whyNot(car, at(3), at(5), booked), /already booked/);
  assert.match(whyNot(car, at(8), at(11), booked), /hasn’t offered/);
  assert.match(whyNot({ ...car, listed: false }, at(0), at(1), []), /isn’t listed/);
  assert.match(whyNot({ ...car, ownerId: 'me' }, at(0), at(1), []), /your own car/);
  assert.match(whyNot(car, at(2), at(1), []), /after pick-up/);
  assert.match(whyNot(car, Date.now() - serverRules.START_GRACE_MS - 6e4, at(1), []), /in the past/);
});

test('hosted mergeWindow() merges overlapping and touching windows like the server', () => {
  const { mergeWindow } = loadHosted();
  const list = [
    { s: at(0), e: at(2) },
    { s: at(5), e: at(7) },
    { s: at(20), e: at(22) },
  ];
  assert.deepEqual(plain(mergeWindow(list, at(2), at(6))), [
    { s: at(0), e: at(7) },
    { s: at(20), e: at(22) },
  ]);
});

test('hosted mergeWindow() drops windows that ended over a day ago (hosted-only housekeeping)', () => {
  const { mergeWindow } = loadHosted();
  const now = Date.now();
  const old = { s: now - 50 * HOUR, e: now - 30 * HOUR };
  const recent = { s: now - 5 * HOUR, e: now - 2 * HOUR };
  const out = plain(mergeWindow([old, recent], now + HOUR, now + 2 * HOUR));
  assert.deepEqual(out, [recent, { s: now + HOUR, e: now + 2 * HOUR }]);
});
