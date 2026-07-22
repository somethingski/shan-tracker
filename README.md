# Shan

Shan (山, "mountain") is the lifting log I keep for myself. I wanted one place to
record every working set and watch a few lifts climb over months, with a rank
system for motivation instead of a spreadsheet that just sits there. It runs as
an offline web app on my phone and syncs to my own Supabase, so the data is mine
and there's nothing to pay for.

The program is a fixed 6-day push/pull/legs split on a wave: rep targets cycle
10–12, then 7–9, then 4–6, and repeat. Each day the app loads the right workout
and the right rep bracket for the current week. I log weight and reps per set,
flag anything that hurt, rate how much I enjoyed it, and every so often add a
bodyweight and a physique photo.

The part that actually keeps me logging is Seals — a Valorant-style ladder (Iron
up to Radiant) for bench, squat, RDL, and dumbbell shoulder press. Ranks come
only from heavy 4–6 rep sets and are adjusted for bodyweight, so putting on
weight without getting stronger can drop a rank. That's intentional. There's
also a Reflect view for longer-term trends and a calendar for looking back.

## Running it locally

It's a static app in `app/`, no build step. Serve that folder and open it:

```
npx serve app        # or: python3 -m http.server --directory app
```

You'll need a Supabase project. Put your keys in `app/config.js`:

- `SUPABASE_URL` — your project URL
- `SUPABASE_ANON` — the anon public key (safe to commit; row-level security scopes every row to your own login)

Then run `sql/schema.sql` once against the database. Deploying is just GitHub
Pages through Actions — the steps are in `DEPLOY_RUNBOOK.md`.

## Known rough edges

The dumbbell shoulder press rank is more of an estimate than the others; there
isn't much public strength data for it, so it's flagged as approximate in the app
and I left it there. It's also strictly single-user — the login exists so the
data is private, not because anyone else is meant to sign in. And there are no
tests yet.
