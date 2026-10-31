# Mealers MVP

A local, functional campus meal-coordination demo. The interface follows the Mealers pitch palette with a minimalist light glass treatment. All people, bookings and menu records are synthetic. No payments, real incentives or measured savings are claimed.

## Run

Requires Node.js 24 or newer with `node:sqlite`. No third-party dependencies are needed.

```powershell
npm start
```

Open http://localhost:3000. To use a different port, set `$env:PORT` before starting. The server listens only on the local computer. Database files are created in this project’s `data` directory. Stop with Ctrl+C.

## Demo journey

1. Choose **Alex · diner demo**. Alex already has a Commons Kitchen booking.
2. Choose an available meal at Garden Kitchen and confirm a voluntary switch. The old booking changes only if the replacement succeeds.
3. Open **My meals** and note the pickup code.
4. Choose **Kitchen team demo** and confirm the pickup using that code. Reusing the code is rejected.
5. Approve a preparation plan, publish a meal or record service totals. View **Insights** and download a synthetic report.
6. Choose **Sam · new diner demo** to try a fresh booking without a previous reservation.

The seed service cutoff is two hours after the database is first created, with pickup three hours after creation. Later, publish fresh services in the kitchen console. Existing database records persist across restarts. Seed data is not automatically reset or overwritten. To start a new synthetic run, stop the server and archive the `data/mealers.sqlite` file before restarting.

## Stack and implementation

The MVP uses browser-native JavaScript and CSS, a Node HTTP API and built-in SQLite. This deliberately keeps installation simple; the earlier architecture document proposed React/FastAPI for a later implementation. Booking availability is enforced in server-side transactions. Idempotency keys prevent duplicate confirmations, and a partial unique index limits diners to one active booking in this limited demo. This MVP models a single active meal at a time rather than a full multi-day meal calendar.

The manager approves preparation quantities. Booking counts include committed reservations, collected meals and late cancellations; late cancellations do not pretend preparation has been avoided. Staff can record an early pickup in the demo, while expired pickups are rejected. Each service currently has a single pickup time rather than multiple independently limited slots. The menu has declared allergens, not a certified food-safety guarantee. Dish thumbnails are emoji; the campus illustration was generated with Imagegen and is not a real pilot photo.

## Verification

```powershell
npm run check
npm test
```

Tests cover last-slot contention, atomic switch rollback, idempotency, access checks, cutoff handling, dietary checks, pickup replay and invalid totals.

## Before a real pilot

Demo accounts are deliberately easy to switch and are not production authentication. The launcher rejects `NODE_ENV=production`. Add real identity and operator assignments, session revocation, rate limiting, pickup-slot modelling, appropriate data retention, stronger audit scoping, monitoring, backup recovery and actual kitchen/menu data before deployment. The report makes no causal savings or carbon claims.

## Project layout

`server.mjs` contains the HTTP API and schema. `public/` contains the interface and concept illustration. `tests/` contains transactional API tests. `data/` stores local runtime state. Nothing needs to install globally.
