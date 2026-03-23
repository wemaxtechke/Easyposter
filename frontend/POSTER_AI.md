# Poster AI & templates

## Environment

- Set `VITE_OPENAI_API_KEY` in `frontend/.env` (same as the 3D text AI features).
- The browser calls OpenAI directly (see `src/services/openai.ts`). For production, prefer a backend proxy to hide the key.

## Creator-defined fields vs `{{placeholders}}`

Templates can define a **`fields`** array: each entry maps a **text layer** (`sourceElementId`) to a **machine key** and **human label**. The Create-with-AI wizard and `instantiateTemplate` use those keys to fill copy.

- Bundled templates in `src/poster/templates/bundled/` include `fields` with stable element ids.
- **Save as template** (user templates): enters **labeling mode** — the canvas stays editable; click each **text** or **image** layer to set a **label**; the field **key** is auto-generated in **snake_case** from the label (optional manual edit). Image fields show **upload / URL** when someone uses the template. **Save template…** opens name/category/description, then writes to `localStorage` with the current canvas and `fields`.
- User templates saved this way always store a `fields` array (possibly empty). Older saved templates without `fields` still fall back to default placeholder keys for AI/merge.

Example text (still works with bindings): `Join us for {{eventTitle}} — {{dateTime}}`

## Authoring a bundled template

1. Design in the poster editor.
2. Use **Save** to export JSON, or copy from devtools after `getProject()`.
3. Add a new file under `src/poster/templates/bundled/` with a `PosterTemplateDefinition` (`id`, `name`, `category`, `description`, `project`, and **`fields`** with ids matching text elements in `project`).
4. Register it in `src/poster/templates/bundled/index.ts`.

## User templates

- **Save as template** stores JSON in `localStorage` under `poster_user_templates`.
- **Add image** from the sidebar stores a **`data:`** URL (not `blob:`), so layers survive HMR/reload and cloud publish reliably. Older projects may still have `blob:` URLs; **Publish to cloud** tries `fetch(blob:)` first, then exports the matching live Fabric image if the blob expired.

## Cloud template library (MongoDB + Cloudinary)

- Backend routes: `GET /api/poster-templates` (list), `GET /api/poster-templates/:id` (full template), `POST /api/poster-templates` (create), `DELETE /api/poster-templates/:id` (remove + delete uploaded Cloudinary images).
- **Poster templates** page: `/poster/templates` — lists built-in, local, and cloud templates → fill fields modal → **Generate poster** opens `/poster`.
- From the save dialog after labeling, **Publish to cloud library** ensures image layers are **`data:`** (or reads them from the live canvas if a stale **`blob:`** remains), then the API uploads those images to Cloudinary and saves the project in MongoDB (`MONGODB_URI`, `CLOUDINARY_*` in `backend/.env`).
- Optional env: `CLOUDINARY_POSTER_TEMPLATE_FOLDER` (see `backend/.env.example`).

## Flow

1. **Create with AI** → pick category → describe event → **Fill fields with AI** (optional) → choose template → edit fields → **Generate poster** → `loadProject`.
2. AI field keys are the **union** of all templates in the selected category (so any template can be filled). Step 3 shows only the **selected** template’s keys.
3. Template choices include **built-in**, **this browser** (`localStorage`), and **cloud** (MongoDB) once the poster editor or templates page has run a cloud sync (`remotePosterTemplates` in the poster store).
