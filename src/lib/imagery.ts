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
 * - Section heroes (Discover, Events, Resources, Community) and About use the bundled
 *   PLACEHOLDER photos below until BFI's own photography arrives.
 * - Sample farms show bundled placeholder photos (SAMPLE_FARM_PHOTOS).
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

/**
 * PLACEHOLDER PHOTOGRAPHY, bundled with the app so it shows offline.
 * Stock images supplied by the project owner for demos. Replace them with BFI's own
 * photography, with permission, before launch, and never present them as a real listed farm.
 */
const PHOTOS = {
  handsInSoil: require('@/assets/images/photos/hands-in-soil.jpg'),
  plantingSeedlings: require('@/assets/images/photos/planting-seedlings.jpg'),
  cabbageHarvestPortrait: require('@/assets/images/photos/cabbage-harvest-portrait.jpg'),
  greenhouseFamily: require('@/assets/images/photos/greenhouse-family.jpg'),
  cabbageFieldBasket: require('@/assets/images/photos/cabbage-field-basket.jpg'),
  greenhouseHarvestLaughing: require('@/assets/images/photos/greenhouse-harvest-laughing.jpg'),
  greenhouseHarvestCrate: require('@/assets/images/photos/greenhouse-harvest-crate.jpg'),
  dairyBarn: require('@/assets/images/photos/dairy-barn.jpg'),
  tractorPortrait: require('@/assets/images/photos/tractor-portrait.jpg'),
  lettuceSeedlingHands: require('@/assets/images/photos/lettuce-seedling-hands.jpg'),
  farmerInField: require('@/assets/images/photos/farmer-in-field.jpg'),
  seedlingTrays: require('@/assets/images/photos/seedling-trays.jpg'),
} as const;

const photo = (source: number, alt: string): Picture => ({ source, alt });

/** Editorial photographs for section heroes (placeholders for now). */
const EDITORIAL: Partial<Record<Section, Picture>> = {
  discover: photo(PHOTOS.cabbageHarvestPortrait, 'A smiling farmer holding a basket of freshly picked cabbages in a green field'),
  events: photo(PHOTOS.greenhouseHarvestLaughing, 'A farmer in a straw hat laughing as she carries a crate of carrots, beets and greens through a greenhouse'),
  community: photo(PHOTOS.greenhouseFamily, 'A father in a greenhouse handing a young seedling to his daughter as her mother looks on'),
  resources: photo(PHOTOS.lettuceSeedlingHands, 'A farmer holding a lettuce seedling with its roots and soil in cupped hands'),
};

/** The About page's photo. */
export const ABOUT_PHOTO: Picture = photo(PHOTOS.handsInSoil, 'A farmer kneeling in a field at sunset, holding a handful of soil');

/**
 * Placeholder photos for the invented sample farms (is_sample), by farm name.
 * These replace any linked photos on sample farms; real farms always use their own uploads.
 */
const SAMPLE_FARM_PHOTOS: Record<string, Picture[]> = {
  'Three Sisters Ranch': [photo(PHOTOS.dairyBarn, 'Two farmers checking on a row of cows at the feeding rail in a barn')],
  'Sweet Pea Acres': [
    photo(PHOTOS.greenhouseHarvestCrate, 'A farmer in a straw hat carrying a crate of fresh greens through a greenhouse'),
    photo(PHOTOS.plantingSeedlings, 'A hand planting young greens in a raised bed with drip irrigation'),
  ],
  'Delta Commons Co-op': [photo(PHOTOS.seedlingTrays, 'Two farmers working among lavender and trays of seedlings')],
  'Okra Row Farm': [photo(PHOTOS.farmerInField, 'A farmer in a wide straw hat crouching in a green field')],
  'Kreyòl Garden': [photo(PHOTOS.cabbageFieldBasket, 'A farmer kneeling in a cabbage field with a basket of harvested heads')],
  'Pine & Pasture Farm': [photo(PHOTOS.tractorPortrait, 'A farmer in overalls sitting between two tractors in a barn')],
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
  const sample = farm.is_sample ? SAMPLE_FARM_PHOTOS[farm.name] : undefined;
  if (sample?.length) return sample[0];
  const first = [...(farm.farm_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  if (first) return fromPhoto(first, farm.categories[0]);
  return categoryImage(farm.categories[0] ?? 'Vegetables & fruit');
}

export function farmPhotos(farm: Farm): Picture[] {
  const sample = farm.is_sample ? SAMPLE_FARM_PHOTOS[farm.name] : undefined;
  if (sample?.length) return sample;
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
