import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const CACHE_PREFIX = 'the-index/cache/';

/**
 * Small data hook: runs `fetcher` on first focus, when `deps` change and whenever the screen regains focus.
 * Keeps the last good data while reloading so screens don't flash empty.
 *
 * With `cacheKey`, the last good result is also saved on the phone. It shows instantly on the next
 * launch and stays on screen when the network is down (`cachedAt` tells the screen it's a saved copy).
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = [], options: { cacheKey?: string } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  const key = options.cacheKey ? CACHE_PREFIX + options.cacheKey : null;
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Show the saved copy right away while the network request runs.
  useEffect(() => {
    if (!key) return;
    let active = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw || !active) return;
        const saved = JSON.parse(raw) as { at: string; value: T };
        setData((current) => (current === undefined ? saved.value : current));
        setCachedAt((current) => current ?? saved.at);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      setCachedAt(null);
      if (key) AsyncStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), value: result })).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [key]);

  // The focus effect below covers the first load; this reruns only when deps change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A failed refresh with a saved copy on screen isn't an error worth shouting about.
  const visibleError = error && data !== undefined && key ? null : error;

  // cachedAt is set while the screen shows the phone's saved copy: before the first refresh lands, or after it failed.
  return { data, error: visibleError, loading, reload: load, setData, cachedAt };
}

/** Throw the Supabase error, or return its data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
