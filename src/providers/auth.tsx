import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Farm, Profile } from '@/lib/types';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  /** The farm this member owns, if any (any review status). */
  myFarm: Farm | null;
  isStaff: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myFarm, setMyFarm] = useState<Farm | null>(null);
  const [ready, setReady] = useState(false);

  const loadMember = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setMyFarm(null);
      return;
    }
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, role, region_id, language').eq('id', s.user.id).maybeSingle(),
      supabase.from('farms').select('*, farm_products(*)').eq('owner_id', s.user.id).limit(1).maybeSingle(),
    ]);
    setProfile((p as Profile) ?? null);
    setMyFarm((f as Farm) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadMember(data.session).catch(() => {});
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadMember(s).catch(() => {});
    });
    return () => sub.subscription.unsubscribe();
  }, [loadMember]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      myFarm,
      isStaff: profile?.role === 'coordinator' || profile?.role === 'admin',
      ready,
      refresh: () => loadMember(session),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, profile, myFarm, ready, loadMember],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
