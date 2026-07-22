# Shan

Shan (山, "mountain") is the lifting log I keep for myself. I wanted one place to
record every working set and watch a few lifts climb over months, with a rank
system for motivation instead of a spreadsheet that just sits there. It runs as
an offline web app on my phone and syncs to my own Supabase, so the data is mine
and there's nothing to pay for.

The default program is a 6-day push/pull/legs split on a wave: rep targets cycle
10–12, then 7–9, then 4–6, and repeat. Each day the app loads the right workout
and the right rep bracket for the current week. If the default doesn't fit, the
Settings tab has a program editor — reorder exercises, add or remove them, and
restructure which day runs on which weekday. I log weight and reps per set,
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

## Multiple users

The same deployment can hold any number of people, each with a completely private
account. Supabase row-level security scopes every row — logs, ranks, settings,
photos — to the signed-in user, so no one can see anyone else's data.

**For a new user:**

1. Open the app's URL.
2. On the sign-in screen, tap **New here? Create an account**, enter an email and
   a password (6+ characters), and tap **Create account**.
3. If email confirmation is turned on in the Supabase project, you'll get a
   confirmation email — click the link, then come back and sign in. If it's off,
   you're signed in immediately.
4. From then on, just sign in with that email and password. Your program,
   history, and ranks are yours alone.

"Use offline on this device" is a separate, account-less mode: it keeps data in
the browser on that one device and never syncs. Sign in if you want a real account
you can reach from anywhere. On a shared device, sign out when you're done —
signing out (and switching accounts) wipes this device's cached data so the next
person can't see yours.

**For the owner (controlling who can register).** Sign-up is open by default —
anyone with the link can create an account. To close it off: Supabase Dashboard →
**Authentication → Sign In / Providers → Email**, turn off **Allow new users to
sign up**. After that, only accounts you create yourself under **Authentication →
Users** can sign in. That's the kill-switch if the public URL starts attracting
strangers.

## Known rough edges

The dumbbell shoulder press rank is more of an estimate than the others; there
isn't much public strength data for it, so it's flagged as approximate in the app
and I left it there. And there are no tests yet.
