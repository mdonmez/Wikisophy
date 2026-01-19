<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import DicesIcon from '@lucide/svelte/icons/dices';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import { PHILOSOPHY_QUOTES } from '$lib/quotes';
	import autoAnimate from '@formkit/auto-animate';
	import type { Article, SearchResult, JourneyState } from '$lib/types';
	import {
		fetchArticlePreview,
		fetchRandomArticle,
		searchArticles,
		performStep
	} from '$lib/wikipedia';
	import {
		MAX_STEPS,
		SEARCH_DEBOUNCE,
		SEARCH_LIMIT,
		TARGET_ARTICLE,
		SCROLL_DELAY,
		FINISH_SCROLL_DELAY
	} from '$lib/constants';

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
	let pathContainer = $state<HTMLDivElement | null>(null);
	let isLoadingInitial = $state(false);

	// Derived states
	let cycleIndexes = $derived(() => {
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

	// Helper to get first sentence
	function getFirstSentence(text: string): string {
		if (!text) return '';
		const match = text.match(/^[^.!?]+[.!?]/);
		return match ? match[0] : text.slice(0, 100) + '...';
	}

	// Generate DiceBear shapes avatar
	function getAvatarUrl(title: string): string {
		const seed = encodeURIComponent(title);
		return `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundColor=transparent`;
	}

	// Search functionality
	async function handleSearch(query: string): Promise<void> {
		if (!query.trim()) {
			searchResults = [];
			return;
		}

		isSearching = true;
		try {
			searchResults = await searchArticles(query, SEARCH_LIMIT);
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

	// Auto-scroll to bottom when path changes (after item is added)
	$effect(() => {
		if (journeyState.status === 'RUNNING' && pathContainer && journeyState.path.length > 0) {
			// Wait for AutoAnimate to complete the item addition
			setTimeout(() => {
				if (pathContainer && journeyState.status === 'RUNNING') {
					const scrollTarget = pathContainer.offsetTop + pathContainer.scrollHeight;
					window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
				}
			}, SCROLL_DELAY);
		}
	});

	// Scroll to bottom once when journey finishes
	$effect(() => {
		if (journeyState.status === 'FINISHED' && pathContainer) {
			setTimeout(() => {
				if (pathContainer) {
					const scrollTarget = pathContainer.offsetTop + pathContainer.scrollHeight;
					window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
				}
			}, FINISH_SCROLL_DELAY);
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
			const previewData = await fetchArticlePreview(initialTitle);

			if (!previewData) {
				throw new Error('Failed to fetch initial article');
			}

			const firstArticle: Article = {
				title: previewData.title,
				extract: previewData.extract ?? '',
				thumbnail: previewData.thumbnail ?? null,
				url: `/wiki/${encodeURIComponent(previewData.title)}`
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
					const stepData = await performStep(currentTitle);

					// Check dead end
					if (!stepData.nextLink || !stepData.nextPreview) {
						journeyState = {
							...journeyState,
							status: 'FINISHED',
							outcome: 'dead_end'
						};
						return;
					}

					// Add to path
					const nextArticle: Article = {
						title: stepData.nextPreview.title,
						extract: stepData.nextPreview.extract ?? '',
						thumbnail: stepData.nextPreview.thumbnail ?? null,
						url: stepData.nextLink
					};

					journeyState = {
						...journeyState,
						path: [...journeyState.path, nextArticle]
					};
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
	}
</script>

<!-- Header -->
<header class="w-full border-b">
	<div class="flex items-center justify-between px-4 py-2">
		{#if mode.current === 'light'}
			<img src="/logo_black.svg" alt="Wikisophy Logo" class="h-12 w-12" />
		{:else}
			<img src="/logo_white.svg" alt="Wikisophy Logo" class="h-12 w-12" />
		{/if}

		<Button onclick={toggleMode} variant="outline" size="icon">
			<SunIcon
				class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 !transition-all dark:scale-0 dark:-rotate-90"
			/>
			<MoonIcon
				class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 !transition-all dark:scale-100 dark:rotate-0"
			/>
			<span class="sr-only">Toggle theme</span>
		</Button>
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
		<div class="mx-auto mt-8 flex max-w-3xl items-start gap-3" use:autoAnimate>
			<Button
				variant="outline"
				size="icon"
				aria-label="Random article"
				class="h-[38px] w-[38px] shrink-0"
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

			{#if isJourneyActive}
				<Button
					variant="destructive"
					size="icon"
					aria-label="Cancel journey"
					class="h-[38px] w-[38px] shrink-0"
					onclick={cancelJourney}
				>
					<XIcon />
				</Button>
			{/if}
		</div>

		<!-- Path Section -->
		{#if journeyState.path.length > 0 || journeyState.status === 'RUNNING' || isLoadingInitial}
			<div class="mx-auto mt-12 max-w-3xl" bind:this={pathContainer}>
				<div class="flex flex-col gap-4" use:autoAnimate>
					{#each journeyState.path as article, index (article.title + index)}
						{@const isCycleItem = cycleIndexes().includes(index)}
						<Item.Root
							variant="outline"
							class={`transition-shadow hover:shadow-md ${isCycleItem ? 'animate-pulse border-red-500' : ''}`}
						>
							{#snippet child({ props })}
								<a
									href={`https://en.wikipedia.org${article.url}`}
									target="_blank"
									rel="noopener noreferrer"
									{...props}
								>
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
		<div use:autoAnimate>
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
