import type { ReactNode } from 'react';

import { Empty, ErrorNote, Loading, Screen } from '@/components/ui';
import { useAuth } from '@/providers/auth';

/** Shown on staff screens to non-staff. Waits for the profile, and offers a retry if it didn't load. */
export function StaffOnly({ children }: { children: ReactNode }) {
  const { memberStatus, refresh } = useAuth();
  if (memberStatus === 'loading') return <Screen><Loading /></Screen>;
  if (memberStatus === 'error') return <Screen><ErrorNote message="Failed to fetch" onRetry={refresh} /></Screen>;
  return (
    <Screen>
      <Empty>{children}</Empty>
    </Screen>
  );
}
