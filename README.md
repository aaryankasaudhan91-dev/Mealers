# Mealers MVP

Mealers is a local campus meal coordination demo with a minimalist light glass interface matching the pitch palette. All identities, records and menus are synthetic. No real payments or measured savings are claimed.

## Separate applications

- `backend/` contains the MongoDB API, database configuration, packages and tests.
- `frontend/` contains the web interface, static assets and API proxy.
- Ready for deployment on **Render** (backend & frontend) and **Vercel** (frontend).

---

## Deployment to Render & Vercel

### Architecture Recommendation

- **Backend**: Deploy on **Render** (Node.js Web Service). Render supports long-running Node processes with persistent MongoDB connection pooling and transaction support.
- **Frontend**: Deploy on **Vercel** (Edge/Serverless Static + API Proxy) OR on **Render** (Node.js Web Service).

---

### 1. Deploy Backend on Render

1. Create a free MongoDB database on [MongoDB Atlas](https://www.mongodb.com/atlas). In Atlas **Network Access**, ensure access is allowed (`0.0.0.0/0` for cloud deployments).
2. Push this repository to GitHub.
3. In [Render Dashboard](https://dashboard.render.com/):
   - **Option A (Blueprint - 1-Click)**:
     - Click **New +** -> **Blueprint**.
     - Select your GitHub repository. Render reads [`render.yaml`](file:///d:/Devanshi/Project%2024(Mealers)/models/t1/render.yaml) and provisions both backend and frontend automatically.
     - When prompted, provide your `MONGODB_URI`.
   - **Option B (Manual Web Service)**:
     - Click **New +** -> **Web Service** -> Connect your repo.
     - **Name**: `mealers-backend`
     - **Root Directory**: `backend`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Environment Variables**:
       - `NODE_ENV`: `production`
       - `DEMO_MODE`: `true`
       - `MONGODB_DATABASE`: `mealers_demo`
       - `FRONTEND_ORIGIN`: `*` (or your frontend domain once deployed)
       - `MONGODB_URI`: `mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`
4. Once deployed, Render gives you a backend URL (e.g. `https://mealers-backend.onrender.com`). Verify it by opening `https://mealers-backend.onrender.com/api/health`.

---

### 2. Deploy Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New...** -> **Project**.
2. Import your GitHub repository.
3. In **Project Settings**:
   - **Framework Preset**: Other
   - **Root Directory**: Leave as `./` (or select `frontend/` — both are pre-configured with `vercel.json` and API proxies).
   - Under **Environment Variables**, add:
     - `BACKEND_URL`: `https://mealers-backend.onrender.com` (your Render backend URL).
4. Click **Deploy**.
5. Vercel will host the frontend CDN and automatically proxy all `/api/*` calls to your Render backend with streaming, cookie preservation, and zero CORS headaches.

---

### 3. Deploy Frontend on Render (Alternative)

If using Render for both backend and frontend:
1. If using the [`render.yaml`](file:///d:/Devanshi/Project%2024(Mealers)/models/t1/render.yaml) Blueprint, Render automatically provisions `mealers-frontend` and links `BACKEND_URL` to `mealers-backend`.
2. For manual setup:
   - **Name**: `mealers-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `BACKEND_URL`: `https://mealers-backend.onrender.com`

---

## Local Development

Fill in `MONGODB_URI` in `backend/.env`.

Start backend:
```powershell
cd backend
npm start
```

Start frontend:
```powershell
cd frontend
npm start
```

Or from workspace root:
```powershell
npm run start:backend
npm run start:frontend
```

Open http://localhost:3000.

---

## Demo journey

Choose Alex's diner demo, switch the existing Commons Kitchen booking to Garden Kitchen and note the pickup code under My meals. Choose the kitchen-team demo and confirm pickup. Approve a preparation plan, publish a meal, record service totals and view the demo report. Sam's diner demo begins with no reservation.

Seed service cutoffs are two hours after initial database setup. Existing data persists. Publish new services once cutoffs expire. The current MVP permits one active meal at a time and one pickup time per service. It does not yet model independently limited pickup slots, real payments, incentives, production users or a multi-day meal calendar.

## Security notice

Demo identities are intentionally switchable and are not production authentication. The warning stays visible in the interface. Use synthetic data only. A real pilot requires verified identity, production session controls, appropriate data retention, operational monitoring, backups and menu/food-safety processes. No secrets should enter frontend files or source control.

## Checks

```powershell
npm run check
```
Runs syntax checks across both backend and frontend.
