/**
 * Wikipedia API utilities for fetching and parsing article content
 */

import type { DisambiguationLink } from './types';

/**
 * Fetches article HTML from Wikipedia (section 0 only - intro paragraph)
 * @param title - Article title to fetch
 * @param lang - Wikipedia language code (default: 'en')
 * @returns HTML string or null if fetch fails
 */
export async function fetchArticleHtml(title: string, lang: string = 'en'): Promise<string | null> {
	const params = new URLSearchParams({
		action: 'parse',
		page: title,
		format: 'json',
		prop: 'text',
		section: '0', // Only intro section for performance
		redirects: '1',
		origin: '*'
	});

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

/**
 * Extracts disambiguation links from article HTML
 *
 * Disambiguation pages contain a list of links with descriptions
 * This function parses the HTML to extract those links
 *
 * @param html - Article HTML to parse
 * @returns Array of disambiguation links with titles and descriptions
 */
export function extractDisambiguationLinks(html: string): DisambiguationLink[] {
	if (!html) return [];

	const links: DisambiguationLink[] = [];

	// Remove unwanted sections
	let cleanHtml = html;
	const removePatterns = [
		/<div[^>]*class="[^"]*(?:hatnote|shortdescription|thumb|infobox|vertical-navbox|noexcerpt|noprint|ambox|mwe-math-element)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
		/<table[\s\S]*?<\/table>/gi,
		/<sup[\s\S]*?<\/sup>/gi,
		/<style[\s\S]*?<\/style>/gi,
		/<script[\s\S]*?<\/script>/gi
	];

	for (const pattern of removePatterns) {
		cleanHtml = cleanHtml.replace(pattern, '');
	}

	// Find all list items (disambiguation pages use <li> elements)
	const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
	let liMatch;

	while ((liMatch = liPattern.exec(cleanHtml)) !== null) {
		const liContent = liMatch[1];

		// Extract the first link in this list item
		const linkMatch = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(liContent);
		if (!linkMatch) continue;

		const href = linkMatch[1];
		const linkText = linkMatch[2].replace(/<[^>]+>/g, '').trim();

		// Only include valid Wikipedia article links
		if (!href.startsWith('/wiki/') || href.substring(6).includes(':')) continue;

		// Get description (text after the link)
		const descMatch = liContent.substring(liContent.indexOf('</a>') + 4);
		let description = descMatch
			.replace(/<[^>]+>/g, '') // Remove HTML tags
			.replace(/^\s*[,–-]\s*/, '') // Remove leading punctuation
			.trim();

		// Limit description length
		if (description.length > 200) {
			description = description.substring(0, 197) + '...';
		}

		const title = decodeURIComponent(href.replace('/wiki/', '')).replace(/_/g, ' ');

		// Avoid duplicates
		if (links.some((link) => link.title === title)) continue;

		links.push({
			title,
			description: description || linkText
		});
	}

	return links;
}
