# Deploying

Written to be followed once, together, and then kept as the record of what was done.

---

## The platform: Vercel

Recommended without much hesitation, and the reasons are specific to this project rather than
general enthusiasm.

**It runs what this app actually is.** There are 9 files of Server Actions, a middleware that
refreshes the staff session on every request, and 6 dynamically-rendered routes. That rules out
anything that only serves static files — Netlify Drop, GitHub Pages, Cloudflare Pages in static
mode. The app is not a static site with a database bolted on; it is a Next server.

**Next 15 works there on the day it ships.** Vercel builds Next, so there is no adapter between
this app and its host, and no version of the "works locally, breaks on the platform" problem that
adapters produce. A self-hosted Node server would also work and is a real alternative — see
below — but it is more to run.

**It can sit next to the database.** Supabase is in `eu-west-3` (Paris), the closest region to
Constantine. Vercel's function region should be set to match, or every database call crosses the
Atlantic twice. This is the single setting most likely to be left at its default and most likely
to be felt.

**The free tier is enough for this salon**, and stays enough. A hair salon in Constantine is not
going to exceed 100 GB of bandwidth a month.

### What was considered and not chosen

- **Netlify** — runs Next through an adapter. Fine, but the adapter is a moving part that
  occasionally lags a Next release, and it buys nothing here.
- **Cloudflare Pages / Workers** — excellent and cheap, but Next on Workers still has rough edges
  around Node APIs, and this app has middleware doing cookie work. Not the place to find out.
- **A VPS** (Hetzner, DigitalOcean, or an Algerian host) — genuinely reasonable, and the honest
  choice if data residency ever becomes a requirement. Costs an evening now and an hour a month
  forever: Node, a process manager, nginx, certificates, and remembering to renew them. Revisit
  if a rule ever requires Algerian hosting.

---

## Before deploying

1. **Everything green.** `npm run typecheck && npm run lint && npm test && npm run e2e`
2. **A production build locally.** `npm run build` — a build that fails on Vercel and passes here
   is almost always an environment variable, and it is quicker to find at home.
3. **The performance budget.** `npm start`, then `npm run perf -- http://localhost:3000/ar`.

## The environment variables

Four, and only four matter on day one. They go in Vercel's project settings, not in the repo.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **anon** key | Public by design; RLS decides what it reads |
| `NEXT_PUBLIC_SITE_URL` | the real domain | Used by canonical tags, hreflang and the sitemap |
| `NEXT_PUBLIC_DEMO_DATA` | **leave unset** | Inert once Supabase is configured, but leave it empty |

**The service-role key is not on this list and must never be.** It bypasses RLS on every table.
Nothing in this application needs it — the console signs in with the same anon key and carries the
member of staff's own session, so their policies filter every query.

`WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` stay empty until Meta approves the account.
The manual adapter runs meanwhile and reports `delivered: false` rather than pretending.

## The walkthrough

Written to be read aloud while somebody else clicks. Roughly 20 minutes, most of it waiting for
the first build.

### 1. Push everything first

```bash
git status          # must be clean
git push origin main
```

Vercel deploys what is on GitHub, not what is on the laptop. A local commit that was never pushed
is the most common reason the deployed site is missing the thing you just fixed.

### 2. Create the project

1. **vercel.com** → sign in **with GitHub**. Signing in with email instead creates an account that
   cannot see the repository, which then looks like the repository is missing.
2. **Add New → Project**.
3. Find **SalonSophie** → **Import**. If it is not listed, **Adjust GitHub App Permissions** and
   grant access to that repository.
4. Framework should read **Next.js** already. Leave the build command, output directory and
   install command exactly as they are — the defaults are correct, and overriding them is how a
   working build stops working.

### 3. Environment variables — before the first build, not after

On the same screen, open **Environment Variables** and add the three from the table above:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.

Add them to **all three environments** (Production, Preview, Development) unless there is a reason
not to. Leave `NEXT_PUBLIC_DEMO_DATA` out entirely.

They are read at **build** time, not at request time — `NEXT_PUBLIC_*` values are compiled into
the bundles. Adding one afterwards changes nothing until the next deploy, which is a confusing
twenty minutes if nobody says so first.

For `NEXT_PUBLIC_SITE_URL` on the very first deploy, the final domain may not exist yet. Use the
`*.vercel.app` URL Vercel gives you, and change it once the real domain is attached — step 6.

### 4. Deploy

Press **Deploy** and wait. The first build takes a few minutes; later ones are faster.

If it fails, read the log from the **top**, not the bottom: the first error is the real one and
everything under it is fallout. A build that passes locally and fails here is almost always a
missing environment variable.

### 5. Move the functions to Paris

**Settings → Functions → Function Region → Paris (cdg1)**, then **redeploy** — the region applies
to the next deployment, not the current one.

This is the step most likely to be skipped and least likely to be noticed, because the site still
works without it, only slower. Supabase is in Paris. The default is Washington. Leaving it puts
the Atlantic between every page render and the database, twice, on an app whose whole performance
budget was written for Algerian 4G.

### 6. The domain

**Settings → Domains → Add.** Vercel prints the DNS records to create at whoever sells the domain
— usually an `A` record, or a `CNAME` for `www`. DNS takes minutes to hours to propagate; the
certificate is automatic once it resolves.

Then, and this is easy to forget:

- Set `NEXT_PUBLIC_SITE_URL` to the real domain and **redeploy**, or the sitemap and every
  canonical tag keep naming the placeholder.
- **Supabase → Authentication → URL Configuration** → add the domain to Site URL and Redirect
  URLs, or staff sign-in bounces to localhost.

### 7. Check it, rather than assume it

```bash
curl -I https://<domain>                     # CSP, HSTS, x-frame-options: DENY
curl -s https://<domain>/robots.txt          # names the real domain
curl -s https://<domain>/sitemap.xml | head  # ditto, and no console paths
npm run perf -- https://<domain>/ar          # the locale with the least headroom
```

Then in a browser: the public site in all three languages, a booking taken as far as the slot list
without submitting, and a staff sign-in.

**Do not run `npm run e2e` against the deployed site.** It drives the booking flow to completion
and would write real appointments into the live database — which has happened once already. The
suite builds its own copy without credentials for exactly this reason.

## What deploying does not do

It does not answer the §6 questions, and the site will go live still rendering `—` where a price
or a duration is unknown. That is the design working, not a defect — but it is worth knowing
before showing it to anyone. `docs/questions-sophie.ar.pdf` is what turns those into real values,
and every one of them is entered from the console afterwards without another deploy.
