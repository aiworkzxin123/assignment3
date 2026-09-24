# Kerbside Car Share

A small private web app for up to 10 neighbours to rent each other's cars. It has login, car listings with photos and prices, owner-set availability times, instant booking with conflict checks, and an OpenStreetMap view of where the cars are.

- **Project site (GitHub Pages):** https://aiworkzxin123.github.io/assignment3/
- **Hosted claude.ai version:** https://claude.ai/artifact/2My3udRdpacRgf7my3M4jJ (private; the owner has to share it before others can open it). Source: [`hosted/index.html`](hosted/index.html)

![Browse page](docs/screenshots/browse.png)

## Run it

```
npm install
npm run seed -- --reset   # optional demo data (log in as alice / password123)
npm start                 # http://localhost:3080
npm test                  # 37 automated tests
npm run build:hosted      # after editing src/rules.js: copy it into hosted/index.html
```

Requires Node.js ≥ 22.13 (uses the built-in `node:sqlite`). The only dependency is Express. The app needs this server, so it can't run on GitHub Pages; the Pages site is the project's documentation.

## Documents
- [Requirements](docs/REQUIREMENTS.md): scope, user stories, pricing rule
- [Design](docs/DESIGN.md): architecture, database schema, REST API, security, configuration
- [User & setup guide](docs/USER_GUIDE.md): installing, sharing with neighbours, using the app
- [Test plan](docs/TEST_PLAN.md): automated and manual test cases
- [Photo credits](docs/IMAGE_CREDITS.md): licences for the demo car photos

## Layout
```
server.js         entry point
src/              Express app, auth, database, pricing
public/           front end (HTML, CSS, JS) and demo car photos
scripts/seed.js   demo data
tests/            node:test suites
hosted/           single-page claude.ai version
docs/             project documents + GitHub Pages site
```

The pricing and booking rules live in one place, `src/rules.js`. The hosted page carries an inlined copy that CI checks against the source, so both versions apply the same rules. See [Design §8](docs/DESIGN.md#8-hosted-variant) for the few intentional differences.
```
