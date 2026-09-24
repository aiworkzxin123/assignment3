# User & Setup Guide — Neighbourhood Car Share

## Part A — Setup (for the organiser)

### 1. Install
1. Install **Node.js 22.13 or newer** (LTS from https://nodejs.org). Check with `node --version`.
2. In a terminal:
   ```
   cd D:\project1\project3
   npm install
   ```

### 2. (Optional) Load demo data
```
npm run seed -- --reset
```
Creates 4 demo neighbours (`alice`, `bob`, `chen`, `dana`, all with password `password123`) and 6 cars. **Skip this for real use.** If you tried the demo data, stop the server and delete the `data` folder before going live.

### 3. Configure (recommended)
Set these before starting (PowerShell example):
```powershell
$env:INVITE_CODE = "ELM-ROAD-2026"   # neighbours need this to sign up
$env:CURRENCY    = "£"               # currency symbol shown in the app
$env:DEFAULT_LAT = "51.5074"         # centre of your neighbourhood
$env:DEFAULT_LNG = "-0.1278"
npm start
```
To find your coordinates, right-click your street in Google Maps or OpenStreetMap and copy the numbers. See DESIGN.md §7 for all options.

### 4. Start
```
npm start
```
The terminal prints two addresses:
- `http://localhost:3080` — on this computer
- `http://192.168.x.x:3080` — for neighbours' phones/laptops **on the same Wi-Fi**

If Windows Firewall asks, allow Node.js on **Private networks**.

### 5. Letting neighbours in from anywhere (optional)
Your home Wi-Fi address only works for people connected to it. For access from anywhere, either:
- deploy the folder to a small host that runs Node.js (e.g. Render, Railway, Fly.io) with a persistent disk for `data/`, and set `SECURE_COOKIES=1`; or
- use the **hosted claude.ai version** (Part C).

### 6. Backup & maintenance
- Everything lives in the `data` folder: `carshare.db` (plus `-wal`/`-shm` files while running) and `uploads\` for owners' photos. Stop the server and copy the whole `data` folder to back up.
- The demo cars' photos are example pictures of each model from Wikimedia Commons (credits in `docs\IMAGE_CREDITS.md`).
- **Forgotten password:** no reset feature yet. Stop the server and delete that user with any SQLite tool (`DELETE FROM users WHERE username='bob';`), then they can register again. This also deletes their cars and bookings.
- Run the tests at any time with `npm test`.

---

## Part B — Using the app (for neighbours)

### Sign up / log in
Open the link the organiser gave you → **Create account** → choose a username, a display name people will recognise (e.g. "Sam at No. 12"), and a password (8+ characters). Enter the invite code if asked. The group allows up to 10 members.

### Find a car
- **Browse** shows every car with its photo, price per hour/day and a badge:
  🟢 *Available now* · 🟡 *From <time>* (next free time) · 🔴 *No times set*
- Filter by text, seats, fuel, or max price. Set **From** and **To** to see only cars free for your whole trip, with the total price.
- Click **Map** to see where the cars are parked. Each pin shows the hourly price; grey pins aren't free right now.

### Book
1. Click a car. The **Next 7 days** chart shows green (available) and red (booked) times.
2. Choose **Pick-up** and **Return** times. The total price updates as you go. If the time doesn't work, you'll see why.
3. Add an optional note and click **Confirm booking**. It's confirmed instantly.
4. **Arrange keys and payment directly with the owner.** The app doesn't take payments.

**How prices work:** whole days at the daily rate, plus extra hours at the hourly rate (never more than one extra day). Partial hours count as a full hour.

### Manage your trips
**Bookings → My trips** lists upcoming, in-progress, completed and cancelled trips. Click **Cancel** on anything that hasn't finished.

### List your car
1. **My cars → + Add a car.** Fill in make, model, seats and prices. Click **Upload a photo** to add a picture of your car (JPEG, PNG or WebP, up to 5 MB), or paste a link to one. A photo of the actual car helps neighbours find it on the street. You can change or remove it later under **Edit details**.
2. **Click the map** where the car is parked (or **Use my location**) and add a pick-up note such as "Outside No. 12".
3. Save, then **add available times**. Renters can only book inside these times.
   - Use the From/Until fields, or **+ Every day 8:00–20:00 for a week**.
   - Overlapping times are joined automatically.
   - **Remove** a time slot you no longer want to offer. You can't remove one that has an upcoming booking; cancel the booking first.

### Change price or availability
In **My cars**, edit the hourly/daily price and click **Save price**. Bookings already made keep their original price. Untick **Listed** to hide your car temporarily. **Edit details** changes anything else, including location, and has **Delete car** (only when there are no upcoming bookings).

### See who booked your car
**Bookings → Bookings of my cars** shows each renter's name, times, note and price. You can cancel a booking if needed. Please tell the renter first.

---

## Part C — Hosted claude.ai version
A version of the same app is published as a private page on claude.ai. Share its link with your neighbours.
- **Sign-in:** each neighbour signs in with their own claude.ai account (no separate password). The first 10 people to join become members.
- **Data:** stored in the page's shared database on claude.ai, separate from your local server's database.
- **Features:** browse (list and map), car photos, availability timeline, booking, my cars (price, availability, listing, photo) and bookings.
- **Photos:** only people who can edit the page can upload photos there. Other members can ask the organiser to add one.
- Use it if you don't want to keep a PC running or deal with networking. Use the local server if you want full control of the data, or neighbours without claude.ai accounts.
