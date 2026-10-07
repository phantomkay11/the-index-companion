import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold } from '@expo-google-fonts/figtree';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { YoungSerif_400Regular } from '@expo-google-fonts/young-serif';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useNavigationContainerRef, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Dimensions, Platform, Pressable, Text, useColorScheme, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Fonts } from '@/constants/theme';
import { tr } from '@/lib/i18n';
import { AuthProvider } from '@/providers/auth';
import { NotificationsProvider } from '@/providers/notifications';
import { SettingsProvider, useSettings } from '@/providers/settings';

SplashScreen.preventAutoHideAsync();

// Opening a screen directly (a link, a notification, a refresh on the web) still puts the tabs underneath,
// so there's always a way back.
export const unstable_settings = { initialRouteName: '(tabs)' };

/** If a screen crashes, show a way out instead of a blank page. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  // The app's own settings may be what broke, so this screen only follows the phone's light or dark mode.
  const dark = useColorScheme() === 'dark';
  const ink = dark ? '#e8f0ea' : '#13241b';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: dark ? '#0b1310' : '#ffffff' }}>
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: ink, textAlign: 'center' }}>
        {tr('m_errorTitle')}
      </Text>
      <Text style={{ fontSize: 16, color: dark ? '#9db0a4' : '#55665c', textAlign: 'center' }}>{tr('m_errorHint')}</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={{ minHeight: 48, paddingHorizontal: 24, borderRadius: 999, backgroundColor: '#007640', justifyContent: 'center' }}>
        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>{tr('tryAgain')}</Text>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => router.replace('/')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: dark ? '#4fc78c' : '#007640', fontSize: 16, fontWeight: '700' }}>{tr('goDiscover')}</Text>
      </Pressable>
    </View>
  );
}

function HeaderBack({ color, label }: { color: string; label: string }) {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel={router.canGoBack() ? tr('m_back') : tr('m_backTo', { label })}
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Icon name="chevron-back" size={26} color={color} />
    </Pressable>
  );
}

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
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
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
      {Platform.OS === 'web' ? <WebTitle /> : null}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          // A 44-point back button that says "Back" to screen readers, and goes to Discover when there's no history.
          headerLeft: () => <HeaderBack color={colors.text} label={t('discover')} />,
          headerTitleStyle: { fontFamily: Fonts.heading },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          animation: reduceMotion ? 'none' : 'default',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('discover') }} />
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
        <Stack.Screen name="surveys" options={{ title: t('surveys') }} />
        <Stack.Screen name="survey/[id]" options={{ title: t('surveys') }} />
        <Stack.Screen name="survey-builder" options={{ title: t('newSurvey'), presentation: 'modal' }} />
        <Stack.Screen name="survey-results/[id]" options={{ title: t('surveyResults') }} />
        <Stack.Screen name="checkin/[id]" options={{ title: t('checkIn') }} />
        <Stack.Screen name="checkins" options={{ title: t('checkIn') }} />
        <Stack.Screen name="send-checkin" options={{ title: t('sendCheckin'), presentation: 'modal' }} />
        <Stack.Screen name="+not-found" options={{ title: t('notFound'), headerTitle: () => null }} />
      </Stack>
    </ThemeProvider>
  );
}

/** On the web, name each browser tab after the screen ("Settings · The Index"), as screen readers announce it. */
function WebTitle() {
  const nav = useNavigationContainerRef();
  useEffect(() => {
    const update = () => {
      if (typeof document === 'undefined' || !nav.isReady()) return;
      const title = (nav.getCurrentOptions() as { title?: unknown } | undefined)?.title;
      document.title = typeof title === 'string' && title.trim() ? `${title} · The Index` : 'The Index';
    };
    update();
    const offState = nav.addListener('state', update);
    const offOptions = nav.addListener('options', update);
    return () => {
      offState();
      offOptions();
    };
  }, [nav]);
  return null;
}
