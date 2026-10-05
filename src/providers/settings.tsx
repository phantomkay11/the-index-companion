import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { palette, type Palette } from '@/constants/theme';
import { strings, type Lang, type StringKey } from '@/lib/i18n';

type Settings = {
  textScale: number;
  highContrast: boolean;
  reduceMotion: boolean;
  /** Hide photos and maps to save mobile data. */
  saveData: boolean;
  language: Lang;
};

type SettingsContextValue = Settings & {
  colors: Palette;
  scheme: 'light' | 'dark';
  update: (patch: Partial<Settings>) => void;
  t: (key: StringKey) => string;
};

const DEFAULTS: Settings = { textScale: 1, highContrast: false, reduceMotion: false, saveData: false, language: 'en' };
const STORAGE_KEY = 'the-index/settings';

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const scheme = system === 'dark' ? 'dark' : 'light';
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
        // Start from the phone's own reduce-motion setting unless the member chose otherwise.
        const osReduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
        setSettings({ ...DEFAULTS, reduceMotion: osReduce, ...stored });
      } catch {
        // Settings are a convenience; defaults are fine if storage is unavailable.
      }
    })();
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      scheme,
      colors: palette(scheme, settings.highContrast),
      update,
      t: (key) => strings[settings.language][key] ?? strings.en[key],
    }),
    [settings, scheme, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
