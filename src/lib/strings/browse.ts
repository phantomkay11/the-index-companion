// Strings for the "browse" screens. Every key in `en` must exist in es, fr, ht and pt (the types enforce it).
// Placeholders like {n} are filled by t('key', { n: 3 }).
const en = {};
type Keys = Record<keyof typeof en, string>;
const es: Keys = {};
const fr: Keys = {};
const ht: Keys = {};
const pt: Keys = {};

export default { en, es, fr, ht, pt };
