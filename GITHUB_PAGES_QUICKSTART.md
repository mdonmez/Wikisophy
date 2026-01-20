# Quick Start: Deploy to GitHub Pages

This Wikisophy project is now a **fully static site** ready for GitHub Pages! 🚀

## 1️⃣ One-Time Setup

```bash
# Install dependencies
bun install

# Verify build works locally
bun run build

# Preview the production build
bun run preview
```

## 2️⃣ Deploy to GitHub

```bash
# Stage changes
git add .

# Commit
git commit -m "Convert to static site for GitHub Pages"

# Push to main
git push origin main
```

## 3️⃣ Configure GitHub Pages

1. Go to repository **Settings** → **Pages**
2. Under "Source", select **"GitHub Actions"**
3. The workflow will automatically deploy on every push

Your site will be live at: `https://<username>.github.io/<repo-name>/`

---

## What's Different?

| Before                   | After                                       |
| ------------------------ | ------------------------------------------- |
| SvelteKit server app     | Static HTML/CSS/JS                          |
| Server-side API routes   | Client-side API calls                       |
| Requires Node.js backend | Runs anywhere (GitHub Pages, Netlify, etc.) |
| Manual deployment        | Automatic via GitHub Actions                |

---

## How It Works

1. **Build:** Generates static files in `build/` directory
2. **Deploy:** GitHub Actions uploads files to `gh-pages` branch
3. **Serve:** GitHub Pages hosts the static site
4. **API Calls:** Browser makes direct requests to Wikipedia's public API

**No server needed!** Everything happens client-side.

---

## Development

```bash
# Local dev server
bun run dev

# Type checking
bun run check

# Code formatting
bun run format

# Lint check
bun run lint
```

---

## Files of Interest

- `DEPLOYMENT.md` - Detailed deployment guide
- `CONVERSION_SUMMARY.md` - What changed in the conversion
- `.github/workflows/deploy.yml` - Automatic deployment workflow
- `static/.nojekyll` - Tells GitHub Pages to skip Jekyll
- `src/lib/wikipedia-client.ts` - Client-side API functions

---

## Troubleshooting

**"Site not live yet?"**

- Check GitHub Actions tab for workflow status
- Verify Settings → Pages shows correct source

**"Search doesn't work?"**

- Check browser DevTools Console (F12)
- Verify you have internet access
- Ensure Wikipedia is not blocked in your region

**"Can I change the Wikipedia language?"**

- Yes! Edit constants in `src/lib/constants.ts` to use different Wikipedia language code

---

Ready? Push to `main` and watch the magic happen! ✨
