import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Fonts, Radius, Space, TapTarget } from '@/constants/theme';
import { useLayout } from '@/lib/layout';
import { useSettings } from '@/providers/settings';

type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
const VARIANTS = {
  display: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 31 },
  title: { fontFamily: Fonts.display, fontSize: 21, lineHeight: 26 },
  heading: { fontFamily: Fonts.bodyBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: Fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: Fonts.bodyBold, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: Fonts.monoMedium, fontSize: 11.5, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  mono: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export type TxtVariant = keyof typeof VARIANTS;

/** Text that follows the member's in-app text size on top of the phone's own setting. */
export function Txt({
  variant = 'body',
  color,
  muted,
  style,
  children,
  ...rest
}: ComponentProps<typeof Text> & { variant?: TxtVariant; color?: string; muted?: boolean }) {
  const { colors, textScale } = useSettings();
  const base = VARIANTS[variant];
  return (
    <Text
      {...rest}
      style={[
        base,
        { color: color ?? (muted || variant === 'label' ? colors.muted : colors.text) },
        { fontSize: base.fontSize * textScale, lineHeight: base.lineHeight * textScale },
        style,
      ]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
/**
 * A scrolling page. On tablets the content sits in a centered column so lines stay readable:
 * `width="reading"` (default) for forms and text, `width="wide"` for grids of cards.
 */
export function Screen({
  children,
  scroll = true,
  width = 'reading',
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  width?: 'reading' | 'wide' | 'full';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useSettings();
  const { isTablet } = useLayout();
  const column: ViewStyle | null =
    isTablet && width !== 'full' ? { width: '100%', maxWidth: width === 'wide' ? 1180 : 760, alignSelf: 'center' } : null;
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.screen, isTablet && styles.screenTablet, column, style]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Lays cards out in columns on tablets; a single column on phones. */
export function Grid({ children, columns, gap = Space.lg }: { children: ReactNode; columns?: number; gap?: number }) {
  const layout = useLayout();
  const [width, setWidth] = useState(0);
  const cols = columns ?? layout.columns;
  const items = Children.toArray(children);
  if (cols <= 1) return <View style={{ gap }}>{items}</View>;
  const cell = width ? Math.floor((width - gap * (cols - 1)) / cols) : undefined;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap, alignItems: 'flex-start' }}>
      {items.map((child, i) => (
        <View key={i} style={{ width: cell ?? `${Math.floor(100 / cols) - 2}%` }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = 'plain',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'plain' | 'leaf' | 'soft' | 'sun';
}) {
  const { colors } = useSettings();
  const toneStyle = {
    plain: { backgroundColor: colors.surface, borderColor: colors.line },
    leaf: { backgroundColor: colors.leaf, borderColor: colors.leaf },
    soft: { backgroundColor: colors.leafSoft, borderColor: colors.leaf },
    sun: { backgroundColor: colors.sunSoft, borderColor: colors.sunSoft },
  }[tone];
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export function Row({ children, style, gap = Space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap }, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  busy,
  small,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'inverse';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useSettings();
  const bg = kind === 'primary' ? colors.leaf : kind === 'inverse' ? colors.onLeaf : 'transparent';
  const fg = kind === 'primary' ? colors.onLeaf : colors.leaf;
  const border = kind === 'inverse' ? colors.onLeaf : colors.leaf;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Txt variant={small ? 'smallBold' : 'bodyBold'} color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const { colors } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.leafSoft : colors.surface, borderColor: selected ? colors.leaf : colors.line },
      ]}>
      {icon ? <Ionicons name={icon} size={16} color={colors.leaf} /> : null}
      <Txt variant={selected ? 'smallBold' : 'small'}>{label}</Txt>
    </Pressable>
  );
}

export function Pill({ label, tone = 'plain', icon }: { label: string; tone?: 'plain' | 'leaf' | 'sun' | 'real' | 'sample'; icon?: IconName }) {
  const { colors } = useSettings();
  const t = {
    plain: { bg: 'transparent', fg: colors.muted, border: colors.line, dashed: false },
    leaf: { bg: colors.leafSoft, fg: colors.text, border: colors.leafSoft, dashed: false },
    sun: { bg: colors.sunSoft, fg: colors.onSun, border: colors.sunSoft, dashed: false },
    real: { bg: colors.realSoft, fg: colors.real, border: colors.realSoft, dashed: false },
    sample: { bg: 'transparent', fg: colors.muted, border: colors.muted, dashed: true },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border, borderStyle: t.dashed ? 'dashed' : 'solid' }]}>
      {icon ? <Ionicons name={icon} size={13} color={t.fg} /> : null}
      <Txt variant="small" color={t.fg} style={{ fontSize: 12.5 }}>
        {label}
      </Txt>
    </View>
  );
}

export function Verified() {
  const { colors, t } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={t('verified')}>
      <Ionicons name="shield-checkmark" size={15} color={colors.leaf} />
      <Txt variant="smallBold" color={colors.leaf}>
        {t('verified')}
      </Txt>
    </View>
  );
}

/** Marks content as either BFI's own published content or invented sample data. */
export function Provenance({ sample }: { sample: boolean }) {
  const { t } = useSettings();
  return sample ? <Pill label={t('sample')} tone="sample" /> : <Pill label={t('fromBfi')} tone="real" icon="checkmark" />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useSettings();
  return (
    <View style={[styles.segment, { borderColor: colors.line }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segmentItem, { backgroundColor: on ? colors.text : colors.surface }]}>
            <Txt variant={on ? 'smallBold' : 'small'} color={on ? colors.surface : colors.muted}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  const { colors, textScale } = useSettings();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="smallBold">{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...input}
        style={[
          styles.input,
          { borderColor: colors.line, backgroundColor: colors.sunk, color: colors.text, fontSize: 16 * textScale },
          input.multiline && { minHeight: 96, textAlignVertical: 'top' },
          input.style,
        ]}
      />
      {hint ? (
        <Txt variant="small" muted>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useSettings();
  return (
    <View style={[styles.toggle, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyBold">{label}</Txt>
        {hint ? (
          <Txt variant="small" muted>
            {hint}
          </Txt>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.leaf, false: colors.line }}
        thumbColor={value ? colors.onLeaf : undefined}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
export function Loading() {
  const { colors } = useSettings();
  return (
    <View style={{ padding: Space.xl, alignItems: 'center' }}>
      <ActivityIndicator color={colors.leaf} accessibilityLabel="Loading" />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors, t } = useSettings();
  return (
    <View style={[styles.notice, { borderColor: colors.danger }]} accessibilityRole="alert">
      <Txt variant="small" color={colors.danger}>
        {message}
      </Txt>
      {onRetry ? <Button small kind="ghost" label={t('tryAgain')} onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const { colors } = useSettings();
  return (
    <View style={[styles.notice, { borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center' }]}>
      <Txt variant="small" muted style={{ textAlign: 'center' }}>
        {children}
      </Txt>
    </View>
  );
}

export function SignInPrompt() {
  const { t } = useSettings();
  return (
    <Card tone="sun" style={{ gap: Space.md }}>
      <Txt>{t('signInToMessage')}</Txt>
      <Button label={t('signIn')} onPress={() => router.push('/sign-in')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { padding: Space.lg, gap: Space.lg, paddingBottom: Space.xxl },
  screenTablet: { padding: Space.xl, gap: Space.xl },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Space.lg, gap: Space.sm },
  button: {
    minHeight: TapTarget,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: Space.md, borderRadius: Radius.sm },
  chip: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.sm, overflow: 'hidden', alignSelf: 'flex-start' },
  segmentItem: { minHeight: 38, paddingHorizontal: 14, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, minHeight: TapTarget },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Space.md, borderWidth: 1, borderRadius: Radius.md, padding: Space.md },
  notice: { borderWidth: 1, borderRadius: Radius.md, padding: Space.lg, gap: Space.sm },
});
