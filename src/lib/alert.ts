import { Alert, Platform } from 'react-native';

/**
 * A short message to the member: errors, confirmations. React Native's Alert does nothing on the web,
 * so the web version uses the browser's own dialog.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
