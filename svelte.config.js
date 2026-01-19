import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// GitHub Pages adapter - generates static site
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '200.html', // SPA fallback for client-side routing
			precompress: false,
			strict: true
		}),
		paths: {
			// Update this to your GitHub repo name if not at root domain
			// For example: base: '/wikisophy'
			base: process.env.NODE_ENV === 'production' ? '/wikisophy' : ''
		}
	}
};

export default config;
