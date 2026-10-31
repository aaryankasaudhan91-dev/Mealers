# Mealers frontend

Run commands from this folder.

```powershell
npm start
```

The frontend reads `BACKEND_URL` exclusively from its `.env` file. It fails startup when this field is missing; there is no fallback backend address. Browser code calls same-origin `/api/` routes, which the frontend server proxies to the environment-configured backend. MongoDB credentials belong only in `backend/.env` and never reach the browser.

Only files beneath `public/` are served. Requests for `.env`, backend files and arbitrary filesystem paths cannot access them. The server enforces same-origin mutation requests and a content security policy. These controls do not replace production authentication.

The interface uses a light glass treatment and the Mealers pitch palette. A permanent security notice identifies switchable demo accounts and synthetic data. A persistent setup message appears until MongoDB is connected. Menu allergy declarations are not a food-safety certification.
