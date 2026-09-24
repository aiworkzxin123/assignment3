'use strict';

// Pure pricing and booking rules, shared by the server (src/) and the hosted
// single-page version. `npm run build:hosted` inlines this file verbatim into
// hosted/index.html, so keep it dependency-free, with no I/O and no clock.
//
// Times can be epoch milliseconds or ISO strings (same format throughout):
// anything that compares correctly with < and >. Intervals are { start, end },
// half-open [start, end).

const HOUR_MS = 36e5;

// Bookings may start this far in the past, so "start now" is accepted.
const START_GRACE_MS = 10 * 6e4;

const toMs = (t) => (typeof t === 'number' ? t : Date.parse(t));

// Price for a rental: whole days at the daily rate, leftover hours at the
// hourly rate (partial hours round up), with leftover hours never costing
// more than one extra day.
function quote({ perHour, perDay }, start, end) {
  const hours = Math.ceil((toMs(end) - toMs(start)) / HOUR_MS);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const remCost = Math.min(remHours * perHour, perDay);
  const total = Math.round((days * perDay + remCost) * 100) / 100;
  return { hours, days, remHours, total };
}

// Do [a.start, a.end) and [b.start, b.end) share any time?
const overlaps = (a, b) => a.start < b.end && a.end > b.start;

// Does the window cover the whole of [start, end)?
const covers = (w, start, end) => w.start <= start && w.end >= end;

// Is the instant t inside [i.start, i.end)?
const contains = (i, t) => i.start <= t && i.end > t;

// Add [start, end) to a list of availability windows, merging it with every
// window it overlaps or touches. Returns the merged window, the windows it
// absorbed and the untouched rest.
function mergeWindow(windows, start, end) {
  const absorbed = [];
  const rest = [];
  let s = start;
  let e = end;
  for (const w of windows) {
    if (w.start <= end && w.end >= start) {
      absorbed.push(w);
      if (w.start < s) s = w.start;
      if (w.end > e) e = w.end;
    } else {
      rest.push(w);
    }
  }
  return { merged: { start: s, end: e }, absorbed, rest };
}

// Why can't [start, end) be booked, given the car's availability windows and
// its confirmed bookings? Returns null when it can.
function bookingConflict(windows, bookings, start, end) {
  if (!windows.some((w) => covers(w, start, end))) return 'not-offered';
  if (bookings.some((b) => overlaps(b, { start, end }))) return 'already-booked';
  return null;
}

module.exports = { HOUR_MS, START_GRACE_MS, quote, overlaps, covers, contains, mergeWindow, bookingConflict };
