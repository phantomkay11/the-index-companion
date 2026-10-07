import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Provenance, Row, Screen, Txt } from '@/components/ui';
import { Photo, Scrim } from '@/components/visual';
import { sectionImage } from '@/lib/imagery';
import { Space } from '@/constants/theme';
import { BFI, bfiCopy } from '@/lib/bfi';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

export default function About() {
  const { colors, t, language } = useSettings();
  const bfi = bfiCopy(t, language);

  const copyText = async (value: string) => {
    await Clipboard.setStringAsync(value);
    showAlert(t('m_copied'), value);
  };

  const hero = (
    <Photo picture={sectionImage('discover')} style={{ minHeight: 260, justifyContent: 'flex-end' }}>
      <Scrim from={0.15} />
      <View style={{ paddingHorizontal: 20, paddingTop: 110, paddingBottom: 22, gap: 4 }}>
        <Txt variant="smallBold" color="rgba(255,255,255,0.9)">
          Black Farmers Index
        </Txt>
        <Txt variant="display" color="#ffffff">
          {BFI.mission}
        </Txt>
      </View>
    </Photo>
  );

  return (
    <Screen hero={hero}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pill label={bfi.status} tone="leaf" />
        <Provenance sample={false} />
      </Row>

      <View style={[styles.quote, { borderLeftColor: colors.sun }]}>
        <Txt variant="title">{BFI.quote.text}</Txt>
        <Txt variant="small" muted>
          {t('m_quotedOnBfi', { name: BFI.quote.by })}
        </Txt>
      </View>

      <View style={{ gap: 6 }}>
        <Txt variant="title">{t('m_bfiWorksToward')}</Txt>
        {bfi.pillars.map((p, i) => (
          <Txt key={p}>
            {i + 1}. {p}
          </Txt>
        ))}
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="label">{t('m_howItStarted')}</Txt>
        {bfi.timeline.map(([when, what]) => (
          <View key={when} style={[styles.timeline, { borderTopColor: colors.line }]}>
            <Txt variant="mono" color={colors.leaf} style={{ width: 80 }}>
              {when}
            </Txt>
            <Txt variant="small" style={{ flex: 1 }}>
              {what}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ gap: 6 }}>
        <Txt variant="label">{t('m_programs')}</Txt>
        <Row gap={6}>
          {bfi.programs.map((p) => (
            <Pill key={p} label={p} />
          ))}
        </Row>
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="label">{t('m_partners')}</Txt>
        <Txt variant="small">{BFI.partners}</Txt>
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="label">{t('m_foundedBy')}</Txt>
        <Txt variant="small">{bfi.founder}</Txt>
      </View>

      <Card>
        <Txt variant="label">{t('m_contact')}</Txt>
        {bfi.contacts.map((c) => (
          <View key={c.label} style={[styles.contact, { borderTopColor: colors.line }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="small" muted>
                {c.label}
              </Txt>
              <Txt variant="mono" selectable>
                {c.value}
              </Txt>
            </View>
            <Button small kind="ghost" label={t('m_copy')} accessibilityLabel={t('m_copyItem', { label: c.label })} onPress={() => copyText(c.value)} />
          </View>
        ))}
      </Card>

      <Row>
        <Button label={t('m_donate')} icon="heart-outline" onPress={() => WebBrowser.openBrowserAsync(BFI.donateUrl)} />
        <Button kind="ghost" label={t('m_shop')} onPress={() => WebBrowser.openBrowserAsync(BFI.shopUrl)} />
        <Button kind="ghost" label={t('m_visitWebsite')} icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(BFI.site)} />
      </Row>
      <Txt variant="mono" muted>
        {t('m_contentFrom')}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 3, paddingLeft: Space.md, gap: 4 },
  timeline: { flexDirection: 'row', gap: Space.md, borderTopWidth: 1, paddingVertical: 6 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, borderTopWidth: 1, paddingTop: Space.sm },
});
