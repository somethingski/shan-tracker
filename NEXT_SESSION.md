# 山 Shan — Session wrap-up & next steps
*Written 2026-07-05 after the deploy + rank-debugging session.*

## Where things stand

**Live and working:**
- Site: https://somethingski.github.io/shan-tracker/ (repo: `somethingski/shan-tracker`, public)
- Deployed via GitHub Actions (`.github/workflows/pages.yml`) — every push to `main`
  publishes the `app/` folder. Branch-mode Pages couldn't serve `/app`, so we use
  Actions-based deployment instead of the runbook's original Step 3.
- Supabase: schema, RLS, and the `physique` bucket are live. Auth, workout sync,
  bodyweight, and rank writes all verified against the real database.
- Rank flow verified end-to-end: log sets → `est_1rm` computed → `ranks` +
  `rank_history` rows written → seal renders.

**Bugs found and fixed this session:**
1. Stray invisible U+2028 in the anon key in `app/config.js` (copy-paste artifact)
   broke every Supabase request with a fetch header error.
2. "Ranks reset daily" — root cause: ranks were write-only to the cloud. The app
   upserted to the `ranks` table but never read it back; seals rendered purely from
   localStorage, which private windows, other browsers, and the installed PWA
   (separate storage on iOS) don't share. Fixed: boot now hydrates `rank:*` from
   Supabase, and `updateRank` runs even when the network sync fails/offline.

## Step 1 next session — REVERT THE TEST GATES

Two `TEMP-TEST` markers in `app/assets/app.js` (~line 70) disable the 4–6-rep
rank gating so ranks could be tested off-wave. **Real training must not run with
these**, or light-weight high-rep sets will write junk ranks. Restore:

```js
if(isRankBracket(bracket)){
  for(const s of sets){ if(s.weight&&s.reps>=4&&s.reps<=6){ const e=conservative1RM(s.weight,s.reps); if(!est||e>est)est=e; } }
}
```

Then wipe the test data (all of it came from testing on 2026-07-04):

```sql
delete from rank_history where log_date <= '2026-07-05';
delete from ranks;
delete from workout_logs where log_date <= '2026-07-05';  -- skip if the bench sets were real
```

Run via: `/opt/homebrew/opt/libpq/bin/psql -h aws-1-us-east-2.pooler.supabase.com -p 5432 -U postgres.rwchvyoegbnylkwkbnhp -d postgres`
(password prompted; or the Supabase SQL Editor — no local tooling needed).

## Step 2 — cache busting (highest-value improvement)

GitHub Pages serves JS with `cache-control: max-age=600`. Stale `app.js` caused
**two** separate "it's still broken" debugging rounds this session. Fix: have the
deploy workflow stamp a version into the asset URLs (e.g. replace a `__V__` token
in `index.html`'s script tag and in `app.js`'s import paths with the commit SHA).
Until then: hard-refresh (Cmd+Shift+R) after every deploy, and remember the
installed PWA caches separately.

## Known limitations to consider (not urgent)

- **Boot hydration can clobber offline progress**: if you log offline (rank updates
  locally), then reopen online, boot overwrites local rank state with the older DB
  row until the next synced log. `flushPending` also replays workout rows without
  recomputing ranks. Robust fix: recompute ranks from `workout_logs` server-side or
  after each flush, or merge by taking the max peak.
- **Supabase free tier pauses after ~7 days idle.** Daily logging prevents it. The
  optional UptimeRobot HTTP monitor (runbook's last step) was never set up.
- `db_shoulder_press` standards are approximate (flagged in-app by design).
- `startApp(offline)` ignores its param; offline-mode data never migrates into an
  account on later sign-in. Fine for single-user reality, worth knowing.

## Machine/tooling notes (this Mac)

- `gh` has two credentials for `somethingski`; the env-var one (`GITHUB_TOKEN`)
  lacks `repo` scope. Anything hitting the API needs `env -u GITHUB_TOKEN gh ...`.
- `psql` lives at `/opt/homebrew/opt/libpq/bin/psql` (keg-only, not on PATH).
- Local preview: `npx serve app -l 4173` (also configured as the `ink-tracker`
  entry in `~/.claude/launch.json`).

## Verification checklist for you (5 min, fresh browser)

1. Open the site in a browser you haven't used for it → sign in → **Seals should
   show your rank immediately** (this is the hydration fix; it needs your login,
   so it couldn't be machine-verified).
2. Log a set on a training day → toast shows `1RM ~N lb · rank updated`.
3. Phone: Add to Home Screen; confirm the installed app also shows ranks.
