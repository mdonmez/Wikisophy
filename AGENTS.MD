# AGENTS.MD - Wikisophy Project Guide for AI Agents

## Project Overview

**Wikisophy** is an interactive web application that demonstrates the Wikipedia "Getting to Philosophy" phenomenon. The app allows users to start from any Wikipedia article and automatically follows the first valid link in each article until it reaches the "Philosophy" article, tracking the journey along the way.

### Core Concept

The application is based on the Wikipedia phenomenon where clicking the first non-italicized, non-parenthesized link in the main text of most Wikipedia articles, and repeating the process for subsequent articles, usually leads to the article "Philosophy".

## Technology Stack

### Frontend Framework

- **SvelteKit 2.49.1+** - Modern Svelte 5 with Runes syntax
- **Svelte 5.45.6+** - Using modern Runes API ($state, $derived, $effect, $props)
- **TypeScript 5.9+** - Strict type checking enabled

### Styling

- **Tailwind CSS 4.1.17+** - Utility-first CSS framework
- **shadcn-svelte** - UI component library built on bits-ui
- **tw-animate-css** - Animation utilities
- **tailwind-merge & tailwind-variants** - Dynamic class composition

### Key Libraries

- **@formkit/auto-animate** - Automatic animations for list changes
- **mode-watcher** - Dark/light mode management
- **@lucide/svelte** - Icon library
- **bits-ui** - Accessible component primitives

### Build Tools

- **Vite 7.2.6+** - Build tool and dev server
- **Bun** - Package manager and runtime (per project conventions)

## Project Structure

```
wikisophy/
├── src/
│   ├── lib/
│   │   ├── components/ui/      # shadcn-svelte UI components
│   │   ├── constants.ts        # Application constants
│   │   ├── types.ts           # TypeScript type definitions
│   │   ├── utils.ts           # Utility functions (cn helper)
│   │   ├── wikipedia.ts       # Wikipedia API interaction logic
│   │   └── quotes.ts          # Philosophy quotes collection
│   └── routes/
│       ├── +layout.svelte     # Root layout with ModeWatcher
│       ├── +page.svelte       # Main application page
│       ├── layout.css         # Global styles and CSS variables
│       └── api/               # SvelteKit API routes
│           ├── preview/       # Article preview endpoint
│           ├── random/        # Random article endpoint
│           ├── search/        # Article search endpoint
│           └── step/          # Next link finder endpoint
├── static/                    # Static assets
├── components.json           # shadcn-svelte configuration
├── svelte.config.js         # SvelteKit configuration
├── vite.config.ts           # Vite configuration
└── tsconfig.json            # TypeScript configuration
```

## Core Functionality

### 1. Wikipedia Link Parser (`src/lib/wikipedia.ts`)

The heart of the application is the link parsing logic that follows specific rules:

**Valid Link Criteria:**

- Must start with `/wiki/`
- Must NOT contain `:` (excludes File:, Help:, Category:, etc.)
- Must NOT be inside parentheses `()`
- Must NOT be in italic tags (`<i>`, `<em>`)
- Must NOT be in excluded elements:
  - Infoboxes
  - Tables
  - Hatnotes
  - Navigation boxes
  - Math elements
  - Figures, audio, video

**Key Functions:**

- `fetchArticleHtml(title, lang)` - Fetches section 0 (intro) HTML from Wikipedia API
- `findFirstWikiLink(html)` - Parses HTML to find first valid link using character-by-character scanning with parenthesis tracking

### 2. API Routes (SvelteKit Server Endpoints)

#### `/api/preview` (GET)

- Fetches article summary using Wikipedia REST API
- Returns: title, extract, thumbnail
- Cache: 1 hour

#### `/api/random` (GET)

- Fetches random Wikipedia article
- Returns: article title
- Cache: None (always fresh)

#### `/api/search` (GET)

- Searches Wikipedia using OpenSearch API
- Query params: `q` (query), `limit` (default: 10)
- Returns: array of SearchResults
- Cache: 5 minutes

#### `/api/step` (POST)

- Finds next article in the chain
- Body: `{ title: string }`
- Process:
  1. Fetches article HTML
  2. Finds first valid link
  3. Fetches preview of next article
- Returns: title, nextLink, nextPreview

### 3. Journey State Machine (`src/routes/+page.svelte`)

**States:**

- `IDLE` - No journey in progress
- `RUNNING` - Journey actively traversing articles
- `FINISHED` - Journey completed

**Outcomes:**

- `success` - Reached "Philosophy" article
- `cycle` - Detected a loop (same article revisited)
- `dead_end` - Article has no valid links
- `error` - Network or parsing error
- `cancelled` - User cancelled

**Journey Algorithm:**

```typescript
1. Start with initial article
2. For each step (max 50):
   a. Check if reached "Philosophy" → SUCCESS
   b. Check if article already visited → CYCLE
   c. Fetch next article via /api/step
   d. If no next link → DEAD_END
   e. Add article to path
   f. Continue with next article
3. If max steps reached → DEAD_END
```

### 4. UI Components

**Main Features:**

- **Search Bar** - Autocomplete search with debouncing (150ms)
- **Random Button** - Start journey from random article
- **Cancel Button** - Abort running journey
- **Path Display** - Animated list showing article chain with:
  - Badge showing step number
  - Avatar/thumbnail
  - Article title
  - First sentence of extract
  - Link to original Wikipedia article
- **Loading Indicator** - Breathing animation during traversal
- **Outcome Message** - Result summary
- **Philosophy Quote** - Random quote on success
- **Auto-scroll** - Smooth scroll to bottom as journey progresses

**Key UI Components Used:**

- `Button` (shadcn-svelte) - With variants: default, outline, destructive, ghost
- `Badge` - Step numbers
- `Command` - Search interface
- `Item` - Custom article card component
- `Skeleton` - Loading states

## Constants (`src/lib/constants.ts`)

```typescript
MAX_STEPS = 50                     // Journey step limit
SEARCH_DEBOUNCE = 150             // Search input delay (ms)
SEARCH_LIMIT = 10                 // Default search results
TARGET_ARTICLE = 'philosophy'     // Success target
SCROLL_DELAY = 150                // Auto-scroll delay (ms)
FINISH_SCROLL_DELAY = 200         // Final scroll delay (ms)
USER_AGENT = 'Wikisophy/2.0'     // Wikipedia API header
WIKIPEDIA_API_URL                 // MediaWiki API endpoint
WIKIPEDIA_REST_API_URL            // REST API endpoint
```

## Type System (`src/lib/types.ts`)

**Core Types:**

- `Status` - 'IDLE' | 'RUNNING' | 'FINISHED'
- `Outcome` - 'success' | 'cycle' | 'dead_end' | 'error' | 'cancelled' | null
- `Article` - Article data with title, extract, thumbnail, url
- `JourneyState` - Current journey state container
- `SearchResult` - Search result item
- `PreviewResponse` - API preview response
- `StepResponse` - API step response
- `WikipediaSummary` - Wikipedia REST API structure
- `WikipediaOpenSearchResult` - OpenSearch tuple structure
- `Quote` - Philosophy quote structure

## Svelte 5 Runes Usage

**State Management:**

```typescript
let journeyState = $state<JourneyState>({...})
let searchQuery = $state('')
let searchResults = $state<SearchResult[]>([])
let isSearching = $state(false)
```

**Derived Values:**

```typescript
let cycleIndexes = $derived(() => {...})
let outcomeMessage = $derived(() => {...})
let isJourneyActive = $derived(...)
```

**Side Effects:**

```typescript
// Search debouncing
$effect(() => {
  if (searchQuery.trim()) {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => handleSearch(searchQuery), SEARCH_DEBOUNCE)
  }
})

// Auto-scroll on path changes
$effect(() => {
  if (journeyState.status === 'RUNNING' && pathContainer) {
    setTimeout(() => window.scrollTo({...}), SCROLL_DELAY)
  }
})
```

**Props:**

```typescript
// Component props use $props()
let { children } = $props()
```

## Styling System

**Theme Variables:**

- Uses CSS custom properties with OKLCH color space
- Dark mode support via `.dark` class
- Theme configured in `layout.css`
- Colors: background, foreground, primary, secondary, muted, accent, destructive, border, input, ring
- Radius: Configurable border radius (default: 0.625rem)

**Animations:**

- AutoAnimate for list additions/removals
- Custom `breathe` keyframe animation for loading indicator
- Smooth scrolling for journey progression
- Pulse animation for cycle detection

## Development Workflow

### Commands (using Bun)

```bash
bun run dev          # Start dev server
bun run build        # Production build
bun run preview      # Preview production build
bun run check        # Type checking
bun run format       # Format with Prettier
bun run lint         # Lint with ESLint
```

### Code Conventions

1. **TypeScript Strict Mode** - All files use strict typing
2. **Svelte 5 Runes** - Always use $state, $derived, $effect, $props
3. **Tailwind Classes** - Use utility classes, avoid custom CSS
4. **Component Organization** - UI components in `$lib/components/ui`
5. **API Routes** - Server logic in `+server.ts` files
6. **Type Safety** - Export/import types from `types.ts`

## Key Design Patterns

### 1. Debounced Search

Search input is debounced using `$effect()` with cleanup:

```typescript
$effect(() => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => handleSearch(searchQuery), SEARCH_DEBOUNCE)
})
```

### 2. Abort Controller Pattern

Journey uses AbortController for cancellation:

```typescript
abortController = new AbortController()
fetch(url, { signal: abortController.signal })
// Later: abortController.abort()
```

### 3. State Machine with Derived Values

Journey state is centralized with derived computed values:

```typescript
let journeyState = $state<JourneyState>({...})
let outcomeMessage = $derived(() => {
  switch (journeyState.outcome) { ... }
})
```

### 4. Progressive Enhancement

- Server-side API routes handle Wikipedia interaction
- Client handles UI state and animations
- Graceful fallbacks for failed API calls

## External APIs

### Wikipedia MediaWiki API

- **Endpoint:** `https://en.wikipedia.org/w/api.php`
- **Used For:**
  - Fetching article HTML (action=parse)
  - Search (action=opensearch)
  - Random articles (action=query, list=random)
- **Rate Limiting:** Respectful usage with User-Agent header
- **Documentation:** https://www.mediawiki.org/wiki/API:Main_page

### Wikipedia REST API

- **Endpoint:** `https://en.wikipedia.org/api/rest_v1`
- **Used For:** Article summaries with thumbnails
- **Documentation:** https://en.wikipedia.org/api/rest_v1/

## Error Handling

1. **Network Errors** - Try/catch blocks with fallback to 'error' outcome
2. **Invalid Articles** - Returns null preview, triggers dead_end
3. **Parse Errors** - Graceful degradation to basic info
4. **Abort Handling** - Checks `abortController.signal.aborted` before state updates

## Performance Optimizations

1. **API Caching** - Response caching via Cache-Control headers
2. **Section 0 Only** - Fetches only intro paragraph (not full article)
3. **Debounced Search** - Reduces API calls during typing
4. **AutoAnimate** - Hardware-accelerated animations
5. **Lazy Avatar Generation** - DiceBear avatars generated on-demand

## Accessibility

- Semantic HTML structure
- ARIA labels on icon buttons
- Keyboard navigation support
- Focus visible states
- Screen reader friendly
- Color contrast compliance (OKLCH color space)

## Testing Considerations

When testing or extending this application:

1. **Wikipedia API Changes** - Monitor for breaking changes in link structure
2. **Edge Cases** - Test with articles that have:
   - No valid links
   - Immediate cycles
   - Special characters in titles
   - SVG thumbnails vs raster images
3. **Performance** - Test with MAX_STEPS journeys
4. **Browser Compatibility** - Verify animations across browsers

## Future Enhancement Ideas

- Journey history/bookmarking
- Share journey via URL
- Statistics (most common paths, average steps)
- Multi-language support
- Journey visualization graph
- Export journey as image/PDF
- Alternative target articles
- Custom link selection rules
- Journey comparison tool

## Debugging Tips

1. **Link Parser Issues** - Check `wikipedia.ts` removePatterns and validation logic
2. **State Not Updating** - Verify Runes usage ($state, not plain variables)
3. **API Errors** - Check Network tab, verify User-Agent header
4. **Animation Glitches** - Check AutoAnimate dependencies and timing constants
5. **Type Errors** - Ensure all API responses match TypeScript interfaces

## Important Notes for AI Agents

1. **Always Use Svelte 5 Runes** - This project uses modern Svelte 5 syntax exclusively
2. **Follow Bun Conventions** - Use `bun` commands, not npm/yarn
3. **Respect Wikipedia** - Include User-Agent header, handle rate limiting
4. **Maintain Type Safety** - All new code must be strictly typed
5. **Use Existing UI Components** - Leverage shadcn-svelte components
6. **Test Link Parser** - Changes to wikipedia.ts require thorough testing
7. **Cache Appropriately** - Balance freshness with API respect
8. **Handle Edge Cases** - Wikipedia content is unpredictable

## Contact & Resources

- **Project Type:** Educational/Demonstrative
- **License:** (Check package.json or add LICENSE file)
- **Wikipedia Policies:** https://en.wikipedia.org/wiki/Wikipedia:Bots/Requests_for_approval
- **SvelteKit Docs:** https://kit.svelte.dev
- **Svelte 5 Docs:** https://svelte.dev/docs/svelte/overview

---

**Last Updated:** January 19, 2026
**Version:** 0.0.1
**Status:** Active Development
