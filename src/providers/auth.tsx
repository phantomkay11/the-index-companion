import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { clearQueryCache } from '@/lib/use-query';
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

  // Only the newest member load may land, so a slow answer for a previous account can't come back after sign-out.
  const latest = useRef(0);
  const loadMember = useCallback(async (s: Session | null) => {
    const id = ++latest.current;
    if (!s) {
      setProfile(null);
      setMyFarm(null);
      return;
    }
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, role, region_id, language').eq('id', s.user.id).maybeSingle(),
      supabase.from('farms').select('*, farm_products(*), farm_photos(*)').eq('owner_id', s.user.id).limit(1).maybeSingle(),
    ]);
    if (id !== latest.current) return;
    setProfile((p as Profile) ?? null);
    setMyFarm((f as Farm) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadMember(data.session).catch(() => {});
      setReady(true);
    });
    let lastUser: string | null | undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Token refreshes keep the same member: no need to reload them every hour.
      const uid = s?.user.id ?? null;
      if (event === 'TOKEN_REFRESHED' && uid === lastUser) return;
      if (lastUser && uid !== lastUser) clearQueryCache();
      lastUser = uid;
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
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        await loadMember(data.session);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        await clearQueryCache();
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
