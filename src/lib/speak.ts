import * as Speech from 'expo-speech';

import type { Lang } from '@/lib/i18n';

/** Read text aloud in the member's language. Stops anything already playing. */
export async function speak(text: string, lang: Lang) {
  await Speech.stop();
  Speech.speak(text, { language: lang === 'es' ? 'es-US' : 'en-US', rate: 0.95 });
}
