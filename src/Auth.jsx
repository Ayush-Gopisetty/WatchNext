import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { signedIn, signedOut } from './store';

// Keeps cloud sync in step with the session; shows Sign in / Sign out in the header.
export default function Auth() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    const apply = (session) => {
      const u = session?.user ?? null;
      setUser((prev) => {
        if (u && !prev) signedIn(u);
        if (!u && prev) signedOut();
        return u;
      });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, session) => {
      apply(session);
      if (e === 'PASSWORD_RECOVERY') location.hash = '#/reset'; // arrived via emailed reset link
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return null;
  if (user) return <button className="link signin" onClick={() => supabase.auth.signOut()}>{user.email} · Sign out</button>;
  return <a className="btn signin" href="#/login">Sign in</a>;
}
