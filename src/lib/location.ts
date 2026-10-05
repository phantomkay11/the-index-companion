import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';

export type Point = { lat: number; lon: number };

/** Great-circle distance in miles (matches public.miles in the database). */
export function miles(a: Point, b: Point) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export type LocateResult = { ok: true; point: Point; label: string | null } | { ok: false; reason: string };

/**
 * The member's approximate location, asked for only when they tap "Use my location".
 * City-level accuracy is plenty for finding farms and saves battery.
 */
export async function locate(): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'Location is off for The Index. You can still browse by region.' };
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 });
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    const point = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    let label: string | null = null;
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: point.lat, longitude: point.lon });
      if (place) label = [place.city ?? place.subregion, place.region].filter(Boolean).join(', ') || null;
    } catch {
      // A missing place name is fine.
    }
    return { ok: true, point, label };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not find your location.' };
  }
}

/** Turn a town or ZIP code into a point, for people who'd rather not share location. */
export async function geocode(place: string): Promise<LocateResult> {
  try {
    const [hit] = await Location.geocodeAsync(place);
    if (!hit) return { ok: false, reason: `Couldn't find “${place}”. Try a town and state, or a ZIP code.` };
    return { ok: true, point: { lat: hit.latitude, lon: hit.longitude }, label: place };
  } catch {
    return { ok: false, reason: 'Looking up places by name isn’t available on this device. Use your location instead.' };
  }
}

// The member's chosen point for this session, shared across screens (never stored on the server).

type Here = { point: Point; label: string | null } | null;
let here: Here = null;
const listeners = new Set<() => void>();

export function setHere(next: Here) {
  here = next;
  listeners.forEach((l) => l());
}

export function useHere(): Here {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => here,
    () => null,
  );
}
