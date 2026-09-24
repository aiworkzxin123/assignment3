'use strict';

// ---------- helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  me: null,
  config: { currency: '$', defaultCenter: { lat: 51.5074, lng: -0.1278 } },
  cars: [],
  allCars: [],
  browseMode: 'list',
  browseMap: null,
  browseLayer: null,
  pickMap: null,
  pickMarker: null,
  editingCar: null,
};

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    showAuth();
    throw new Error(data.error || 'Please log in.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const money = (n) => `${state.config.currency}${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtRange(a, b) {
  const s = new Date(a), e = new Date(b);
  const sameDay = s.toDateString() === e.toDateString();
  const endStr = sameDay ? e.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : fmt(b);
  return `${fmt(a)} → ${endStr}`;
}

function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const fromLocalInput = (v) => (v ? new Date(v).toISOString() : '');

function nextHour(from = new Date()) {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// ---------- icons & small components ----------

const ICON_PATHS = {
  seats: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  fuel: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9"/><path d="M14 8h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/>',
  gear: '<circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v8M12 8v8M18 8v4H6"/>',
  palette: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  car: '<path d="M3.5 15.5V12l2-5.2A2 2 0 0 1 7.4 5.5h9.2a2 2 0 0 1 1.9 1.3l2 5.2v3.5a1 1 0 0 1-1 1h-1.2M6.2 16.5H4.5a1 1 0 0 1-1-1M9 16.5h6"/><circle cx="7.6" cy="16.5" r="1.9"/><circle cx="16.4" cy="16.5" r="1.9"/><path d="M4.5 11.5h15"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
const fuelIcon = (fuel) => icon(fuel === 'Electric' ? 'bolt' : fuel === 'Hybrid' ? 'leaf' : 'fuel');

const CAR_PLACEHOLDER = `<div class="car-img" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON_PATHS.car}</svg></div>`;

function carImg(car) {
  if (!car.image_url) return CAR_PLACEHOLDER;
  return `<img class="car-img" src="${esc(car.image_url)}" alt="${esc(car.make)} ${esc(car.model)}" loading="lazy" onerror="carImgFailed(this)">`;
}

// A photo link that no longer works falls back to the drawn car.
window.carImgFailed = (img) => { img.outerHTML = CAR_PLACEHOLDER; };

// Initials on a colour picked from the name, so each neighbour is recognisable.
const AVATAR_COLOURS = ['#2f7cf6', '#0f9d74', '#d9480f', '#7c4dff', '#c2185b', '#00838f', '#6d4c41', '#5c6bc0'];
function avatar(name) {
  const n = String(name || '?');
  const initials = n.replace(/\(.*?\)/g, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="avatar" style="background:${AVATAR_COLOURS[h % AVATAR_COLOURS.length]}" aria-hidden="true">${esc(initials)}</span>`;
}

function availBadge(car) {
  if (!car.is_listed) return '<span class="badge">Hidden</span>';
  if (car.available_now) return '<span class="badge ok">Free now</span>';
  if (car.next_window) return `<span class="badge warn">From ${esc(fmt(car.next_window.start_at))}</span>`;
  return '<span class="badge danger">No times set</span>';
}

function specChips(c, cls = '') {
  const items = [
    `${icon('seats')} ${c.seats} seats`,
    `${fuelIcon(c.fuel)} ${esc(c.fuel)}`,
    `${icon('gear')} ${esc(c.transmission)}`,
  ];
  if (c.color) items.push(`${icon('palette')} ${esc(c.color)}`);
  return items.map((i) => `<span class="${cls}">${i}</span>`).join('');
}

// ---------- auth ----------

function showAuth() {
  $('#app-view').hidden = true;
  $('#auth-view').hidden = false;
}

async function showApp() {
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;
  $('#user-name').textContent = state.me.display_name;
  $('#user-avatar').outerHTML = avatar(state.me.display_name).replace('class="avatar"', 'class="avatar" id="user-avatar"');
  showView('browse');
}

$$('[data-auth-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    $$('[data-auth-tab]').forEach((x) => x.classList.toggle('active', x === b));
    $('#login-form').hidden = b.dataset.authTab !== 'login';
    $('#register-form').hidden = b.dataset.authTab !== 'register';
    $('#auth-error').textContent = '';
  }),
);

async function submitAuth(e, url) {
  e.preventDefault();
  $('#auth-error').textContent = '';
  try {
    const { user } = await api('POST', url, Object.fromEntries(new FormData(e.target)));
    state.me = user;
    e.target.reset();
    showApp();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
}
$('#login-form').addEventListener('submit', (e) => submitAuth(e, '/api/auth/login'));
$('#register-form').addEventListener('submit', (e) => submitAuth(e, '/api/auth/register'));

$('#logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout').catch(() => {});
  state.me = null;
  showAuth();
});

// ---------- navigation ----------

function showView(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${name}`));
  window.scrollTo({ top: 0 });
  if (name === 'browse') loadBrowse();
  if (name === 'mycars') loadMyCars();
  if (name === 'bookings') loadBookings();
}
$$('[data-view]').forEach((t) =>
  t.addEventListener('click', (e) => {
    e.preventDefault();
    showView(t.dataset.view);
  }),
);

// ---------- browse ----------

let filterTimer;
$('#filters').addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(loadBrowse, 250);
});
$('#filters').addEventListener('submit', (e) => e.preventDefault());
$('#clear-filters').addEventListener('click', () => {
  $('#filters').reset();
  loadBrowse();
});

$$('[data-browse-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    state.browseMode = b.dataset.browseMode;
    $$('[data-browse-mode]').forEach((x) => x.classList.toggle('active', x === b));
    renderBrowse();
  }),
);

async function loadBrowse() {
  const f = Object.fromEntries(new FormData($('#filters')));
  const params = new URLSearchParams();
  for (const k of ['q', 'seats', 'fuel', 'maxPrice']) if (f[k]) params.set(k, f[k]);
  const timed = f.from && f.to;
  if (timed) {
    params.set('from', fromLocalInput(f.from));
    params.set('to', fromLocalInput(f.to));
  }
  try {
    const { cars } = await api('GET', `/api/cars?${params}`);
    state.cars = cars;
    if (![...params.keys()].length || !state.allCars.length) {
      state.allCars = params.toString() ? (await api('GET', '/api/cars')).cars : cars;
      renderHero();
    }
    $('#result-title').textContent = timed ? 'Free for your trip' : 'Cars on your street';
    $('#result-count').textContent = `${cars.length} car${cars.length === 1 ? '' : 's'}${timed ? ' available for the whole time, with the trip price shown' : ', sorted with the ones free right now first'}`;
    renderBrowse();
  } catch (err) {
    $('#result-count').textContent = err.message;
  }
}

function renderHero() {
  const all = state.allCars.filter((c) => !c.is_mine);
  const free = all.filter((c) => c.available_now);
  const cheapest = all.length ? Math.min(...all.map((c) => c.price_per_hour)) : null;
  const owners = new Set(state.allCars.map((c) => c.owner_id)).size;
  $('#hero-stats').innerHTML = `
    <div class="stat"><b>${all.length}</b><span>cars to rent</span></div>
    <div class="stat"><b>${free.length}</b><span>free right now</span></div>
    <div class="stat"><b>${cheapest === null ? '–' : money(cheapest)}</b><span>per hour, from</span></div>
    <div class="stat"><b>${owners}</b><span>neighbours sharing</span></div>`;

  // Feature the cheapest car that's free now, falling back to any car with a photo.
  const pick = [...free].filter((c) => c.image_url).sort((a, b) => a.price_per_hour - b.price_per_hour)[0]
    || all.find((c) => c.image_url);
  const box = $('#hero-feature');
  if (!pick) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    ${carImg(pick)}
    <div class="tag">
      <div><small>${pick.available_now ? 'Free right now' : 'Coming up'}</small><strong>${esc(pick.make)} ${esc(pick.model)}</strong></div>
      <div class="price-big">${money(pick.price_per_hour)}<span> / hour</span></div>
    </div>`;
  box.onclick = () => openCar(pick.id);
}

function renderBrowse() {
  const grid = $('#car-grid');
  const mapEl = $('#browse-map');
  grid.hidden = state.browseMode !== 'list';
  mapEl.hidden = state.browseMode !== 'map';

  const cars = [...state.cars].sort((a, b) => b.available_now - a.available_now || a.price_per_hour - b.price_per_hour);
  if (state.browseMode === 'list') {
    grid.innerHTML = cars.length
      ? cars.map(cardHtml).join('')
      : '<div class="empty"><strong>No cars match</strong>Try clearing the filters, or list your own car under “My garage”.</div>';
    $$('.card', grid).forEach((el) => {
      el.addEventListener('click', () => openCar(el.dataset.id));
      el.addEventListener('keydown', (e) => e.key === 'Enter' && openCar(el.dataset.id));
    });
  } else {
    renderBrowseMap(cars);
  }
}

function cardHtml(c) {
  return `
    <article class="card" tabindex="0" data-id="${c.id}" aria-label="${esc(c.make)} ${esc(c.model)}, ${money(c.price_per_hour)} per hour">
      <div class="card-photo">
        ${carImg(c)}
        ${availBadge(c)}
        <div class="price-tag">${money(c.price_per_hour)}<span> /hr</span></div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(c.make)} ${esc(c.model)}${c.year ? `<small>${c.year}</small>` : ''}</div>
        <div class="specs">${specChips(c)}</div>
        <div class="muted small">${money(c.price_per_day)} per day${c.address ? ` · ${esc(c.address)}` : ''}</div>
        ${c.quote ? `<div class="quote-line">${money(c.quote.total)} for your trip</div>` : ''}
        <div class="card-foot">
          <span class="owner">${avatar(c.owner_name)}<span>${c.is_mine ? 'Your car' : esc(c.owner_name)}</span></span>
          <span class="go">View &amp; book ${icon('arrow')}</span>
        </div>
      </div>
    </article>`;
}

function pricePin(car) {
  return L.divIcon({
    className: '',
    iconSize: null,
    html: `<span class="price-pin ${car.available_now ? '' : 'off'}">${money(car.price_per_hour)}/h</span>`,
  });
}

function renderBrowseMap(cars) {
  if (!state.browseMap) {
    state.browseMap = makeMap('browse-map');
    state.browseLayer = L.layerGroup().addTo(state.browseMap);
  }
  const map = state.browseMap;
  state.browseLayer.clearLayers();
  const pts = [];
  for (const c of cars) {
    const m = L.marker([c.lat, c.lng], { icon: pricePin(c), title: `${c.make} ${c.model}` });
    m.bindPopup(`
      <div class="pop">
        ${c.image_url ? `<img src="${esc(c.image_url)}" alt="">` : ''}
        <div class="pop-body">
          <strong>${esc(c.make)} ${esc(c.model)}</strong>
          <div>${availBadge(c)}</div>
          <div class="muted small">${money(c.price_per_hour)}/hour · ${money(c.price_per_day)}/day</div>
          ${c.address ? `<div class="muted small">${esc(c.address)}</div>` : ''}
          <button class="btn primary sm" data-open-car="${c.id}">View &amp; book</button>
        </div>
      </div>`);
    m.addTo(state.browseLayer);
    pts.push([c.lat, c.lng]);
  }
  setTimeout(() => {
    map.invalidateSize();
    if (pts.length) map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 });
    else map.setView([state.config.defaultCenter.lat, state.config.defaultCenter.lng], 14);
  }, 0);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-open-car]');
  if (b) openCar(b.dataset.openCar);
});

function makeMap(id) {
  const map = L.map(id, { scrollWheelZoom: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  return map;
}

// ---------- car detail & booking ----------

function timelineHtml(windows, bookings, days = 7) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d0 = new Date(start); d0.setDate(d0.getDate() + i);
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    const segs = (list, cls) =>
      list
        .map((x) => {
          const a = Math.max(new Date(x.start_at), d0), b = Math.min(new Date(x.end_at), d1);
          if (b <= a) return '';
          const left = ((a - d0) / 864e5) * 100, width = ((b - a) / 864e5) * 100;
          return `<div class="tl-seg ${cls}" style="left:${left}%;width:${width}%" title="${esc(fmtRange(x.start_at, x.end_at))}"></div>`;
        })
        .join('');
    const label = i === 0 ? 'Today' : d0.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    rows.push(`<div class="tl-row ${i === 0 ? 'today' : ''}"><span>${label}</span><div class="tl-bar">${segs(windows, 'avail')}${segs(bookings, 'booked')}</div></div>`);
  }
  return `
    <div class="timeline">
      ${rows.join('')}
      <div class="tl-axis"><div></div><div><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
    </div>
    <div class="legend"><span><i style="background:var(--avail)"></i>Free to book</span><span><i style="background:var(--booked)"></i>Booked</span><span><i style="background:var(--surface-2);border:1px solid var(--border)"></i>Not offered</span></div>`;
}

async function openCar(id) {
  let data;
  try {
    data = await api('GET', `/api/cars/${id}`);
  } catch (err) {
    return toast(err.message);
  }
  const { car, availability, bookings } = data;
  const body = $('#car-dialog-body');

  const windowsList = availability.length
    ? `<ul class="list">${availability.map((w) => `<li>${esc(fmtRange(w.start_at, w.end_at))}</li>`).join('')}</ul>`
    : '<p class="muted small">The owner hasn’t offered any times yet.</p>';
  const bookedList = bookings.length
    ? `<ul class="list">${bookings.map((b) => `<li><span>${esc(fmtRange(b.start_at, b.end_at))}</span><span class="muted small">${b.is_mine ? 'You' : b.renter_name ? esc(b.renter_name) : 'Booked'}</span></li>`).join('')}</ul>`
    : '<p class="muted small">No upcoming bookings.</p>';

  // Default booking time: next full hour inside the first open window.
  let defStart = nextHour();
  const w0 = availability[0];
  if (w0 && new Date(w0.start_at) > defStart) defStart = new Date(w0.start_at);
  const defEnd = new Date(defStart.getTime() + 2 * 36e5);

  const side = car.is_mine
    ? `<aside class="booking-card">
         <h3>This is your car</h3>
         <p class="muted small" style="margin:0">Change the price, photo or the times it’s free from your garage.</p>
         <button class="btn primary" id="manage-car">Edit this car</button>
       </aside>`
    : `<form class="booking-card" id="book-form">
         <h3>Book this car</h3>
         <label class="field">Pick-up <input type="datetime-local" name="start" required value="${toLocalInput(defStart)}"></label>
         <label class="field">Return <input type="datetime-local" name="end" required value="${toLocalInput(defEnd)}"></label>
         <label class="field">Note to ${esc(car.owner_name)} <input name="note" maxlength="300" placeholder="e.g. Airport run, back by 6"></label>
         <div class="total"><span id="quote-dur">Total</span><b id="quote-text">–</b></div>
         <p class="error" id="book-error" role="alert"></p>
         <button class="btn primary lg" type="submit" id="book-btn">Confirm booking</button>
         <p class="muted small" style="margin:0">Confirmed instantly. You arrange keys and payment with the owner.</p>
       </form>`;

  body.innerHTML = `
    <figure class="detail-hero">
      ${carImg(car)}
      ${car.image_credit ? `<figcaption class="credit">Photo: ${esc(car.image_credit)}</figcaption>` : ''}
      <button type="button" class="icon-btn on-photo" data-close aria-label="Close">✕</button>
      <div class="detail-title">
        <div>
          ${availBadge(car)}
          <h2 class="display-sm">${esc(car.make)} ${esc(car.model)}</h2>
        </div>
        <span class="owner" style="color:#fff">${avatar(car.owner_name)}<span>${car.is_mine ? 'Your car' : esc(car.owner_name)}</span></span>
      </div>
    </figure>
    <div class="detail-body">
      <div class="detail-main">
        <div class="chips">${car.year ? `<span class="chip">${icon('calendar')} ${car.year}</span>` : ''}${specChips(car, 'chip')}</div>
        ${car.description ? `<p style="margin:0">${esc(car.description)}</p>` : ''}
        <div class="rates">
          <div class="rate"><b>${money(car.price_per_hour)}</b><span>per hour</span></div>
          <div class="rate"><b>${money(car.price_per_day)}</b><span>per day, for 24 hours</span></div>
        </div>
        <div class="where">
          <div class="where-text">
            <span class="label">Pick-up spot</span>
            <strong>${icon('pin')} ${esc(car.address || 'Shown on the map')}</strong>
            <span class="muted small">Collect the keys from ${car.is_mine ? 'you' : esc(car.owner_name)}.</span>
          </div>
          <div id="mini-map" class="map mini-map"></div>
        </div>
        <div class="stack">
          <span class="label">Next 7 days</span>
          ${timelineHtml(availability, bookings)}
        </div>
        <div class="where">
          <div class="stack"><span class="label">Times offered</span>${windowsList}</div>
          <div class="stack"><span class="label">Already booked</span>${bookedList}</div>
        </div>
      </div>
      ${side}
    </div>`;

  const dlg = $('#car-dialog');
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;

  const mini = makeMap('mini-map');
  L.marker([car.lat, car.lng], { icon: pricePin(car) }).addTo(mini);
  setTimeout(() => { mini.invalidateSize(); mini.setView([car.lat, car.lng], 16); }, 0);
  dlg.addEventListener('close', () => mini.remove(), { once: true });

  if (car.is_mine) {
    $('#manage-car').addEventListener('click', () => { dlg.close(); openCarForm(car); });
    return;
  }

  const form = $('#book-form');
  const updateQuote = async () => {
    const f = Object.fromEntries(new FormData(form));
    $('#book-error').textContent = '';
    if (!f.start || !f.end) return;
    try {
      const { quote, unavailable } = await api('GET', `/api/cars/${car.id}/quote?start=${encodeURIComponent(fromLocalInput(f.start))}&end=${encodeURIComponent(fromLocalInput(f.end))}`);
      const dur = [quote.days && `${quote.days} day${quote.days > 1 ? 's' : ''}`, quote.remHours && `${quote.remHours} hr`].filter(Boolean).join(' ');
      $('#quote-text').textContent = money(quote.total);
      $('#quote-dur').textContent = `Total · ${dur}`;
      $('#book-btn').disabled = !!unavailable;
      if (unavailable) $('#book-error').textContent = unavailable;
    } catch (err) {
      $('#quote-text').textContent = '–';
      $('#quote-dur').textContent = 'Total';
      $('#book-btn').disabled = true;
      $('#book-error').textContent = err.message;
    }
  };
  form.addEventListener('input', updateQuote);
  updateQuote();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    try {
      await api('POST', '/api/bookings', { carId: car.id, start: fromLocalInput(f.start), end: fromLocalInput(f.end), note: f.note });
      toast(`Booked. Arrange the keys and payment with ${car.owner_name}.`);
      dlg.close();
      loadBrowse();
    } catch (err) {
      $('#book-error').textContent = err.message;
    }
  });
}

// Close buttons inside any dialog.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) e.target.closest('dialog')?.close();
});

// ---------- my garage ----------

async function loadMyCars() {
  const box = $('#my-cars');
  try {
    const [{ cars }, { asOwner }] = await Promise.all([api('GET', '/api/my/cars'), api('GET', '/api/bookings')]);
    if (!cars.length) {
      box.innerHTML = '<div class="empty"><strong>Your garage is empty</strong>List your car to start renting it to neighbours when you’re not using it.</div>';
      return;
    }
    const details = await Promise.all(cars.map((c) => api('GET', `/api/cars/${c.id}`)));
    box.innerHTML = details.map((d) => myCarHtml(d, asOwner)).join('');
    bindMyCars(details);
  } catch (err) {
    box.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

function myCarHtml({ car, availability, bookings }, ownerBookings) {
  const upcoming = ownerBookings.filter((b) => b.car_id === car.id && b.status === 'confirmed' && new Date(b.end_at) > new Date());
  const earned = ownerBookings.filter((b) => b.car_id === car.id && b.status === 'confirmed').reduce((s, b) => s + b.total_price, 0);
  const start = nextHour();
  const end = new Date(start.getTime() + 8 * 36e5);
  return `
    <article class="garage" data-car="${car.id}">
      <div class="garage-photo">${carImg(car)}${availBadge(car)}</div>
      <div class="garage-body">
        <div class="row between">
          <div>
            <h3>${esc(car.make)} ${esc(car.model)}${car.year ? ` <span class="muted" style="font-weight:500;font-stretch:100%">${car.year}</span>` : ''}</h3>
            <div class="specs">${specChips(car)}</div>
          </div>
          <div class="row">
            <button class="btn ghost sm" data-preview>See it as renters do</button>
            <button class="btn sm" data-edit>Edit details &amp; photo</button>
          </div>
        </div>
        <div class="tiles">
          <form class="tile" data-price-form>
            <span class="label">Price</span>
            <div class="inline-form">
              <label class="field">Per hour <input name="price_per_hour" type="number" min="0" step="0.5" value="${car.price_per_hour}" required></label>
              <label class="field">Per day <input name="price_per_day" type="number" min="0" step="0.5" value="${car.price_per_day}" required></label>
            </div>
            <div class="row between">
              <label class="check"><input type="checkbox" name="is_listed" ${car.is_listed ? 'checked' : ''}> Listed for rent</label>
              <button class="btn primary sm" type="submit">Save</button>
            </div>
          </form>
          <div class="tile">
            <div class="row between"><span class="label">This week</span><span class="muted small num">${upcoming.length} upcoming · ${money(earned)} booked in total</span></div>
            ${timelineHtml(availability, bookings)}
          </div>
        </div>
        <div class="tile">
          <span class="label">Times you’re offering it</span>
          ${availability.length
            ? `<ul class="list">${availability.map((w) => `<li><span>${esc(fmtRange(w.start_at, w.end_at))}</span><button class="btn danger-ghost sm" data-del-window="${w.id}">Remove</button></li>`).join('')}</ul>`
            : '<p class="muted small" style="margin:0">No times yet, so nobody can book it. Add some below.</p>'}
          <form class="inline-form" data-window-form>
            <label class="field">Free from <input type="datetime-local" name="start" value="${toLocalInput(start)}" required></label>
            <label class="field">Until <input type="datetime-local" name="end" value="${toLocalInput(end)}" required></label>
            <button class="btn sm" type="submit">+ Add these times</button>
            <button class="btn ghost sm" type="button" data-quick-week>+ 08:00–20:00 daily for a week</button>
          </form>
        </div>
      </div>
    </article>`;
}

function bindMyCars(details) {
  for (const { car } of details) {
    const panel = $(`[data-car="${car.id}"]`);
    $('[data-edit]', panel).addEventListener('click', () => openCarForm(car));
    $('[data-preview]', panel).addEventListener('click', () => openCar(car.id));

    $('[data-price-form]', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('PUT', `/api/cars/${car.id}`, {
          price_per_hour: f.get('price_per_hour'),
          price_per_day: f.get('price_per_day'),
          is_listed: f.get('is_listed') === 'on',
        });
        toast('Price and listing saved.');
        loadMyCars();
      } catch (err) { toast(err.message); }
    });

    $('[data-window-form]', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        await api('POST', `/api/cars/${car.id}/availability`, { start: fromLocalInput(f.start), end: fromLocalInput(f.end) });
        toast('Times added.');
        loadMyCars();
      } catch (err) { toast(err.message); }
    });

    $('[data-quick-week]', panel).addEventListener('click', async () => {
      try {
        for (let i = 0; i < 7; i++) {
          const s = new Date(); s.setDate(s.getDate() + i); s.setHours(8, 0, 0, 0);
          const en = new Date(s); en.setHours(20);
          if (en <= new Date()) continue;
          await api('POST', `/api/cars/${car.id}/availability`, { start: (s < new Date() ? new Date() : s).toISOString(), end: en.toISOString() });
        }
        toast('Offered 08:00–20:00 for the next 7 days.');
        loadMyCars();
      } catch (err) { toast(err.message); }
    });

    $$('[data-del-window]', panel).forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await api('DELETE', `/api/cars/${car.id}/availability/${b.dataset.delWindow}`);
          loadMyCars();
        } catch (err) { toast(err.message); }
      }),
    );
  }
}

// ---------- add / edit car form ----------

$('#add-car-btn').addEventListener('click', () => openCarForm(null));

function openCarForm(car) {
  state.editingCar = car;
  const form = $('#car-form');
  form.reset();
  $('#car-form-error').textContent = '';
  $('#car-form-title').textContent = car ? `Edit ${car.make} ${car.model}` : 'List a car';
  $('#delete-car-btn').hidden = !car;
  if (car) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in car)) continue;
      if (el.type === 'checkbox') el.checked = !!car[el.name];
      else el.value = car[el.name] ?? '';
    }
  } else {
    form.is_listed.checked = true;
  }
  showPhotoPreview();
  $('#edit-dialog').showModal();

  const center = car ? [car.lat, car.lng] : [state.config.defaultCenter.lat, state.config.defaultCenter.lng];
  if (!state.pickMap) {
    state.pickMap = makeMap('pick-map');
    state.pickMap.on('click', (e) => setPick(e.latlng.lat, e.latlng.lng));
  }
  if (state.pickMarker) { state.pickMarker.remove(); state.pickMarker = null; }
  if (car) setPick(car.lat, car.lng);
  setTimeout(() => { state.pickMap.invalidateSize(); state.pickMap.setView(center, 15); }, 50);
}

function setPick(lat, lng) {
  const form = $('#car-form');
  form.lat.value = lat.toFixed(6);
  form.lng.value = lng.toFixed(6);
  if (state.pickMarker) state.pickMarker.setLatLng([lat, lng]);
  else state.pickMarker = L.marker([lat, lng]).addTo(state.pickMap);
}

function showPhotoPreview() {
  const url = $('#photo-url').value.trim();
  const box = $('#photo-preview');
  box.innerHTML = url ? `<img src="${esc(url)}" alt="Car photo preview" onerror="this.outerHTML='<span>Can’t load that photo</span>'">` : '<span>No photo yet</span>';
  $('#photo-remove').hidden = !url;
}

$('#photo-url').addEventListener('change', showPhotoPreview);
$('#photo-remove').addEventListener('click', () => {
  $('#photo-url').value = '';
  showPhotoPreview();
});

$('#photo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    $('#car-form-error').textContent = 'Choose a JPEG, PNG or WebP photo.';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    $('#car-form-error').textContent = 'That photo is too big. The limit is 5 MB.';
    return;
  }
  $('#car-form-error').textContent = '';
  $('#photo-preview').innerHTML = '<span>Uploading…</span>';
  try {
    const res = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': file.type }, body: file, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    $('#photo-url').value = data.url;
  } catch (err) {
    $('#car-form-error').textContent = err.message;
  }
  showPhotoPreview();
});

$('#use-my-location').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Location isn’t supported in this browser.');
  navigator.geolocation.getCurrentPosition(
    (p) => { setPick(p.coords.latitude, p.coords.longitude); state.pickMap.setView([p.coords.latitude, p.coords.longitude], 16); },
    () => toast('Couldn’t get your location. Click the map instead.'),
  );
});

$('#car-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  data.is_listed = form.is_listed.checked;
  if (!data.lat || !data.lng) {
    $('#car-form-error').textContent = 'Click the map to show where the car is parked.';
    return;
  }
  try {
    const car = state.editingCar;
    if (car) await api('PUT', `/api/cars/${car.id}`, data);
    else await api('POST', '/api/cars', data);
    $('#edit-dialog').close();
    toast(car ? 'Car updated.' : 'Car listed. Now add the times it’s free.');
    showView('mycars');
  } catch (err) {
    $('#car-form-error').textContent = err.message;
  }
});

$('#delete-car-btn').addEventListener('click', async () => {
  const car = state.editingCar;
  if (!car || !confirm(`Delete ${car.make} ${car.model}? This can’t be undone.`)) return;
  try {
    await api('DELETE', `/api/cars/${car.id}`);
    $('#edit-dialog').close();
    toast('Car deleted.');
    showView('mycars');
  } catch (err) {
    $('#car-form-error').textContent = err.message;
  }
});

// ---------- trips ----------

async function loadBookings() {
  try {
    const { asRenter, asOwner } = await api('GET', '/api/bookings');
    $('#renter-bookings').innerHTML = asRenter.length
      ? asRenter.map((b) => ticketHtml(b, 'Owner')).join('')
      : '<div class="empty"><strong>No trips yet</strong>Find a car and book a slot. It will show up here.</div>';
    $('#owner-bookings').innerHTML = asOwner.length
      ? asOwner.map((b) => ticketHtml(b, 'Renter')).join('')
      : '<div class="empty"><strong>No bookings of your cars yet</strong>Make sure your cars have times offered in your garage.</div>';
    $$('[data-cancel]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel this booking?')) return;
        try {
          await api('POST', `/api/bookings/${btn.dataset.cancel}/cancel`);
          toast('Booking cancelled.');
          loadBookings();
        } catch (err) { toast(err.message); }
      }),
    );
  } catch (err) {
    $('#renter-bookings').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

function ticketHtml(b, otherLabel) {
  const now = new Date();
  const ended = new Date(b.end_at) <= now;
  const active = new Date(b.start_at) <= now && !ended;
  const status =
    b.status === 'cancelled' ? '<span class="badge danger">Cancelled</span>'
    : ended ? '<span class="badge">Completed</span>'
    : active ? '<span class="badge ok">On the road</span>'
    : '<span class="badge warn">Upcoming</span>';
  const canCancel = b.status === 'confirmed' && !ended;
  return `
    <article class="ticket ${b.status}">
      <div class="ticket-photo">${carImg(b)}</div>
      <div class="ticket-main">
        <div class="row"><strong>${esc(b.make)} ${esc(b.model)}</strong> ${status}</div>
        <div class="ticket-when">${icon('calendar')} ${esc(fmtRange(b.start_at, b.end_at))}</div>
        <div class="muted small">${otherLabel}: ${esc(b.other_name)}${b.address ? ` · ${esc(b.address)}` : ''}</div>
        ${b.note ? `<div class="muted small">“${esc(b.note)}”</div>` : ''}
      </div>
      <div class="ticket-stub">
        <b>${money(b.total_price)}</b>
        ${canCancel ? `<button class="btn danger-ghost sm" data-cancel="${b.id}">Cancel</button>` : ''}
      </div>
    </article>`;
}

// ---------- start ----------

(async function init() {
  try {
    const me = await api('GET', '/api/auth/me');
    state.config.currency = me.currency;
    state.config.defaultCenter = me.defaultCenter;
    $('#invite-field').hidden = !me.inviteRequired;
    $('#member-count').innerHTML = `
      <span>${me.members} of ${me.maxUsers} member places taken</span>
      <span class="meter"><i style="width:${Math.min(100, (me.members / me.maxUsers) * 100)}%"></i></span>`;
    if (me.user) {
      state.me = me.user;
      showApp();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
})();
