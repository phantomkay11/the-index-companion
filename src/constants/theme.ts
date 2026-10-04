/**
 * The Index design tokens.
 * Green is BFI's own site color (#007640). Every screen reads colors from here,
 * so light, dark and high-contrast modes stay consistent.
 */

export type Palette = {
  background: string;
  surface: string;
  sunk: string;
  text: string;
  muted: string;
  line: string;
  leaf: string;
  onLeaf: string;
  leafSoft: string;
  sun: string;
  sunSoft: string;
  onSun: string;
  real: string;
  realSoft: string;
  danger: string;
};

const light: Palette = {
  background: '#edf1ec',
  surface: '#fdfdfb',
  sunk: '#f3f6f2',
  text: '#122019',
  muted: '#506157',
  line: '#d3dcd5',
  leaf: '#007640',
  onLeaf: '#ffffff',
  leafSoft: '#dcede2',
  sun: '#e9a91f',
  sunSoft: '#fbefcf',
  onSun: '#5f4100',
  real: '#0d4f8a',
  realSoft: '#dfeaf5',
  danger: '#a3341f',
};

const dark: Palette = {
  background: '#0c1210',
  surface: '#141d18',
  sunk: '#101814',
  text: '#e5eee8',
  muted: '#9aaba0',
  line: '#29362f',
  leaf: '#4fc78c',
  onLeaf: '#06130c',
  leafSoft: '#163527',
  sun: '#f2c14e',
  sunSoft: '#382e13',
  onSun: '#f2c14e',
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
  onSun: '#3f2b00',
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
  onLeaf: '#000000',
  onSun: '#ffd76a',
  real: '#b5dcff',
};

export function palette(scheme: 'light' | 'dark', highContrast: boolean): Palette {
  if (scheme === 'dark') return highContrast ? contrastDark : dark;
  return highContrast ? contrastLight : light;
}

/** Font family names registered in the root layout. */
export const Fonts = {
  display: 'YoungSerif_400Regular',
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;

/** Minimum touch target, in points. */
export const TapTarget = 44;
