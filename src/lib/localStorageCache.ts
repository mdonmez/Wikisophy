const DEFAULT_LIMIT = 100;

function getStorage(): Storage | null {
	if (typeof globalThis === 'undefined') return null;
	const candidate = (globalThis as { localStorage?: Storage }).localStorage;
	if (!candidate) return null;
	if (typeof candidate.getItem !== 'function') return null;
	if (typeof candidate.setItem !== 'function') return null;
	return candidate;
}

function parseEntries<T>(raw: string): [string, T][] | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return null;
		return parsed as [string, T][];
	} catch {
		return null;
	}
}

function trimMapToLimit<T>(map: Map<string, T>, limit: number): void {
	if (map.size <= limit) return;
	let remaining = map.size - limit;
	for (const key of map.keys()) {
		map.delete(key);
		remaining -= 1;
		if (remaining <= 0) break;
	}
}

/**
 * Load a Map cache from localStorage.
 */
export function loadCacheMap<T>(key: string): Map<string, T> {
	const storage = getStorage();
	if (!storage) return new Map();
	const raw = storage.getItem(key);
	if (!raw) return new Map();
	const entries = parseEntries<T>(raw);
	if (!entries) return new Map();
	return new Map(entries);
}

/**
 * Persist a Map cache to localStorage with a max size limit.
 */
export function persistCacheMap<T>(
	key: string,
	map: Map<string, T>,
	limit: number = DEFAULT_LIMIT
): void {
	const storage = getStorage();
	if (!storage) return;
	const safeLimit = Math.max(1, limit);
	trimMapToLimit(map, safeLimit);
	try {
		const entries = Array.from(map.entries());
		storage.setItem(key, JSON.stringify(entries));
	} catch {
		// Ignore quota and serialization errors.
	}
}

/**
 * Touch an entry (move to most-recent position) and return its value if present.
 */
export function touchMapEntry<T>(map: Map<string, T>, key: string): T | undefined {
	if (!map.has(key)) return undefined;
	const value = map.get(key) as T;
	map.delete(key);
	map.set(key, value);
	return value;
}
