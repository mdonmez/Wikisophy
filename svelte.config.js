import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Use static adapter for GitHub Pages
		adapter: adapter({
			// Enable fallback for SPA routing
			fallback: 'index.html',
			strict: false
		}),
		// Set base path for GitHub Pages subdirectory deployment
		paths: {
			base: '/wikisophy'
		}
	}
};

export default config;
