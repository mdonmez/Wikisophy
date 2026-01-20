# GitHub Pages Deployment Guide

This Wikisophy project is now configured as a **static site** and can be deployed to GitHub Pages.

## Deployment Steps

### 1. Build the Project

```bash
bun install
bun run build
```

This generates a static site in the `build/` directory.

### 2. Deploy to GitHub Pages

There are several ways to deploy to GitHub Pages:

#### Option A: Using GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ['main']
  workflow_dispatch:

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Build
        run: bun run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./build
```

#### Option B: Manual Deployment

1. Build the project: `bun run build`
2. Commit the `build/` directory to a `gh-pages` branch
3. Configure GitHub Pages in repository settings to use `gh-pages` branch

#### Option C: Using `gh-pages` package

```bash
bun add -d gh-pages
# Add to package.json scripts:
# "deploy": "gh-pages -d build"
bun run deploy
```

### 3. Configure Repository Settings

1. Go to your repository **Settings** → **Pages**
2. Set Source to your deployment branch (`gh-pages` or `main`)
3. Ensure branch protection rules don't block the action

### 4. Enable CORS for Wikipedia API

The app makes direct calls to Wikipedia's public APIs which support CORS. No additional configuration needed for client-side requests.

## Key Changes from Original

- ✅ Removed SvelteKit server routes (`/api/*`)
- ✅ All Wikipedia API calls now made directly from the browser
- ✅ Using `@sveltejs/adapter-static` for static export
- ✅ Created `src/lib/wikipedia-client.ts` for client-side API utilities
- ✅ Fully functional as a static site (works on GitHub Pages)

## Development

```bash
# Start dev server
bun run dev

# Type checking
bun run check

# Format and lint
bun run format
bun run lint
```

## Notes

- The app works entirely client-side
- Wikipedia API calls are CORS-enabled for public use
- Respects Wikipedia's User-Agent policy
- No backend server required
- Suitable for deployment on any static hosting (GitHub Pages, Netlify, Vercel, etc.)
