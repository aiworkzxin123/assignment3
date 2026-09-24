'use strict';

// Pricing cases shared by pricing.test.js (server) and hosted.test.js (hosted
// page), so both implementations are held to the same expectations.
// Rates: $10/hour, $50/day.
module.exports = [
  { name: 'charges hourly for short rentals', hours: 3, expected: { hours: 3, days: 0, remHours: 3, total: 30 } },
  { name: 'rounds partial hours up', hours: 1.25, expected: { hours: 2, days: 0, remHours: 2, total: 20 } },
  { name: 'hourly cost is capped at the daily rate', hours: 8, expected: { hours: 8, days: 0, remHours: 8, total: 50 } },
  { name: 'one whole day uses the daily rate', hours: 24, expected: { hours: 24, days: 1, remHours: 0, total: 50 } },
  { name: 'whole days plus leftover hours', hours: 26, expected: { hours: 26, days: 1, remHours: 2, total: 70 } },
  { name: 'leftover hours capped at one extra day', hours: 58, expected: { hours: 58, days: 2, remHours: 10, total: 150 } },
];
