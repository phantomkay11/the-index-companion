import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';

const subscribe = () => () => {};

/**
 * Ionicons, safe for the web's pre-rendered pages: the icon font isn't available while pages are
 * rendered ahead of time, so a same-size blank holds the space until the page is live in the browser.
 */
export function Icon(props: ComponentProps<typeof Ionicons>) {
  const live = useSyncExternalStore(
    subscribe,
    () => true,
    () => Platform.OS !== 'web',
  );
  if (!live) {
    const size = props.size ?? 12;
    return <View style={[{ width: size, height: size }, props.style as object]} />;
  }
  return <Ionicons {...props} />;
}

export type IconName = ComponentProps<typeof Ionicons>['name'];
