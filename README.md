# SpaceX Now — Fort Mohave

Unofficial SpaceX launch schedule for **Fort Mohave, AZ (86426)**, styled like spacex.com / SpaceX Now.

- Live upcoming launches from [Launch Library 2](https://thespacedevs.com/)
- Local times in **America/Phoenix (PT / MST)**
- Visibility heuristic: **Vandenberg** YES/MAYBE (night/twilight → look **WSW**); Florida & Starbase → **NO**

> Not affiliated with SpaceX.

## Local development

```bash
cd spacex-now
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

Dev server proxies `/api/ll/*` → `https://ll.thespacedevs.com` (see `vite.config.js`). If the API is rate-limited, the app falls back to `public/fallback-launches.json`.

```bash
npm run build   # output → dist/
npm run preview # serve production build locally (proxy still active)
```

## Deploy: GitHub → Railway

### 1. Push this folder to GitHub

From the repo root that contains this project (or make `spacex-now` the repo root):

```bash
git init
git add .
git commit -m "SpaceX Now — Fort Mohave launch visibility"
# create empty repo on GitHub, then:
git remote add origin https://github.com/<YOU>/<REPO>.git
git branch -M main
git push -u origin main
```

If this directory is a subdirectory of a monorepo, set Railway’s **Root Directory** to `spacex-now`.

### 2. Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select the repo (and root directory `spacex-now` if needed)
3. Railway will detect **Nixpacks** (`nixpacks.toml`):
   - Installs Node 20 + Caddy
   - Runs `npm run build`
   - Starts: `caddy run --config /app/Caddyfile --adapter caddyfile`
4. Generate a public domain: **Settings → Networking → Generate Domain**
5. `$PORT` is injected by Railway; the Caddyfile binds `:{$PORT:8080}`

Optional: use the included `Dockerfile` instead (Railway → Settings → Builder → Dockerfile).

### 3. What production serves

| Path | Behavior |
|------|----------|
| `/*` | Vite `dist/` SPA (`try_files` → `index.html`) |
| `/api/ll/*` | Reverse proxy to Launch Library 2 |

No extra env vars required.

## Visibility rules (Fort Mohave)

| Pad | Distance (approx.) | Flag |
|-----|-------------------|------|
| Vandenberg SFB | 250–300 mi WSW | **YES** night/twilight · **MAYBE** daytime |
| Cape / KSC | 2000+ mi | **NO** |
| Starbase TX | 1000+ mi | **NO** |

## Stack

- Vite (vanilla JS)
- Caddy (static + API proxy)
- Nixpacks / optional Dockerfile for Railway
