import { useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Breakpoints: phones, tablets (iPad portrait and up) and wide tablets (iPad landscape, desktop web). */
export const TABLET = 700;
export const WIDE = 1024;

const subscribe = () => () => {};

export function useLayout() {
  const { width, height } = useWindowDimensions();
  // The web's pre-rendered pages don't know the screen size, so they use the phone layout;
  // the real size takes over as soon as the page is live in the browser.
  const live = useSyncExternalStore(
    subscribe,
    () => true,
    () => Platform.OS !== 'web',
  );
  const isTablet = live && width >= TABLET;
  const isWide = live && width >= WIDE;
  return {
    width,
    height,
    isTablet,
    isWide,
    /** Card columns for grids of farms, events and posts. */
    columns: isWide ? 3 : isTablet ? 2 : 1,
  };
}
