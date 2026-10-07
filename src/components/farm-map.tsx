import { router } from 'expo-router';
import { Platform, View } from 'react-native';

import { SketchMap, type MapProps } from '@/components/sketch-map';
import { Txt } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { isExpoGo } from '@/lib/push';
import { useSettings } from '@/providers/settings';

/**
 * Native map: Apple Maps on iPhone, Google Maps on Android (expo-maps).
 * expo-maps needs a development or store build, so Expo Go falls back to the sketch map.
 */
export function FarmMap(props: MapProps) {
  const { colors, scheme } = useSettings();
  const { farms, here, height = 320 } = props;
  if (isExpoGo) return <SketchMap {...props} />;

  // Loaded lazily so Expo Go never touches the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppleMaps, GoogleMaps } = require('expo-maps') as typeof import('expo-maps');
  const pts = farms.filter((f) => f.lat != null && f.lon != null);
  const center = here ?? (pts[0] ? { lat: pts[0].lat!, lon: pts[0].lon! } : { lat: 32.5, lon: -88 });
  const zoom = here ? 7 : pts.length > 1 ? 5 : 8;
  const markers = pts.map((f) => ({ id: f.id, title: f.name, coordinates: { latitude: f.lat!, longitude: f.lon! } }));
  const open = (e: { id?: string }) => e.id && router.push({ pathname: '/farm/[id]', params: { id: e.id } });
  const camera = { coordinates: { latitude: center.lat, longitude: center.lon }, zoom };

  return (
    <View style={{ height, borderRadius: Radius.xl, overflow: 'hidden' }} accessibilityLabel={`Map of ${pts.length} farms`}>
      {Platform.OS === 'ios' ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={camera}
          markers={markers.map((m) => ({ ...m, tintColor: colors.leaf }))}
          onMarkerClick={open}
          properties={{ isMyLocationEnabled: !!here }}
        />
      ) : Platform.OS === 'android' ? (
        <GoogleMaps.View
          style={{ flex: 1 }}
          cameraPosition={camera}
          markers={markers}
          onMarkerClick={open}
          properties={{ isMyLocationEnabled: !!here }}
          colorScheme={scheme === 'dark' ? GoogleMaps.MapColorScheme.DARK : GoogleMaps.MapColorScheme.LIGHT}
        />
      ) : (
        <Txt>Maps aren’t available here.</Txt>
      )}
    </View>
  );
}
