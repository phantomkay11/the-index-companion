import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon as Ionicons } from '@/components/icon';
import { Card, Row, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Checkin, Survey } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

/**
 * What BFI is waiting to hear from this member: an open storm check-in (shown first, in yellow)
 * and open surveys they haven't answered. Shows nothing when there's nothing to do.
 */
export function BfiAsks() {
  const { session } = useAuth();
  const { colors, t } = useSettings();
  const asks = useQuery(
    async () => {
      if (!session) return { checkins: [] as Checkin[], surveys: [] as Survey[] };
      const now = new Date().toISOString();
      const uid = session.user.id;
      const [checkins, answeredC, surveys, answeredS] = await Promise.all([
        supabase.from('checkins').select('*').gt('closes_at', now).order('created_at', { ascending: false }).limit(3),
        supabase.from('checkin_responses').select('checkin_id').eq('user_id', uid),
        supabase.from('surveys').select('*').eq('status', 'open').or(`closes_at.is.null,closes_at.gt.${now}`).order('created_at', { ascending: false }).limit(5),
        supabase.from('survey_responses').select('survey_id').eq('user_id', uid),
      ]);
      const doneC = new Set((must(answeredC) as { checkin_id: string }[]).map((r) => r.checkin_id));
      const doneS = new Set((must(answeredS) as { survey_id: string }[]).map((r) => r.survey_id));
      return {
        checkins: (must(checkins) as Checkin[]).filter((c) => !doneC.has(c.id)),
        surveys: (must(surveys) as Survey[]).filter((s) => !doneS.has(s.id)),
      };
    },
    [session?.user.id],
  );

  const c = asks.data?.checkins ?? [];
  const s = asks.data?.surveys ?? [];
  if (!c.length && !s.length) return null;

  return (
    <View style={{ gap: Space.sm }}>
      {c.map((x) => (
        <Pressable
          key={x.id}
          accessibilityRole="button"
          accessibilityLabel={`${t('checkIn')}: ${x.title}. Tap to answer.`}
          onPress={() => router.push({ pathname: '/checkin/[id]', params: { id: x.id } })}>
          <Card tone="sun">
            <Row>
              <Ionicons name="thunderstorm-outline" size={22} color={colors.onSun} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyBold" color={colors.onSun}>{x.title}</Txt>
                <Txt variant="small" color={colors.onSun}>
                  Tap to tell BFI you’re OK or that you need help.
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSun} />
            </Row>
          </Card>
        </Pressable>
      ))}
      {s.slice(0, 1).map((x) => (
        <Pressable
          key={x.id}
          accessibilityRole="button"
          accessibilityLabel={`${t('surveys')}: ${x.title}. ${x.questions.length} questions.`}
          onPress={() => router.push({ pathname: '/survey/[id]', params: { id: x.id } })}>
          <Card tone="soft">
            <Row>
              <Ionicons name="clipboard-outline" size={22} color={colors.leaf} />
              <View style={{ flex: 1 }}>
                <Txt variant="smallBold">{x.title}</Txt>
                <Txt variant="small" muted>
                  {x.questions.length} quick questions from BFI{s.length > 1 ? ` · ${s.length - 1} more waiting` : ''}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Row>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
