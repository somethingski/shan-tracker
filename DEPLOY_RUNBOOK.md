# DEPLOY_RUNBOOK.md — hand this to Claude Code

Goal: get 山 Shan live on GitHub Pages, synced to the user's private Supabase,
installable on their phone. Total time ~10 min. Ask for confirmation before any
push, any SQL run against their database, and any settings change.

## Prerequisites the user completes first (they cannot be automated)
1. Supabase project created (card-free). Have ready:
   - Project URL and anon key → pasted into `app/config.js`
   - Database connection string (Session URI) → for running the SQL
2. One Supabase Auth user created (their login).

If `app/config.js` still contains `PASTE_HERE`, STOP and ask the user to fill it.

## Step 1 — Create the GitHub repo and push
```
gh repo create shan-tracker --private --source=. --remote=origin --push
```
(If `gh` is unavailable, create the repo via the GitHub MCP, then
`git remote add origin <url> && git push -u origin main`.)

## Step 2 — Run the database schema
Using the user's connection string (ask them to paste it; do not store it):
```
psql "<CONNECTION_STRING>" -f sql/schema.sql
```
This creates all tables, row-level security, and the private `physique`
storage bucket. It is idempotent — safe to re-run.

## Step 3 — Enable GitHub Pages
Serve from the `app/` folder on the `main` branch. Either:
- GitHub UI: Settings → Pages → Source = Deploy from a branch → main → /app
- or via GitHub API (confirm with user first).
The live URL will be: `https://<username>.github.io/shan-tracker/`

Note: because Pages serves `app/` as the site root, all paths in the app are
already relative (`assets/…`, `config.js`) so they resolve correctly.

## Step 4 — Verify
- Open the URL. You should see the 山 auth screen.
- Sign in with the user's Supabase Auth account.
- Log a set on Today; confirm it appears after refresh (sync working).
- Tap Seals → a lift → confirm the ladder opens with weights at their bodyweight.

## Step 5 — Phone install
Tell the user: open the URL in Safari/Chrome → Share → Add to Home Screen.
It opens fullscreen and works offline; logs sync when back online.

## Optional — keep Supabase awake
Free projects pause after 7 days idle. Daily use prevents this. As insurance,
suggest a free UptimeRobot HTTP monitor on the Supabase URL. Do not set this up
without asking.

## Guardrails
- Never enter the user's password or create accounts for them.
- Confirm before: pushing, running SQL, enabling Pages, any account change.
- The anon key in config.js is safe to commit (RLS restricts all rows to the
  authenticated user). The connection string is NOT — never commit it.
