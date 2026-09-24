# Design — Neighbourhood Car Share

## 1. Architecture

```
 Browser (phone / laptop)                    Host PC or small server
┌───────────────────────────┐   HTTP/JSON   ┌───────────────────────────────┐
│ public/index.html          │ ───────────▶ │ server.js  (Node.js ≥ 22.13)   │
│ public/app.js  (vanilla JS)│ ◀─────────── │  └─ src/app.js   Express routes│
│ public/styles.css          │  session     │      ├─ src/auth.js  scrypt,   │
│ Leaflet + OpenStreetMap    │  cookie      │      │   sessions, cookies     │
└───────────────────────────┘               │      ├─ src/pricing.js quote() │
            │ map tiles                     │      └─ src/db.js  node:sqlite │
            ▼                               │            │                   │
   tile.openstreetmap.org                   │     data/carshare.db (SQLite)  │
                                            └───────────────────────────────┘
```

- **Single process, single file database.** For ≤10 users, SQLite via Node's built-in `node:sqlite` is plenty and needs no native build or DB server.
- **No frontend build step.** Plain HTML/CSS/JS served statically by Express; Leaflet loaded from cdnjs.
- **Synchronous DB + transactions.** Booking checks and inserts run inside one transaction, and Node is single-threaded, so two people can't book the same slot at once.

## 2. Folder layout
```
project3/
├─ server.js            entry point (reads env vars, opens DB, starts HTTP)
├─ src/
│  ├─ app.js            createApp(db, options) — all routes & validation
│  ├─ auth.js           password hashing, sessions, cookie helpers, middleware
│  ├─ db.js             schema + openDb() + transaction()
│  └─ pricing.js        quote(car, start, end)
├─ public/              frontend (index.html, app.js, styles.css)
│  └─ images/cars/      bundled demo photos (credits in docs/IMAGE_CREDITS.md)
├─ scripts/seed.js      demo data
├─ tests/               node:test suites (API + pricing)
├─ hosted/              claude.ai hosted version (single HTML page)
├─ data/                SQLite database and uploads/ (created at runtime)
└─ docs/                these documents
```

## 3. Data model

```
 users 1───* cars 1───* availability
   │           │
   │           └──────* bookings *───1 users (renter)
   └──1───* sessions
```

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, username (unique, case-insensitive), display_name, password_hash, password_salt, created_at | scrypt 64-byte hash, 16-byte salt |
| `sessions` | token (PK, 256-bit random), user_id, expires_at | 14-day expiry; expired rows purged on login |
| `cars` | id, owner_id, make, model, year, seats, fuel, transmission, color, image_url, image_credit, description, price_per_hour, price_per_day, lat, lng, address, is_listed | `is_listed=0` hides the car from others |
| `availability` | id, car_id, start_at, end_at | Owner-offered windows; merged when overlapping/touching |
| `bookings` | id, car_id, renter_id, start_at, end_at, total_price, status (`confirmed`/`cancelled`), note | Price frozen at booking time |

**Photos.** `image_url` is one of: a bundled demo photo (`/images/cars/<name>.jpg`), an uploaded photo (`/uploads/<random>.<ext>`, stored in `data/uploads/`), or an `http(s)` link. `image_credit` holds the licence credit for bundled photos, and is cleared automatically when an owner changes the photo. `openDb()` adds the `image_credit` column to databases created before it existed.

All times are stored as UTC ISO-8601 strings (`2030-01-01T09:00:00.000Z`), so string comparison equals time comparison. The browser converts to and from local time.

### Booking rules (server-enforced)
A booking `[start, end)` for car C by user U is accepted only if:
1. `end > start`, and `start` isn't more than 10 minutes in the past;
2. C is listed and U isn't the owner;
3. one availability window of C fully covers `[start, end)`;
4. no confirmed booking of C overlaps (`b.start < end AND b.end > start`). Back-to-back bookings are allowed.

## 4. REST API
All bodies are JSON. Errors return `{ "error": "message" }` with a 4xx status. All routes except `/api/auth/*` need a session cookie (otherwise 401).

| Method & path | Who | Purpose |
|---|---|---|
| `POST /api/auth/register` | anyone | `{username, password, displayName?, inviteCode?}` → 201 + cookie. 403 if full or wrong invite code, 409 if username taken |
| `POST /api/auth/login` | anyone | `{username, password}` → cookie |
| `POST /api/auth/logout` | anyone | clears session |
| `GET /api/auth/me` | anyone | `{user|null, members, maxUsers, inviteRequired, currency, defaultCenter}` |
| `GET /api/cars?q&seats&fuel&maxPrice&from&to` | member | Listed cars + `available_now`, `next_window`; with from/to returns only free cars plus a `quote` |
| `GET /api/my/cars` | member | My cars including unlisted |
| `GET /api/cars/:id` | member | `{car, availability[], bookings[]}` (renter names only for owner/renter) |
| `GET /api/cars/:id/quote?start&end` | member | `{quote:{hours,days,remHours,total}, unavailable: reason|null}` |
| `POST /api/cars` | member | Create a car (fields as in `cars` table) |
| `PUT /api/cars/:id` | owner | Partial update — e.g. `{price_per_hour, price_per_day, is_listed}` |
| `DELETE /api/cars/:id` | owner | 409 if the car has upcoming bookings |
| `POST /api/cars/:id/availability` | owner | `{start, end}` — add (merged) window |
| `DELETE /api/cars/:id/availability/:wid` | owner | 409 if an upcoming booking sits inside it |
| `POST /api/uploads` | member | Raw image body (`Content-Type: image/jpeg`, `image/png` or `image/webp`, ≤ 5 MB) → 201 `{url}`. The type is checked from the file's first bytes; 400 if it isn't a real image |
| `GET /uploads/<file>` | anyone | Serves an uploaded photo |
| `POST /api/bookings` | member | `{carId, start, end, note?}` → 201, or 409 with a reason |
| `GET /api/bookings` | member | `{asRenter[], asOwner[]}` |
| `POST /api/bookings/:id/cancel` | renter or owner | Cancel a booking that hasn't ended |

## 5. Frontend
Single page with three tabs:
- **Browse** — filter bar, then **List** (cards) or **Map** (Leaflet, price pins; grey pin = not free right now). Clicking a car opens the detail dialog: specs, mini-map, 7-day timeline (green available / red booked), slot lists, and the booking form with live price quote.
- **My cars** — each car has quick price/listed editing, its availability slots (add, remove, "every day 8–20 for a week") and an **Edit details** dialog with a map location picker.
- **Bookings** — "My trips" and "Bookings of my cars", each with status badges and cancel buttons.

## 6. Security
- scrypt password hashing with timing-safe comparison; 8-character minimum password.
- Session token: 32 random bytes, HttpOnly, SameSite=Lax cookie (`Secure` when `SECURE_COOKIES=1`).
- Member cap enforced inside a transaction; optional `INVITE_CODE`.
- Ownership checks on every write; renter names hidden from other members.
- All output HTML-escaped in the frontend; photo paths restricted to http(s) links, bundled photos or uploads (no path traversal).
- Uploads: members only, 5 MB cap, type checked by magic bytes, saved under a random name so users can't choose paths or overwrite files.
- Out of scope for v1: login rate limiting, password reset (an organiser can delete a user row in the DB), CSRF tokens (SameSite=Lax plus JSON-only bodies mitigate this).

## 7. Configuration (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3080 | HTTP port |
| `HOST` | 0.0.0.0 | Bind address (0.0.0.0 = reachable on your network) |
| `DB_FILE` | data/carshare.db | SQLite file path |
| `MAX_USERS` | 10 | Member cap |
| `INVITE_CODE` | (none) | If set, needed to register |
| `CURRENCY` | `$` | Currency symbol shown in the UI |
| `DEFAULT_LAT` / `DEFAULT_LNG` | 51.5074 / -0.1278 | Map centre when there are no cars, and centre for seed data |
| `SECURE_COOKIES` | (off) | Set to `1` when served over HTTPS |

## 8. Hosted variant
`hosted/index.html` is the same product as a single page published on claude.ai. It uses the platform's shared database and sign-in (claude.ai accounts) instead of the Express server. Photos live in the page's own file store, because the hosted page can't load images from other websites. Car documents keep `imageId` and `imageUrl` (`/_blob/<id>`). Uploading is available only to people who can edit the page. See the user guide for the differences.
