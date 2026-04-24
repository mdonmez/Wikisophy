# AGENTS.md - Wikisophy Project Guide

> For project overview, usage, and contributing guidelines, see [README.md](README.md).

## Build Commands

```bash
# Development
bun run dev              # Start Vite dev server
bun run build            # Production build (Cloudflare Workers)
bun run preview          # Preview production build
bun run prepare          # svelte-kit sync

# Quality Checks
bun run check            # TypeScript/Svelte type checking (svelte-check)
bun run check:watch      # Type checking in watch mode
bun run lint             # Prettier check + ESLint
bun run format           # Format all files with Prettier
```

**No test framework is configured** — no vitest, jest, or playwright.

## Technology Stack

| Technology      | Version               | Notes                                               |
| --------------- | --------------------- | --------------------------------------------------- |
| SvelteKit       | ^2.53.4               | Cloudflare adapter (`@sveltejs/adapter-cloudflare`) |
| Svelte          | ^5.53.8               | Runes syntax exclusively                            |
| TypeScript      | ^5.9.3                | Strict mode                                         |
| Vite            | ^7.3.1                |                                                     |
| Tailwind CSS    | ^4.2.1                | v4 with `@tailwindcss/vite` plugin                  |
| shadcn-svelte   | via `components.json` | Neutral base color, `bits-ui ^2.16.3`               |
| ESLint          | ^9.39.4               | Flat config                                         |
| Prettier        | ^3.8.1                | With svelte + tailwindcss plugins                   |
| Package manager | Bun                   |                                                     |
| Deployment      | Cloudflare Workers    | `wrangler.jsonc`, `nodejs_compat` flag              |

## Code Style Guidelines

### Svelte 5 Runes (REQUIRED)

Always use modern runes syntax. **Never** use `$:`, `export let`, or `<slot>`:

```typescript
// State
let count = $state(0);
let user = $state<User | null>(null);

// Derived
let doubled = $derived(count * 2);
let result = $derived.by(() => compute(value));

// Effects
$effect(() => { console.log(count); });

// Props
let { title, children }: Props = $props();
let value = $bindable(); // Two-way binding
```

### TypeScript

- **Strict mode** - All code must pass strict checks
- **Explicit return types** - Annotate all function returns
- **Avoid `any`** - Use `unknown` or specific types
- Use modern TypeScript 5.9+ syntax

### Imports (Order Matters)

```typescript
// 1. External libraries (alphabetical)
import { fly } from 'svelte/transition';

// 2. Internal $lib imports
import { Button } from '$lib/components/ui/button/index.js';
import type { Article } from '$lib/types';

// 3. SvelteKit imports
import { base } from '$app/paths';
```

### Formatting (Prettier)

```json
{ "useTabs": true, "singleQuote": true, "trailingComma": "none", "printWidth": 100 }
```

- **Tabs** for indentation | **Single quotes** | **No trailing commas** | **100 char** line width

### Naming Conventions

| Type               | Convention           | Example                   |
| ------------------ | -------------------- | ------------------------- |
| Files (utils)      | camelCase            | `wikipedia.ts`            |
| Files (components) | PascalCase           | `Button.svelte`           |
| Components         | PascalCase           | `ItemCard`                |
| Types/Interfaces   | PascalCase           | `Article`, `JourneyState` |
| Constants          | UPPER_SNAKE_CASE     | `MAX_STEPS`               |
| Functions          | camelCase            | `findFirstWikiLink`       |
| Variables          | camelCase            | `searchQuery`             |
| Booleans           | is/has/should prefix | `isActive`, `hasError`    |

### Error Handling

```typescript
// Always handle errors gracefully
try { return await fetchData(); } catch { return null; }

// Early returns for validation
if (!data) return null;
```

### JSDoc

Document all exported functions with JSDoc comments.

### Styling

- Use **Tailwind CSS** utility classes exclusively
- Use `cn()` utility from `$lib/utils` for conditional classes
- Never use inline `<style>` blocks

## Project Structure

```
src/
├── lib/
│   ├── components/ui/       # shadcn-svelte UI components (badge, button, command, dialog, item, popover, separator, skeleton)
│   ├── constants.ts         # App constants (MAX_STEPS, SEARCH_DEBOUNCE, API URLs)
│   ├── types.ts             # TypeScript type definitions (Article, JourneyState, etc.)
│   ├── utils.ts             # cn() helper (clsx + twMerge)
│   ├── wikipedia.ts         # Wikipedia HTML parsing logic (DOMParser, browser-only)
│   ├── wikipedia-client.ts  # Client-side Wikipedia API calls (CORS-enabled)
│   ├── localStorageCache.ts # Map-based localStorage cache with LRU eviction
│   ├── quotes.ts            # Philosophy quotes collection
│   └── index.ts             # $lib alias placeholder
├── routes/
│   ├── +layout.svelte       # Root layout (imports layout.css, ModeWatcher)
│   ├── +page.svelte         # Single-page app (all UI + logic in one file)
│   └── layout.css           # Tailwind v4 CSS with oklch color variables
├── app.d.ts                 # SvelteKit app type declarations
└── app.html                 # HTML shell
```

## Core Patterns

### Wikipedia Link Parsing Rules

Valid links must:

- Start with `/wiki/`
- NOT contain `:` (excludes File:, Help:, Category:)
- NOT be inside parentheses `()`
- NOT be in italic tags (`<i>`, `<em>`)
- NOT be in excluded elements (infoboxes, tables, hatnotes)

### State Management

```typescript
let journeyState = $state<JourneyState>({
  status: 'IDLE', path: [], outcome: null
});
let isActive = $derived(journeyState.status === 'RUNNING');
```

### Debounced Effects

```typescript
$effect(() => {
  const query = searchQuery;
  clearTimeout(timeout);
  timeout = setTimeout(() => handleSearch(query), SEARCH_DEBOUNCE);
});
```

## Important Notes

1. **Svelte 5 Runes only** — No `$:`, `export let`, or `<slot>`
2. **Use Bun** — Not npm/yarn/pnpm
3. **Client-side API calls** — Wikipedia API called directly from browser (CORS-enabled)
4. **Cloudflare Workers deployment** — Uses `@sveltejs/adapter-cloudflare` with `nodejs_compat`
5. **Strict TypeScript** — No `any` types; use `unknown` or specific types
6. **Tailwind v4** — Uses `@tailwindcss/vite` plugin, not `tailwind.config.js`; CSS in `layout.css` with `@import 'tailwindcss'`
7. **DOMParser is browser-only** — `wikipedia.ts` uses `DOMParser`; won't work in SSR
8. **Single-page app** — All logic in `+page.svelte`; no additional routes
9. **shadcn-svelte** — Use existing UI components from `$lib/components/ui/`; `cn()` from `$lib/utils`
