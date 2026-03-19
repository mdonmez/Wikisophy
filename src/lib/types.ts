/**
 * Shared type definitions for Wikisophy application
 * Using TypeScript 5.9+ modern syntax
 */

/**
 * Journey status states
 */
export type Status = 'IDLE' | 'RUNNING' | 'FINISHED';

/**
 * Journey outcome states
 */
export type Outcome = 'success' | 'cycle' | 'dead_end' | 'error' | 'cancelled' | null;

/**
 * Wikipedia article representation with metadata
 */
export type Article = {
	title: string;
	extract: string;
	thumbnail: string | null;
	url: string;
	isDisambiguation?: boolean;
};

/**
 * Journey state container
 */
export type JourneyState = {
	status: Status;
	path: Article[];
	outcome: Outcome;
};

/**
 * Search result from Wikipedia OpenSearch API
 */
export type SearchResult = {
	title: string;
	description: string;
	url: string;
};

/**
 * API response for article preview
 */
export type PreviewResponse = {
	title: string;
	extract: string;
	thumbnail: string | null;
	type: string;
	isDisambiguation: boolean;
};

/**
 * Disambiguation option extracted from disambiguation pages
 */
export type DisambiguationOption = {
	title: string;
	description: string;
	url: string;
};

/**
 * API response for random article
 */
export type RandomResponse = {
	title: string | null;
};

/**
 * API response for search results
 */
export type SearchResponse = {
	results: SearchResult[];
};

/**
 * API response for step (finding next article)
 */
export type StepResponse = {
	title: string;
	nextLink: string | null;
	nextPreview: PreviewResponse | null;
};

/**
 * API request for step endpoint
 */
export type StepRequest = {
	title: string;
};

/**
 * Wikipedia API Summary response structure
 */
export type WikipediaSummary = {
	title: string;
	extract: string;
	type: string;
	thumbnail?: { source: string };
};

/**
 * Wikipedia API OpenSearch response structure
 * Returns tuple: [query, titles[], descriptions[], urls[]]
 */
export type WikipediaOpenSearchResult = [string, string[], string[], string[]];

/**
 * Wikipedia API Random response structure
 */
export type WikipediaRandomResult = {
	query?: {
		pages?: Record<
			string,
			{
				title: string;
				pageprops?: {
					disambiguation?: string;
				};
				categories?: {
					title: string;
				}[];
			}
		>;
	};
};

/**
 * Wikipedia API generator=categorymembers page shape
 */
export type WikipediaCategoryMembersGeneratorPage = {
	title: string;
	pageprops?: {
		disambiguation?: string;
	};
	categories?: {
		title: string;
	}[];
};

/**
 * Wikipedia API generator=categorymembers response structure
 */
export type WikipediaCategoryMembersGeneratorResult = {
	continue?: {
		gcmcontinue?: string;
		continue?: string;
	};
	query?: {
		pages?: Record<string, WikipediaCategoryMembersGeneratorPage>;
	};
};

/**
 * Wikipedia API search query response structure
 */
export type WikipediaSearchQueryResult = {
	query?: {
		search?: {
			title: string;
		}[];
	};
};

/**
 * Philosophical quote structure
 */
export type Quote = {
	text: string;
	author: string;
};
