import { View } from 'react-native';

import { Chip, Row, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { tr, type StringKey } from '@/lib/i18n';
import { useSettings } from '@/providers/settings';

// `value` is what gets stored; `labelKey` is the translated text shown for it.
export const AUDIENCES: { value: string; labelKey: StringKey }[] = [
  { value: 'everyone', labelKey: 'b_audEveryone' },
  { value: 'growers', labelKey: 'b_audGrowers' },
  { value: 'neighbors', labelKey: 'b_audNeighbors' },
];

export function useRegions() {
  return useQuery(async () => must(await supabase.from('regions').select('*').order('sort_order')) as Region[], [], { cacheKey: 'regions' });
}

export function audienceLabel(audience: string, regions?: Region[] | null) {
  const known = AUDIENCES.find((a) => a.value === audience);
  if (known) return tr(known.labelKey);
  if (audience === 'region:intl') return tr('international');
  return regions?.find((r) => `region:${r.id}` === audience)?.name ?? audience.replace(/^region:/, `${tr('region')} `);
}

/** Everyone, growers, neighbors or one region: who a broadcast, survey or check-in reaches. */
export function AudiencePicker({
  value,
  onChange,
  regionsOnly,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  regionsOnly?: boolean;
  label?: string;
}) {
  const regions = useRegions();
  const { t } = useSettings();
  return (
    <View style={{ gap: Space.sm }}>
      <Txt variant="smallBold">{label ?? t('b_whoGetsIt')}</Txt>
      {!regionsOnly ? (
        <Row gap={6}>
          {AUDIENCES.map((a) => (
            <Chip key={a.value} label={t(a.labelKey)} selected={value === a.value} onPress={() => onChange(a.value)} />
          ))}
        </Row>
      ) : null}
      <Row gap={6}>
        {(regions.data ?? []).map((r) => (
          <Chip
            key={r.id}
            label={r.id === 'intl' ? t('international') : r.name}
            selected={value === `region:${r.id}`}
            onPress={() => onChange(`region:${r.id}`)}
          />
        ))}
      </Row>
    </View>
  );
}
