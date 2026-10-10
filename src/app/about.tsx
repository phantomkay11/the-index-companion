import * as Clipboard from 'expo-clipboard';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Provenance, Row, Screen, Txt } from '@/components/ui';
import { Photo, Scrim } from '@/components/visual';
import { ABOUT_PHOTO } from '@/lib/imagery';
import { Space } from '@/constants/theme';
import { BFI } from '@/lib/bfi';
import { useSettings } from '@/providers/settings';
import { openLink } from '@/lib/links';

export default function About() {
  const { colors } = useSettings();

  const copy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', value);
  };

  const hero = (
    <Photo picture={ABOUT_PHOTO} style={{ height: 260 }}>
      <Scrim from={0.15} />
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: 22, gap: 4 }}>
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
        <Button label="Donate" icon="heart-outline" onPress={() => openLink(BFI.donateUrl)} />
        <Button kind="ghost" label="Shop" onPress={() => openLink(BFI.shopUrl)} />
        <Button kind="ghost" label="Visit the website" icon="open-outline" onPress={() => openLink(BFI.site)} />
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
