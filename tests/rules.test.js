'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, covers, contains, mergeWindow, bookingConflict } = require('../src/rules');

const iso = (h) => new Date(Date.parse('2030-01-01T00:00:00.000Z') + h * 36e5).toISOString();
const i = (a, b) => ({ start: iso(a), end: iso(b) });

test('intervals are half-open: touching ones do not overlap', () => {
  assert.equal(overlaps(i(0, 2), i(1, 3)), true);
  assert.equal(overlaps(i(0, 2), i(2, 3)), false);
  assert.equal(overlaps(i(2, 3), i(0, 2)), false);
  assert.equal(overlaps(i(0, 10), i(4, 5)), true);
});

test('covers() needs the whole range inside the window', () => {
  assert.equal(covers(i(0, 10), iso(0), iso(10)), true);
  assert.equal(covers(i(0, 10), iso(2), iso(11)), false);
  assert.equal(covers(i(1, 10), iso(0), iso(5)), false);
});

test('contains() includes the start instant but not the end', () => {
  assert.equal(contains(i(0, 2), iso(0)), true);
  assert.equal(contains(i(0, 2), iso(2)), false);
});

test('works with epoch milliseconds as well as ISO strings', () => {
  assert.equal(overlaps({ start: 0, end: 2 }, { start: 1, end: 3 }), true);
  assert.equal(covers({ start: 0, end: 10 }, 2, 11), false);
});

test('mergeWindow() absorbs overlapping and touching windows only', () => {
  const a = i(0, 2), b = i(5, 7), c = i(20, 22);
  const { merged, absorbed, rest } = mergeWindow([a, b, c], iso(2), iso(6));
  assert.deepEqual(merged, i(0, 7));
  assert.deepEqual(absorbed, [a, b]);
  assert.deepEqual(rest, [c]);
});

test('mergeWindow() with nothing nearby adds the window as-is', () => {
  const { merged, absorbed } = mergeWindow([i(0, 1)], iso(3), iso(4));
  assert.deepEqual(merged, i(3, 4));
  assert.deepEqual(absorbed, []);
});

test('bookingConflict() checks the window first, then existing bookings', () => {
  const windows = [i(0, 10)];
  const bookings = [i(4, 6)];
  assert.equal(bookingConflict(windows, bookings, iso(0), iso(4)), null);
  assert.equal(bookingConflict(windows, bookings, iso(6), iso(10)), null);
  assert.equal(bookingConflict(windows, bookings, iso(5), iso(7)), 'already-booked');
  assert.equal(bookingConflict(windows, bookings, iso(8), iso(11)), 'not-offered');
  assert.equal(bookingConflict([], [], iso(0), iso(1)), 'not-offered');
});
