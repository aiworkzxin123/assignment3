# Requirements — Neighbourhood Car Share

## 1. Purpose
A small private web app that lets up to **10 neighbours** rent each other's cars. Owners list cars with prices, locations and the times they're available; renters browse (as a list or on a map), see when each car is free, and book it.

## 2. Scope
| In scope | Out of scope (v1) |
|---|---|
| Username/password accounts, max 10 members | Online card payments (settled offline between neighbours) |
| Car listings with model details, photo, prices | Insurance, damage reports, ID/licence checks |
| Owner-defined availability time slots | Owner approval step (bookings are confirmed instantly) |
| Instant booking with conflict checks | Email/SMS notifications |
| Map of car locations with prices | Native mobile apps (the web app works on phones) |
| Owners edit price, availability, listing status | Multiple neighbourhoods / admin panel |

## 3. Users & roles
- **Member** — anyone with an account. Every member can be both:
  - **Owner** — lists one or more cars.
  - **Renter** — books other members' cars.

## 4. User stories
### Accounts
- **US-01** As a neighbour, I can create an account with a username, display name and password so I can use the app.
- **US-02** As the organiser, I want sign-ups capped at 10 members (configurable) and optionally protected by an invite code, so only our neighbourhood can join.
- **US-03** As a member, I can log in and out; my session stays logged in for 14 days.

### Browsing
- **US-10** As a renter, I can see all listed cars with make, model, year, seats, fuel, transmission, colour, photo, hourly and daily price, and owner.
- **US-11** As a renter, I can filter cars by text, minimum seats, fuel type, maximum hourly price, and a **from/to time** (showing only cars free for that whole period, with the price for it).
- **US-12** As a renter, I can switch to a **map** that shows each car's location as a pin labelled with its hourly price; clicking a pin shows details and a "Details & book" button.
- **US-13** As a renter, I can open a car and see a **7-day availability timeline** (available vs booked), the list of available slots, and the booked slots.

### Booking
- **US-20** As a renter, I can pick a pick-up and return time and see the total price before confirming.
- **US-21** The system must reject a booking that is outside the owner's available times, overlaps another booking, starts in the past, ends before it starts, or is for my own car.
- **US-22** As a renter, I can see my trips (upcoming, in progress, completed, cancelled) and cancel ones that haven't finished.
- **US-23** As an owner, I can see bookings of my cars (with renter name and note) and cancel them if needed.

### Owning
- **US-30** As an owner, I can add a car with its details, a photo URL, prices, pick-up address and a location picked on a map (or "use my location").
- **US-31** As an owner, I can change the **price per hour / per day** at any time. Existing bookings keep the price they were booked at.
- **US-32** As an owner, I can **add or remove available time slots**, including a one-click "every day 08:00–20:00 for a week". Overlapping/adjacent slots are merged automatically.
- **US-33** As an owner, I can **unlist** a car temporarily (hidden from others) or delete it if it has no upcoming bookings.
- **US-34** Only the owner can change or delete their car and its slots.
- **US-35** As an owner, I can **upload a photo** of my car (JPEG/PNG/WebP, up to 5 MB) or paste a link to one, and replace or remove it later.
- **US-36** As a renter, I see each car's photo on the browse cards, in map pop-ups and on the car's detail view, with the photographer credited where the licence requires it.

## 5. Pricing rule
`total = whole days × daily price + min(leftover hours × hourly price, daily price)`; partial hours round up. Example at 10/h, 50/day: 3h → 30; 8h → 50 (capped); 26h → 70.

## 6. Non-functional requirements
| ID | Requirement |
|---|---|
| NFR-1 | Runs on one ordinary PC/laptop or a small cloud instance; ≤10 users. |
| NFR-2 | One dependency (Express); database is a single SQLite file — easy to back up. |
| NFR-3 | Passwords hashed with scrypt + per-user salt; sessions in HttpOnly SameSite cookies. |
| NFR-4 | Works on phone screens (responsive layout) and in light/dark mode. |
| NFR-5 | Map uses OpenStreetMap — no API key or cost. |
| NFR-6 | All server input validated; errors returned as friendly messages. |
| NFR-7 | Renter identities are only shown to the car owner and the renter themselves. |

## 7. Acceptance criteria
All user stories above are covered by the checks in [TEST_PLAN.md](TEST_PLAN.md); the automated suite (`npm test`) must pass.
