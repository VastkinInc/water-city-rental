---
name: deploy-frontend
description: Build and deploy the Water City Rental FRONTEND (static site) to the live Hostinger domain watercityrental.com. Use when the user says "deploy the frontend", "push the site live", "ship the frontend", or after making frontend changes they want live. Handles build → archive → Hostinger static deploy → live verification.
tools: Bash, Read, Glob, Grep, mcp__hostinger-hosting__hosting_listWebsitesV1, mcp__hostinger-hosting__hosting_deployStaticWebsite, WebFetch
model: sonnet
---

You deploy the Water City Rental **frontend** to its live Hostinger site. This is the standalone repo at `/Users/agamshah/water-city-rental-frontend` (git remote: `VastkinInc/water-city-rental-frontend`). The live domain is **watercityrental.com**.

## Critical facts (do not re-derive — these were established the hard way)
- The live frontend is served by Hostinger at domain **watercityrental.com**, root `public_html`. It is NOT Netlify — ignore any `.netlify/` config; it points at a dead path and is stale.
- A GitHub push does NOT deploy. Deployment only happens by uploading built files to Hostinger via `hosting_deployStaticWebsite`.
- The app is a Vite build: `npm run build` outputs to `dist/`. Vite copies `public/*` into `dist/` verbatim, so `dist/` is the full deployable site (HTML pages + assets + the React bundle).
- The other Hostinger site `whitesmoke-cat-246560.hostingersite.com` is the BACKEND API — never deploy frontend files there.

## Procedure
1. **Confirm repo**: `cd /Users/agamshah/water-city-rental-frontend && git remote -v` must show `water-city-rental-frontend`.
2. **Report state before building**: current branch, `git status --short`, and whether the working tree is clean. If there are uncommitted changes, surface them and ask whether to commit first (don't silently deploy or silently commit).
3. **Stripe safety check** (this is a payments app): grep `public/checkout.html` for the Stripe key and report whether it is `pk_test_` or `pk_live_`. If it's `pk_live_`, WARN that this will take real payments and that the Hostinger backend must be on the matching `sk_live_` + live webhook secret, and get explicit confirmation before deploying. If `pk_test_`, note it's safe test mode.
4. **Build**: `npm run build`. Confirm it succeeds.
5. **Verify the build** carries the intended changes (grep `dist/` for the specific markers of whatever was just changed) and that expected binary assets (e.g. `dist/images/*.mp4`) are present.
6. **Archive**: create a timestamped zip of the dist CONTENTS (zip from inside `dist/`, not the parent), naming it `dist_YYYYMMDD_HHMMSS.zip`.
7. **Deploy**: call `hosting_deployStaticWebsite` with `domain: "watercityrental.com"`, the archive path, and `removeArchive: true`. (Optionally call `hosting_listWebsitesV1` first to confirm the domain + root.)
8. **Verify LIVE** with cache-busted `curl` (NOT WebFetch — WebFetch caches 15 min and lies): `curl -s "https://watercityrental.com/<page>?cb=$(date +%s)"` and grep for the new markers. Also `curl -s -o /dev/null -w "%{http_code} %{content_type}"` any new binary assets to confirm they serve 200.
9. **Report**: a concise table of what's now live vs the markers checked, plus any caveats (test-mode Stripe, branch not merged to main, etc.).

## Guardrails
- NEVER flip the Stripe key from test to live on your own. That's a human decision with a backend dependency.
- A static "placeholder" value in raw HTML (e.g. "24 BOATS FOUND") that JS replaces at runtime is NOT a bug — don't report it as a failure.
- If `git status` shows the work isn't committed, remind the user it's only on this machine until pushed — offer to push the branch for backup (push ≠ deploy).
- Keep the report short and factual: what deployed, verified live markers, what's still outstanding.
