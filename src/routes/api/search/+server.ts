import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SearchResponse, SearchResult, WikipediaOpenSearchResult } from '$lib/types';
import { USER_AGENT, WIKIPEDIA_API_URL, SEARCH_LIMIT } from '$lib/constants';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const query = url.searchParams.get('q');
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? parseInt(limitParam, 10) : SEARCH_LIMIT;

	if (!query?.trim()) {
		return json({ results: [] } satisfies SearchResponse);
	}

	const params = new URLSearchParams({
		action: 'opensearch',
		format: 'json',
		search: query,
		limit: limit.toString(),
		origin: '*'
	});

	const apiUrl = `${WIKIPEDIA_API_URL}?${params}`;

	try {
		const response = await fetch(apiUrl, {
			headers: { 'User-Agent': USER_AGENT }
		});

		if (!response.ok) {
			return error(500, { message: 'Search failed' });
		}

		const data: WikipediaOpenSearchResult = await response.json();
		const [, titles = [], descriptions = [], urls = []] = data;

		const results: SearchResult[] = titles.map((title, i) => ({
			title,
			description: descriptions[i] ?? '',
			url: urls[i] ?? ''
		}));

		// Cache search results for 5 minutes
		setHeaders({
			'Cache-Control': 'public, max-age=300'
		});

		return json({ results } satisfies SearchResponse);
	} catch (err) {
		console.error('Search error:', err);
		return error(500, { message: 'Search request failed' });
	}
};
