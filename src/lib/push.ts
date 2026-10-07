import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { tr } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

/** True inside the Expo Go app, where remote push and some native modules aren't available. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (Platform.OS !== 'web') {
  // Show notifications while the app is open, too.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export type PushResult = { ok: true } | { ok: false; reason: string };

/**
 * Ask for permission, get this phone's Expo push token and save it to the member's contact settings.
 * Push needs a development or store build (not Expo Go on Android) and an EAS project id.
 */
export async function registerForPush(userId: string): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: tr('s_pushWeb') };
  if (!Device.isDevice) return { ok: false, reason: tr('s_pushSimulator') };
  if (isExpoGo && Platform.OS === 'android') {
    return { ok: false, reason: tr('s_pushExpoGo') };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'The Index',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#007640',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return { ok: false, reason: tr('s_pushOff') };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: tr('s_pushNoProject') };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.from('contact_prefs').update({ push_token: token, updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : tr('s_pushUnreachable') };
  }
}

export async function unregisterPush(userId: string) {
  await supabase.from('contact_prefs').update({ push_token: null }).eq('user_id', userId);
}
