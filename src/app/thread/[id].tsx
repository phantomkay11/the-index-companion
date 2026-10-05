import { useLocalSearchParams } from 'expo-router';

import { ThreadView } from '@/components/thread-view';

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ThreadView id={id} />;
}
