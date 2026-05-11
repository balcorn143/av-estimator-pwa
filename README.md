# AV Estimator PWA

A Progressive Web App for Audio/Visual project estimation. Vite + React, with Supabase as the server-authoritative backend for the catalog, projects, and team collaboration.

## Stack

- **Frontend:** React 19, Vite 7
- **Backend:** Supabase (Postgres + Auth + Realtime)
- **Exports:** xlsx, jspdf
- **Hosting:** GitHub Pages (via Actions)

## Local development

```bash
npm install
npm run dev
```

The dev server runs on port 8080.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serves the built dist/ on 8080
```

## Deployment

Pushes to `main` are built and deployed to GitHub Pages automatically via `.github/workflows/deploy.yml`. No manual upload step.

## Supabase setup

Run the SQL files in this order against a fresh Supabase project (SQL Editor):

1. `supabase-teams-migration.sql` — teams, team_members, RLS
2. `supabase-teams-v2.sql` — member-email RPC, project checkout, revision log
3. `supabase-catalog-items.sql` — catalog_items table
4. `supabase-catalog-realtime.sql` — realtime publication for catalog_items
5. `supabase-catalog-sync.sql` — catalog sync helpers
6. `supabase-uom-options.sql` — per-team UOM list on user_settings

Then update `src/config.js` with your project's `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The `supabase/functions/procore-proxy/` edge function is optional — only needed if you're using the Procore export.

## Data model

The catalog is server-authoritative: `catalog_items` is the only source of truth. Clients subscribe to realtime changes and write directly through Supabase. There is no localStorage fallback — the app requires an authenticated session and an active team.

## Project structure

```
src/
├── App.jsx              # Top-level app + routing/state
├── config.js            # Supabase client, app version
├── constants.js         # UOM/phase/status options, column defaults
├── components/          # React UI components
├── hooks/               # Custom hooks
├── utils/               # catalog, packages, projects, exports, formatters
└── styles.js            # Inline style objects

public/
├── av_catalog.json      # Seed catalog (first-team bootstrap only)
├── av_packages.json     # Seed packages
├── manifest.json        # PWA manifest
└── sw.js                # Service worker

supabase/
└── functions/procore-proxy/   # Edge function for Procore API

*.sql                    # Supabase migrations (run in order above)
```
