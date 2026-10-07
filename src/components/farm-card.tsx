import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon as Ionicons } from '@/components/icon';
import { Txt } from '@/components/ui';
import { Credit, GlassChip, Photo, Scrim } from '@/components/visual';
import { Radius } from '@/constants/theme';
import { farmCover, photoUrl } from '@/lib/imagery';
import { miles, type Point } from '@/lib/location';
import type { Farm } from '@/lib/types';
import { useSettings } from '@/providers/settings';

export { photoUrl };

/**
 * A farm in a list: the photo carries the card. Name and town sit on the image; what's fresh
 * sits underneath on the page, with no box around it.
 */
export function FarmCard({ farm, here, compact }: { farm: Farm; here?: Point | null; compact?: boolean }) {
  const { colors, t } = useSettings();
  const inSeason = (farm.farm_products ?? []).filter((p) => p.in_season).map((p) => p.name);
  const distance = here && farm.lat != null && farm.lon != null ? Math.round(miles(here, { lat: farm.lat, lon: farm.lon })) : null;
  const cover = farmCover(farm);
  const kind = farm.categories[0];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })}
      accessibilityRole="button"
      accessibilityLabel={[
        farm.name,
        `${farm.city}, ${farm.state}`,
        farm.verified_at ? t('verified') : 'awaiting verification',
        distance != null ? `${distance} miles away` : '',
        inSeason.length ? `${t('fresh')}: ${inSeason.join(', ')}` : '',
        farm.is_sample ? t('sample') : '',
      ]
        .filter(Boolean)
        .join('. ')}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      <Photo picture={cover} rounded={Radius.xl} style={{ aspectRatio: compact ? 16 / 10 : 4 / 3 }}>
        <Scrim from={0.4} />
        <View style={styles.topRow}>
          {farm.verified_at ? (
            <GlassChip>
              <Ionicons name="shield-checkmark" size={14} color={colors.leaf} />
              <Txt variant="smallBold" color="#0b4a2f" style={{ fontSize: 12.5 }}>
                Verified
              </Txt>
            </GlassChip>
          ) : (
            <GlassChip>
              <Txt variant="smallBold" color="#5f4100" style={{ fontSize: 12.5 }}>
                Awaiting review
              </Txt>
            </GlassChip>
          )}
          {farm.is_sample ? (
            <View style={styles.sample}>
              <Txt variant="smallBold" color="#ffffff" style={{ fontSize: 12 }}>
                {t('sample')}
              </Txt>
            </View>
          ) : null}
        </View>
        <View style={styles.caption}>
          <Txt variant="title" color="#ffffff" numberOfLines={2}>
            {farm.name}
          </Txt>
          <Txt variant="small" color="rgba(255,255,255,0.88)">
            {[`${farm.city}, ${farm.state}`, kind, distance != null ? `${distance} mi` : null].filter(Boolean).join('  ·  ')}
          </Txt>
        </View>
        <Credit picture={cover} style={{ top: 46, bottom: undefined, right: 12 }} />
      </Photo>
      <View style={styles.below}>
        {inSeason.length ? (
          <View style={styles.freshRow}>
            <View style={[styles.dot, { backgroundColor: colors.harvest }]} />
            <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>
              <Txt variant="smallBold">{t('fresh')}: </Txt>
              {inSeason.join(', ')}
            </Txt>
          </View>
        ) : null}
        {farm.harvest_mode ? (
          <Txt variant="small" color={colors.onSun}>
            In harvest, may reply slowly
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  topRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sample: { backgroundColor: 'rgba(6,24,15,0.72)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.85)', borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  caption: { position: 'absolute', left: 16, right: 16, bottom: 14, gap: 2 },
  below: { paddingHorizontal: 4, gap: 4 },
  freshRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
