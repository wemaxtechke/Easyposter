# Deploying to Render

This guide covers deploying the 3D Text Editor (EasyPoster) frontend and backend to [Render](https://render.com).

## Quick Start (Blueprint)

1. Push your code to GitHub.

2. In [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.

3. Connect your GitHub repo and select it.

4. Render will detect `render.yaml` and create both services.

5. **Backend**: Add these environment variables (Dashboard → easyposter-api → Environment):
   - `MONGODB_URI` – your MongoDB connection string (required for auth, templates, projects)
   - `JWT_SECRET` – keep the auto-generated value or set your own
   - `OPENAI_API_KEY` – for Poster AI Assistant (optional)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` – for image uploads (optional)

6. **Frontend**: After the backend deploys, copy its URL (e.g. `https://easyposter-api.onrender.com`).
   - Go to **easyposter** (frontend) → **Environment**
   - Add `VITE_API_URL` = your backend URL (e.g. `https://easyposter-api.onrender.com`)
   - **Redeploy** the frontend so it builds with the correct API URL.

7. Open your frontend URL (e.g. `https://easyposter.onrender.com`).

---

## Manual Setup (without Blueprint)

### Backend (Web Service)

1. **New** → **Web Service**
2. Connect repo, set **Root Directory** to `backend`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Add environment variables (see above)
6. Deploy

### Frontend (Static Site)

1. **New** → **Static Site**
2. Connect repo, set **Root Directory** to `frontend`
3. **Build Command**: `npm install && npm run build`
4. **Publish Directory**: `dist`
5. Add **Rewrite** rule: Source `/*` → Destination `/index.html` (for React Router)
6. Add `VITE_API_URL` = your backend URL
7. Deploy

---

## Environment Variables Reference

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes (for full features) | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs (Render can auto-generate) |
| `OPENAI_API_KEY` | No | For Poster AI chat/suggestions |
| `CLOUDINARY_*` | No | For template/project image uploads |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes (production) | Backend URL, e.g. `https://easyposter-api.onrender.com` |

---

## Troubleshooting

- **CORS errors**: Backend uses `cors({ origin: true })`; should allow all origins. If issues persist, ensure `VITE_API_URL` matches the backend URL exactly (no trailing slash).
- **Blank page on refresh**: Ensure the rewrite rule `/*` → `/index.html` is set for the static site.
- **API 404**: Ensure `VITE_API_URL` is set and the frontend was redeployed after adding it.
