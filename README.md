# Mealers

**Campus meal coordination before cooking.**

[Open the demo](https://mealers.vercel.app/) · [Workflow guide](./WORKFLOW.md)

Mealers helps a campus caterer coordinate voluntary meal choices across nearby kitchens. Diners choose suitable meals, managers review committed demand, and staff record pickup and service totals. The interface uses a minimalist light glass theme with a shared web logo and favicon.

> **Demo status:** use synthetic data only. No real payments, paying customers, partnerships or measured savings are claimed. Switchable demo identities are not production authentication.

## Product workflow

1. **Publish:** a kitchen manager sets the menu, capacity, walk-in buffer, preparation cutoff and pickup time.
2. **Choose:** a diner filters by meal preference, walking distance and declared allergens. Always confirm dietary needs with staff.
3. **Confirm or switch:** the API checks eligibility and capacity. Database transactions protect an existing booking if a replacement fails; request keys prevent duplicate confirmations.
4. **Collect:** staff redeem the pickup code once. Confirmation and actual collection are separate events.
5. **Reconcile:** managers approve preparation quantities and record prepared, served and unused portions.

The MVP permits one active booking per diner and one pickup timestamp per service. Independent pickup-slot limits, payments, incentive payouts, forecasting and a multi-day meal calendar remain outside the current scope.

## Business hypothesis

The proposed buyer is one caterer operating multiple nearby campus cafeterias. The proposed revenue model is a monthly subscription per participating kitchen, priced in Indian rupees. Pricing and willingness to pay need validation.

Forecasting and pre-order tools already exist. Mealers focuses on voluntary coordination between kitchens before cooking. A proposed two-kitchen pilot would measure leftovers, unmet demand, pickup completion and additional staff time against a baseline. A confirmed switch is not automatically a saved meal. Net benefit must account for software cost, extra labour and any future incentives.

## Explainer narration — Sarvam AI

[Sarvam AI Text to Speech](https://www.sarvam.ai/text-to-speech) is used in the explainer production workflow for Indian-English narration. The selected voice is **Shubh**, with a conversational, friendly delivery. The generated voice has been reviewed and approved for the explainer.

**Integration status:** exporting the approved Sarvam audio and replacing the earlier explainer audio is still in progress. The existing website video should not yet be described as using the final Sarvam narration.

Sarvam is a media-production dependency, not a runtime dependency of the booking API. No Sarvam API key is required to run the Mealers MVP. Keep any production credentials in private environment variables; never commit them.

## Stack and repository layout

- **Frontend:** vanilla JavaScript, HTML and CSS; static assets, splash screen, first-visit guided tour and explainer player in `frontend/public/`.
- **API proxy:** Node.js frontend server or Vercel catch-all functions forward same-origin `/api/*` requests to the configured backend.
- **Backend:** Node.js HTTP API and MongoDB driver in `backend/`.
- **Database:** MongoDB Atlas or a local replica set. Transactions require a replica set; standalone MongoDB is insufficient.
- **Hosting configuration:** Vercel frontend, Render backend, with an optional Render frontend.

```text
backend/             API, database initialization, security helpers and tests
frontend/            Static server, UI, onboarding, media and Vercel proxy
api/                 Vercel proxy when the repository root is deployed
.github/workflows/   Checks and integration-test workflow
render.yaml          Render service configuration
vercel.json          Root frontend deployment configuration
```

## Local setup

Use a supported Node.js version compatible with the package engine requirements. Install dependencies separately:

```powershell
npm --prefix backend install
npm --prefix frontend install
```

Create or update `backend/.env` with your own values:

```dotenv
PORT=3001
HOST=127.0.0.1
MONGODB_URI=
MONGODB_DATABASE=mealers_demo
FRONTEND_ORIGIN=http://localhost:3000
DEMO_MODE=true
```

Set `frontend/.env`:

```dotenv
PORT=3000
HOST=127.0.0.1
BACKEND_URL=http://127.0.0.1:3001
```

Run each application in its own terminal:

```powershell
# Terminal 1, from backend/
npm start

# Terminal 2, from frontend/
npm start
```

Alternatively, use `npm run start:backend` and `npm run start:frontend` from the repository root. Open [localhost:3000](http://localhost:3000). Check `/api/health`: the database must report connected before relying on bookings. Missing database configuration should produce a setup message, not simulated success.

## Demo journey

Use **Sam** for a fresh diner flow, **Alex** for a seeded booking, or **Kitchen Team** for publishing, preparation approval, pickup and reconciliation. Prices are displayed in **INR (₹)**.

Seeded service cutoffs are two hours after initial database setup; restarting does not reset them. When they expire, use the Kitchen workspace to publish a new service. Existing records are retained.

## Deployment

### Backend on Render

- Root directory: `backend`; build: `npm install`; start: `npm start`.
- Set `MONGODB_URI` privately and choose a dedicated database such as `mealers_demo`. Configure database network access for the deployment deliberately.
- Set `FRONTEND_ORIGIN` to the exact frontend origin, such as `https://mealers.vercel.app`; do not use `*`.
- Use `DEMO_MODE=true` only for a clearly labelled synthetic demo. Turning it off does not by itself make the app production-ready.
- Verify `/api/health` after deployment.

### Frontend on Vercel or Render

- Vercel supports the repository root or `frontend/`, with the corresponding checked-in proxy configuration.
- Set `BACKEND_URL` to the full HTTPS backend origin, including `https://`, without credentials, a path or query parameters.
- For Render frontend hosting, use root `frontend`, build `npm install`, start `npm start`, and the same `BACKEND_URL`.
- Review [render.yaml](./render.yaml), [root Vercel configuration](./vercel.json) and [frontend Vercel configuration](./frontend/vercel.json). Config files alone do not prove a successful deployed booking workflow.

## Security and checks

The implementation includes salted scrypt password hashing, diner-only self-registration, HttpOnly session cookies, server-side role/ownership checks, explicit allowed origins and request validation. Legacy prototype password records require secure reprovisioning; they are not silently accepted. Demo accounts remain intentionally switchable when enabled.

Before a real pilot, establish verified operator membership, durable production session handling, appropriate rate limits and monitoring, backups, retention rules and operational food-safety procedures. Keep the visible security notice and all synthetic-data labels.

```powershell
npm run check
npm test
```

Tests cover booking consistency, last-slot contention, switch rollback, pickup replay, validation and password handling. MongoDB integration tests require a reachable replica set. Local runs may skip those tests without one; CI is configured to fail if the database prerequisite is missing. A green syntax check is not an end-to-end deployment certification.
