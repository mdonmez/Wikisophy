<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import DicesIcon from '@lucide/svelte/icons/dices';
	import XIcon from '@lucide/svelte/icons/x';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import { PHILOSOPHY_QUOTES } from '$lib/quotes';
	import { fly } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import type { Article, SearchResult, JourneyState } from '$lib/types';
	import {
		MAX_STEPS,
		SEARCH_DEBOUNCE,
		SEARCH_LIMIT,
		TARGET_ARTICLE,
		SCROLL_DELAY,
		FINISH_SCROLL_DELAY
	} from '$lib/constants';
	import {
		searchArticles,
		fetchPreview,
		fetchRandomArticle,
		findNextStep
	} from '$lib/wikipedia-client';
	import { base } from '$app/paths';
	import * as Popover from '$lib/components/ui/popover/index.js';

	// State
	let journeyState = $state<JourneyState>({
		status: 'IDLE',
		path: [],
		outcome: null
	});

	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let isSearching = $state(false);
	let searchTimeout: number = 0;
	let abortController: AbortController | null = null;
	let visited = new Set<string>();
	let isLoadingInitial = $state(false);
	let isNearBottom = $state(true);

	// Derived states
	let cycleIndexes = $derived.by(() => {
		if (journeyState.outcome !== 'cycle' || journeyState.path.length === 0) return [];
		const lastTitle = journeyState.path[journeyState.path.length - 1].title.toLowerCase();
		const firstIndex = journeyState.path.findIndex((a) => a.title.toLowerCase() === lastTitle);
		return [firstIndex, journeyState.path.length - 1];
	});

	let outcomeMessage = $derived(() => {
		switch (journeyState.outcome) {
			case 'success':
				return `Philosophy was reached in ${journeyState.path.length} steps.`;
			case 'cycle':
				return "A loop was detected. You're going in circles!";
			case 'dead_end':
				return 'Dead end! This article has no valid links.';
			case 'error':
				return 'Something went wrong. Please try again.';
			case 'cancelled':
				return 'Journey cancelled.';
			default:
				return '';
		}
	});

	let randomQuote = $derived(() => {
		if (journeyState.outcome === 'success') {
			return PHILOSOPHY_QUOTES[Math.floor(Math.random() * PHILOSOPHY_QUOTES.length)];
		}
		return null;
	});

	let isJourneyActive = $derived(journeyState.status === 'RUNNING' || isLoadingInitial);

	// Memoization cache for avatar URLs and sentences
	const avatarCache = new Map<string, string>();
	const sentenceCache = new Map<string, string>();

	// Helper to get first sentence with caching
	function getFirstSentence(text: string): string {
		if (!text) return '';
		if (sentenceCache.has(text)) return sentenceCache.get(text)!;
		const match = text.match(/^[^.!?]+[.!?]/);
		const result = match ? match[0] : text.slice(0, 100) + '...';
		sentenceCache.set(text, result);
		return result;
	}

	// Generate DiceBear shapes avatar with caching
	function getAvatarUrl(title: string): string {
		if (avatarCache.has(title)) return avatarCache.get(title)!;
		const seed = encodeURIComponent(title);
		const url = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundColor=transparent`;
		avatarCache.set(title, url);
		return url;
	}

	// Search functionality
	async function handleSearch(query: string): Promise<void> {
		if (!query.trim()) {
			searchResults = [];
			return;
		}

		isSearching = true;
		try {
			const results = await searchArticles(query, SEARCH_LIMIT);
			searchResults = results;
		} catch (err) {
			console.error('Search error:', err);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	// Debounced search - watch searchQuery changes
	$effect(() => {
		if (searchQuery.trim()) {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				handleSearch(searchQuery);
			}, SEARCH_DEBOUNCE) as unknown as number;
		} else {
			searchResults = [];
		}
	});

	// Track whether user is near the bottom (ChatGPT-like behavior)
	$effect(() => {
		const updateNearBottom = () => {
			const scrollingElement = document.scrollingElement ?? document.documentElement;
			const distanceToBottom =
				scrollingElement.scrollHeight - scrollingElement.scrollTop - scrollingElement.clientHeight;
			isNearBottom = distanceToBottom <= 240;
		};

		updateNearBottom();
		window.addEventListener('scroll', updateNearBottom, { passive: true });
		window.addEventListener('resize', updateNearBottom, { passive: true });
		return () => {
			window.removeEventListener('scroll', updateNearBottom);
			window.removeEventListener('resize', updateNearBottom);
		};
	});

	// Auto-scroll while RUNNING only if user is near bottom
	$effect(() => {
		if (journeyState.path.length === 0) return;
		if (!isNearBottom) return;

		// Scroll if running or just finished
		if (journeyState.status === 'RUNNING') {
			const timeout = setTimeout(() => {
				scrollToBottom();
			}, SCROLL_DELAY);
			return () => clearTimeout(timeout);
		} else if (journeyState.status === 'FINISHED') {
			const timeout = setTimeout(() => {
				scrollToBottom();
			}, FINISH_SCROLL_DELAY);
			return () => clearTimeout(timeout);
		}
	});

	// Journey functions
	async function handleRandomArticle(): Promise<void> {
		// Clear existing path immediately and show loading state
		journeyState = {
			status: 'IDLE',
			path: [],
			outcome: null
		};
		isLoadingInitial = true;

		try {
			const title = await fetchRandomArticle();
			if (title) {
				await startJourney(title);
			} else {
				throw new Error('Failed to fetch random article');
			}
		} catch (err) {
			console.error('Random article failed:', err);
			journeyState = {
				status: 'FINISHED',
				path: [],
				outcome: 'error'
			};
		} finally {
			isLoadingInitial = false;
		}
	}

	async function startJourney(initialTitle: string): Promise<void> {
		// Reset state
		abortController = new AbortController();
		visited.clear();
		isLoadingInitial = true;

		// Fetch initial article preview
		try {
			const previewData = await fetchPreview(initialTitle);

			if (!previewData) {
				throw new Error('Failed to fetch initial article');
			}

			const firstArticle: Article = {
				title: previewData.title,
				extract: previewData.extract ?? '',
				thumbnail: previewData.thumbnail ?? null,
				url: `https://en.wikipedia.org/wiki/${encodeURIComponent(previewData.title)}`
			};

			journeyState = {
				status: 'RUNNING',
				path: [firstArticle],
				outcome: null
			};

			// Clear search
			searchQuery = '';
			searchResults = [];
			isLoadingInitial = false;
			isNearBottom = true;

			// Start the loop
			let currentTitle = initialTitle;

			for (let step = 0; step < MAX_STEPS; step++) {
				// Check abort
				if (abortController.signal.aborted) {
					journeyState = {
						...journeyState,
						status: 'FINISHED',
						outcome: 'cancelled'
					};
					return;
				}

				// Check success
				if (currentTitle.toLowerCase() === TARGET_ARTICLE) {
					journeyState = {
						...journeyState,
						status: 'FINISHED',
						outcome: 'success'
					};
					return;
				}

				// Check cycle
				if (visited.has(currentTitle.toLowerCase())) {
					journeyState = {
						...journeyState,
						status: 'FINISHED',
						outcome: 'cycle'
					};
					return;
				}
				visited.add(currentTitle.toLowerCase());

				// Fetch next step
				try {
					const stepData = await findNextStep(currentTitle);

					// Check dead end
					if (!stepData.nextLink || !stepData.nextPreview) {
						journeyState = {
							...journeyState,
							status: 'FINISHED',
							outcome: 'dead_end'
						};
						return;
					}

					// Add to path - use direct mutation instead of spreading
					const nextArticle: Article = {
						title: stepData.nextPreview.title,
						extract: stepData.nextPreview.extract ?? '',
						thumbnail: stepData.nextPreview.thumbnail ?? null,
						url: `https://en.wikipedia.org${stepData.nextLink}`
					};

					journeyState.path.push(nextArticle);
					journeyState.status = 'RUNNING';
					currentTitle = stepData.nextPreview.title;
				} catch (err) {
					if (!abortController.signal.aborted) {
						journeyState = {
							...journeyState,
							status: 'FINISHED',
							outcome: 'error'
						};
					}
					return;
				}
			}

			// Max steps reached
			journeyState = {
				...journeyState,
				status: 'FINISHED',
				outcome: 'dead_end'
			};
		} catch (err) {
			console.error('Journey error:', err);
			if (!abortController?.signal.aborted) {
				journeyState = {
					status: 'FINISHED',
					path: journeyState.path.length > 0 ? journeyState.path : [],
					outcome: 'error'
				};
			}
			isLoadingInitial = false;
		}
	}

	function cancelJourney(): void {
		if (abortController) {
			abortController.abort();
		}
		journeyState = {
			...journeyState,
			status: 'FINISHED',
			outcome: 'cancelled'
		};
		isLoadingInitial = false;
	}

	function resetJourney(): void {
		journeyState = {
			status: 'IDLE',
			path: [],
			outcome: null
		};
		visited.clear();
		abortController = null;
		isLoadingInitial = false;
		isNearBottom = true;
	}

	function scrollToBottom(): void {
		const scrollingElement = document.scrollingElement ?? document.documentElement;
		window.scrollTo({ top: scrollingElement.scrollHeight, behavior: 'smooth' });
	}
</script>

<!-- Header -->
<header class="sticky top-0 z-50 w-full border-b bg-background">
	<div class="flex items-center justify-between px-4 py-2">
		<div class="logo-transition">
			{#if mode.current === 'light'}
				<img src="{base}/logo_black.svg" alt="Wikisophy Logo" class="h-12 w-12" />
			{:else}
				<img src="{base}/logo_white.svg" alt="Wikisophy Logo" class="h-12 w-12" />
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<Popover.Root>
				<Popover.Trigger
					class={buttonVariants({ variant: 'outline', size: 'icon' })}
					aria-label="About Wikisophy"
				>
					<!-- simple info glyph -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
						/>
					</svg>
				</Popover.Trigger>
				<Popover.Content side="top" align="end" sideOffset={4} class="z-50 w-64 p-3 text-sm">
					<p>
						Wikisophy is an interactive demonstration of the
						<a
							href="https://en.wikipedia.org/wiki/Wikipedia:Getting_to_Philosophy"
							target="_blank"
							rel="noopener noreferrer"
							class="underline"
						>
							Wikipedia's Getting to Philosophy
						</a>
						phenomenon. This project is licensed under the
						<a
							href="https://github.com/mdonmez/wikisophy/blob/main/LICENSE"
							target="_blank"
							rel="noopener noreferrer"
							class="underline">MIT License</a
						>
						and source code is
						<a
							href="https://github.com/mdonmez/wikisophy"
							target="_blank"
							rel="noopener noreferrer"
							class="underline">available</a
						>.
					</p>
				</Popover.Content>
			</Popover.Root>

			<Button
				onclick={() => {
					// Add theme-changing class to prevent transition flicker
					document.body.classList.add('theme-changing');
					toggleMode();
					// Remove the class after a brief delay
					setTimeout(() => {
						document.body.classList.remove('theme-changing');
					}, 50);
				}}
				variant="outline"
				size="icon"
			>
				<SunIcon
					class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-90"
				/>
				<MoonIcon
					class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"
				/>
				<span class="sr-only">Toggle theme</span>
			</Button>

			{#if isJourneyActive}
				<div
					in:fly={{ x: 50, duration: 250, easing: cubicInOut }}
					out:fly={{ x: 50, duration: 250, easing: cubicInOut }}
				>
					<Button
						variant="destructive"
						size="icon"
						aria-label="Cancel journey"
						onclick={cancelJourney}
					>
						<XIcon />
					</Button>
				</div>
			{/if}
		</div>
	</div>
</header>

<!-- Main Content -->
<div class="container mx-auto px-4">
	<main class="py-8">
		<!-- Hero Section -->
		<div class="mx-auto flex max-w-3xl flex-col gap-6 pt-2">
			<h1 class="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
				Philosophy, origin of everything.
			</h1>

			<h4 class="scroll-m-20 text-xl font-semibold tracking-tight">
				Did you know that if you follow the first links in almost all Wikipedia articles, you can
				end up at philosophy?
			</h4>
		</div>

		<!-- Search Bar -->
		<div class="mx-auto mt-8 flex max-w-3xl items-start gap-3">
			<Button
				variant="outline"
				size="icon"
				aria-label="Random article"
				class="h-9.5 w-9.5 shrink-0"
				onclick={handleRandomArticle}
				disabled={isJourneyActive}
			>
				<DicesIcon />
			</Button>
			<Command.Root class="flex-1 rounded-md border shadow-xs" shouldFilter={false}>
				<Command.Input
					placeholder="Search Wikipedia article..."
					bind:value={searchQuery}
					disabled={isJourneyActive}
				/>
				{#if searchQuery.trim() !== '' && searchResults.length > 0}
					<Command.List class="border-t">
						<Command.Group>
							{#each searchResults as result}
								<Command.Item
									value={result.title}
									onSelect={() => {
										startJourney(result.title);
									}}
								>
									<div class="flex flex-col gap-1">
										<div class="font-medium">{result.title}</div>
										{#if result.description}
											<div class="text-xs text-muted-foreground">{result.description}</div>
										{/if}
									</div>
								</Command.Item>
							{/each}
						</Command.Group>
					</Command.List>
				{:else if searchQuery.trim() !== '' && !isSearching}
					<Command.List class="border-t">
						<Command.Empty>No results found.</Command.Empty>
					</Command.List>
				{/if}
			</Command.Root>
		</div>

		<!-- Path Section -->
		{#if journeyState.path.length > 0 || journeyState.status === 'RUNNING' || isLoadingInitial}
			<div class="mx-auto mt-12 max-w-3xl">
				<div class="flex flex-col gap-4">
					{#each journeyState.path as article, index (article.title + index)}
						{@const isCycleItem = cycleIndexes.includes(index)}
						<Item.Root
							variant="outline"
							class={`transition-shadow hover:shadow-md ${isCycleItem ? 'animate-pulse border-red-500' : ''}`}
						>
							{#snippet child({ props })}
								<a href={article.url} target="_blank" rel="noopener noreferrer" {...props}>
									<div class="flex items-center gap-3">
										<Badge class="h-5 w-7 rounded-sm px-1 font-mono tabular-nums">
											{index + 1}
										</Badge>
									</div>
									<Item.Media variant="image">
										{#if article.thumbnail}
											{@const isSvg = article.thumbnail.includes('.svg')}
											<img
												src={article.thumbnail}
												alt={article.title}
												width="32"
												height="32"
												class={`size-8 rounded object-cover ${isSvg ? 'bg-white p-0.5' : ''}`}
											/>
										{:else}
											<img
												src={getAvatarUrl(article.title)}
												alt={article.title}
												width="32"
												height="32"
												class="size-8 rounded bg-muted/50 p-0.5 opacity-70"
											/>
										{/if}
									</Item.Media>
									<Item.Content>
										<Item.Title>{article.title}</Item.Title>
										<Item.Description>{getFirstSentence(article.extract)}</Item.Description>
									</Item.Content>
								</a>
							{/snippet}
						</Item.Root>
					{/each}

					<!-- Loading Indicator -->
					{#if journeyState.status === 'RUNNING' || isLoadingInitial}
						{#key 'loading-indicator'}
							<Item.Root variant="outline">
								{#snippet child({ props })}
									<div {...props} class="flex items-center justify-center py-4">
										<div
											class="h-2 w-2 animate-[breathe_3s_ease-in-out_infinite] rounded-full bg-foreground"
										></div>
									</div>
								{/snippet}
							</Item.Root>
						{/key}
					{/if}
				</div>
			</div>
		{/if}

		<!-- Outcome Message and Actions -->
		<div>
			{#if journeyState.status === 'FINISHED' && journeyState.outcome}
				<div class="mx-auto mt-12 max-w-3xl text-center">
					<div class="mb-6 text-lg font-semibold">
						{outcomeMessage()}
					</div>
				</div>
			{/if}

			<!-- Quote Section (Success Only) -->
			{#if journeyState.outcome === 'success' && randomQuote()}
				{@const quote = randomQuote()}
				{#if quote}
					<div class="mx-auto mt-12 max-w-3xl">
						<blockquote class="border-s-2 ps-6 italic">
							{quote.text} — {quote.author}
						</blockquote>
					</div>
				{/if}
			{/if}

			<!-- New Journey Button -->
			{#if journeyState.status === 'FINISHED' && journeyState.outcome}
				<div class="mx-auto mt-12 max-w-3xl text-center">
					<Button onclick={resetJourney}>Start a New Journey</Button>
				</div>
			{/if}
		</div>
	</main>
</div>

<!-- Floating Action Button: Show Latest -->
{#if !isNearBottom && journeyState.status !== 'IDLE' && journeyState.path.length > 0}
	<div
		in:fly={{ y: 100, duration: 300, easing: cubicInOut }}
		out:fly={{ y: 100, duration: 300, easing: cubicInOut }}
		class="fixed bottom-8 left-1/2 z-50 -translate-x-1/2"
	>
		<Button
			onclick={scrollToBottom}
			size="icon"
			class="shadow-lg"
			aria-label="Scroll to latest article"
		>
			<ChevronDownIcon />
		</Button>
	</div>
{/if}
