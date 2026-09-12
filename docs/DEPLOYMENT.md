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

## After the first deploy

- **Set the function region to `cdg1` (Paris).** Vercel → Settings → Functions. The default is
  Washington, which puts the Atlantic between every page render and the database.
- **Point `NEXT_PUBLIC_SITE_URL` at the final domain** and redeploy. Until then the sitemap and
  the canonical tags name a domain that is not live.
- **Add the domain in Supabase** → Authentication → URL Configuration, or the staff sign-in
  redirect will bounce to localhost.
- **Check the headers survived**: `curl -I https://<domain>` should show
  `content-security-policy`, `strict-transport-security` and `x-frame-options: DENY`.
- **Re-run the performance budget against the deployed URL**, which is the number that counts:
  `npm run perf -- https://<domain>/ar`.
- **Check `/robots.txt` and `/sitemap.xml`** name the real domain rather than `thesisters-ns.dz`
  if the domain differs.

## What deploying does not do

It does not answer the §6 questions, and the site will go live still rendering `—` where a price
or a duration is unknown. That is the design working, not a defect — but it is worth knowing
before showing it to anyone. `docs/questions-sophie.ar.pdf` is what turns those into real values,
and every one of them is entered from the console afterwards without another deploy.
