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
	WikipediaRandomResult
} from './types';
import { loadCacheMap, persistCacheMap, touchMapEntry } from './localStorageCache';
import { fetchArticleHtml, findFirstWikiLink, extractDisambiguationOptions } from './wikipedia';

const LOCAL_CACHE_LIMIT = 100;
const PREVIEW_CACHE_KEY = 'wikisophy.previewCache.v1';
const NEXT_LINK_CACHE_KEY = 'wikisophy.nextLinkCache.v1';

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
				const hasDisambiguationCategory = (entry.categories ?? []).some((category) =>
					category.title.toLowerCase() === 'category:disambiguation pages'
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
