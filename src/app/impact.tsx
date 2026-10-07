import { Share, StyleSheet, View } from 'react-native';

import { Button, Card, ErrorNote, Loading, Row, Screen, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { regionLabel } from '@/lib/bfi';
import { shortDate } from '@/lib/format';
import type { StringKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';
import { StaffOnly } from '@/components/staff-only';

type Impact = Record<string, number | string> & { generated_at: string; farms_by_region: Record<string, number> };

// Row ids are the impact_stats() fields; labels are translation keys.
const GROUPS: { title: StringKey; rows: [string, StringKey][] }[] = [
  {
    title: 's_impDirectory',
    rows: [
      ['farms_live', 's_imp_farms_live'],
      ['farms_verified', 's_imp_farms_verified'],
      ['farms_on_app', 's_imp_farms_on_app'],
      ['farms_pending', 's_imp_farms_pending'],
    ],
  },
  {
    title: 's_impBusiness',
    rows: [
      ['inquiries_total', 's_imp_inquiries_total'],
      ['inquiries_30d', 's_imp_inquiries_30d'],
      ['inquiries_answered', 's_imp_inquiries_answered'],
      ['profile_views_30d', 's_imp_profile_views_30d'],
      ['follows', 's_imp_follows'],
    ],
  },
  {
    title: 's_impCommunity',
    rows: [
      ['members', 's_imp_members'],
      ['growers', 's_imp_growers'],
      ['messages_30d', 's_imp_messages_30d'],
      ['board_posts_open', 's_imp_board_posts_open'],
    ],
  },
  {
    title: 's_impEvents',
    rows: [
      ['events_upcoming', 's_imp_events_upcoming'],
      ['rsvps', 's_imp_rsvps'],
      ['volunteer_signups', 's_imp_volunteer_signups'],
      ['programs_saved', 's_imp_programs_saved'],
    ],
  },
];

/** Figures BFI can use in grant reports and funder updates. Sample farms are excluded. */
export default function ImpactScreen() {
  const { t, colors, language } = useSettings();
  const { isStaff } = useAuth();
  const q = useQuery(async () => must(await supabase.rpc('impact_stats')) as Impact, [isStaff]);

  if (!isStaff) return <StaffOnly>{t('s_impactStaffOnly')}</StaffOnly>;
  if (q.error) return <Screen><ErrorNote message={q.error} onRetry={q.reload} /></Screen>;
  if (!q.data) return <Screen><Loading /></Screen>;
  const d = q.data;

  const share = async () => {
    // A report for people to read, so the labels follow the app's language; the header row stays machine-readable.
    const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const lines = ['metric,value', ...GROUPS.flatMap((g) => g.rows.map(([k, label]) => `${quote(t(label))},${d[k] ?? 0}`)),
      ...Object.entries(d.farms_by_region).map(([r, n]) => `${quote(t('s_farmsInRegion', { region: regionLabel(r, t) }))},${n}`)];
    try {
      await Share.share({
        title: t('s_impactReportTitle'),
        message: `${t('s_impactReportMessage', { date: shortDate(d.generated_at, language) })}\n\n${lines.join('\n')}`,
      });
    } catch (e) {
      showAlert(t('s_couldNotShare'), e instanceof Error ? e.message : '');
    }
  };

  const maxRegion = Math.max(1, ...Object.values(d.farms_by_region));

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="mono" muted>
          {t('s_asOf', { date: shortDate(d.generated_at, language) })}
        </Txt>
        <Button small kind="ghost" label={t('s_shareCsv')} icon="share-outline" onPress={share} />
      </Row>
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <Txt variant="label">{t(g.title)}</Txt>
          {g.rows.map(([k, label]) => (
            <View key={k} style={[styles.row, { borderTopColor: colors.line }]}>
              <Txt variant="small" style={{ flex: 1 }}>
                {t(label)}
              </Txt>
              <Txt variant="mono" style={{ fontSize: 17 }}>
                {Number(d[k] ?? 0).toLocaleString()}
              </Txt>
            </View>
          ))}
        </Card>
      ))}
      <Card>
        <Txt variant="label">{t('s_farmsByRegion')}</Txt>
        {Object.entries(d.farms_by_region).map(([r, n]) => (
          <View key={r} style={{ gap: 4 }} accessibilityLabel={t(n === 1 ? 's_regionFarmsOne' : 's_regionFarmsN', { region: regionLabel(r, t), n })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small">{regionLabel(r, t)}</Txt>
              <Txt variant="mono">{n}</Txt>
            </Row>
            <View style={[styles.track, { backgroundColor: colors.sunk }]}>
              <View style={[styles.bar, { width: `${(n / maxRegion) * 100}%`, backgroundColor: colors.leaf }]} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, borderTopWidth: 1, paddingTop: Space.sm },
  track: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  bar: { height: 8, borderRadius: Radius.pill },
});
