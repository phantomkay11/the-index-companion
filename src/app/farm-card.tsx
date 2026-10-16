import { useMemo } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button, Card, ErrorNote, Loading, Pill, Row, Screen, SignInPrompt, Txt, Verified } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { farmProfileUrl, qrMatrix, TEXT_LINE, textKeyword } from '@/lib/farm-card';
import { supabase } from '@/lib/supabase';
import type { FarmProduct } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';

const QR_SIZE = 232;
const INK = '#0B0B0B';

/**
 * A printable card for a farm stand: a QR code to the farm's profile, what's fresh now, and the text-line
 * keyword. Printed cards and the QR code are always black on white so they scan in any light and any mode.
 */
export default function FarmCard() {
  const { session, myFarm } = useAuth();
  const products = useQuery(
    async () => (myFarm ? (must(await supabase.from('farm_products').select('*').eq('farm_id', myFarm.id).eq('in_season', true).order('name')) as FarmProduct[]) : []),
    [myFarm?.id],
  );

  const inSeason = (products.data ?? []).map((p) => p.name);
  const url = myFarm ? farmProfileUrl(myFarm.id) : null;
  const keyword = myFarm ? textKeyword(inSeason, myFarm.state) : '';
  const modules = useMemo(() => (url ? qrMatrix(url) : null), [url]);

  if (!session) return <Screen><SignInPrompt /></Screen>;
  if (!myFarm) return <Screen><Txt>List your farm first, then you can print its card.</Txt></Screen>;
  if (products.error) return <Screen><ErrorNote message={products.error} onRetry={products.reload} /></Screen>;
  if (products.loading && !products.data) return <Screen><Loading /></Screen>;

  const live = myFarm.status === 'approved';
  const cell = modules ? Math.floor(QR_SIZE / (modules.length + 8)) : 0;

  const share = async () => {
    if (!url) return;
    try {
      await Share.share({ message: `${myFarm.name} on The Index: ${url}` });
    } catch {
      // The share sheet was closed or isn't available here; nothing to report.
    }
  };

  return (
    <Screen>
      <Card tone="plain" style={styles.card}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Txt color={INK} variant="label">
            The Index
          </Txt>
          {live ? <Verified /> : <Pill label="Waiting for BFI review" tone="sun" />}
        </Row>
        <Txt color={INK} variant="title" style={styles.center}>
          {myFarm.name}
        </Txt>
        <Txt color={INK} style={styles.center}>
          {myFarm.city}, {myFarm.state}
        </Txt>

        {inSeason.length ? (
          <Txt color={INK} style={styles.center}>Fresh now: {inSeason.slice(0, 4).join(', ')}</Txt>
        ) : (
          <Txt color={INK} style={styles.center}>Turn on what’s fresh on the My farm screen to show it here.</Txt>
        )}

        {modules ? (
          <View style={styles.qrWrap} accessibilityRole="image" accessibilityLabel={`QR code to the ${myFarm.name} profile`}>
            <View style={{ backgroundColor: '#ffffff', padding: 8, borderRadius: Radius.md }}>
              {modules.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {row.map((dark, c) => (
                    <View key={c} style={{ width: cell, height: cell, backgroundColor: dark ? INK : '#ffffff' }} />
                  ))}
                </View>
              ))}
            </View>
            <Txt color={INK} variant="small" style={styles.center}>
              Scan to see what’s fresh
            </Txt>
          </View>
        ) : null}

        {keyword && TEXT_LINE ? (
          <View style={styles.textBox}>
            <Txt color={INK} variant="small" style={styles.center}>No smartphone? Text</Txt>
            <Txt color={INK} variant="title" style={styles.center}>
              {keyword}
            </Txt>
            <Txt color={INK} variant="small" style={styles.center}>
              to {TEXT_LINE}
            </Txt>
          </View>
        ) : null}

        {!url ? (
          <Txt color={INK} variant="small" style={styles.center}>
            This card has no web address for its QR code yet. BFI staff can add it in the app settings.
          </Txt>
        ) : null}
      </Card>

      {!live ? <Txt variant="small" muted>Your card works once BFI approves your farm.</Txt> : null}
      <Button label="Share my farm link" icon="share-outline" onPress={share} disabled={!url || !live} />
      <Txt variant="small" muted>
        Print this screen or take a screenshot to put it on your stand, your table or your bag.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Space.md, alignItems: 'stretch', backgroundColor: '#ffffff' },
  center: { textAlign: 'center' },
  qrWrap: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm },
  textBox: { alignItems: 'center', gap: 4, padding: Space.md, borderRadius: Radius.lg, borderWidth: 2, borderColor: INK },
});
