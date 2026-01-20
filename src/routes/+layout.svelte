<script lang="ts">
	import './layout.css';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { base } from '$app/paths';

	let { children } = $props();

	// Dynamic favicon based on theme
	let faviconHref = $derived(
		mode.current === 'dark' ? `${base}/logo_white.svg` : `${base}/logo_black.svg`
	);
</script>

<svelte:head><link rel="icon" href={faviconHref} /></svelte:head>
<ModeWatcher />
{@render children()}
