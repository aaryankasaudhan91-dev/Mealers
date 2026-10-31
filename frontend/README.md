# Mealers frontend

Run commands from this folder or from the workspace root.

```powershell
npm start
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Listening port for frontend server | `3000` (or assigned by Render `PORT`) |
| `HOST` | Binding address | `0.0.0.0` (Render-compatible) |
| `BACKEND_URL` | Backend URL to proxy `/api/*` requests to | `http://127.0.0.1:3001` |

## Deployment to Vercel

1. In Vercel, connect this repository.
2. Root Directory: `./` or `frontend/` (both are supported with pre-configured `vercel.json` and API proxies).
3. Set Environment Variable:
   - `BACKEND_URL`: `https://your-backend.onrender.com`
4. Deploy! Vercel serves the static frontend and proxies `/api/*` to Render with cookie and session preservation.

## Deployment to Render

1. Create a Web Service pointing to `frontend` folder.
2. Build command: `npm install`
3. Start command: `npm start`
4. Set `BACKEND_URL` to your Render backend service URL.
