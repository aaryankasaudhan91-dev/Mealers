# Mealers MVP

Mealers is a local campus meal coordination demo with a minimalist light glass interface matching the pitch palette. All identities, records and menus are synthetic. No real payments or measured savings are claimed.

## Separate applications

- `backend/` contains the MongoDB API, database configuration, packages and tests.
- `frontend/` contains the web interface and its environment-configured API proxy.
- Each application must be started from its own folder. No root application server is used.

## Your next step

Fill in `MONGODB_URI` in `backend/.env`. Use a dedicated MongoDB Atlas database or local replica set. See `backend/README.md` for connection and database requirements. This is the only missing user configuration; no connection string is embedded in the app.

Start the backend in one terminal:

```powershell
cd backend
npm start
```

Start the frontend in another terminal:

```powershell
cd frontend
npm start
```

Open http://localhost:3000. The frontend's `BACKEND_URL` comes only from `frontend/.env`. MongoDB credentials remain on the backend. Both servers default to local-only binding through their environment configuration. Database setup creates collections and indexes after the connection is supplied.

## Demo journey

Choose Alex's diner demo, switch the existing Commons Kitchen booking to Garden Kitchen and note the pickup code under My meals. Choose the kitchen-team demo and confirm pickup. Approve a preparation plan, publish a meal, record service totals and view the demo report. Sam's diner demo begins with no reservation.

Seed service cutoffs are two hours after initial database setup. Existing data persists. Publish new services once cutoffs expire. The current MVP permits one active meal at a time and one pickup time per service. It does not yet model independently limited pickup slots, real payments, incentives, production users or a multi-day meal calendar.

## Security notice

Demo identities are intentionally switchable and are not production authentication. The warning stays visible in the interface. Use synthetic data only. The backend refuses production mode. A real pilot requires verified identity, production session controls, appropriate data retention, operational monitoring, backups and menu/food-safety processes. No secrets should enter frontend files or source control.

## Checks

Run `npm run check` in each application folder. Run `npm test` in backend for MongoDB transaction integration tests. The earlier SQLite prototype is preserved under backend/legacy for reference only and is not an active fallback.
