import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Info, LogIn, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../services/api';
import AuthShell from './AuthShell';
import PasswordField from './PasswordField';
import { ErrorNote, Spinner } from '../Shared/ui';

export default function Login({ admin = false }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '', rememberMe: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const profile = await login(form.username.trim(), form.password, form.rememberMe, { adminOnly: admin });
      const fallback = profile.role === 'super_admin' ? '/admin' : '/dashboard';
      navigate(location.state?.from || fallback, { replace: true });
    } catch (err) {
      setError(err.userMessage ? err.message : errorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      subtitle={admin ? 'Admin Portal' : 'Member Portal'}
      heading={admin ? 'Administrator sign in' : 'Sign in'}
      footer={admin
        ? <>Not an administrator? <Link to="/login" className="font-bold text-brand-600 hover:underline">Member sign in</Link></>
        : <>Don't have an account? <Link to="/register" className="font-bold text-brand-600 hover:underline">Sign Up Free</Link></>}
    >
      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-800 to-indigo-700 px-4 py-3 text-sm text-white">
        <Info className="h-4 w-4 shrink-0" /> Use your <b>username</b> and password to sign in
      </div>
      <ErrorNote message={error} />
      <form onSubmit={submit} className="mt-3 space-y-4">
        <div>
          <label htmlFor="username" className="label">Username</label>
          <div className="relative">
            <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="username" className="field pl-11" placeholder="your_username" value={form.username} onChange={set('username')} autoComplete="username" required />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:underline">Forgot password?</Link>
          </div>
          <PasswordField id="password" value={form.password} onChange={set('password')} autoComplete="current-password" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.rememberMe} onChange={set('rememberMe')} className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
          Keep me signed in
        </label>
        <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-base">
          {loading ? <Spinner className="!text-white" /> : <LogIn className="h-5 w-5" />} Sign In
        </button>
      </form>
    </AuthShell>
  );
}
