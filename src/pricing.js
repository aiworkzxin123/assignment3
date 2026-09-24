'use strict';

const HOUR = 36e5;

// Price for a rental: whole days at the daily rate, leftover hours at the
// hourly rate (partial hours round up), with leftover hours never costing
// more than one extra day.
function quote(car, startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso);
  const hours = Math.ceil(ms / HOUR);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const remCost = Math.min(remHours * car.price_per_hour, car.price_per_day);
  const total = round2(days * car.price_per_day + remCost);
  return { hours, days, remHours, total };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { quote };
