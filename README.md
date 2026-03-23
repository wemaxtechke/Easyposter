# 3D Metallic Text Editor

A production-ready 3D metallic text editor with AI-powered style generation, SVG/PNG export, and real-time rendering.

## Features

- **3D Text Editor** (/) — Create metallic 3D text with presets, AI style generation, and WebGL/SVG rendering
- **Poster Editor** (/poster) — Canva-like poster designer with:
  - Drag-and-drop canvas (Fabric.js)
  - Text, images, shapes (rect, circle)
  - 3D text integration — add 3D text from the editor, edit after placing
  - Layers (bring forward/backward)
  - Properties panel, export PNG, save/load project
- **Text controls**: Content, font family, size
- **Lighting**: Azimuth, elevation, intensity, ambient
- **Extrusion**: Depth and steps for 3D effect
- **Filters**: Shine and metallic intensity
- **Presets**: Gold Chrome, Silver, Copper, Rose Gold, Brushed Steel
- **AI Generator**: Describe a style (e.g. "brushed steel with blue highlights") and get instant settings
- **Export**: Optimized SVG and PNG (2x retina)

## Setup

1. Install dependencies (from project root):
   ```bash
   npm run install:all
   ```
   Or install separately: `cd frontend && npm install` and `cd backend && npm install`.

2. Create `.env` files (copy from `.env.example` in each folder):
   - **frontend/.env** — `VITE_OPENAI_API_KEY`, `PORT` (for API proxy)
   - **backend/.env** — `PORT`, `MONGODB_URI`, Cloudinary vars
   ```
   VITE_OPENAI_API_KEY=sk-your-api-key-here
   Get your API key from [OpenAI](https://platform.openai.com/api-keys).

3. Run the frontend dev server (from root):
   ```bash
   npm run dev
   ```
   - **3D Text Editor**: http://localhost:5173/
   - **Poster Editor**: http://localhost:5173/poster

4. **Backend** (HDR list + texture library): in a second terminal:
   ```bash
   npm run server
   ```
   Or: `cd backend && npm start`. Defaults to **http://localhost:5174**. Vite proxies `/api` to this server.

   Add to **backend/.env**:

   | Variable | Purpose |
   |----------|---------|
   | `MONGODB_URI` | MongoDB connection string (Atlas or local) |
   | `CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard |
   | `CLOUDINARY_API_KEY` | Cloudinary API key |
   | `CLOUDINARY_API_SECRET` | Cloudinary API secret |
   | `CLOUDINARY_TEXTURE_FOLDER` | Optional; default `3d-text-editor/textures` |
   | `CLOUDINARY_FONT_FOLDER` | Optional; default `3d-text-editor/fonts` (TTF/OTF as raw files) |
   | `PORT` | Optional; default `5174` |

   - **GET `/api/textures`** — list saved textures (from MongoDB; URLs point to Cloudinary).
   - **POST `/api/textures/upload`** — multipart: `map` (required) + optional `roughness`, `normal`, `metalness`; uploads to Cloudinary, saves metadata in MongoDB.
   - **DELETE `/api/textures/:id`** — removes DB row and deletes assets from Cloudinary.
   - **GET `/api/fonts`** — list saved fonts (MongoDB + Cloudinary raw URL).
   - **POST `/api/fonts/upload`** — multipart: field `font` (TTF/OTF), optional `label`.
   - **DELETE `/api/fonts/:id`** — delete font from DB and Cloudinary.
   - **GET `/api/health`** — `{ mongo, cloudinary }` flags.

   In the app: **WebGL** → **Front texture** → **Cloud library** to use or upload textures. **Text** → **Font library (saved)** to store and reload TTF/OTF.

5. Build for production:
   ```bash
   npm run build
   ```

## Project Structure

```
├── frontend/              # React + Vite app (own package.json, node_modules)
│   ├── src/               # Components, hooks, store, etc.
│   ├── public/            # Static assets (HDR, favicon, etc.)
│   ├── index.html
│   ├── vite.config.mjs
│   ├── tailwind.config.cjs
│   ├── postcss.config.cjs
│   ├── .env
│   └── package.json
├── backend/               # Express API (own package.json, node_modules)
│   ├── src/
│   │   ├── config/        # DB, Cloudinary, paths
│   │   ├── controllers/   # hdr, health, texture, font
│   │   ├── models/        # TextureAsset, FontAsset
│   │   ├── routes/        # API routes
│   │   └── utils/         # upload, cloudinary helpers
│   ├── server.js
│   ├── .env
│   └── package.json
├── dist/                  # Built frontend (npm run build)
└── package.json           # Root scripts (dev, server, build, etc.)
```

## Tech Stack

- Vite + React + TypeScript
- TailwindCSS
- Zustand (state)
- OpenAI API (AI style generation)
- Express + MongoDB (texture metadata) + Cloudinary (texture files)
