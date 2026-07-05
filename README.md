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
- **Reflect (徑)** — every-6-week analytics: which lifts climb vs. stall, pain
  patterns, practice adherence, fun trends, and a plain-language summary of your
  strengths and single biggest thing to fix.
- **Settings** — editable practice checklist, program start date, data export.

## Structure
```
app/               the web app (this folder is the GitHub Pages site root)
  index.html
  config.js        ← paste your Supabase URL + anon key here
  manifest.webmanifest
  assets/          styles, program data, rank engine, app logic, icons
sql/schema.sql     run once against your Supabase
docs/DESIGN_SYSTEM.md   the visual language
DEPLOY_RUNBOOK.md  hand this to Claude Code to deploy
```

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
private repo, enable Pages on `app/`, add to your home screen.
