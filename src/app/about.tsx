import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Provenance, Row, Screen, Txt } from '@/components/ui';
import { Photo, Scrim } from '@/components/visual';
import { sectionImage } from '@/lib/imagery';
import { Space } from '@/constants/theme';
import { BFI } from '@/lib/bfi';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

export default function About() {
  const { colors } = useSettings();

  const copy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    showAlert('Copied', value);
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
        <Pill label={BFI.status} tone="leaf" />
        <Provenance sample={false} />
      </Row>

      <View style={[styles.quote, { borderLeftColor: colors.sun }]}>
        <Txt variant="title">{BFI.quote.text}</Txt>
        <Txt variant="small" muted>
          {BFI.quote.by} · quoted on BFI’s home page
        </Txt>
      </View>

      <View style={{ gap: 6 }}>
        <Txt variant="title">What BFI works toward</Txt>
        {BFI.pillars.map((p, i) => (
          <Txt key={p}>
            {i + 1}. {p}
          </Txt>
        ))}
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="label">How it started</Txt>
        {BFI.timeline.map(([when, what]) => (
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
        <Txt variant="label">Programs</Txt>
        <Row gap={6}>
          {BFI.programs.map((p) => (
            <Pill key={p} label={p} />
          ))}
        </Row>
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="label">Partners</Txt>
        <Txt variant="small">{BFI.partners}</Txt>
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="label">Founded by</Txt>
        <Txt variant="small">{BFI.founder}</Txt>
      </View>

      <Card>
        <Txt variant="label">Contact</Txt>
        {BFI.contacts.map((c) => (
          <View key={c.label} style={[styles.contact, { borderTopColor: colors.line }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="small" muted>
                {c.label}
              </Txt>
              <Txt variant="mono" selectable>
                {c.value}
              </Txt>
            </View>
            <Button small kind="ghost" label="Copy" accessibilityLabel={`Copy ${c.label}`} onPress={() => copy(c.value)} />
          </View>
        ))}
      </Card>

      <Row>
        <Button label="Donate" icon="heart-outline" onPress={() => WebBrowser.openBrowserAsync(BFI.donateUrl)} />
        <Button kind="ghost" label="Shop" onPress={() => WebBrowser.openBrowserAsync(BFI.shopUrl)} />
        <Button kind="ghost" label="Visit the website" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(BFI.site)} />
      </Row>
      <Txt variant="mono" muted>
        Content from blackfarmersindex.com, checked Oct 4, 2026.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 3, paddingLeft: Space.md, gap: 4 },
  timeline: { flexDirection: 'row', gap: Space.md, borderTopWidth: 1, paddingVertical: 6 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, borderTopWidth: 1, paddingTop: Space.sm },
});
