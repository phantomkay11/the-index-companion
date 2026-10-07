import { View } from 'react-native';

import { Chip, Row, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';

export const AUDIENCES = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'growers', label: 'Growers' },
  { value: 'neighbors', label: 'Neighbors' },
];

export function useRegions() {
  return useQuery(async () => must(await supabase.from('regions').select('*').order('sort_order')) as Region[], [], { cacheKey: 'regions' });
}

export function audienceLabel(audience: string, regions?: Region[] | null) {
  return (
    AUDIENCES.find((a) => a.value === audience)?.label ??
    regions?.find((r) => `region:${r.id}` === audience)?.name ??
    audience.replace(/^region:/, 'Region ')
  );
}

/** Everyone, growers, neighbors or one region: who a broadcast, survey or check-in reaches. */
export function AudiencePicker({
  value,
  onChange,
  regionsOnly,
  label = 'Who gets it',
}: {
  value: string;
  onChange: (v: string) => void;
  regionsOnly?: boolean;
  label?: string;
}) {
  const regions = useRegions();
  return (
    <View style={{ gap: Space.sm }}>
      <Txt variant="smallBold">{label}</Txt>
      {!regionsOnly ? (
        <Row gap={6}>
          {AUDIENCES.map((a) => (
            <Chip key={a.value} label={a.label} selected={value === a.value} onPress={() => onChange(a.value)} />
          ))}
        </Row>
      ) : null}
      <Row gap={6}>
        {(regions.data ?? []).map((r) => (
          <Chip
            key={r.id}
            label={r.id === 'intl' ? 'International' : r.name}
            selected={value === `region:${r.id}`}
            onPress={() => onChange(`region:${r.id}`)}
          />
        ))}
      </Row>
    </View>
  );
}
