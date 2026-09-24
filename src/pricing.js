'use strict';

const rules = require('./rules');

// Server-side adapter: cars come from the database with snake_case prices.
function quote(car, startIso, endIso) {
  return rules.quote({ perHour: car.price_per_hour, perDay: car.price_per_day }, startIso, endIso);
}

module.exports = { quote };
