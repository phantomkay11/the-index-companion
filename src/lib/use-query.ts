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
  const key = options.cacheKey ? CACHE_PREFIX + options.cacheKey : null;
  // Data is stored with the cache key it belongs to, so switching filters (a new key) never shows
  // the previous filter's results under the new chip.
  const [state, setState] = useState<{ key: string | null; data: T | undefined; at: string | null; cachedAt: string | null }>({
    key,
    data: undefined,
    at: null,
    cachedAt: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  const seq = useRef(0);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });
  const current = state.key === key ? state : { key, data: undefined, at: null, cachedAt: null };

  // Show the saved copy right away while the network request runs.
  useEffect(() => {
    if (!key) return;
    let active = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw || !active) return;
        const saved = JSON.parse(raw) as { at: string; value: T };
        setState((s) => (s.key === key && s.data !== undefined ? s : { key, data: saved.value, at: saved.at, cachedAt: saved.at }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (mine !== seq.current) return; // a newer request has been made; drop this answer
      const at = new Date().toISOString();
      setState({ key, data: result, at, cachedAt: null });
      setError(null);
      if (key) AsyncStorage.setItem(key, JSON.stringify({ at, value: result })).catch(() => {});
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong. Check your connection and try again.');
      // What's on screen is now a saved copy as of its last good load.
      setState((s) => (s.key === key && s.data !== undefined && key ? { ...s, cachedAt: s.cachedAt ?? s.at } : s));
    } finally {
      if (mine === seq.current) setLoading(false);
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

  // A failed refresh while the phone's saved copy is on screen isn't an error worth shouting about;
  // the screen shows "saved copy" from cachedAt instead.
  const visibleError = error && current.data !== undefined && current.cachedAt ? null : error;
  const setData = useCallback(
    (next: T | undefined | ((prev: T | undefined) => T | undefined)) =>
      setState((s) => {
        const prev = s.key === key ? s.data : undefined;
        const value = typeof next === 'function' ? (next as (p: T | undefined) => T | undefined)(prev) : next;
        return { key, data: value, at: s.key === key ? s.at : null, cachedAt: s.key === key ? s.cachedAt : null };
      }),
    [key],
  );

  return { data: current.data, error: visibleError, loading, reload: load, setData, cachedAt: current.cachedAt };
}

/** Throw the Supabase error, or return its data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
