import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Screen, Txt } from '@/components/ui';
import { useSettings } from '@/providers/settings';

/** Any address the app doesn't know. */
export default function NotFound() {
  const { t } = useSettings();
  return (
    <Screen>
      <View style={{ gap: 12, paddingTop: 40 }}>
        <Txt variant="display" accessibilityRole="header">
          {t('notFound')}
        </Txt>
        <Txt muted>{t('notFoundHint')}</Txt>
        <Button label={t('discover')} icon="location-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
