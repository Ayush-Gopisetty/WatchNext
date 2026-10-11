import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const MIN = 8;
const NOT_CONFIGURED = <div className="empty">Backend not configured. Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart.</div>;

export default function Login() {
  const [mode, setMode] = useState('in'); // in | up | forgot
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in (or just finished): go home.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => data.session && (location.hash = '#/'));
    const { data } = supabase.auth.onAuthStateChange((e, s) => s && e !== 'PASSWORD_RECOVERY' && (location.hash = '#/'));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!supabase) return NOT_CONFIGURED;

  const switchTo = (m) => { setMode(m); setMsg(''); setNote(''); setPw(''); setPw2(''); };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin, queryParams: { prompt: 'select_account' } } });
    if (error) setMsg(error.message);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg(''); setNote('');
    if (mode !== 'forgot' && pw.length < MIN) return setMsg(`Password must be at least ${MIN} characters.`);
    if (mode === 'up' && pw !== pw2) return setMsg('Passwords do not match.');
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) setMsg(error.message);
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin } });
        if (error) setMsg(error.message);
        else if (!data.session) setNote(`We sent a confirmation link to ${email}. Click it to activate your account, then sign in.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) setMsg(error.message);
        else setNote(`If an account exists for ${email}, a reset link is on its way.`);
      }
    } finally { setBusy(false); }
  };

  const title = { in: 'Sign in', up: 'Create your account', forgot: 'Reset your password' }[mode];
  return (
    <div className="loginpage">
      <h1>{title}</h1>
      {mode !== 'forgot' && <>
        <button className="btn ghost wide" onClick={google}>Continue with Google</button>
        <div className="or"><span>or use email</span></div>
      </>}
      {note ? <p className="sent">{note}</p> : (
        <form onSubmit={submit}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
          {mode !== 'forgot' && <input type="password" required minLength={MIN} value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder={mode === 'up' ? `Password (min ${MIN} characters)` : 'Password'} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />}
          {mode === 'up' && <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />}
          <button className="btn wide" disabled={busy}>{{ in: 'Sign in', up: 'Create account', forgot: 'Send reset link' }[mode]}</button>
        </form>
      )}
      {msg && <p className="loginerr">{msg}</p>}
      <p className="muted small">
        {mode === 'in' && <>New here? <button className="link" onClick={() => switchTo('up')}>Create an account</button> · <button className="link" onClick={() => switchTo('forgot')}>Forgot password?</button></>}
        {mode === 'up' && <>Already have an account? <button className="link" onClick={() => switchTo('in')}>Sign in</button></>}
        {mode === 'forgot' && <button className="link" onClick={() => switchTo('in')}>Back to sign in</button>}
      </p>
    </div>
  );
}

// Shown after the user clicks the reset link in their email (they hold a temporary recovery session).
export function ResetPassword() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  if (!supabase) return NOT_CONFIGURED;
  const save = async (e) => {
    e.preventDefault();
    if (pw.length < MIN) return setMsg(`Password must be at least ${MIN} characters.`);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setMsg(error.message); else location.hash = '#/';
  };
  return (
    <div className="loginpage">
      <h1>Choose a new password</h1>
      <form onSubmit={save}>
        <input type="password" required minLength={MIN} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={`New password (min ${MIN} characters)`} autoComplete="new-password" />
        <button className="btn wide">Save password</button>
      </form>
      {msg && <p className="loginerr">{msg}</p>}
    </div>
  );
}
