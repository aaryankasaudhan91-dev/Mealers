# Mealers backend

Run commands from this folder. The backend serves API routes only; it does not serve frontend files.

## Connect MongoDB

Open `.env` and fill in `MONGODB_URI`. Leave the database name as `mealers_demo`, or choose a separate demo database. Use MongoDB Atlas or a local replica set: atomic booking and switching require MongoDB transactions. A standalone local MongoDB server is not sufficient.

Use a database user with read/write access to the selected demo database and permission to create its collections and indexes. On Atlas, allow your computer's current IP through the project's network access settings. Keep the URI private and URL-encode special characters in its username/password. Do not paste it in frontend files, screenshots or source control.

```powershell
npm ci --cache .npm-cache
npm start
```

The driver and test dependencies are already installed in this folder. Restart after editing `.env`. Missing or invalid configuration keeps the API in an explicit setup-required state; no SQLite fallback exists in the active backend. Connection strings are never printed in error logs.

## Collections and rules

Startup creates `users`, `services`, `bookings`, `idempotency` and `auditEvents`. The first three collections receive basic schema validators on creation. Indexes enforce one active booking per diner, unique pickup codes and unique request keys. Service capacity changes, switches, cancellations and pickups use MongoDB transactions. Tenant scopes apply to manager services, reports and activity records.

With `DEMO_MODE=true`, the app seeds synthetic sample records only if the users collection is empty. It does not reset an existing database. Use a dedicated demo database, never a production database. Demo accounts have no real authentication. Turning demo mode off does not install a real authentication system. The launcher refuses `NODE_ENV=production` until real identity and operational controls are implemented.

## Tests

```powershell
npm test
```

Integration tests use a separate temporary MongoDB replica set, not the connection in `.env`. Its binary downloads to `.mongodb-binaries/` inside this folder. Cache and packages also stay inside this folder. Old SQLite prototype files are archived in `legacy/`; the launcher never imports them.
