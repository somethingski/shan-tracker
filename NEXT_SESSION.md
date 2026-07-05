# 山 Shan — Session wrap-up & next steps
*Written 2026-07-05 after the feature session (history view, offline, polish).*

## Where things stand

**Live:** https://somethingski.github.io/shan-tracker/ (repo `somethingski/shan-tracker`,
public, deployed by `.github/workflows/pages.yml` on every push to `main`).

**Done this session (all browser-verified locally):**
- TEMP-TEST rank gates reverted — ranks once again require the 4–6 bracket
  AND 4–6 reps. Honest toast when a rank lift is logged without bodyweight.
- Cache busting: the workflow stamps the commit SHA into `__V__` tokens in
  `index.html`, `app.js` imports, and `sw.js`. No more stale-JS debugging.
- Photos moved to IndexedDB (`shan-photos` DB); legacy localStorage photos
  migrate at boot. Object-URL leak fixed; save failures now toast.
- **History tab (誌)**: month calendar (jade = workout, bronze = photo, enso
  ring = all practices), day sheet with photo + sets + pain + practices,
  prev/next-day arrows on Today, Reflect rows open the underlying day.
- Calibration (user-confirmed): ~170–180 lb male, ratio anchors unchanged;
  DB press entry is **per dumbbell** (labeled); RDL labeled as judged on
  deadlift standards; even 3rd→95th tier spread kept and the ladder's
  "top X%" column now matches it.
- Offline: service worker app-shell cache (versioned per deploy, skipped on
  localhost); Latin fonts self-hosted, Google Fonts removed (CJK falls back
  to local Songti SC on Apple devices). Settings has Import (validating,
  confirm-overwrite).
- Polish: PR seal-press (峰), enso on the Today date chip, est-1RM sparklines
  in Reflect, habit delete, deload-week toggle (excluded from trends).

## What Sean still has to do (5 min)

1. **Run this in Supabase SQL Editor** (test data wipe — you chose full wipe —
   plus the new column):
   ```sql
   delete from rank_history where log_date <= '2026-07-05';
   delete from ranks;
   delete from workout_logs where log_date <= '2026-07-05';
   alter table settings add column if not exists deload_weeks jsonb not null default '[]'::jsonb;
   ```
2. Open the live site signed in, and on the phone PWA: confirm seals render,
   log a set, check the History tab. The service worker only runs on the
   deployed site (not localhost), so offline-open is only testable there:
   load the site once, then airplane-mode and reopen.

## Known limitations (unchanged, not urgent)

- Boot hydration can clobber offline rank progress until the next synced log;
  `flushPending` replays workouts without recomputing ranks.
- Supabase free tier pauses after ~7 days idle (daily use prevents it).
- `db_shoulder_press` standards approximate (flagged in-app).
- Offline-mode data never migrates into an account on later sign-in.
- Icons are placeholders; multi-photo/compare view is a natural follow-on.

## Machine/tooling notes (this Mac)

- `gh` API calls need `env -u GITHUB_TOKEN gh ...` (env token lacks `repo` scope).
- `psql` lives at `/opt/homebrew/opt/libpq/bin/psql` (keg-only).
- Local preview: `npx serve app -l 4173` (the `ink-tracker` entry in
  `~/.claude/launch.json`). SW is intentionally not registered on localhost.
