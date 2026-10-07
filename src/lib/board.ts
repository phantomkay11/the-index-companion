import { tr, type StringKey } from '@/lib/i18n';
import type { PostKind } from '@/lib/types';

export type PostKindInfo = {
  /** Stored in the database; never translated. */
  id: PostKind;
  /** Ionicons name. */
  icon: string;
  /** Translation keys: inside components prefer t(k.labelKey) / t(k.hintKey). */
  labelKey: StringKey;
  hintKey: StringKey;
  /** The label and hint in the current language (read at call time). */
  readonly label: string;
  readonly hint: string;
};

function kind(id: PostKind, icon: string, labelKey: StringKey, hintKey: StringKey): PostKindInfo {
  return {
    id,
    icon,
    labelKey,
    hintKey,
    get label() {
      return tr(labelKey);
    },
    get hint() {
      return tr(hintKey);
    },
  };
}

/** Community board post types. */
export const POST_KINDS: PostKindInfo[] = [
  kind('need', 'hand-left-outline', 's_kindNeed', 's_kindNeedHint'),
  kind('offer', 'gift-outline', 's_kindOffer', 's_kindOfferHint'),
  kind('equipment', 'construct-outline', 's_kindEquipment', 's_kindEquipmentHint'),
  kind('ride', 'car-outline', 's_kindRide', 's_kindRideHint'),
  kind('bulk', 'cart-outline', 's_kindBulk', 's_kindBulkHint'),
  kind('mentor', 'school-outline', 's_kindMentor', 's_kindMentorHint'),
];

/**
 * A post kind in the member's language (unknown kinds show as stored).
 * Inside components pass `t` from useSettings so the label updates when the language changes.
 */
export function kindLabel(kind: PostKind, t: (key: StringKey) => string = tr) {
  const k = POST_KINDS.find((x) => x.id === kind);
  return k ? t(k.labelKey) : kind;
}
