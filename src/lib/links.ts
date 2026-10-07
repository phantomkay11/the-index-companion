import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking } from 'react-native';

/** True only for well-formed https links. Anything a member typed goes through this before it is opened. */
export function isSafeUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

/** Opens an https link in the in-app browser; refuses anything else (javascript:, data:, http:). */
export async function openLink(url: string | null | undefined) {
  if (!isSafeUrl(url)) {
    Alert.alert('Link not opened', 'This link does not look safe to open.');
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Link not opened', url);
    }
  }
}

/** Keeps + and digits only. */
export function dialable(phone: string) {
  return phone.replace(/[^\d+]/g, '');
}

/**
 * Calls or texts a number. On devices that can't (an iPad without a phone plan, or the web),
 * offers to copy the number instead of silently doing nothing.
 */
export async function contact(kind: 'tel' | 'sms', phone: string) {
  const n = dialable(phone);
  const url = `${kind}:${encodeURIComponent(n)}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return;
    }
  } catch {
    // fall through to the copy option
  }
  Alert.alert(kind === 'tel' ? "This device can't make calls" : "This device can't send texts", n, [
    { text: 'Copy number', onPress: () => Clipboard.setStringAsync(n) },
    { text: 'OK', style: 'cancel' },
  ]);
}

