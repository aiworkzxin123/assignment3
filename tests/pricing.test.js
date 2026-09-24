'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { quote } = require('../src/pricing');
const quoteCases = require('./fixtures/quote-cases');

const car = { price_per_hour: 10, price_per_day: 50 };
const t0 = '2030-01-01T09:00:00.000Z';
const plus = (h) => new Date(Date.parse(t0) + h * 36e5).toISOString();

for (const { name, hours, expected } of quoteCases) {
  test(name, () => {
    assert.deepEqual(quote(car, t0, plus(hours)), expected);
  });
}
