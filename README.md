# Notification Templates admin UI

The operations console for the Notification Template Service: browse namespaces, services and events, write and preview templates, and manage snippets. Built from the "Dashen Bank Operations Console" design with React, Vite, TypeScript and Tailwind.

## Demo mode (default)

Out of the box the UI runs against a mock API with an in-memory database (`src/mock/`), so it works without the backend: `npm run build` and deploy `dist/` to any static host. The mock checks, renders and saves templates and snippets like the real service, using seeded sample data. Changes last until the page is reloaded. For the SPA routes, `public/_redirects` (Netlify) and `vercel.json` (Vercel) send every path to `index.html`.

To use the real service, set `VITE_USE_MOCK=false` (see below and `.env.example`).

## Run

The backend is a separate repository: `superapp-notification-template` (the Notification Template Service).

```bash
# 1. Start the backend, port 3005
cd ../superapp-notification-template
npm run dev

# 2. Start the UI (this repository)
cd ../superapp-notification-admin-ui
npm install        # first time only
npm run dev        # http://localhost:5173
```

The dev server forwards `/v1.0/...` to the backend (`NOTIFICATION_API_TARGET`, default `http://localhost:3005`), so the browser never makes a cross-origin call. The backend has no CORS setup: in other environments, serve the UI behind the same gateway as the API, or set `VITE_API_BASE` and enable CORS on the backend. See `.env.example`.

| Script              | Does                               |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Development server with hot reload |
| `npm run build`     | Type check, then build to `dist/`  |
| `npm run typecheck` | Type check only                    |
| `npm run preview`   | Serve the built `dist/`            |
| `npm run format`    | Format with Prettier               |

## Screens

| Route                                                 | Screen                                             | API calls                                                       |
| ----------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `/`                                                   | Namespaces with service and event counts           | `GET /namespaces`, `GET /namespaces/:ns/services` per namespace |
| `/namespaces/:namespace`                              | Services table with search and status filter       | `GET /namespaces/:ns/services`                                  |
| `/services/:service`                                  | Service, its events, audiences, channels, progress | `GET /services/:s`, `GET /services/:s/events/:e` per event      |
| `/services/:service/events/:event`                    | Slot grid (audience × channel) and variables panel | event page, `GET /services/:s`, `GET` each filled slot          |
| `/services/:service/events/:event/templates/:aud/:ch` | Template editor with live preview and test values  | `GET`/`PUT`/`PATCH` slot, `POST …/preview`, `GET /snippets`     |
| `/snippets`, `/snippets/new`, `/snippets/:key`        | Snippet directory and editor                       | `GET /snippets`, `PUT /snippets/:key`, `DELETE /snippets/:key`  |

## Left out of the design on purpose

Everything the backend doesn't support was removed rather than faked: Audit Logs, Channel Rules, environment/version badge, user profile and notification bell (no authentication yet), languages/locales, "Send test SMS", "Validate all", "Register service", "Export report", deleting templates (there is no delete: rewrite or switch off), push channel, channel fallback, maker-checker approval, compliance banners, contract IDs and sample payload panels, and coverage numbers that would need data the API doesn't return.

The preview, SMS length and checks are always the server's own (`POST …/preview`), so what the admin sees is exactly what the backend accepts and sends.
