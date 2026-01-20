import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { PreviewResponse, WikipediaSummary } from '$lib/types';
import { USER_AGENT, WIKIPEDIA_REST_API_URL } from '$lib/constants';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const title = url.searchParams.get('title');

	if (!title?.trim()) {
		return error(400, { message: 'Title parameter is required' });
	}

	const apiUrl = `${WIKIPEDIA_REST_API_URL}/page/summary/${encodeURIComponent(title)}`;

	try {
		const res = await fetch(apiUrl, {
			headers: { 'User-Agent': USER_AGENT }
		});

		if (!res.ok) {
			const status = res.status === 404 ? 404 : 500;
			const message = res.status === 404 ? 'Article not found' : 'Failed to fetch article';
			return error(status, { message });
		}

		const data: WikipediaSummary = await res.json();
		const response: PreviewResponse = {
			title: data.title,
			extract: data.extract,
			thumbnail: data.thumbnail?.source ?? null
		};

		// Cache for 1 hour
		setHeaders({
			'Cache-Control': 'public, max-age=3600'
		});

		return json(response);
	} catch (err) {
		console.error('Preview fetch error:', err);
		return error(500, { message: 'Failed to fetch article preview' });
	}
};
