import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Pill, Provenance, Row, Txt, Verified } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { CATEGORIES } from '@/lib/bfi';
import { updatedAgo } from '@/lib/format';
import type { Farm } from '@/lib/types';
import { useSettings } from '@/providers/settings';

/** Stand-in until BFI uploads farm photography (with each farmer's permission). */
export function PhotoSlot({ farm, tall }: { farm: Farm; tall?: boolean }) {
  const { colors } = useSettings();
  const cat = CATEGORIES.find((c) => farm.categories.includes(c.id));
  return (
    <View
      style={[styles.photo, { backgroundColor: colors.leafSoft, aspectRatio: tall ? 16 / 7 : 16 / 6 }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants">
      <Ionicons name={(cat?.icon ?? 'leaf-outline') as never} size={tall ? 56 : 44} color={colors.leaf} style={{ opacity: 0.55 }} />
      <View style={[styles.caption, { backgroundColor: colors.surface }]}>
        <Txt variant="mono" style={{ fontSize: 11 }}>
          Photo slot · {cat?.id ?? 'Farm'}
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

export function FarmCard({ farm }: { farm: Farm }) {
  const { colors, t } = useSettings();
  const inSeason = (farm.farm_products ?? []).filter((p) => p.in_season).map((p) => p.name);
  const tags = [...farm.categories, ...farm.attributes].filter((x, i, a) => a.indexOf(x) === i).slice(0, 5);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${farm.name}, ${farm.city}, ${farm.state}. ${inSeason.length ? `${t('fresh')}: ${inSeason.join(', ')}` : ''}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: pressed ? colors.leaf : colors.line },
      ]}>
      <PhotoSlot farm={farm} />
      <View style={styles.inner}>
        <View style={{ gap: 2 }}>
          <Txt variant="heading">{farm.name}</Txt>
          <Txt variant="small" muted>
            {farm.city}, {farm.state} · Region {farm.region_id}
          </Txt>
        </View>
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
