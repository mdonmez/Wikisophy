/**
 * Wikipedia API utilities for fetching and parsing article content
 */

/**
 * Fetches article HTML from Wikipedia (section 0 only - intro paragraph)
 * @param title - Article title to fetch
 * @param lang - Wikipedia language code (default: 'en')
 * @param section - Section number, or null to fetch full page (default: '0')
 * @returns HTML string or null if fetch fails
 */
export async function fetchArticleHtml(
	title: string,
	lang: string = 'en',
	section: string | null = '0'
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
		const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`);

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

	let cleanHtml = html;

	const removePatterns = [
		/<table[\s\S]*?<\/table>/gi,
		/<sup[\s\S]*?<\/sup>/gi,
		/<style[\s\S]*?<\/style>/gi,
		/<script[\s\S]*?<\/script>/gi,
		/<div[^>]*class="[^"]*(?:hatnote|shortdescription|thumb|infobox|vertical-navbox|noexcerpt|noprint|ambox|mwe-math-element|toc|metadata)[^"]*"[^>]*>[\s\S]*?<\/div>/gi
	];

	for (const pattern of removePatterns) {
		cleanHtml = cleanHtml.replace(pattern, '');
	}

	const options: Array<{ title: string; description: string; url: string }> = [];
	const seenTitles = new Set<string>();
	const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
	let liMatch;

	while ((liMatch = liPattern.exec(cleanHtml)) !== null && options.length < limit) {
		const liContent = liMatch[1];
		const anchorPattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
		let anchorMatch;
		let selectedHref: string | null = null;
		let selectedText: string | null = null;

		while ((anchorMatch = anchorPattern.exec(liContent)) !== null) {
			const href = anchorMatch[1].split('#')[0];
			if (!href.startsWith('/wiki/') || href.substring(6).includes(':')) {
				continue;
			}

			selectedHref = href;
			selectedText = anchorMatch[2].replace(/<[^>]+>/g, '').trim();
			break;
		}

		if (!selectedHref) {
			continue;
		}

		const title = decodeURIComponent(selectedHref.replace('/wiki/', '')).replace(/_/g, ' ').trim();
		if (!title || seenTitles.has(title.toLowerCase())) {
			continue;
		}

		const plainText = liContent
			.replace(/<[^>]+>/g, ' ')
			.replace(/\[[^\]]+\]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		let description = plainText;
		if (selectedText) {
			description = description.replace(
				new RegExp(`^${escapeRegExp(selectedText)}\\s*[,:–-]?\\s*`, 'i'),
				''
			);
		}

		options.push({
			title,
			description,
			url: `https://en.wikipedia.org${selectedHref}`
		});
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

	let cleanHtml = html;

	// Remove elements that shouldn't contain valid links
	const removePatterns = [
		/<div[^>]*class="[^"]*(?:hatnote|shortdescription|thumb|infobox|vertical-navbox|noexcerpt|noprint|ambox|mwe-math-element)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
		/<table[\s\S]*?<\/table>/gi,
		/<sup[\s\S]*?<\/sup>/gi,
		/<style[\s\S]*?<\/style>/gi,
		/<script[\s\S]*?<\/script>/gi,
		/<audio[\s\S]*?<\/audio>/gi,
		/<video[\s\S]*?<\/video>/gi,
		/<figure[\s\S]*?<\/figure>/gi
	];

	for (const pattern of removePatterns) {
		cleanHtml = cleanHtml.replace(pattern, '');
	}

	// Scan paragraphs
	const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
	let pMatch;

	while ((pMatch = pPattern.exec(cleanHtml)) !== null) {
		const pContent = pMatch[1];

		// Skip very short paragraphs
		const textContent = pContent.replace(/<[^>]+>/g, '').trim();
		if (textContent.length < 20 && !textContent.includes('is')) continue;

		// Character analysis and link validation
		let parenCount = 0;
		let i = 0;

		while (i < pContent.length) {
			const char = pContent[i];

			if (char === '(') {
				parenCount++;
				i++;
				continue;
			}
			if (char === ')') {
				parenCount--;
				i++;
				continue;
			}

			// Link start: <a href="
			if (pContent.substring(i, i + 9) === '<a href="') {
				const hrefStart = i + 9;
				const hrefEnd = pContent.indexOf('"', hrefStart);
				if (hrefEnd === -1) {
					i++;
					continue;
				}

				const href = pContent.substring(hrefStart, hrefEnd);

				// Rule: Must start with /wiki/ and not contain :
				if (!href.startsWith('/wiki/') || href.substring(6).includes(':')) {
					i = hrefEnd + 1;
					continue;
				}

				// Get link content for italic check
				const contentStart = pContent.indexOf('>', hrefEnd) + 1;
				const contentEnd = pContent.indexOf('</a>', contentStart);
				if (contentEnd === -1) {
					i++;
					continue;
				}

				const linkContent = pContent.substring(contentStart, contentEnd);

				// Rule: Not in parentheses AND not italic
				if (parenCount <= 0 && !linkContent.includes('<i>') && !linkContent.includes('<em>')) {
					return href.split('#')[0]; // Remove anchor
				}

				i = contentEnd + 4;
				continue;
			}
			i++;
		}
	}
	return null;
}
