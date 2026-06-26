# Dashboard (GitHub Pages)

This folder is the **public** copy of the site — safe to push to GitHub. It contains **no PINs, API keys, or database secrets**.

## What is included

- HTML pages, `css/site.css`, and JavaScript
- `js/config.js` — branding, links, packages (public)
- `js/private-config.example.js` — template only (no real secrets)

## What is NOT included (never commit these)

| File | Why |
|------|-----|
| `js/private-config.js` | Supabase URL/key only (generated at deploy; optional locally) |
| `users.txt` | Plain-text PINs |
| `data/reps.json` | PINs |
| `*.sql` | Database setup (run in Supabase dashboard only) |
| `import_*.sql` | Lead data dumps |

## Go live on GitHub Pages

### 1. Create the repo

1. Create a new **private** or **public** GitHub repository.
2. Push **only the contents of this `github` folder** as the repo root (not the parent `SalesTeamWebsite` folder).

```powershell
cd "path\to\SalesTeamWebsite\github"
git init
git add .
git commit -m "Initial public site"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

### 2. Add GitHub Secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|--------|
| `SUPABASE_URL` | `https://qxtvrlskuntfcsgqdekh.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase **publishable** or anon key (from Project Settings → API) |

**PINs are not stored in GitHub.** Add reps in Supabase with `supabase-rep-pins.sql` (see parent folder). The site calls `verify_rep_pin` to check PINs server-side.

### 3. Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions**

Push to `main`. The workflow `.github/workflows/deploy.yml` builds `js/private-config.js` from secrets and deploys.

Your site URL will be like: `https://YOUR_USER.github.io/YOUR_REPO/`

## Local testing (before push)

```powershell
cd github
copy js\private-config.example.js js\private-config.js
# Edit js\private-config.js with Supabase URL + key only (PINs live in Supabase rep_pins)
python -m http.server 8765
```

Open `http://localhost:8765` — hard refresh after edits.

## Supabase SQL (parent folder — never commit)

Run these in **Supabase → SQL Editor** (files live in `SalesTeamWebsite/`, not `github/`):

| File | When to run |
|------|-------------|
| `supabase-all-setup.sql` | New project or full schema refresh |
| `supabase-faq-qa-setup.sql` | First-time FAQ team Q&A tables |
| `supabase-faq-qa-policies-only.sql` | FAQ edit/remove already broken (permission errors) |
| `supabase-reset-rep-playtest.sql` | Clear test rep data (keeps leads + PINs) |

After FAQ setup: **Database → Replication** → enable Realtime for `faq_questions` and `faq_answers`.

## Syncing updates from the main project

From the `SalesTeamWebsite` folder (parent of `github/`):

```bash
node scripts/sync-to-github.js
```

This copies HTML, CSS, and JS into `github/`, injects `private-config.js` + `config-merge.js` on every page, and rebuilds `js/config.js` **without** Supabase keys or PINs. It never copies `users.txt`, `data/`, SQL files, or `js/private-config.js`.

### Git Bash — sync and push to GitHub

```bash
cd "/d/Website Bot/SalesTeamWebsite"

# Copy latest public site into github/ (no secrets)
node scripts/sync-to-github.js

cd github

git add .
git status

# If there are changes:
git commit -m "Update site"
git push origin main
```

Repo: [https://github.com/Delexoo/Dashboard](https://github.com/Delexoo/Dashboard)

First-time push only:

```bash
cd "/d/Website Bot/SalesTeamWebsite/github"
git init
git branch -M main
git remote add origin https://github.com/Delexoo/Dashboard.git
git add .
git commit -m "Initial public site"
git push -u origin main
```

## Security notes

- Supabase **anon/publishable** keys are still visible in the browser after deploy — protect data with Row Level Security in Supabase.
- **PINs are verified server-side** (`verify_rep_pin` in Supabase). They are not in this repo or in `private-config.js`.
- Never commit `private-config.js`, `users.txt`, or paste real PINs into issues or PRs.
