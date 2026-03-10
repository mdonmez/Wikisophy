# AGENTS.md - Wikisophy Project Guide

## Overview

Wikisophy is a SvelteKit 2 + Svelte 5 app demonstrating the Wikipedia "Getting to Philosophy" phenomenon. Users start from any article and follow the first valid link until reaching "Philosophy".

## Build Commands

```bash
# Development
bun run dev              # Start dev server
bun run build            # Production build (static adapter)
bun run preview          # Preview production build

# Quality Checks
bun run check            # TypeScript/Svelte type checking
bun run check:watch      # Type checking in watch mode
bun run lint             # ESLint + Prettier check
bun run format           # Format all files with Prettier
```

**Note:** No test framework is configured.

## Technology Stack

- **SvelteKit 2.53+** with static adapter (GitHub Pages)
- **Svelte 5.53+** using Runes syntax exclusively
- **TypeScript 5.9+** with strict mode
- **Tailwind CSS 4.2+** with shadcn-svelte components
- **Bun** for package management

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
│   ├── components/ui/      # shadcn-svelte UI components
│   ├── constants.ts         # App constants (MAX_STEPS, etc.)
│   ├── types.ts             # TypeScript type definitions
│   ├── utils.ts             # cn() helper and type utilities
│   ├── wikipedia.ts         # Wikipedia HTML parsing logic
│   ├── wikipedia-client.ts  # Client-side Wikipedia API calls
│   └── quotes.ts            # Philosophy quotes collection
└── routes/
    ├── +layout.svelte       # Root layout with ModeWatcher
    ├── +page.svelte         # Main application page
    └── layout.css           # Global styles and CSS variables
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

1. **Svelte 5 Runes only** - No legacy syntax
2. **Use Bun** - Not npm/yarn/pnpm
3. **Client-side API calls** - Direct Wikipedia API from browser
4. **Static export** - GitHub Pages deployment with `base: '/wikisophy'`
5. **Strict TypeScript** - No `any` types
6. **shadcn-svelte** - Use existing UI components
