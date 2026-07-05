# 山 Shan — a personal training journal

A single-purpose weightlifting tracker for one person. Ink-on-paper aesthetic,
runs offline on your phone, syncs to your own private Supabase, hosted free on
GitHub Pages. No servers, no fees, no accounts but yours.

## What it does
- **Today** — your 6-day push/pull/legs split auto-loads the right workout and
  the right rep bracket for the current wave week (10-12 → 7-9 → 4-6, repeating).
  Log weight × reps per set, flag pain with a note, rate fun 1–5, record
  bodyweight, take a physique photo, tick the day's practices.
- **Seals (印)** — Valorant-structured rank ladder (Iron→Radiant) for the four
  rank-bearing lifts (bench, squat, RDL, DB shoulder press), rendered as ink
  seals. Ranks come only from heavy 4–6 rep sets, are bodyweight-adjusted, and
  track both a live current rank and a peak. Tap a seal for the full ladder.
- **Reflect (徑)** — every-6-week analytics: which lifts climb vs. stall (with
  est-1RM sparklines, deload weeks excluded), pain patterns, practice adherence,
  fun trends, and a plain-language summary of your strengths and single biggest
  thing to fix. Rows link to the underlying day.
- **History (誌)** — month calendar (jade dot = workout, bronze dot = photo,
  enso ring = all practices done). Tap a day to see its sets, pain notes, and
  physique photo side by side; arrows on Today browse day by day.
- **Settings** — editable practice checklist (add/rename/delete), program start
  date, deload-week toggle, data export and import.

## Structure
```
app/               the web app (published to GitHub Pages by Actions)
  index.html
  config.js        ← paste your Supabase URL + anon key here
  sw.js            service worker: offline app-shell cache
  manifest.webmanifest
  assets/          styles, program data, rank engine, app logic, fonts, icons
sql/schema.sql     run once against your Supabase
docs/DESIGN_SYSTEM.md   the visual language
DEPLOY_RUNBOOK.md  deploy steps (Actions-based Pages)
.github/workflows/pages.yml   deploys app/ on every push to main
```

Offline: the app shell and fonts are self-hosted and cached by a service
worker, so the installed PWA opens with no signal; photos live in IndexedDB
and logs queue locally until you're back online.

## The rank math (honest notes)
Thresholds come from published bodyweight-ratio strength standards, anchored so
the 95th percentile of lifters = Diamond 3, exactly as specified. 1RM is the
**lower** of Epley and Brzycki (strictest honest estimate), computed only from
4–6 rep sets. Dumbbell shoulder press standards are approximate (thinner data);
it's flagged in-app. Ranks recompute against your logged bodyweight, so gaining
weight without gaining strength can lower a rank — by design.

## Privacy
Photos live in a private Supabase Storage bucket, compressed client-side before
upload. Row-level security ties every row to your login. The anon key is safe to
commit; your database connection string is not.

## Deploy
See `DEPLOY_RUNBOOK.md`. Short version: fill `config.js`, run the SQL, push to a
public repo with Pages source = GitHub Actions, add to your home screen. Every
push to `main` redeploys with cache-busted assets.
