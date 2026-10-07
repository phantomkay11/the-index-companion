/**
 * The Index design tokens.
 * Green is BFI's own site color (#007640). Every screen reads colors from here,
 * so light, dark and high-contrast modes stay consistent.
 */

export type Palette = {
  background: string;
  surface: string;
  /** Tinted panel used instead of outlined boxes. */
  sunk: string;
  text: string;
  muted: string;
  line: string;
  leaf: string;
  onLeaf: string;
  leafSoft: string;
  /** Deep green for gradients and text on light tints. */
  forest: string;
  /** Bright fresh green, the light end of the brand gradient. */
  sprout: string;
  sun: string;
  sunSoft: string;
  onSun: string;
  /** Harvest yellow: search, highlights and what's fresh. */
  harvest: string;
  /** Edges of inputs, chips and panels: invisible normally, solid in high contrast. */
  outline: string;
  placeholder: string;
  onHarvest: string;
  real: string;
  realSoft: string;
  danger: string;
};

const light: Palette = {
  background: '#ffffff',
  surface: '#ffffff',
  sunk: '#f1f6f2',
  text: '#13241b',
  muted: '#55665c',
  line: '#e1e9e3',
  leaf: '#007640',
  onLeaf: '#ffffff',
  leafSoft: '#e3f3e8',
  forest: '#0b4a2f',
  sprout: '#2fb36b',
  sun: '#e9a91f',
  sunSoft: '#fff4c7',
  onSun: '#5f4100',
  harvest: '#ffd84d',
  onHarvest: '#2a2200',
  outline: 'transparent',
  placeholder: '#6b7a71',
  real: '#0d4f8a',
  realSoft: '#e3eef8',
  danger: '#a3341f',
};

const dark: Palette = {
  background: '#0b1310',
  surface: '#111c17',
  sunk: '#16231d',
  text: '#e8f0ea',
  muted: '#9db0a4',
  line: '#24332b',
  leaf: '#4fc78c',
  onLeaf: '#06130c',
  leafSoft: '#173627',
  forest: '#a8e6c1',
  sprout: '#5fd697',
  sun: '#f2c14e',
  sunSoft: '#3a3014',
  onSun: '#f2c14e',
  harvest: '#ffd84d',
  onHarvest: '#2a2200',
  outline: 'transparent',
  placeholder: '#8a9b90',
  real: '#8cc2f2',
  realSoft: '#16283a',
  danger: '#ff8a73',
};

const contrastLight: Palette = {
  ...light,
  background: '#ffffff',
  surface: '#ffffff',
  sunk: '#ffffff',
  text: '#000000',
  muted: '#1a1a1a',
  line: '#000000',
  leaf: '#004a28',
  forest: '#003a20',
  onSun: '#3f2b00',
  outline: '#000000',
  placeholder: '#595959',
  real: '#06335c',
};

const contrastDark: Palette = {
  ...dark,
  background: '#000000',
  surface: '#000000',
  sunk: '#000000',
  text: '#ffffff',
  muted: '#f0f0f0',
  line: '#ffffff',
  leaf: '#7dffbe',
  forest: '#c9ffe0',
  onLeaf: '#000000',
  onSun: '#ffd76a',
  outline: '#ffffff',
  placeholder: '#bdbdbd',
  real: '#b5dcff',
};

/**
 * The brand gradient: deep forest into BFI green. It always carries white text, so it uses fixed deep greens
 * in every mode (white stays above 4.5:1 across the whole band), and goes solid in high contrast.
 */
export function brandGradient(colors: Palette) {
  if (colors.outline !== 'transparent') return ['#003a20', '#003a20'] as const;
  return ['#0b4a2f', '#007640', '#0a6b3b'] as const;
}

/** A dark wash over photos so white text stays readable (bottom of the image). */
export const SCRIM = ['rgba(6,24,15,0)', 'rgba(6,24,15,0.35)', 'rgba(6,24,15,0.82)'] as const;

export function palette(scheme: 'light' | 'dark', highContrast: boolean): Palette {
  if (scheme === 'dark') return highContrast ? contrastDark : dark;
  return highContrast ? contrastLight : light;
}

/** Font family names registered in the root layout. */
export const Fonts = {
  /** Figtree: friendly geometric headings. Atkinson Hyperlegible stays for reading. */
  hero: 'Figtree_800ExtraBold',
  display: 'Figtree_700Bold',
  heading: 'Figtree_700Bold',
  ui: 'Figtree_600SemiBold',
  serif: 'YoungSerif_400Regular',
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

/** Minimum touch target, in points. */
export const TapTarget = 44;
