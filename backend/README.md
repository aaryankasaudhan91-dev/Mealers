# Mealers backend

Run commands from this folder or from the workspace root. The backend serves API routes only; it does not serve frontend files.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Listening port for HTTP API | `3001` (or assigned by Render `PORT`) |
| `HOST` | Binding address | `0.0.0.0` (Render-compatible) |
| `FRONTEND_ORIGIN` | Allowed CORS origins (comma-separated or `*`) | `*` |
| `MONGODB_URI` | MongoDB Atlas / replica set connection string | Required for full functionality |
| `MONGODB_DATABASE` | Database name | `mealers_demo` |
| `DEMO_MODE` | Seeds synthetic demo data if database is empty | `true` |

## Connect MongoDB

In local development, configure `backend/.env`. On Render, set `MONGODB_URI` in the service environment variables.
Use MongoDB Atlas or a replica set: atomic booking and switching require MongoDB transactions. A standalone local MongoDB server is not sufficient.

On Atlas, ensure **Network Access** allows `0.0.0.0/0` (Allow Access from Anywhere) so Render instances can connect.

```powershell
npm install
npm start
```

## Cloud Deployment (Render)

- **Root Directory**: `backend`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- Supported on Node `>=20` (Render default).
- Gracefully starts in setup mode if `MONGODB_URI` is not yet provisioned.

## Collections and rules

All meal prices use Indian rupees (INR). Database and service-publication API prices are integer paise (100 paise = ₹1); meal responses expose rupees for display. Existing numeric prices are preserved; no exchange-rate conversion is applied.

Startup creates `users`, `services`, `bookings`, `idempotency` and `auditEvents`. The first three collections receive basic schema validators on creation. Indexes enforce one active booking per diner, unique pickup codes and unique request keys. Service capacity changes, switches, cancellations and pickups use MongoDB transactions.

With `DEMO_MODE=true`, the app seeds synthetic sample records only if the users collection is empty.
