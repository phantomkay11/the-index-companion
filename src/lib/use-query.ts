import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const CACHE_PREFIX = 'the-index/cache/';

// Bumped whenever saved data is cleared (sign-out, account switch): requests that started before
// can't save or show their results afterwards.
let generation = 0;

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
  const keyRef = useRef(key);
  // Each request gets a number; only the newest one may update the screen, so a slow old
  // response (from a previous filter or account) can never overwrite a newer one.
  const latest = useRef(0);
  const fresh = useRef(false); // the network has answered for the current key
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
    keyRef.current = key;
  });

  // A new key (a new filter) keeps the old results on screen while loading, so lists and maps don't jump,
  // and swaps in the new key's saved copy if there is one.
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      fresh.current = false;
      setError(null);
      setCachedAt(null); // the old results on screen aren't a saved copy of the new filter
    }
    if (!key) return;
    let active = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw || !active || fresh.current) return;
        const saved = JSON.parse(raw) as { at: string; value: T };
        setData(saved.value);
        setCachedAt(saved.at);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);

  const load = useCallback(async () => {
    const id = ++latest.current;
    const forKey = keyRef.current;
    const gen = generation;
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (id !== latest.current || gen !== generation) return;
      fresh.current = true;
      setData(result);
      setError(null);
      setCachedAt(null);
      if (forKey) AsyncStorage.setItem(forKey, JSON.stringify({ at: new Date().toISOString(), value: result })).catch(() => {});
    } catch (e) {
      if (id !== latest.current || gen !== generation) return;
      setError(e instanceof Error ? e.message : 'Something went wrong. Check your connection and try again.');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

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

  // A failed refresh with a saved copy on screen isn't an error worth shouting about: the screen says it's a saved copy.
  // (cachedAt is cleared when the filter changes, so old results from a previous filter don't count and its error shows.)
  const visibleError = error && data !== undefined && cachedAt ? null : error;

  // cachedAt is set while the screen shows the phone's saved copy: before the first refresh lands, or after it failed.
  return { data, error: visibleError, loading, reload: load, setData, cachedAt };
}

/** Forget every saved copy, so the next person to sign in on this phone never sees the last one's data. */
export async function clearQueryCache() {
  generation++;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing saved, or storage unavailable: nothing to clear.
  }
}

/** Throw the Supabase error, or return its data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
