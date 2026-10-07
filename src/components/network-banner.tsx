import { Icon as Ionicons } from '@/components/icon';
import { useNetworkState } from 'expo-network';
import { View } from 'react-native';

import { Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { shortDate, timeOfDay } from '@/lib/format';
import { useSettings } from '@/providers/settings';

/** A slim bar shown across the app when the phone has no connection. */
export function NetworkBanner() {
  const { colors, t } = useSettings();
  const state = useNetworkState();
  const offline = state.isConnected === false || state.isInternetReachable === false;
  if (!offline) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, paddingVertical: 8, backgroundColor: colors.sunSoft }}>
      <Ionicons name="cloud-offline-outline" size={18} color={colors.onSun} />
      <Txt variant="small" color={colors.onSun} style={{ flex: 1 }}>
        {t('offline')}
      </Txt>
    </View>
  );
}

/** Small note on screens showing a saved copy. */
export function SavedCopyNote({ at }: { at: string | null }) {
  const { t, language } = useSettings();
  if (!at) return null;
  return (
    <Txt variant="mono" muted>
      {t('savedCopy')} · {shortDate(at, language)} {timeOfDay(at, language)}
    </Txt>
  );
}
