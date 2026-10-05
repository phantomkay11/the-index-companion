import { Icon as Ionicons } from '@/components/icon';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Pill, Provenance, Row, Txt, Verified } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { CATEGORIES } from '@/lib/bfi';
import { updatedAgo } from '@/lib/format';
import { miles, type Point } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import type { Farm, FarmPhoto } from '@/lib/types';
import { useSettings } from '@/providers/settings';

export function photoUrl(path: string) {
  return supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl;
}

export function firstPhoto(farm: Farm): FarmPhoto | undefined {
  return [...(farm.farm_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
}

/** The farm's own photo when it has one; otherwise a designed placeholder. */
export function PhotoSlot({ farm, tall, photo }: { farm: Farm; tall?: boolean; photo?: FarmPhoto }) {
  const { colors } = useSettings();
  const shown = photo ?? firstPhoto(farm);
  const cat = CATEGORIES.find((c) => farm.categories.includes(c.id));
  const ratio = tall ? 16 / 9 : 16 / 7;

  if (shown) {
    return (
      <View style={{ width: '100%', aspectRatio: ratio, backgroundColor: colors.leafSoft }}>
        <Image
          source={{ uri: photoUrl(shown.path) }}
          alt={shown.alt_text}
          accessibilityLabel={shown.alt_text}
          contentFit="cover"
          transition={200}
          style={{ flex: 1 }}
        />
        {farm.is_sample ? (
          <View style={styles.corner}>
            <Provenance sample />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[styles.photo, { backgroundColor: colors.leafSoft, aspectRatio: ratio }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants">
      <Ionicons name={(cat?.icon ?? 'leaf-outline') as never} size={tall ? 56 : 44} color={colors.leaf} style={{ opacity: 0.55 }} />
      <View style={[styles.caption, { backgroundColor: colors.surface }]}>
        <Txt variant="mono" style={{ fontSize: 11 }}>
          Photo coming · {cat?.id ?? 'Farm'}
        </Txt>
      </View>
      {farm.is_sample ? (
        <View style={styles.corner}>
          <Provenance sample />
        </View>
      ) : null}
    </View>
  );
}

export function FarmCard({ farm, here }: { farm: Farm; here?: Point | null }) {
  const { colors, t, saveData } = useSettings();
  const inSeason = (farm.farm_products ?? []).filter((p) => p.in_season).map((p) => p.name);
  const tags = [...farm.categories, ...farm.attributes].filter((x, i, a) => a.indexOf(x) === i).slice(0, 5);
  const distance = here && farm.lat != null && farm.lon != null ? Math.round(miles(here, { lat: farm.lat, lon: farm.lon })) : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${farm.name}, ${farm.city}, ${farm.state}${distance != null ? `, ${distance} miles away` : ''}. ${inSeason.length ? `${t('fresh')}: ${inSeason.join(', ')}` : ''}`}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: pressed ? colors.leaf : colors.line }]}>
      {!saveData ? <PhotoSlot farm={farm} /> : null}
      <View style={styles.inner}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2, flex: 1 }}>
            <Txt variant="heading">{farm.name}</Txt>
            <Txt variant="small" muted>
              {farm.city}, {farm.state} · Region {farm.region_id}
            </Txt>
          </View>
          {distance != null ? <Txt variant="mono" muted>{distance} mi</Txt> : null}
        </Row>
        <Row>
          {farm.verified_at ? <Verified /> : <Pill label="Awaiting verification" tone="sun" />}
          <Txt variant="mono" muted>
            {updatedAgo(farm.updated_at)}
          </Txt>
        </Row>
        {inSeason.length ? (
          <Txt variant="small">
            <Txt variant="smallBold" color={colors.leaf}>
              {t('fresh')}:{' '}
            </Txt>
            {inSeason.join(', ')}
          </Txt>
        ) : null}
        <Row gap={6}>
          {tags.map((x) => (
            <Pill key={x} label={x} />
          ))}
          {farm.harvest_mode ? <Pill label="In harvest" tone="sun" /> : null}
        </Row>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  inner: { padding: Space.lg, gap: Space.sm },
  photo: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 10, bottom: 8, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  corner: { position: 'absolute', right: 10, top: 8 },
});
