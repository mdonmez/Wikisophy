import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RandomResponse, WikipediaRandomResult } from '$lib/types';
import { USER_AGENT, WIKIPEDIA_API_URL } from '$lib/constants';

export const GET: RequestHandler = async ({ setHeaders }) => {
	const params = new URLSearchParams({
		action: 'query',
		list: 'random',
		rnnamespace: '0',
		rnlimit: '1',
		format: 'json',
		origin: '*'
	});

	const apiUrl = `${WIKIPEDIA_API_URL}?${params}`;

	try {
		const res = await fetch(apiUrl, {
			headers: { 'User-Agent': USER_AGENT }
		});

		if (!res.ok) {
			return error(500, { message: 'Failed to fetch random article' });
		}

		const data: WikipediaRandomResult = await res.json();
		const response: RandomResponse = {
			title: data.query?.random?.[0]?.title ?? null
		};

		// No cache for random articles
		setHeaders({
			'Cache-Control': 'no-cache'
		});

		return json(response);
	} catch (err) {
		console.error('Random article fetch error:', err);
		return error(500, { message: 'Failed to fetch random article' });
	}
};
