// react-native-web's Alert.alert does nothing, so on the web link every error, confirmation and
// "sent" message would vanish. This routes them to the browser's own dialogs instead.
import { Alert, Platform, type AlertButton } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons ?? [];
    if (list.length <= 1) {
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const cancel = list.find((b) => b.style === 'cancel');
    const action = list.find((b) => b !== cancel) ?? list[0];
    if (window.confirm(`${text}\n\n${action.text ?? 'OK'}?`)) action.onPress?.();
    else cancel?.onPress?.();
  };
}

/** Asks before doing something that can't be undone. Works on phones, tablets and the web. */
export function confirmThen(title: string, message: string, action: string, onYes: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onYes },
  ]);
}
