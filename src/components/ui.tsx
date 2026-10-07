import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
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
import { friendlyError } from '@/lib/errors';
import { useLayout } from '@/lib/layout';
import { useSettings } from '@/providers/settings';

type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
const VARIANTS = {
  hero: { fontFamily: Fonts.hero, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  display: { fontFamily: Fonts.hero, fontSize: 28, lineHeight: 33, letterSpacing: -0.4 },
  title: { fontFamily: Fonts.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  heading: { fontFamily: Fonts.heading, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: Fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: Fonts.bodyBold, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: Fonts.ui, fontSize: 14, lineHeight: 19 },
  mono: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export type TxtVariant = keyof typeof VARIANTS;

// Long words (farm names, links) wrap instead of running off the screen on the web.
const WEB_WRAP = { overflowWrap: 'anywhere' } as unknown as TextStyle;

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
  // A size passed in `style` is a design size: it still follows the member's text size setting.
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = (flat.fontSize ?? base.fontSize) * textScale;
  const lineHeight = flat.lineHeight
    ? flat.lineHeight * textScale
    : flat.fontSize
      ? Math.round(flat.fontSize * 1.3 * textScale)
      : base.lineHeight * textScale;
  return (
    <Text
      {...rest}
      style={[
        base,
        { color: color ?? (muted || variant === 'label' ? colors.muted : colors.text) },
        Platform.OS === 'web' ? WEB_WRAP : null,
        style,
        { fontSize, lineHeight },
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
  hero,
}: {
  children: ReactNode;
  scroll?: boolean;
  width?: 'reading' | 'wide' | 'full';
  style?: StyleProp<ViewStyle>;
  /** Full-bleed content above the page column, edge to edge (a photo hero). */
  hero?: ReactNode;
}) {
  const { colors } = useSettings();
  const { isTablet } = useLayout();
  const column: ViewStyle | null =
    isTablet && width !== 'full' ? { width: '100%', maxWidth: width === 'wide' ? 1180 : 760, alignSelf: 'center' } : null;
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} keyboardShouldPersistTaps="handled">
      {hero}
      <View style={[styles.screen, isTablet && styles.screenTablet, column, style]}>{children}</View>
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
  // Tinted panels instead of outlined boxes.
  const toneStyle = {
    plain: { backgroundColor: colors.sunk, borderColor: colors.outline },
    leaf: { backgroundColor: colors.leaf },
    soft: { backgroundColor: colors.leafSoft },
    sun: { backgroundColor: colors.sunSoft },
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
  // Primary: solid brand green. Ghost: a soft green tint (no outline). Inverse: white on photos and bands.
  const bg = kind === 'primary' ? colors.leaf : kind === 'inverse' ? colors.onLeaf : colors.leafSoft;
  const fg = kind === 'primary' ? colors.onLeaf : colors.forest;
  const border = bg;
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
      <Txt variant={small ? 'smallBold' : 'bodyBold'} color={fg} style={{ flexShrink: 1, textAlign: 'center' }}>
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
  radio,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  /** One choice of several (inside a radiogroup) rather than an on/off toggle. */
  radio?: boolean;
}) {
  const { colors } = useSettings();
  // Native: a toggle button ("on"/"off"). Web has no such role: a button with aria-pressed. Radios say "checked".
  const a11y = radio
    ? { accessibilityRole: 'radio' as const, accessibilityState: { checked: !!selected }, 'aria-checked': !!selected }
    : Platform.OS === 'web'
      ? { accessibilityRole: 'button' as const, 'aria-pressed': !!selected }
      : { accessibilityRole: 'togglebutton' as const, accessibilityState: { checked: !!selected } };
  return (
    <Pressable
      onPress={onPress}
      {...a11y}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.forest : colors.sunk, borderColor: selected ? colors.forest : colors.outline },
      ]}>
      {icon ? <Ionicons name={icon} size={16} color={selected ? colors.onLeaf : colors.leaf} /> : null}
      <Txt variant="smallBold" color={selected ? colors.onLeaf : colors.text} style={{ flexShrink: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Pill({ label, tone = 'plain', icon }: { label: string; tone?: 'plain' | 'leaf' | 'sun' | 'real' | 'sample'; icon?: IconName }) {
  const { colors } = useSettings();
  const t = {
    plain: { bg: colors.sunk, fg: colors.muted, border: colors.sunk, dashed: false },
    leaf: { bg: colors.leafSoft, fg: colors.text, border: colors.leafSoft, dashed: false },
    sun: { bg: colors.sunSoft, fg: colors.onSun, border: colors.sunSoft, dashed: false },
    real: { bg: colors.realSoft, fg: colors.real, border: colors.realSoft, dashed: false },
    sample: { bg: colors.surface, fg: colors.muted, border: colors.muted, dashed: true },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border, borderStyle: t.dashed ? 'dashed' : 'solid' }]}>
      {icon ? <Ionicons name={icon} size={13} color={t.fg} /> : null}
      <Txt variant="small" color={t.fg} style={{ fontSize: 12.5, flexShrink: 1 }}>
        {label}
      </Txt>
    </View>
  );
}

export function Verified() {
  const { colors, t } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessible accessibilityLabel={t('verified')}>
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
  const { colors, textScale } = useSettings();
  // Items wrap onto a second line rather than break words when the text is large.
  return (
    <View
      style={[styles.segment, { backgroundColor: colors.sunk, borderColor: colors.outline }, textScale > 1.25 && { borderRadius: Radius.lg }]}
      accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            style={[styles.segmentItem, on && [styles.segmentOn, { backgroundColor: colors.surface, borderColor: colors.outline === 'transparent' ? colors.surface : colors.outline }]]}>
            <Txt variant="smallBold" color={on ? colors.text : colors.muted}>
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
        placeholderTextColor={colors.placeholder}
        {...input}
        style={[
          styles.input,
          { borderColor: colors.field, backgroundColor: colors.surface, color: colors.text, fontSize: 16 * textScale },
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
  // The whole row is one big switch: easier to hit, and read as a single control.
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={({ pressed }) => [styles.toggle, { backgroundColor: colors.sunk, borderColor: colors.outline, opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyBold">{label}</Txt>
        {hint ? (
          <Txt variant="small" muted>
            {hint}
          </Txt>
        ) : null}
      </View>
      {Platform.OS === 'web' ? (
        // The web Switch is a real checkbox that would add a second, unnamed tab stop; the row is the control,
        // so draw a plain picture of a switch instead.
        <View aria-hidden style={[styles.track, { backgroundColor: value ? colors.leaf : colors.field }]}>
          <View style={[styles.thumb, { backgroundColor: value ? colors.onLeaf : '#ffffff', alignSelf: value ? 'flex-end' : 'flex-start' }]} />
        </View>
      ) : (
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Switch value={value} trackColor={{ true: colors.leaf, false: colors.field }} thumbColor={value ? colors.onLeaf : undefined} />
        </View>
      )}
    </Pressable>
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

export { friendlyError } from '@/lib/errors';

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors, t } = useSettings();
  return (
    <View style={[styles.notice, { borderWidth: 1, borderColor: colors.danger }]} accessibilityRole="alert">
      <Txt variant="small" color={colors.danger}>
        {friendlyError(message)}
      </Txt>
      <Row>
        {onRetry ? <Button small kind="ghost" label={t('tryAgain')} onPress={onRetry} /> : null}
        <Button small kind="ghost" label={t('goDiscover')} onPress={() => router.replace('/')} />
      </Row>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const { colors } = useSettings();
  return (
    <View style={[styles.notice, { backgroundColor: colors.sunk, alignItems: 'center' }]}>
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
  track: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  thumb: { width: 20, height: 20, borderRadius: 10 },
  screen: { padding: 20, gap: Space.xl, paddingBottom: 48 },
  screenTablet: { padding: Space.xxl, gap: Space.xxl },
  card: { borderRadius: Radius.lg, padding: 18, gap: Space.sm, borderWidth: 1, borderColor: 'transparent' },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    maxWidth: '100%',
  },
  buttonSmall: { minHeight: TapTarget, paddingHorizontal: 16 },
  chip: {
    minHeight: TapTarget,
    maxWidth: '100%',
    paddingVertical: 6,
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
    maxWidth: '100%',
  },
  segment: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: Radius.pill, padding: 3, alignSelf: 'flex-start', borderWidth: 1, maxWidth: '100%' },
  segmentItem: { minHeight: TapTarget, paddingHorizontal: 14, justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 2, borderColor: 'transparent' },
  segmentOn: { shadowColor: '#0b2a1b', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: TapTarget + 4 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Space.md, borderRadius: Radius.lg, padding: 16, borderWidth: 1 },
  notice: { borderRadius: Radius.lg, padding: 18, gap: Space.sm },
});
