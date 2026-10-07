import { Alert, Platform } from 'react-native';

import { friendlyError } from '@/lib/errors';

/**
 * A short message to the member: errors, confirmations. React Native's Alert does nothing on the web,
 * so the web version uses the browser's own dialog.
 */
export function showAlert(title: string, raw?: string) {
  const message = raw ? friendlyError(raw) : raw;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Ask before doing something with a side effect the member may not expect. Resolves true to go ahead. */
export function confirmAction(title: string, message: string, goLabel: string, cancelLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: goLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
