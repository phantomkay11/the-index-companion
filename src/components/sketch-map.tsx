import { router } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui';
import { Radius } from '@/constants/theme';
import type { Point } from '@/lib/location';
import type { Farm } from '@/lib/types';
import { useSettings } from '@/providers/settings';

export type MapProps = { farms: Farm[]; here: Point | null; height?: number };

/**
 * A lightweight plotted map used on the web and in Expo Go, where native maps aren't available.
 * Farms are placed by their public coordinates inside the bounds of what's shown.
 */
export function SketchMap({ farms, here, height = 280 }: MapProps) {
  const { colors } = useSettings();
  const [w, setW] = useState(0);
  const pts = farms.filter((f) => f.lat != null && f.lon != null);
  const all = [...pts.map((f) => ({ lat: f.lat!, lon: f.lon! })), ...(here ? [here] : [])];
  if (!all.length) {
    return (
      <View
        style={[styles.box, { height: 120, borderColor: colors.line, backgroundColor: colors.sunk, alignItems: 'center', justifyContent: 'center' }]}>
        <Txt variant="small" muted>
          None of these farms share map coordinates yet.
        </Txt>
      </View>
    );
  }
  const pad = 0.6;
  const minLat = Math.min(...all.map((p) => p.lat)) - pad;
  const maxLat = Math.max(...all.map((p) => p.lat)) + pad;
  const minLon = Math.min(...all.map((p) => p.lon)) - pad;
  const maxLon = Math.max(...all.map((p) => p.lon)) + pad;
  const x = (lon: number) => ((lon - minLon) / (maxLon - minLon || 1)) * (w - 24) + 12;
  const y = (lat: number) => ((maxLat - lat) / (maxLat - minLat || 1)) * (height - 24) + 12;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[styles.box, { height, borderColor: colors.line, backgroundColor: colors.sunk }]}
      accessibilityLabel={`Map of ${pts.length} farms`}>
      {w > 0 &&
        [0.25, 0.5, 0.75].map((f) => (
          <View key={`h${f}`} style={[styles.grid, { top: height * f, left: 0, right: 0, height: 1, backgroundColor: colors.line }]} />
        ))}
      {w > 0 &&
        [0.25, 0.5, 0.75].map((f) => (
          <View key={`v${f}`} style={[styles.grid, { left: w * f, top: 0, bottom: 0, width: 1, backgroundColor: colors.line }]} />
        ))}
      {w > 0 && here ? (
        <View
          style={[styles.here, { left: x(here.lon) - 9, top: y(here.lat) - 9, backgroundColor: colors.sun, borderColor: colors.surface }]}
          accessibilityLabel="You are here"
        />
      ) : null}
      {w > 0 &&
        pts.map((f) => {
          // Labels near the right edge sit to the left of their dot so they aren't cut off.
          const px = x(f.lon!);
          const flip = px > w - 120;
          return (
            <Pressable
              key={f.id}
              onPress={() => router.push({ pathname: '/farm/[id]', params: { id: f.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${f.name}, ${f.city}`}
              hitSlop={10}
              style={[styles.pin, flip ? { right: w - px - 8, flexDirection: 'row-reverse' } : { left: px - 8 }, { top: y(f.lat!) - 22 }]}>
              <View style={[styles.dot, { backgroundColor: colors.leaf, borderColor: colors.surface }]} />
              <Txt variant="smallBold" style={{ fontSize: 11 }} numberOfLines={1}>
                {f.name.split(' ')[0]}
              </Txt>
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 0, borderRadius: Radius.xl, overflow: 'hidden', position: 'relative' },
  grid: { position: 'absolute', opacity: 0.6 },
  here: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  // 44 points tall (dot centred) so pins are easy to tap; hitSlop does nothing on the web.
  pin: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 120, minHeight: 44, minWidth: 44 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
});
