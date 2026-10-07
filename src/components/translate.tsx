import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';

import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

const cache = new Map<string, string>();

/** Translate text into the member's language on request, via the translate function. */
export function useTranslation(text: string) {
  const { language } = useSettings();
  const key = `${language}:${text}`;
  const [translated, setTranslated] = useState<string | null>(cache.get(key) ?? null);
  const [showing, setShowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // New text or a new language: start over (adjusting state during render, as React recommends).
  const [forKey, setForKey] = useState(key);
  if (forKey !== key) {
    setForKey(key);
    setTranslated(cache.get(key) ?? null);
    setShowing(false);
    setBusy(false);
    setError(null);
  }
  // A slow answer for the old text must not land on the new one.
  const current = useRef(key);
  useLayoutEffect(() => {
    current.current = key;
  }, [key]);

  const toggle = async () => {
    if (showing) return setShowing(false);
    if (translated) return setShowing(true);
    setBusy(true);
    setError(null);
    const asked = key;
    const { data, error: err } = await supabase.functions
      .invoke('translate', { body: { text, target: language } })
      .catch((e: unknown) => ({ data: null, error: e }));
    if (asked !== current.current) {
      if (!err && data?.translation) cache.set(asked, data.translation);
      return;
    }
    setBusy(false);
    if (err || !data?.translation) {
      setError('Translation isn’t available right now.');
      return;
    }
    cache.set(key, data.translation);
    setTranslated(data.translation);
    setShowing(true);
  };

  return { text: showing && translated ? translated : text, showing, busy, error, toggle };
}

export function TranslateToggle({ tr, color }: { tr: ReturnType<typeof useTranslation>; color: string }) {
  const { t } = useSettings();
  const { session } = useAuth();
  // The translate service is for members; signed-out visitors would only see an error.
  if (!session) return null;
  return (
    <Pressable onPress={tr.toggle} disabled={tr.busy} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Txt variant="small" color={color} style={{ textDecorationLine: 'underline' }}>
        {tr.busy ? '…' : tr.error ? tr.error : tr.showing ? t('showOriginal') : t('translate')}
      </Txt>
    </Pressable>
  );
}
