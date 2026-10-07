import { monthYear } from '@/lib/format';
import { currentLang, tr, type Lang, type StringKey } from '@/lib/i18n';

/**
 * BFI's descriptive copy in one language. Inside components call bfiCopy(t, language) with both from
 * useSettings(), so the text is recomputed when the language changes (the BFI getters below read the
 * current language at call time, which memoized components may not re-read).
 */
export function bfiCopy(t: (key: StringKey) => string = tr, lang: Lang = currentLang()) {
  return {
    tagline: t('s_bfiTagline'),
    status: t('s_bfiStatus'),
    stats: [
      { value: '~1,300', label: t('s_bfiStatGrowers') },
      { value: '400+', label: t('s_bfiStatWomen') },
      { value: '300+', label: t('s_bfiStatOrganic') },
    ],
    pillars: [t('s_bfiPillar1'), t('s_bfiPillar2'), t('s_bfiPillar3'), t('s_bfiPillar4')],
    timeline: [
      [monthYear('2020-04', lang), t('s_bfiTimeline1')],
      [monthYear('2020-07', lang), t('s_bfiTimeline2')],
      [monthYear('2021-11', lang), t('s_bfiTimeline3')],
      ['2021–22', t('s_bfiTimeline4')],
      [monthYear('2024-10', lang), t('s_bfiTimeline5')],
    ] as readonly (readonly [string, string])[],
    programs: [t('s_bfiProgram1'), t('s_bfiProgram2'), t('s_bfiProgram3'), t('s_bfiProgram4'), t('s_bfiProgram5'), t('s_bfiProgram6')],
    founder: t('s_bfiFounder'),
    contacts: [
      { label: t('s_bfiContactGeneral'), value: 'foodculture@blackfarmersindex.com' },
      { label: t('s_bfiContactCollab'), value: 'cornbread@blackfarmersindex.com' },
      { label: t('s_bfiContactDonor'), value: 'cheddar@blackfarmersindex.com' },
      { label: t('s_bfiContactPress'), value: 'lettuce@blackfarmersindex.com' },
      { label: t('s_bfiContactPhone'), value: '337-357-8321' },
      { label: t('s_bfiContactMail'), value: '1105 Moss St #90391, Lafayette, LA 70509' },
    ],
  };
}

/**
 * What Black Farmers Index publishes about itself (blackfarmersindex.com: home, The Index, About BFI).
 * Checked October 4, 2026. BFI should review and own this copy.
 *
 * Descriptive copy (tagline, stats, pillars, timeline, programs, contact roles) is translated: these getters
 * read the current language each time (see bfiCopy). BFI's own words stay as published: the
 * "Build + Connect + Grow" motto, the Fannie Lou Hamer quote, partner and people names, and all addresses,
 * emails and links.
 */
export const BFI = {
  site: 'https://blackfarmersindex.com',
  donateUrl: 'https://pay.blackfarmersindex.com/',
  shopUrl: 'https://blackfarmersindex.com/shop',
  mission: 'Build + Connect + Grow',
  get tagline() {
    return bfiCopy().tagline;
  },
  get status() {
    return bfiCopy().status;
  },
  get stats() {
    return bfiCopy().stats;
  },
  get pillars() {
    return bfiCopy().pillars;
  },
  get timeline() {
    return bfiCopy().timeline;
  },
  get programs() {
    return bfiCopy().programs;
  },
  partners:
    'Ark Republic, Organic Trade Association, Florida Organic Growers, Pennsylvania Certified Growers, Accredited Certifiers Association, IGH Gardens',
  get founder() {
    return bfiCopy().founder;
  },
  quote: { text: 'If you give him land, he will grow his own food.', by: 'Fannie Lou Hamer, on the Freedom Farm Cooperative' },
  get contacts() {
    return bfiCopy().contacts;
  },
};

/** BFI's own grower types, used for browsing. Icon names are Ionicons. */
// `id` is the value stored in the database; `label` is the translation key shown to members.
export const CATEGORIES = [
  { id: 'Row crops', icon: 'leaf-outline', label: 'cat_rowCrops' },
  { id: 'Ranchers', icon: 'paw-outline', label: 'cat_ranchers' },
  { id: 'Vegetables & fruit', icon: 'nutrition-outline', label: 'cat_vegFruit' },
  { id: 'Beekeepers', icon: 'flower-outline', label: 'cat_beekeepers' },
  { id: 'Fisherfolk', icon: 'fish-outline', label: 'cat_fisherfolk' },
  { id: 'Foragers', icon: 'trail-sign-outline', label: 'cat_foragers' },
  { id: 'Vintners', icon: 'wine-outline', label: 'cat_vintners' },
  { id: 'Organic', icon: 'ribbon-outline', label: 'cat_organic' },
] as const;

/** A grower type in the member's language (unknown types show as stored). */
export function categoryLabel(id: string, t: (key: (typeof CATEGORIES)[number]['label']) => string) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? t(c.label) : id;
}

/** "Region 6" / "Región 6", or "International". */
export function regionLabel(id: string, t: (key: 'region' | 'international') => string) {
  return id === 'intl' ? t('international') : `${t('region')} ${id}`;
}
