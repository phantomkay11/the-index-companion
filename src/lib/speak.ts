import * as Speech from 'expo-speech';

import { SPEECH_LANG, type Lang } from '@/lib/i18n';

/** Read text aloud in the member's language. Stops anything already playing. */
export async function speak(text: string, lang: Lang) {
  await Speech.stop();
  // Few phones ship a Haitian Creole voice; French is the closest widely available one.
  Speech.speak(text, { language: SPEECH_LANG[lang], rate: 0.95 });
}
