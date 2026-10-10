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
 * - Section heroes (Discover, Events, Resources, Community) use the EDITORIAL photos below
 *   (stock placeholders for now), with the landscape art while they load or when offline.
 *
 * To add an editorial photo: put the file in assets/images/photos/, then add an entry like
 *   discover: { source: require('@/assets/images/photos/market-morning.jpg'), alt: '…', credit: 'Name / Unsplash' },
 * Keep photos of people for editorial heroes, credited, and never present them as a listed farm.
 */
export type Picture = {
  source: ImageSource | number;
  alt: string;
  credit?: string | null;
  creditUrl?: string | null;
  art?: boolean;
  /** Shown while a linked photo loads, or if it can't (offline). */
  fallback?: number;
};

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

/** A free-license stock photo, loaded by link. Placeholders until BFI's own photography arrives. */
const stock = (url: string, alt: string, credit: string, creditUrl: string, section: Section): Picture => ({
  source: { uri: url },
  alt,
  credit,
  creditUrl,
  fallback: SECTION_ART[section],
});

const pexels = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1400`;

/**
 * Editorial photographs for section heroes.
 * PLACEHOLDERS: free-license stock (Pexels and Unsplash licenses allow app use; credited anyway).
 * Replace them with BFI's own photography, with permission, before launch.
 */
const EDITORIAL: Partial<Record<Section, Picture>> = {
  discover: stock(
    pexels(8540273),
    'A smiling farmer selling fresh vegetables at an outdoor market stand',
    'RDNE Stock project / Pexels',
    'https://www.pexels.com/photo/a-smiling-man-selling-organic-vegetables-8540273/',
    'discover',
  ),
  events: stock(
    pexels(8540249),
    'A farmer in a cowboy hat holding up a watermelon at a busy farmers market',
    'RDNE Stock project / Pexels',
    'https://www.pexels.com/photo/a-man-holding-a-watermelon-8540249/',
    'events',
  ),
  resources: stock(
    pexels(10697799),
    'An older farmer in a sun hat working in a green field',
    'Josiah Matthew / Pexels',
    'https://www.pexels.com/photo/elderly-man-in-hat-working-in-garden-10697799/',
    'resources',
  ),
  community: stock(
    'https://images.unsplash.com/photo-1697175386304-20e09a88c5a1?auto=format&fit=crop&w=1400&q=80',
    'A young person in a knit cardigan holding a box of oranges',
    'Eye for Ebony / Unsplash',
    'https://unsplash.com/photos/young-person-holding-box-of-oranges-SAh6doRUdZg',
    'community',
  ),
};

export function sectionImage(section: Section): Picture {
  return EDITORIAL[section] ?? { source: SECTION_ART[section], alt: '', art: true };
}

export function categoryImage(category: string): Picture {
  const source = LANDSCAPES[category as keyof typeof LANDSCAPES] ?? SECTION_ART.discover;
  return { source, alt: '', art: true };
}

function fromPhoto(p: FarmPhoto, category?: string): Picture {
  return {
    source: { uri: photoUrl(p.path) },
    alt: p.alt_text,
    credit: p.credit,
    creditUrl: p.credit_url,
    fallback: category ? (categoryImage(category).source as number) : undefined,
  };
}

/** The farm's cover: its first photo, or the art for its grower type. */
export function farmCover(farm: Farm): Picture {
  const first = [...(farm.farm_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  if (first) return fromPhoto(first, farm.categories[0]);
  return categoryImage(farm.categories[0] ?? 'Vegetables & fruit');
}

export function farmPhotos(farm: Farm): Picture[] {
  return [...(farm.farm_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((p) => fromPhoto(p, farm.categories[0]));
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
