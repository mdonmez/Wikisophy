import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchArticleHtml, findFirstWikiLink } from '$lib/wikipedia';
import type { StepResponse, StepRequest, WikipediaSummary, PreviewResponse } from '$lib/types';
import { USER_AGENT, WIKIPEDIA_REST_API_URL } from '$lib/constants';

export const POST: RequestHandler = async ({ request }) => {
	let body: StepRequest;

	try {
		body = await request.json();
	} catch {
		return error(400, { message: 'Invalid request body' });
	}

	const { title } = body;

	if (!title?.trim()) {
		return error(400, { message: 'Title is required' });
	}

	const html = await fetchArticleHtml(title);

	if (!html) {
		return json({
			title,
			nextLink: null,
			nextPreview: null
		} satisfies StepResponse);
	}

	const nextLink = findFirstWikiLink(html);

	if (!nextLink) {
		return json({
			title,
			nextLink: null,
			nextPreview: null
		} satisfies StepResponse);
	}

	const nextTitle = decodeURIComponent(nextLink.replace('/wiki/', '')).replace(/_/g, ' ');
	const previewUrl = `${WIKIPEDIA_REST_API_URL}/page/summary/${encodeURIComponent(nextTitle)}`;

	try {
		const previewRes = await fetch(previewUrl, {
			headers: { 'User-Agent': USER_AGENT }
		});

		if (previewRes.ok) {
			const previewData: WikipediaSummary = await previewRes.json();
			const nextPreview: PreviewResponse = {
				title: previewData.title,
				extract: previewData.extract,
				thumbnail: previewData.thumbnail?.source ?? null
			};

			return json({
				title,
				nextLink,
				nextPreview
			} satisfies StepResponse);
		}
	} catch (err) {
		console.error('Preview fetch error:', err);
		// Continue to fallback
	}

	// Fallback: return basic info without preview
	const fallbackPreview: PreviewResponse = {
		title: nextTitle,
		extract: '',
		thumbnail: null
	};

	return json({
		title,
		nextLink,
		nextPreview: fallbackPreview
	} satisfies StepResponse);
};
