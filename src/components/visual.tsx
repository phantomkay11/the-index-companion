import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';

import { Txt } from '@/components/ui';
import { brandGradient, Radius, SCRIM } from '@/constants/theme';
import type { Picture } from '@/lib/imagery';
import { useSettings } from '@/providers/settings';

/**
 * A photo (or landscape art) that fills its frame. Art is decorative, so screen readers skip it;
 * photos are described with their alt text. In save-data mode, photos give way to a soft brand tint.
 */
export function Photo({ picture, style, rounded, children }: { picture: Picture; style?: StyleProp<ViewStyle>; rounded?: number; children?: ReactNode }) {
  const { colors, saveData, reduceMotion } = useSettings();
  const hide = saveData && !picture.art;
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: colors.leafSoft, borderRadius: rounded }, style]}>
      {hide ? (
        <LinearGradient colors={[colors.leafSoft, colors.sunk]} style={StyleSheet.absoluteFill} />
      ) : picture.art ? (
        // Decorative art: hidden from screen readers on every platform (expo-image drops alt="" on the web).
        <View style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
          <Image source={picture.source} contentFit="cover" transition={reduceMotion ? 0 : 250} style={StyleSheet.absoluteFill} />
        </View>
      ) : (
        <Image
          source={picture.source}
          // Art is decorative: an empty alt hides it from screen readers on the web too.
          alt={picture.art ? '' : picture.alt}
          accessible={!picture.art}
          accessibilityLabel={picture.art ? undefined : picture.alt}
          contentFit="cover"
          transition={reduceMotion ? 0 : 250}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}

/** Darkens the bottom of a photo so white text on it stays readable. */
export function Scrim({ from = 0.35, top }: { from?: number; top?: boolean }) {
  return (
    <>
      <LinearGradient pointerEvents="none" colors={SCRIM} locations={[from, Math.min(0.9, from + 0.3), 1]} style={StyleSheet.absoluteFill} />
      {top ? (
        <LinearGradient pointerEvents="none" colors={['rgba(6,24,15,0.45)', 'rgba(6,24,15,0)']} style={[StyleSheet.absoluteFill, { bottom: '70%' }]} />
      ) : null}
    </>
  );
}

/** "Photo: Name / Unsplash", tucked into a corner of the photo it credits. */
export function Credit({ picture, style, link = true }: { picture: Picture; style?: StyleProp<ViewStyle>; link?: boolean }) {
  const { t } = useSettings();
  if (!picture.credit) return null;
  const text = (
    <Txt variant="small" color="#ffffff" style={{ fontSize: 11, lineHeight: 14 }}>
      {t('m_photoCredit', { credit: picture.credit })}
    </Txt>
  );
  // Inside a tappable card a nested link can't be reached, so there the credit is plain text.
  if (!link || !picture.creditUrl) return <View style={[styles.credit, style]}>{text}</View>;
  return (
    <Pressable
      onPress={() => Linking.openURL(picture.creditUrl!)}
      accessibilityRole="link"
      hitSlop={10}
      style={[styles.credit, styles.creditLink, style]}>
      {text}
    </Pressable>
  );
}

/** A frosted label that sits on top of a photo. */
export function GlassChip({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

/** The brand gradient, forest into green into sprout, for bands and feature panels. */
export function GradientBand({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useSettings();
  return (
    <LinearGradient colors={brandGradient(colors)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.band, style]}>
      {/* A low sun in the corner, echoing the landscape art. */}
      <View pointerEvents="none" style={[styles.sun, { backgroundColor: colors.harvest }]} />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  credit: { position: 'absolute', right: 10, bottom: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  creditLink: { minHeight: 24, justifyContent: 'center', paddingVertical: 4 },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  band: { borderRadius: Radius.xl, padding: 22, gap: 14, overflow: 'hidden' },
  sun: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -90, opacity: 0.28 },
  disc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,24,15,0.55)', marginLeft: 4 },
});

/** Light status bar text while a screen with a photo under the header is in front. */
export function useLightStatusBar() {
  const { scheme } = useSettings();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark');
    }, [scheme]),
  );
}

/** A back button that stays readable over photos and white pages, and works even when opened from a link. */
export function BackDisc() {
  const { t } = useSettings();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel={t('m_back')}
      hitSlop={6}
      style={({ pressed }) => [styles.disc, { opacity: pressed ? 0.8 : 1 }]}>
      <Icon name="chevron-back" size={24} color="#ffffff" />
    </Pressable>
  );
}
