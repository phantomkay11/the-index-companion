import type { PostKind } from '@/lib/types';

/** Community board post types. Icon names are Ionicons. */
export const POST_KINDS: { id: PostKind; label: string; icon: string; hint: string }[] = [
  { id: 'need', label: 'Need help', icon: 'hand-left-outline', hint: 'Harvest hands, a ride to market, advice' },
  { id: 'offer', label: 'Offering', icon: 'gift-outline', hint: 'Seedlings, surplus produce, a skill' },
  { id: 'equipment', label: 'Equipment', icon: 'construct-outline', hint: 'Tools, tractors or cold storage to lend or share' },
  { id: 'ride', label: 'Rides and hauling', icon: 'car-outline', hint: 'Carpools to events, shared trucking' },
  { id: 'bulk', label: 'Buying together', icon: 'cart-outline', hint: 'Pool orders for seed, feed or packaging' },
  { id: 'mentor', label: 'Mentoring', icon: 'school-outline', hint: 'Offer or ask for guidance from another grower' },
];

export function kindLabel(kind: PostKind) {
  return POST_KINDS.find((k) => k.id === kind)?.label ?? kind;
}
