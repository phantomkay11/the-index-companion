import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon as Ionicons } from '@/components/icon';
import { Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { useSettings } from '@/providers/settings';

/**
 * "Which door are you?" The three ways into the app, always visible at the top of Discover.
 * Growers list or update a farm, buyers find growers near them, volunteers find shifts.
 */
export function FrontDoor({ onBuy, isTablet }: { onBuy: () => void; isTablet?: boolean }) {
  const { colors } = useSettings();

  const doors = [
    {
      key: 'grow',
      icon: 'leaf-outline' as const,
      title: 'I grow food',
      detail: 'List your farm for free',
      onPress: () => router.push('/my-farm'),
    },
    {
      key: 'buy',
      icon: 'cart-outline' as const,
      title: 'I want to buy',
      detail: 'Find growers near me',
      onPress: onBuy,
    },
    {
      key: 'help',
      icon: 'hand-left-outline' as const,
      title: 'I want to help',
      detail: 'Sign up for volunteer shifts',
      onPress: () => router.push('/events'),
    },
  ];

  return (
    <View style={{ gap: Space.sm }} accessibilityRole="menu">
      <Txt variant="title" accessibilityRole="header">
        Which one are you?
      </Txt>
      <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: Space.sm }}>
        {doors.map((d) => (
          <Pressable
            key={d.key}
            onPress={d.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${d.title}. ${d.detail}.`}
            style={({ pressed }) => ({
              flex: isTablet ? 1 : undefined,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              minHeight: 72,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: Radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1.5,
              borderColor: colors.line,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.leafSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={d.icon} size={22} color={colors.onSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyBold">{d.title}</Txt>
              <Txt variant="small" muted>
                {d.detail}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
