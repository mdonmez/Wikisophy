/**
 * Client-side Wikipedia API utilities for GitHub Pages static export
 * All functions make direct calls to Wikipedia REST and MediaWiki APIs
 */

import { USER_AGENT, WIKIPEDIA_API_URL, WIKIPEDIA_REST_API_URL, SEARCH_LIMIT } from './constants';
import type {
	SearchResult,
	PreviewResponse,
	StepResponse,
	WikipediaSummary,
	WikipediaOpenSearchResult,
	WikipediaRandomResult
} from './types';
import { fetchArticleHtml, findFirstWikiLink } from './wikipedia';

/**
 * Fetch article preview (title, extract, thumbnail)
 */
export async function fetchPreview(title: string): Promise<PreviewResponse | null> {
	const apiUrl = `${WIKIPEDIA_REST_API_URL}/page/summary/${encodeURIComponent(title)}`;

	try {
		const res = await fetch(apiUrl, {
			headers: { 'User-Agent': USER_AGENT }
		});

		if (!res.ok) {
			return null;
		}

		const data: WikipediaSummary = await res.json();
		return {
			title: data.title,
			extract: data.extract,
			thumbnail: data.thumbnail?.source ?? null
		};
	} catch {
		return null;
	}
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
		const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`, {
			headers: { 'User-Agent': USER_AGENT }
		});

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
		const res = await fetch(`${WIKIPEDIA_API_URL}?${params}`, {
			headers: { 'User-Agent': USER_AGENT }
		});

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
	const html = await fetchArticleHtml(title);

	if (!html) {
		return {
			title,
			nextLink: null,
			nextPreview: null
		};
	}

	const nextLink = findFirstWikiLink(html);

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
