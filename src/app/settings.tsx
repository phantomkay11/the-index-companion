import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, Row, Screen, ToggleRow, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { speak } from '@/lib/speak';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

export default function Settings() {
  const s = useSettings();
  const { session, profile, signOut, refresh } = useAuth();

  const setLanguage = async (language: 'en' | 'es') => {
    s.update({ language });
    if (profile) {
      await supabase.from('profiles').update({ language }).eq('id', profile.id);
      refresh();
    }
  };

  return (
    <Screen>
      <Txt variant="label">{s.t('accessibility')}</Txt>
      <Button
        label={s.t('readAloud')}
        icon="volume-high-outline"
        onPress={() =>
          speak(
            s.language === 'es'
              ? 'Ajustes de accesibilidad. Puedes cambiar el tamaño del texto, el contraste, el movimiento y el idioma.'
              : 'Accessibility settings. You can change text size, contrast, motion and language. Every screen has Listen buttons for farm profiles and messages.',
            s.language,
          )
        }
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyBold">{s.t('textSize')}</Txt>
          <Txt variant="mono">{Math.round(s.textScale * 100)}%</Txt>
        </Row>
        <Slider
          minimumValue={1}
          maximumValue={1.6}
          step={0.1}
          value={s.textScale}
          onSlidingComplete={(v) => s.update({ textScale: Math.round(v * 10) / 10 })}
          minimumTrackTintColor={s.colors.leaf}
          maximumTrackTintColor={s.colors.line}
          thumbTintColor={s.colors.leaf}
          accessibilityLabel={s.t('textSize')}
          style={{ height: 44 }}
        />
        <Txt variant="small" muted>
          This works on top of your phone’s own text size setting.
        </Txt>
      </Card>

      <ToggleRow label={s.t('highContrast')} hint="Black and white text, stronger borders." value={s.highContrast} onChange={(v) => s.update({ highContrast: v })} />
      <ToggleRow label={s.t('reduceMotion')} hint="Turns off sliding and fading between screens." value={s.reduceMotion} onChange={(v) => s.update({ reduceMotion: v })} />

      <View style={{ gap: Space.sm }}>
        <Txt variant="bodyBold">{s.t('language')}</Txt>
        <Row gap={6}>
          <Chip label="English" selected={s.language === 'en'} onPress={() => setLanguage('en')} />
          <Chip label="Español" selected={s.language === 'es'} onPress={() => setLanguage('es')} />
        </Row>
        <Txt variant="small" muted>
          French, Haitian Creole and Portuguese are planned next, based on who is in the Index.
        </Txt>
      </View>

      <Txt variant="label" style={{ marginTop: Space.md }}>
        Account
      </Txt>
      {session ? (
        <Card>
          <Txt variant="bodyBold">{profile?.display_name ?? 'Member'}</Txt>
          <Txt variant="small" muted>
            {session.user.email}
          </Txt>
          <Row>
            <Button small kind="ghost" label={s.t('myFarm')} onPress={() => router.push('/my-farm')} />
            <Button
              small
              kind="ghost"
              label={s.t('signOut')}
              onPress={async () => {
                await signOut();
                Alert.alert('Signed out');
              }}
            />
          </Row>
        </Card>
      ) : (
        <Button label={s.t('signIn')} onPress={() => router.push('/sign-in')} />
      )}

      <Button kind="ghost" label={s.t('about')} icon="information-circle-outline" onPress={() => router.push('/about')} />
    </Screen>
  );
}
