<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import DicesIcon from '@lucide/svelte/icons/dices';
	import XIcon from '@lucide/svelte/icons/x';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import AtomIcon from '@lucide/svelte/icons/atom';
	import LineSquiggleIcon from '@lucide/svelte/icons/line-squiggle';
	import EarthIcon from '@lucide/svelte/icons/earth';
	import OmegaIcon from '@lucide/svelte/icons/omega';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import MusicIcon from '@lucide/svelte/icons/music';
	import SigmaIcon from '@lucide/svelte/icons/sigma';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import HeartPulseIcon from '@lucide/svelte/icons/heart-pulse';
	import BookOpenTextIcon from '@lucide/svelte/icons/book-open-text';
	import LandmarkIcon from '@lucide/svelte/icons/landmark';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import { PHILOSOPHY_QUOTES } from '$lib/quotes';
	import { loadCacheMap, persistCacheMap, touchMapEntry } from '$lib/localStorageCache';
	import { fly } from 'svelte/transition';
	import { untrack } from 'svelte';
	import { cubicInOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Article, SearchResult, JourneyState, DisambiguationOption } from '$lib/types';
	import {
		MAX_STEPS,
		SEARCH_DEBOUNCE,
		SEARCH_LIMIT,
		TARGET_ARTICLE,
		SCROLL_DELAY,
		FINISH_SCROLL_DELAY,
		STEP_DELAY
	} from '$lib/constants';
	import {
		searchArticles,
		fetchPreview,
		fetchRandomArticle,
		fetchCategoryStarter,
		findNextStep,
		fetchDisambiguationOptions
	} from '$lib/wikipedia-client';
	import { base } from '$app/paths';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import autoAnimate from '@formkit/auto-animate';

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
	let searchAbortController: AbortController | null = null;
	let abortController: AbortController | null = null;
	let journeyStartTitle = $state<string | null>(null);
	let visited = new SvelteSet<string>();
	let isLoadingInitial = $state(false);
	let isNearBottom = $state(true);
	let bottomSentinel = $state<HTMLElement | null>(null);
	let pathContainer = $state<HTMLElement | null>(null);
	let starterCategoriesContainer = $state<HTMLElement | null>(null);
	let disambiguationOptionsContainer = $state<HTMLElement | null>(null);
	let disambiguationOpen = $state(false);
	let disambiguationSourceTitle = $state('');
	let disambiguationOptions = $state<DisambiguationOption[]>([]);
	let disambiguationResolver: ((title: string | null) => void) | null = null;
	let wasDisambiguationOpen = false;
	let previousHtmlOverflow: string | null = null;

	// Derived states
	let cycleIndexes = $derived.by(() => {
		if (journeyState.outcome !== 'cycle' || journeyState.path.length === 0) return [];
		const lastTitle = journeyState.path[journeyState.path.length - 1].title.toLowerCase();
		const firstIndex = journeyState.path.findIndex((a) => a.title.toLowerCase() === lastTitle);
		return [firstIndex, journeyState.path.length - 1];
	});

	let outcomeMessage = $derived.by(() => {
		switch (journeyState.outcome) {
			case 'success': {
				const nonDisambiguationCount = journeyState.path.filter(
					(article) => !article.isDisambiguation
				).length;
				return `Philosophy was reached in ${nonDisambiguationCount} steps.`;
			}
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

	let randomQuote = $state<(typeof PHILOSOPHY_QUOTES)[number] | null>(null);

	let isJourneyActive = $derived(journeyState.status === 'RUNNING' || isLoadingInitial);
	let showStarterCategories = $derived(
		journeyState.status === 'IDLE' &&
			journeyState.path.length === 0 &&
			searchQuery.trim() === '' &&
			!isLoadingInitial
	);

	const starterCategories = [
		{
			label: 'Science',
			categoryTitles: ['Category:Science'],
			icon: AtomIcon,
			colorClass: 'text-cyan-500'
		},
		{
			label: 'Art',
			categoryTitles: ['Category:The arts'],
			icon: LineSquiggleIcon,
			colorClass: 'text-rose-500'
		},
		{
			label: 'History',
			categoryTitles: ['Category:History'],
			icon: EarthIcon,
			colorClass: 'text-emerald-500'
		},
		{
			label: 'Philosophy',
			categoryTitles: ['Category:Philosophy'],
			icon: OmegaIcon,
			colorClass: 'text-amber-500'
		},
		{
			label: 'Literature',
			categoryTitles: ['Category:Literature'],
			icon: BookOpenTextIcon,
			colorClass: 'text-sky-500'
		},
		{
			label: 'Technology',
			categoryTitles: ['Category:Technology'],
			icon: CpuIcon,
			colorClass: 'text-lime-500'
		},
		{
			label: 'Music',
			categoryTitles: ['Category:Music'],
			icon: MusicIcon,
			colorClass: 'text-fuchsia-500'
		},
		{
			label: 'Mathematics',
			categoryTitles: ['Category:Mathematics'],
			icon: SigmaIcon,
			colorClass: 'text-indigo-500'
		},
		{
			label: 'Geography',
			categoryTitles: ['Category:Geography'],
			icon: GlobeIcon,
			colorClass: 'text-teal-500'
		},
		{
			label: 'Sports',
			categoryTitles: ['Category:Sports'],
			icon: TrophyIcon,
			colorClass: 'text-orange-500'
		},
		{
			label: 'Medicine',
			categoryTitles: ['Category:Medicine'],
			icon: HeartPulseIcon,
			colorClass: 'text-red-500'
		},
		{
			label: 'Politics',
			categoryTitles: ['Category:Politics'],
			icon: LandmarkIcon,
			colorClass: 'text-violet-500'
		}
	] as const;

	const LOCAL_CACHE_LIMIT = 100;
	const AVATAR_CACHE_KEY = 'wikisophy.avatarCache.v1';
	const SENTENCE_CACHE_KEY = 'wikisophy.sentenceCache.v1';

	// Memoization cache for avatar URLs and sentences (plain Map — not reactive)
	const avatarCache = loadCacheMap<string>(AVATAR_CACHE_KEY);
	const sentenceCache = loadCacheMap<string>(SENTENCE_CACHE_KEY);

	// Helper to get first sentence with caching
	function getFirstSentence(text: string): string {
		if (!text) return '';
		const cachedSentence = touchMapEntry(sentenceCache, text);
		if (cachedSentence !== undefined) return cachedSentence;
		const match = text.match(/^[^.!?]+[.!?]/);
		const result = match ? match[0] : text.slice(0, 100) + '…';
		sentenceCache.set(text, result);
		persistCacheMap(SENTENCE_CACHE_KEY, sentenceCache, LOCAL_CACHE_LIMIT);
		return result;
	}

	// Generate DiceBear shapes avatar with caching
	function getAvatarUrl(title: string): string {
		const cachedAvatar = touchMapEntry(avatarCache, title);
		if (cachedAvatar !== undefined) return cachedAvatar;
		const seed = encodeURIComponent(title);
		const url = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundColor=transparent`;
		avatarCache.set(title, url);
		persistCacheMap(AVATAR_CACHE_KEY, avatarCache, LOCAL_CACHE_LIMIT);
		return url;
	}

	// Search functionality
	async function handleSearch(query: string): Promise<void> {
		if (!query.trim()) {
			searchResults = [];
			return;
		}

		searchAbortController?.abort();
		const controller = new AbortController();
		searchAbortController = controller;

		isSearching = true;
		try {
			const results = await searchArticles(query, SEARCH_LIMIT, controller.signal);
			if (!controller.signal.aborted) {
				searchResults = results;
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				console.error('Search error:', err);
				searchResults = [];
			}
		} finally {
			if (!controller.signal.aborted) {
				isSearching = false;
			}
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
		if (wasDisambiguationOpen && !disambiguationOpen && disambiguationResolver) {
			cancelDisambiguationSelection();
		}
		wasDisambiguationOpen = disambiguationOpen;
	});

	$effect(() => {
		if (typeof document === 'undefined') return;

		if (disambiguationOpen) {
			if (previousHtmlOverflow === null) {
				previousHtmlOverflow = document.documentElement.style.overflow;
			}
			document.documentElement.style.overflow = 'hidden';
			return;
		}

		if (previousHtmlOverflow !== null) {
			document.documentElement.style.overflow = previousHtmlOverflow;
			previousHtmlOverflow = null;
		}
	});

	$effect(() => {
		if (!bottomSentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				isNearBottom = entry.isIntersecting;
			},
			{ rootMargin: '0px 0px 240px 0px' }
		);
		observer.observe(bottomSentinel);
		return () => observer.disconnect();
	});

	$effect(() => {
		return () => {
			if (typeof document === 'undefined') return;
			if (previousHtmlOverflow !== null) {
				document.documentElement.style.overflow = previousHtmlOverflow;
				previousHtmlOverflow = null;
			}
		};
	});

	$effect(() => {
		if (!pathContainer) return;
		const controller = autoAnimate(pathContainer, { duration: 250, easing: 'ease-in-out' });
		return () => controller.destroy?.();
	});

	$effect(() => {
		if (!starterCategoriesContainer) return;
		const controller = autoAnimate(starterCategoriesContainer, {
			duration: 220,
			easing: 'ease-in-out'
		});
		return () => controller.destroy?.();
	});

	$effect(() => {
		if (!disambiguationOptionsContainer) return;
		const controller = autoAnimate(disambiguationOptionsContainer, {
			duration: 200,
			easing: 'ease-in-out'
		});
		return () => controller.destroy?.();
	});

	// Auto-scroll while RUNNING only if user is near bottom
	$effect(() => {
		if (journeyState.path.length === 0) return;
		// Read isNearBottom without tracking it — IntersectionObserver fires as content
		// grows, which would otherwise cancel the pending scroll timeout mid-flight.
		if (!untrack(() => isNearBottom)) return;

		// Scroll if running or just finished
		if (journeyState.status === 'RUNNING') {
			const timeout = setTimeout(scrollToBottom, SCROLL_DELAY);
			return () => clearTimeout(timeout);
		} else if (journeyState.status === 'FINISHED') {
			const timeout = setTimeout(scrollToBottom, FINISH_SCROLL_DELAY);
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

	async function handleCategoryStarter(categoryTitles: readonly string[]): Promise<void> {
		if (isJourneyActive) return;
		isLoadingInitial = true;

		try {
			const title = await fetchCategoryStarter(categoryTitles);
			if (title) {
				startJourney(title);
				return;
			}
			throw new Error('Failed to fetch category starter');
		} catch (err) {
			console.error('Category starter failed:', err);
			journeyState = {
				status: 'FINISHED',
				path: [],
				outcome: 'error'
			};
			isLoadingInitial = false;
		}
	}

	async function startJourney(initialTitle: string): Promise<void> {
		// Reset state
		journeyStartTitle = initialTitle;
		abortController = new AbortController();
		const signal = abortController.signal;
		visited.clear();
		isLoadingInitial = true;

		// Fetch initial article preview
		try {
			const previewData = await fetchPreview(initialTitle, signal);

			if (!previewData) {
				throw new Error('Failed to fetch initial article');
			}

			const firstArticle: Article = {
				title: previewData.title,
				extract: previewData.extract ?? '',
				thumbnail: previewData.thumbnail ?? null,
				url: `https://en.wikipedia.org/wiki/${encodeURIComponent(previewData.title)}`,
				isDisambiguation: previewData.isDisambiguation
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

			// Resolve possible disambiguation chain for the starting point
			let currentPreview = previewData;
			let currentTitle = currentPreview.title;

			while (currentPreview.isDisambiguation) {
				const options = await fetchDisambiguationOptions(currentPreview.title, signal);

				if (options.length === 0) {
					journeyState = {
						...journeyState,
						status: 'FINISHED',
						outcome: 'dead_end'
					};
					return;
				}

				const selectedTitle = await promptDisambiguationSelection(currentPreview.title, options);
				if (!selectedTitle) {
					return;
				}

				const selectedPreview = await fetchPreview(selectedTitle, signal);
				if (!selectedPreview) {
					journeyState = {
						...journeyState,
						status: 'FINISHED',
						outcome: 'error'
					};
					return;
				}

				const selectedArticle: Article = {
					title: selectedPreview.title,
					extract: selectedPreview.extract ?? '',
					thumbnail: selectedPreview.thumbnail ?? null,
					url: `https://en.wikipedia.org/wiki/${encodeURIComponent(selectedPreview.title)}`,
					isDisambiguation: selectedPreview.isDisambiguation
				};

				journeyState = { ...journeyState, path: [...journeyState.path, selectedArticle] };
				currentPreview = selectedPreview;
				currentTitle = selectedPreview.title;
			}

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
					randomQuote = PHILOSOPHY_QUOTES[Math.floor(Math.random() * PHILOSOPHY_QUOTES.length)];
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
					const [stepData] = await Promise.all([
						findNextStep(currentTitle, signal),
						new Promise((r) => setTimeout(r, STEP_DELAY))
					]);
					if (signal.aborted) return;

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
						url: `https://en.wikipedia.org${stepData.nextLink}`,
						isDisambiguation: stepData.nextPreview.isDisambiguation
					};

					journeyState = {
						...journeyState,
						path: [...journeyState.path, nextArticle],
						status: 'RUNNING'
					};
					currentTitle = stepData.nextPreview.title;
				} catch {
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
		resolveDisambiguationSelection(null);
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
		journeyStartTitle = null;
		randomQuote = null;
		closeDisambiguationDialog();
		isLoadingInitial = false;
		isNearBottom = true;
	}

	function scrollToBottom(): void {
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
	}

	function getBadgeLabel(article: Article, index: number): string | number {
		if (article.isDisambiguation) {
			return 'D';
		}

		let latestDisambiguationIndex = -1;
		for (let cursor = index; cursor >= 0; cursor--) {
			if (journeyState.path[cursor]?.isDisambiguation) {
				latestDisambiguationIndex = cursor;
				break;
			}
		}

		return index - latestDisambiguationIndex;
	}

	function promptDisambiguationSelection(
		sourceTitle: string,
		options: DisambiguationOption[]
	): Promise<string | null> {
		disambiguationSourceTitle = sourceTitle;
		disambiguationOptions = options;
		disambiguationOpen = true;

		return new Promise((resolve) => {
			disambiguationResolver = resolve;
		});
	}

	function resolveDisambiguationSelection(title: string | null): void {
		const resolver = disambiguationResolver;
		disambiguationResolver = null;
		closeDisambiguationDialog();
		resolver?.(title);
	}

	function cancelDisambiguationSelection(): void {
		if (!disambiguationResolver) {
			closeDisambiguationDialog();
			return;
		}

		abortController?.abort();
		resolveDisambiguationSelection(null);
		resetJourney();
	}

	function closeDisambiguationDialog(): void {
		disambiguationOpen = false;
		disambiguationSourceTitle = '';
		disambiguationOptions = [];
	}
</script>

<svelte:head>
	<title>Wikisophy — Wikipedia to Philosophy Journey</title>
	<meta
		name="description"
		content="Explore the Wikipedia 'Getting to Philosophy' phenomenon. Start from any article and follow the first link to reach Philosophy."
	/>
</svelte:head>

<div class="flex min-h-screen flex-col bg-background font-sans text-foreground">
	<!-- Header -->
	<header class="fixed top-0 left-0 z-50 w-full border-b bg-background">
		<div class="flex items-center justify-between px-4 py-2">
			<div class="flex items-center gap-3">
				<div class="logo-transition">
					{#if mode.current === 'light'}
						<img src="{base}/logo_black.svg" alt="Wikisophy Logo" class="h-12 w-12" />
					{:else}
						<img src="{base}/logo_white.svg" alt="Wikisophy Logo" class="h-12 w-12" />
					{/if}
				</div>
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
	<div class="container mx-auto px-4 pt-16">
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
								{#each searchResults as result (result.title)}
									<Command.Item
										value={result.title}
										onSelect={() => {
											startJourney(result.title);
										}}
									>
										<div class="flex flex-col gap-1">
											<div class="font-medium">{result.title}</div>
											{#if result.description}
												<div class="line-clamp-1 text-xs text-muted-foreground">
													{result.description}
												</div>
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

			<!-- Try These Starters -->
			<div bind:this={starterCategoriesContainer} class="mx-auto mt-6 max-w-3xl">
				{#if showStarterCategories}
					<div class="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
						Try these starters
					</div>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each starterCategories as category (category.label)}
							{@const CategoryIcon = category.icon}
							<Button
								variant="outline"
								class="h-auto justify-start gap-3 px-3 py-3"
								onclick={() => handleCategoryStarter(category.categoryTitles)}
								disabled={isJourneyActive}
							>
								<span class="grid size-9 place-items-center">
									<CategoryIcon class={`h-5 w-5 ${category.colorClass}`} />
								</span>
								<span class="text-sm font-medium">{category.label}</span>
							</Button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Path Section -->
			{#if journeyState.path.length > 0 || journeyState.status === 'RUNNING' || isLoadingInitial}
				<div class="mx-auto mt-12 max-w-3xl">
					<div bind:this={pathContainer} class="flex flex-col gap-4">
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
												{getBadgeLabel(article, index)}
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
											<Item.Description class="line-clamp-1"
												>{article.isDisambiguation
													? 'Disambiguation Page'
													: getFirstSentence(article.extract)}</Item.Description
											>
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
							{outcomeMessage}
						</div>
					</div>
				{/if}

				<!-- Quote Section (Success Only) -->
				{#if journeyState.outcome === 'success' && randomQuote}
					<div class="mx-auto mt-12 max-w-3xl">
						<blockquote class="border-s-2 ps-6 italic">
							{randomQuote.text} — {randomQuote.author}
						</blockquote>
					</div>
				{/if}

				<!-- New Journey Button -->
				{#if journeyState.status === 'FINISHED' && journeyState.outcome}
					<div class="mx-auto mt-12 flex max-w-3xl justify-center gap-3">
						{#if journeyState.outcome === 'error' && journeyStartTitle}
							<Button variant="outline" onclick={() => startJourney(journeyStartTitle!)}
								>Try Again</Button
							>
						{/if}
						<Button onclick={resetJourney}>Start a New Journey</Button>
					</div>
				{/if}
			</div>
		</main>
		<div bind:this={bottomSentinel} aria-hidden="true" class="h-0"></div>
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

	<Dialog.Root bind:open={disambiguationOpen}>
		<Dialog.Content showCloseButton={false} class="max-h-[80vh] overflow-hidden sm:max-w-2xl">
			<div class="flex items-start justify-between gap-4">
				<Dialog.Header class="text-left">
					<Dialog.Title>Choose a topic</Dialog.Title>
					<Dialog.Description>
						{disambiguationSourceTitle} is a disambiguation page. Select an article to continue.
					</Dialog.Description>
				</Dialog.Header>
				<Button variant="destructive" class="shrink-0" onclick={cancelDisambiguationSelection}
					>Cancel journey</Button
				>
			</div>

			<div
				bind:this={disambiguationOptionsContainer}
				class="mt-2 flex max-h-[52vh] flex-col gap-2 overflow-y-auto pe-1"
			>
				{#each disambiguationOptions as option (option.title)}
					<Button
						variant="outline"
						class="h-auto w-full justify-start px-3 py-2 text-left"
						onclick={() => resolveDisambiguationSelection(option.title)}
					>
						<span class="font-medium">{option.title}</span>
					</Button>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Root>
</div>
