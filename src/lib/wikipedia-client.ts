/**
 * Client-side Wikipedia API utilities for GitHub Pages static export
 * All functions make direct calls to Wikipedia REST and MediaWiki APIs
 */

import {
	WIKIPEDIA_API_URL,
	WIKIPEDIA_REST_API_URL,
	RANDOM_ARTICLE_MAX_ATTEMPTS,
	SEARCH_LIMIT,
	LINK_FALLBACK_SECTION_MAX
} from './constants';
import type {
	SearchResult,
	PreviewResponse,
	StepResponse,
	DisambiguationOption,
	WikipediaSummary,
	WikipediaOpenSearchResult,
	WikipediaRandomResult,
	WikipediaCategoryMembersGeneratorResult,
	WikipediaCategoryMembersGeneratorPage
} from './types';
import { loadCacheMap, persistCacheMap, touchMapEntry } from './localStorageCache';
import { fetchArticleHtml, findFirstWikiLink, extractDisambiguationOptions } from './wikipedia';

const LOCAL_CACHE_LIMIT = 100;
const PREVIEW_CACHE_KEY = 'wikisophy.previewCache.v1';
const NEXT_LINK_CACHE_KEY = 'wikisophy.nextLinkCache.v1';
const CATEGORY_MEMBER_BATCH_LIMIT = 50;
const CATEGORY_MEMBER_MAX_BATCHES = 4;
const CATEGORY_STARTER_MAX_ATTEMPTS = 4;
const CATEGORY_CANDIDATE_TARGET = 120;

const previewCache = loadCacheMap<PreviewResponse>(PREVIEW_CACHE_KEY);
const nextLinkCache = loadCacheMap<string | null>(NEXT_LINK_CACHE_KEY);
const articleHtmlCache = new Map<string, string>();

/**
 * Fetch article preview (title, extract, thumbnail)
 */
export async function fetchPreview(
	title: string,
	signal?: AbortSignal
): Promise<PreviewResponse | null> {
	const cacheKey = title.toLowerCase();
	const cachedPreview = touchMapEntry(previewCache, cacheKey);
	if (cachedPreview !== undefined) return cachedPreview;

	const apiUrl = `${WIKIPEDIA_REST_API_URL}/page/summary/${encodeURIComponent(title)}`;

	try {
		const res = await fetch(apiUrl, { signal });

		if (!res.ok) {
			return null;
		}

		const data: WikipediaSummary = await res.json();
		const isDisambiguation = data.type === 'disambiguation';

		const result: PreviewResponse = {
			title: data.title,
			extract: data.extract,
			thumbnail: data.thumbnail?.source ?? null,
			type: data.type,
			isDisambiguation
		};
		previewCache.set(cacheKey, result);
		persistCacheMap(PREVIEW_CACHE_KEY, previewCache, LOCAL_CACHE_LIMIT);
		return result;
	} catch {
		return null;
	}
}

/**
 * Fetch disambiguation options by parsing full article HTML
 */
export async function fetchDisambiguationOptions(
	title: string,
	signal?: AbortSignal
): Promise<DisambiguationOption[]> {
	const html = await fetchArticleHtml(title, 'en', null, signal);
	if (!html) {
		return [];
	}

	return extractDisambiguationOptions(html);
}

/**
 * Search Wikipedia articles
 */
export async function searchArticles(
	query: string,
	limit: number = SEARCH_LIMIT,
	signal?: AbortSignal
): Promise<SearchResult[]> {
	if (!query.trim()) {
		return [];
	}

	const params = new URLSearchParams({
		action: 'opensearch',
		format: 'json',
		search: query,
		limit: limit.toString(),
		origin: '*'
	});

	try {
		const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`, { signal });

		if (!response.ok) {
			return [];
		}

		const data: WikipediaOpenSearchResult = await response.json();
		const [, titles = [], descriptions = [], urls = []] = data;

		return titles.map((title, i) => ({
			title,
			description: descriptions[i] ?? '',
			url: urls[i] ?? ''
		}));
	} catch {
		return [];
	}
}

/**
 * Fetch random Wikipedia article
 */
export async function fetchRandomArticle(): Promise<string | null> {
	for (let attempt = 0; attempt < RANDOM_ARTICLE_MAX_ATTEMPTS; attempt++) {
		const params = new URLSearchParams({
			action: 'query',
			generator: 'random',
			grnnamespace: '0',
			grnlimit: '1',
			grnfilterredir: 'nonredirects',
			prop: 'pageprops|categories',
			ppprop: 'disambiguation',
			cllimit: '500',
			clshow: '!hidden',
			format: 'json',
			origin: '*'
		});

		try {
			const res = await fetch(`${WIKIPEDIA_API_URL}?${params}`);

			if (!res.ok) {
				return null;
			}

			const data: WikipediaRandomResult = await res.json();
			const pages = Object.values(data.query?.pages ?? {});
			const page = pages.find((entry) => {
				if (entry.pageprops?.disambiguation) return false;
				const hasDisambiguationCategory = (entry.categories ?? []).some(
					(category) => category.title.toLowerCase() === 'category:disambiguation pages'
				);
				return !hasDisambiguationCategory;
			});
			if (page) return page.title;
		} catch {
			return null;
		}
	}

	return null;
}

/**
 * Fetch a random starter article based on real Wikipedia categories.
 */
export async function fetchCategoryStarter(
	categories: readonly string[],
	signal?: AbortSignal
): Promise<string | null> {
	const normalizedCategories = categories
		.map((category) => normalizeCategoryTitle(category))
		.filter(Boolean);
	if (normalizedCategories.length === 0) return null;

	const blockedStarterTitles = new Set(
		normalizedCategories
			.map((category) => extractCategoryTopicTitle(category))
			.filter(Boolean)
			.map((title) => normalizeTitleForCompare(title))
	);

	const candidateSet = new Set<string>();

	for (let attempt = 0; attempt < CATEGORY_STARTER_MAX_ATTEMPTS; attempt++) {
		if (signal?.aborted) return null;

		const category = normalizedCategories[Math.floor(Math.random() * normalizedCategories.length)];
		const candidates = await fetchCategoryMemberCandidates(category, blockedStarterTitles, signal);
		for (const candidate of candidates) {
			candidateSet.add(candidate);
		}

		if (candidateSet.size >= CATEGORY_CANDIDATE_TARGET) {
			break;
		}
	}

	const candidateList = Array.from(candidateSet);
	if (candidateList.length === 0) return null;

	return pickVerifiedStarterCandidate(candidateList, blockedStarterTitles, signal);
}

async function fetchCategoryMemberCandidates(
	categoryTitle: string,
	blockedStarterTitles: ReadonlySet<string>,
	signal?: AbortSignal
): Promise<string[]> {
	const candidates: string[] = [];
	let gcmcontinue: string | undefined;

	for (let batch = 0; batch < CATEGORY_MEMBER_MAX_BATCHES; batch++) {
		const params = new URLSearchParams({
			action: 'query',
			generator: 'categorymembers',
			gcmtitle: categoryTitle,
			gcmtype: 'page',
			gcmnamespace: '0',
			gcmlimit: CATEGORY_MEMBER_BATCH_LIMIT.toString(),
			prop: 'pageprops|categories',
			ppprop: 'disambiguation',
			clshow: '!hidden',
			cllimit: '20',
			redirects: '1',
			format: 'json',
			origin: '*'
		});

		if (gcmcontinue) {
			params.set('gcmcontinue', gcmcontinue);
		}

		try {
			const res = await fetch(`${WIKIPEDIA_API_URL}?${params}`, { signal });
			if (!res.ok) {
				break;
			}

			const data: WikipediaCategoryMembersGeneratorResult = await res.json();
			const pages = Object.values(data.query?.pages ?? {});

			for (const page of pages) {
				if (isValidCategoryStarterPage(page, blockedStarterTitles)) {
					candidates.push(page.title);
				}
			}

			gcmcontinue = data.continue?.gcmcontinue;
			if (!gcmcontinue) {
				break;
			}
		} catch {
			return candidates;
		}
	}

	return candidates;
}

async function pickVerifiedStarterCandidate(
	candidates: readonly string[],
	blockedStarterTitles: ReadonlySet<string>,
	signal?: AbortSignal
): Promise<string | null> {
	const pool = [...candidates];

	while (pool.length > 0) {
		if (signal?.aborted) return null;

		const index = Math.floor(Math.random() * pool.length);
		const [candidate] = pool.splice(index, 1);
		if (!candidate) continue;

		if (isBlockedStarterTitle(candidate, blockedStarterTitles)) {
			continue;
		}

		const preview = await fetchPreview(candidate, signal);
		if (!preview) {
			continue;
		}

		if (preview.isDisambiguation) {
			continue;
		}

		if (isBlockedStarterTitle(preview.title, blockedStarterTitles)) {
			continue;
		}

		return preview.title;
	}

	return null;
}

function normalizeCategoryTitle(category: string): string {
	const normalized = category.trim().replace(/_/g, ' ');
	if (!normalized) return '';

	if (normalized.toLowerCase().startsWith('category:')) {
		const suffix = normalized.slice('category:'.length).trim();
		if (!suffix) return '';
		return `Category:${suffix}`;
	}

	return `Category:${normalized}`;
}

function extractCategoryTopicTitle(categoryTitle: string): string {
	if (!categoryTitle.toLowerCase().startsWith('category:')) {
		return categoryTitle.trim();
	}

	return categoryTitle.slice('category:'.length).trim();
}

function normalizeTitleForCompare(title: string): string {
	return title.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function isBlockedStarterTitle(title: string, blockedStarterTitles: ReadonlySet<string>): boolean {
	return blockedStarterTitles.has(normalizeTitleForCompare(title));
}

function isValidCategoryStarterPage(
	page: WikipediaCategoryMembersGeneratorPage,
	blockedStarterTitles: ReadonlySet<string>
): boolean {
	const normalizedTitle = page.title.trim();
	if (!normalizedTitle) return false;
	if (page.pageprops?.disambiguation) return false;
	if (isBlockedStarterTitle(normalizedTitle, blockedStarterTitles)) return false;

	const lowerTitle = normalizedTitle.toLowerCase();
	if (lowerTitle.includes('(disambiguation)')) return false;

	const hasDisambiguationCategory = (page.categories ?? []).some(
		(category) => category.title.toLowerCase() === 'category:disambiguation pages'
	);

	return !hasDisambiguationCategory;
}

/**
 * Find next article in the chain
 */
export async function findNextStep(title: string, signal?: AbortSignal): Promise<StepResponse> {
	const cacheKey = title.toLowerCase();
	const cachedLink = touchMapEntry(nextLinkCache, cacheKey);
	if (cachedLink !== undefined) {
		if (!cachedLink) return { title, nextLink: null, nextPreview: null };
		const nextTitle = decodeURIComponent(cachedLink.replace('/wiki/', '')).replace(/_/g, ' ');
		const nextPreview = await fetchPreview(nextTitle, signal);
		return { title, nextLink: cachedLink, nextPreview };
	}

	const nextLink = await resolveNextLinkWithFallback(title, signal);
	nextLinkCache.set(cacheKey, nextLink);
	persistCacheMap(NEXT_LINK_CACHE_KEY, nextLinkCache, LOCAL_CACHE_LIMIT);

	if (!nextLink) {
		return {
			title,
			nextLink: null,
			nextPreview: null
		};
	}

	const nextTitle = decodeURIComponent(nextLink.replace('/wiki/', '')).replace(/_/g, ' ');
	const nextPreview = await fetchPreview(nextTitle, signal);

	return {
		title,
		nextLink,
		nextPreview
	};
}

async function resolveNextLinkWithFallback(
	title: string,
	signal?: AbortSignal
): Promise<string | null> {
	const introHtml = await fetchArticleHtmlCached(title, '0', signal);
	if (introHtml) {
		const introLink = findFirstWikiLink(introHtml);
		if (introLink) {
			return introLink;
		}
	}

	for (let section = 1; section <= LINK_FALLBACK_SECTION_MAX; section++) {
		const sectionHtml = await fetchArticleHtmlCached(title, section.toString(), signal);
		if (!sectionHtml) {
			continue;
		}

		const sectionLink = findFirstWikiLink(sectionHtml);
		if (sectionLink) {
			return sectionLink;
		}
	}

	const fullPageHtml = await fetchArticleHtmlCached(title, null, signal);
	if (!fullPageHtml) {
		return null;
	}

	return findFirstWikiLink(fullPageHtml);
}

async function fetchArticleHtmlCached(
	title: string,
	section: string | null,
	signal?: AbortSignal
): Promise<string | null> {
	const key = `${title.toLowerCase()}__${section ?? 'full'}`;
	if (articleHtmlCache.has(key)) {
		return articleHtmlCache.get(key)!;
	}
	const html = await fetchArticleHtml(title, 'en', section, signal);
	if (html !== null) {
		articleHtmlCache.set(key, html);
	}
	return html;
}
