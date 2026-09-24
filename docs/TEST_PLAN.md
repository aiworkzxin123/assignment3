# Test Plan — Neighbourhood Car Share

## 1. Strategy
| Level | Tool | What |
|---|---|---|
| Unit | `node:test` — `tests/pricing.test.js` | Price calculation rules |
| API / integration | `node:test` — `tests/api.test.js` | Each test starts the real Express app on a random port with a fresh in-memory SQLite DB and calls it over HTTP with per-user cookie jars |
| Manual UI | Browser checklist below | Layout, map, dialogs, phone width, dark mode |

Run the automated tests with `npm test` (no network or database setup needed).

## 2. Automated test cases
| ID | Test (file: test name) | Requirement |
|---|---|---|
| T-01 | pricing: charges hourly for short rentals | §5 pricing |
| T-02 | pricing: rounds partial hours up | §5 |
| T-03 | pricing: hourly cost is capped at the daily rate | §5 |
| T-04 | pricing: whole days use the daily rate plus leftover hours | §5 |
| T-05 | api: register, me, logout, login (case-insensitive username, wrong password rejected) | US-01, US-03 |
| T-06 | api: rejects weak passwords and duplicate usernames | US-01, NFR-3 |
| T-07 | api: enforces the member limit | US-02 |
| T-08 | api: requires the invite code when configured | US-02 |
| T-09 | api: API needs login | NFR-3 |
| T-10 | api: owner can add, update price/listing and delete a car; unlisted hidden; non-owner gets 403 | US-30, 31, 33, 34 |
| T-11 | api: validates car input (negative price, bad latitude, empty make, `javascript:` URL) | NFR-6 |
| T-12 | api: browse filters by seats, price, text and free time; quote returned | US-11 |
| T-13 | api: overlapping availability windows are merged | US-32 |
| T-14 | api: cannot remove an availability window that holds a booking | US-32 |
| T-15 | api: renter books a car; price is calculated; owner and renter both see it | US-20, 22, 23 |
| T-16 | api: rejects double bookings, bookings outside availability, own-car, reversed and past bookings; allows back-to-back | US-21 |
| T-17 | api: cancelling frees the slot; strangers cannot cancel; can't cancel twice | US-22, 23 |
| T-18 | api: car with upcoming bookings cannot be deleted | US-33 |
| T-19 | api: detail hides renter names from other users | NFR-7 |
| T-20 | api: owner uploads a photo and attaches it to a car; renters see it; missing files 404 | US-35, US-36 |
| T-21 | api: rejects uploads that are not photos, and anonymous uploads | US-35, NFR-3 |
| T-22 | api: photo must be an uploaded file, a bundled photo or a web link (no `/etc/passwd`, no `..`) | US-35, NFR-6 |

**Latest result:** 22 / 22 passed (Node 24.21, Windows 11).

## 3. Manual UI checklist
Run `npm run seed -- --reset`, then `npm start`, and open http://localhost:3080.

| # | Steps | Expected |
|---|---|---|
| M-01 | Register a new account | Lands on Browse; name in the top bar |
| M-02 | Log out, log in as `bob` / `password123` | Browse shows 6 demo cars |
| M-03 | Type "tesla" in search; set seats 7+; set max/hour 8 | List updates within ¼ s each time |
| M-04 | Set From/To for tomorrow 10:00–12:00 | Only free cars shown, each with "… for your time" price |
| M-05 | Switch to Map | Price pins near the default centre; grey pins = not free now; clicking a pin → popup → "Details & book" |
| M-06 | Open the Toyota | 7-day timeline shows green and red blocks; booked list shows "Booked" (not names) |
| M-07 | Pick a time overlapping a red block | Red error, Confirm button disabled |
| M-08 | Pick a free time and confirm | Toast shown; the booking appears under Bookings → My trips |
| M-09 | Log in as `alice` → My cars → change the Toyota's hourly price → Save price | Toast "Saved"; new price shown in Browse |
| M-10 | Add a time slot; click "Every day 8:00–20:00 for a week"; remove a slot | Slot list updates; overlapping slots merge |
| M-11 | Uncheck "Listed" and save | Car hidden for bob; shows "Unlisted" for alice |
| M-12 | + Add a car → click the map to set location → Save | New car in My cars, and on the map once it has slots |
| M-13 | Bookings → cancel a booking | Status becomes "Cancelled"; slot is free again |
| M-14 | Narrow the window to phone width (~375 px) | No sideways scrolling; dialogs fit; tabs usable |
| M-15 | Switch the OS to dark mode | Colours adapt and text stays readable |
| M-16 | Browse the list | Every demo car shows its photo, with the availability badge over the photo |
| M-17 | Open a car; open a map pin | Large photo with "Photo: …" credit; map pop-up shows a small photo |
| M-18 | My cars → Edit details → Upload a photo (JPEG) → Save | Preview appears, then the new photo shows in Browse, with no credit line |
| M-19 | Try uploading a .txt file renamed to .jpg, or a file over 5 MB | Clear error; the car keeps its old photo |
| M-20 | Open from another device on the same Wi-Fi using the "Your network" URL | App loads and login works |
