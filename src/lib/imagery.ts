import type { ImageSource } from 'expo-image';

import { supabase } from '@/lib/supabase';
import type { Farm, FarmPhoto } from '@/lib/types';

/** A farm photo's address: a path in the farm-photos bucket, or a full https link (sample farms only). */
export function photoUrl(path: string) {
  if (/^https:\/\//.test(path)) return path;
  return supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl;
}

/**
 * Every image in the app comes from here, so photography can replace the art in one place.
 *
 * - A farm's own photos (uploaded with the farmer's consent) always come first.
 * - Otherwise the app shows brand landscape art for the farm's grower type. The art is an
 *   illustration, never a photo, so it can't be mistaken for a real farm or person.
 * - Section heroes (Discover, Events, Resources, Community) use EDITORIAL photos when they're
 *   added below, and the landscape art until then.
 *
 * To add an editorial photo: put the file in assets/images/photos/, then add an entry like
 *   discover: { source: require('@/assets/images/photos/market-morning.jpg'), alt: '…', credit: 'Name / Unsplash' },
 * Keep photos of people for editorial heroes, credited, and never present them as a listed farm.
 */
export type Picture = { source: ImageSource | number; alt: string; credit?: string | null; creditUrl?: string | null; art?: boolean };

export const LANDSCAPES = {
  'Row crops': require('@/assets/images/landscapes/row-crops.jpg'),
  Ranchers: require('@/assets/images/landscapes/ranchers.jpg'),
  'Vegetables & fruit': require('@/assets/images/landscapes/vegetables-fruit.jpg'),
  Beekeepers: require('@/assets/images/landscapes/beekeepers.jpg'),
  Fisherfolk: require('@/assets/images/landscapes/fisherfolk.jpg'),
  Foragers: require('@/assets/images/landscapes/foragers.jpg'),
  Vintners: require('@/assets/images/landscapes/vintners.jpg'),
  Organic: require('@/assets/images/landscapes/organic.jpg'),
} as const;

const SECTION_ART = {
  discover: require('@/assets/images/landscapes/discover.jpg'),
  events: require('@/assets/images/landscapes/events.jpg'),
  resources: require('@/assets/images/landscapes/resources.jpg'),
  community: require('@/assets/images/landscapes/community.jpg'),
} as const;

export type Section = keyof typeof SECTION_ART;

/** Editorial photographs for section heroes. Empty until real photos are added. */
const EDITORIAL: Partial<Record<Section, Picture>> = {};

export function sectionImage(section: Section): Picture {
  return EDITORIAL[section] ?? { source: SECTION_ART[section], alt: '', art: true };
}

export function categoryImage(category: string): Picture {
  const source = LANDSCAPES[category as keyof typeof LANDSCAPES] ?? SECTION_ART.discover;
  return { source, alt: '', art: true };
}

function fromPhoto(p: FarmPhoto): Picture {
  return { source: { uri: photoUrl(p.path) }, alt: p.alt_text, credit: p.credit, creditUrl: p.credit_url };
}

/** The farm's cover: its first photo, or the art for its grower type. */
export function farmCover(farm: Farm): Picture {
  const first = [...(farm.farm_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  if (first) return fromPhoto(first);
  return categoryImage(farm.categories[0] ?? 'Vegetables & fruit');
}

export function farmPhotos(farm: Farm): Picture[] {
  return [...(farm.farm_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(fromPhoto);
}

/** Art for an event, by its type. */
export function eventImage(type: string): Picture {
  const t = type.toLowerCase();
  if (t.includes('market')) return categoryImage('Vegetables & fruit');
  if (t.includes('volunteer') || t.includes('harvest')) return categoryImage('Row crops');
  if (t.includes('workshop') || t.includes('training')) return categoryImage('Organic');
  if (t.includes('bfi') || t.includes('gala')) return sectionImage('events');
  return sectionImage('community');
}
