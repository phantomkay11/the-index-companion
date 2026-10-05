import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { YoungSerif_400Regular } from '@expo-google-fonts/young-serif';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

import { Fonts } from '@/constants/theme';
import { AuthProvider } from '@/providers/auth';
import { NotificationsProvider } from '@/providers/notifications';
import { SettingsProvider, useSettings } from '@/providers/settings';

SplashScreen.preventAutoHideAsync();

// Phones stay upright; iPads and Android tablets rotate freely.
if (Platform.OS !== 'web') {
  const { width, height } = Dimensions.get('screen');
  if (Math.min(width, height) < 600) {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
    YoungSerif_400Regular,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SettingsProvider>
      <AuthProvider>
        <NotificationsProvider>
          <AppStack />
        </NotificationsProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

function AppStack() {
  const { colors, scheme, reduceMotion, t } = useSettings();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.leaf,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.line,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTitleStyle: { fontFamily: Fonts.display },
          headerBackButtonDisplayMode: 'minimal',
          animation: reduceMotion ? 'none' : 'default',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="farm/[id]" options={{ title: '' }} />
        <Stack.Screen name="thread/[id]" options={{ title: '' }} />
        <Stack.Screen name="inquiry/[farmId]" options={{ title: t('sendInquiry'), presentation: 'modal' }} />
        <Stack.Screen name="about" options={{ title: t('about'), presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: t('settings'), presentation: 'modal' }} />
        <Stack.Screen name="sign-in" options={{ title: t('signIn'), presentation: 'modal' }} />
        <Stack.Screen name="my-farm" options={{ title: t('myFarm') }} />
        <Stack.Screen name="post-event" options={{ title: t('postEvent'), presentation: 'modal' }} />
        <Stack.Screen name="review" options={{ title: t('review') }} />
        <Stack.Screen name="notifications" options={{ title: t('notifications') }} />
        <Stack.Screen name="alerts" options={{ title: t('nearMeAlerts') }} />
        <Stack.Screen name="new-post" options={{ title: t('newPost'), presentation: 'modal' }} />
        <Stack.Screen name="compose-broadcast" options={{ title: t('broadcast'), presentation: 'modal' }} />
        <Stack.Screen name="impact" options={{ title: t('impact') }} />
      </Stack>
    </ThemeProvider>
  );
}
