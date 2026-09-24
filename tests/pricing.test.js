'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { quote } = require('../src/pricing');

const car = { price_per_hour: 10, price_per_day: 50 };
const t0 = '2030-01-01T09:00:00.000Z';
const plus = (h) => new Date(Date.parse(t0) + h * 36e5).toISOString();

test('charges hourly for short rentals', () => {
  assert.deepEqual(quote(car, t0, plus(3)), { hours: 3, days: 0, remHours: 3, total: 30 });
});

test('rounds partial hours up', () => {
  assert.equal(quote(car, t0, plus(1.25)).total, 20);
});

test('hourly cost is capped at the daily rate', () => {
  assert.equal(quote(car, t0, plus(8)).total, 50);
});

test('whole days use the daily rate plus leftover hours', () => {
  assert.equal(quote(car, t0, plus(24)).total, 50);
  assert.equal(quote(car, t0, plus(26)).total, 70);
  assert.equal(quote(car, t0, plus(48 + 10)).total, 150);
});
