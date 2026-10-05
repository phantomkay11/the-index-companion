import { Alert, Share, StyleSheet, View } from 'react-native';

import { Button, Card, Empty, ErrorNote, Loading, Row, Screen, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

type Impact = Record<string, number | string> & { generated_at: string; farms_by_region: Record<string, number> };

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Directory',
    rows: [
      ['farms_live', 'Farms live on the Index'],
      ['farms_verified', 'Verified by BFI'],
      ['farms_on_app', 'Farms reachable in the app'],
      ['farms_pending', 'Waiting for review'],
    ],
  },
  {
    title: 'Business for farmers',
    rows: [
      ['inquiries_total', 'Inquiries sent to farms, all time'],
      ['inquiries_30d', 'Inquiries, last 30 days'],
      ['inquiries_answered', 'Inquiries farmers said yes to'],
      ['profile_views_30d', 'Farm profile views, last 30 days'],
      ['follows', 'Farms followed'],
    ],
  },
  {
    title: 'Community',
    rows: [
      ['members', 'Members'],
      ['growers', 'Growers'],
      ['messages_30d', 'Messages, last 30 days'],
      ['board_posts_open', 'Open community board posts'],
    ],
  },
  {
    title: 'Events and resources',
    rows: [
      ['events_upcoming', 'Upcoming events'],
      ['rsvps', 'RSVPs'],
      ['volunteer_signups', 'Volunteer sign-ups'],
      ['programs_saved', 'Programs saved to deadline trackers'],
    ],
  },
];

/** Figures BFI can use in grant reports and funder updates. Sample farms are excluded. */
export default function ImpactScreen() {
  const { colors } = useSettings();
  const { isStaff } = useAuth();
  const q = useQuery(async () => must(await supabase.rpc('impact_stats')) as Impact, [isStaff]);

  if (!isStaff) return <Screen><Empty>Only BFI staff can see the impact report.</Empty></Screen>;
  if (q.error) return <Screen><ErrorNote message={q.error} onRetry={q.reload} /></Screen>;
  if (!q.data) return <Screen><Loading /></Screen>;
  const d = q.data;

  const share = async () => {
    const lines = ['metric,value', ...GROUPS.flatMap((g) => g.rows.map(([k, label]) => `"${label}",${d[k] ?? 0}`)),
      ...Object.entries(d.farms_by_region).map(([r, n]) => `"Farms in ${r === 'intl' ? 'International' : `Region ${r}`}",${n}`)];
    try {
      await Share.share({ title: 'The Index impact report', message: `The Index impact report, ${shortDate(d.generated_at)}\n\n${lines.join('\n')}` });
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : '');
    }
  };

  const maxRegion = Math.max(1, ...Object.values(d.farms_by_region));

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="mono" muted>
          As of {shortDate(d.generated_at)} · sample data excluded
        </Txt>
        <Button small kind="ghost" label="Share as CSV" icon="share-outline" onPress={share} />
      </Row>
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <Txt variant="label">{g.title}</Txt>
          {g.rows.map(([k, label]) => (
            <View key={k} style={[styles.row, { borderTopColor: colors.line }]}>
              <Txt variant="small" style={{ flex: 1 }}>
                {label}
              </Txt>
              <Txt variant="mono" style={{ fontSize: 17 }}>
                {Number(d[k] ?? 0).toLocaleString()}
              </Txt>
            </View>
          ))}
        </Card>
      ))}
      <Card>
        <Txt variant="label">Farms by region</Txt>
        {Object.entries(d.farms_by_region).map(([r, n]) => (
          <View key={r} style={{ gap: 4 }} accessibilityLabel={`${r === 'intl' ? 'International' : `Region ${r}`}: ${n} farms`}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small">{r === 'intl' ? 'International' : `Region ${r}`}</Txt>
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
