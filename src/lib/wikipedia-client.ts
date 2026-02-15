/**
 * Client-side Wikipedia API utilities for GitHub Pages static export
 * All functions make direct calls to Wikipedia REST and MediaWiki APIs
 */

import {
	WIKIPEDIA_API_URL,
	WIKIPEDIA_REST_API_URL,
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
import { fetchArticleHtml, findFirstWikiLink, extractDisambiguationOptions } from './wikipedia';

/**
 * Fetch article preview (title, extract, thumbnail)
 */
export async function fetchPreview(title: string): Promise<PreviewResponse | null> {
	const apiUrl = `${WIKIPEDIA_REST_API_URL}/page/summary/${encodeURIComponent(title)}`;

	try {
		const res = await fetch(apiUrl);

		if (!res.ok) {
			return null;
		}

		const data: WikipediaSummary = await res.json();
		const isDisambiguation = data.type === 'disambiguation';

		return {
			title: data.title,
			extract: data.extract,
			thumbnail: data.thumbnail?.source ?? null,
			type: data.type,
			isDisambiguation
		};
	} catch {
		return null;
	}
}

/**
 * Fetch disambiguation options by parsing full article HTML
 */
export async function fetchDisambiguationOptions(title: string): Promise<DisambiguationOption[]> {
	const html = await fetchArticleHtml(title, 'en', null);
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
	limit: number = SEARCH_LIMIT
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
		const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);

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
	const params = new URLSearchParams({
		action: 'query',
		list: 'random',
		rnnamespace: '0',
		rnlimit: '1',
		format: 'json',
		origin: '*'
	});

	try {
		const res = await fetch(`${WIKIPEDIA_API_URL}?${params}`);

		if (!res.ok) {
			return null;
		}

		const data: WikipediaRandomResult = await res.json();
		return data.query?.random?.[0]?.title ?? null;
	} catch {
		return null;
	}
}

/**
 * Find next article in the chain
 */
export async function findNextStep(title: string): Promise<StepResponse> {
	const nextLink = await resolveNextLinkWithFallback(title);

	if (!nextLink) {
		return {
			title,
			nextLink: null,
			nextPreview: null
		};
	}

	const nextTitle = decodeURIComponent(nextLink.replace('/wiki/', '')).replace(/_/g, ' ');
	const nextPreview = await fetchPreview(nextTitle);

	return {
		title,
		nextLink,
		nextPreview
	};
}

async function resolveNextLinkWithFallback(title: string): Promise<string | null> {
	const introHtml = await fetchArticleHtml(title, 'en', '0');
	if (introHtml) {
		const introLink = findFirstWikiLink(introHtml);
		if (introLink) {
			return introLink;
		}
	}

	for (let section = 1; section <= LINK_FALLBACK_SECTION_MAX; section++) {
		const sectionHtml = await fetchArticleHtml(title, 'en', section.toString());
		if (!sectionHtml) {
			continue;
		}

		const sectionLink = findFirstWikiLink(sectionHtml);
		if (sectionLink) {
			return sectionLink;
		}
	}

	const fullPageHtml = await fetchArticleHtml(title, 'en', null);
	if (!fullPageHtml) {
		return null;
	}

	return findFirstWikiLink(fullPageHtml);
}
