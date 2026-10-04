import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useSettings } from '@/providers/settings';

export default function TabsLayout() {
  const { colors, t, textScale } = useSettings();

  const settingsButton = () => (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel={t('settings')}
      hitSlop={10}
      style={{ marginHorizontal: 16, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="accessibility-outline" size={24} color={colors.text} />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        headerTitleStyle: { fontFamily: Fonts.display, fontSize: 21 },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerRight: settingsButton,
        tabBarActiveTintColor: colors.leaf,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: Fonts.bodyBold, fontSize: 11.5 * Math.min(textScale, 1.2) },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'The Index',
          tabBarLabel: t('discover'),
          tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t('events'),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="resources"
        options={{
          title: t('resources'),
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
