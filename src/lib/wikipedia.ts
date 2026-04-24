/**
 * Wikipedia API utilities for fetching and parsing article content
 */

/**
 * Fetches article HTML from Wikipedia (section 0 only - intro paragraph)
 * @param title - Article title to fetch
 * @param lang - Wikipedia language code (default: 'en')
 * @param section - Section number, or null to fetch full page (default: '0')
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns HTML string or null if fetch fails
 */
export async function fetchArticleHtml(
	title: string,
	lang: string = 'en',
	section: string | null = '0',
	signal?: AbortSignal
): Promise<string | null> {
	const params = new URLSearchParams({
		action: 'parse',
		page: title,
		format: 'json',
		prop: 'text',
		redirects: '1',
		origin: '*'
	});

	if (section !== null) {
		params.set('section', section);
	}

	try {
		const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal });

		if (!response.ok) return null;
		const data = await response.json();

		if (data.error) return null;
		return data?.parse?.text?.['*'] ?? null;
	} catch {
		return null;
	}
}

/**
 * Extracts disambiguation options from a disambiguation page HTML
 * @param html - Full article HTML for a disambiguation page
 * @param limit - Maximum number of options to return (Infinity by default)
 * @returns Candidate article options
 */
export function extractDisambiguationOptions(
	html: string,
	limit: number = Number.POSITIVE_INFINITY
) {
	if (!html) return [];

	const doc = new DOMParser().parseFromString(html, 'text/html');
	const removeSelectors = [
		'table',
		'sup',
		'style',
		'script',
		'.hatnote',
		'.shortdescription',
		'.thumb',
		'.infobox',
		'.vertical-navbox',
		'.noexcerpt',
		'.noprint',
		'.ambox',
		'.mwe-math-element',
		'.toc',
		'.metadata'
	];
	for (const selector of removeSelectors) {
		doc.querySelectorAll(selector).forEach((el) => el.remove());
	}

	const options: Array<{ title: string; description: string; url: string }> = [];
	const seenTitles = new Set<string>();

	for (const li of doc.querySelectorAll('li')) {
		if (options.length >= limit) break;

		const anchor = Array.from(li.querySelectorAll('a')).find((a) => {
			const href = a.getAttribute('href') ?? '';
			return href.startsWith('/wiki/') && !href.substring(6).includes(':');
		});
		if (!anchor) continue;

		const rawHref = (anchor.getAttribute('href') ?? '').split('#')[0];
		const title = decodeURIComponent(rawHref.replace('/wiki/', '')).replace(/_/g, ' ').trim();
		if (!title || seenTitles.has(title.toLowerCase())) continue;

		const linkText = anchor.textContent?.trim() ?? '';
		const liText = (li.textContent ?? '')
			.replace(/\[[^\]]+\]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		let description = liText;
		if (linkText) {
			description = description.replace(
				new RegExp(`^${escapeRegExp(linkText)}\\s*[,:–-]?\\s*`, 'i'),
				''
			);
		}

		options.push({ title, description, url: `https://en.wikipedia.org${rawHref}` });
		seenTitles.add(title.toLowerCase());
	}

	return options;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the first valid Wikipedia link in article HTML
 *
 * Rules for valid links:
 * - Must start with /wiki/
 * - Must not contain ':' (excludes File:, Help:, Category:, etc.)
 * - Must not be in parentheses
 * - Must not be in italic tags (<i>, <em>)
 * - Must not be in excluded elements (infoboxes, tables, hatnotes, etc.)
 *
 * @param html - Article HTML to parse
 * @returns First valid link path or null if no valid link found
 */
export function findFirstWikiLink(html: string): string | null {
	if (!html) return null;

	const doc = new DOMParser().parseFromString(html, 'text/html');
	const removeSelectors = [
		'.hatnote',
		'.shortdescription',
		'.thumb',
		'.infobox',
		'.vertical-navbox',
		'.noexcerpt',
		'.noprint',
		'.ambox',
		'.mwe-math-element',
		'table',
		'sup',
		'style',
		'script',
		'audio',
		'video',
		'figure'
	];
	for (const selector of removeSelectors) {
		doc.querySelectorAll(selector).forEach((el) => el.remove());
	}

	for (const p of doc.querySelectorAll('p')) {
		const textContent = p.textContent?.trim() ?? '';
		if (textContent.length < 20 && !textContent.includes('is')) continue;

		const link = findFirstValidLinkInParagraph(p);
		if (link) return link;
	}

	return null;
}

function findFirstValidLinkInParagraph(p: Element): string | null {
	let parenCount = 0;

	function walk(node: Node): string | null {
		if (node.nodeType === Node.TEXT_NODE) {
			for (const ch of node.textContent ?? '') {
				if (ch === '(') parenCount++;
				else if (ch === ')') parenCount--;
			}
			return null;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return null;

		const el = node as Element;
		const tag = el.tagName.toLowerCase();

		// Skip italic wrappers entirely
		if (tag === 'i' || tag === 'em') return null;

		if (tag === 'a') {
			const href = el.getAttribute('href') ?? '';
			if (
				href.startsWith('/wiki/') &&
				!href.substring(6).includes(':') &&
				parenCount <= 0 &&
				!el.querySelector('i') &&
				!el.querySelector('em')
			) {
				return href.split('#')[0];
			}
			// Don't count text inside links toward paren depth
			return null;
		}

		for (const child of node.childNodes) {
			const result = walk(child);
			if (result !== null) return result;
		}
		return null;
	}

	return walk(p);
}
