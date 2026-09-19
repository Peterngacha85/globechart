import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../services/api';
import AuthShell from './AuthShell';
import PasswordField from './PasswordField';
import { ErrorNote, Spinner } from '../Shared/ui';

const COUNTRIES = ['Kenya', 'Tanzania', 'Uganda', 'Nigeria', 'Other'];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ref = params.get('ref') || '';
  const [form, setForm] = useState({ username: '', phone: '', country: 'Kenya', password: '', agreeTerms: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.agreeTerms) return setError('You must agree to the Terms of Service and No-Refund Policy');
    setLoading(true);
    try {
      await register({ ...form, username: form.username.trim(), phone: form.phone.trim(), ...(ref && { referralCode: ref }) });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      subtitle="Create account — start earning today"
      heading="New member registration"
      footer={<>Already have an account? <Link to="/login" className="font-bold text-brand-600 hover:underline">Sign In</Link></>}
    >
      {ref && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-700 to-purple-800 px-4 py-3 text-sm text-white">
          <UserPlus className="h-5 w-5" /> Invited by <b className="text-base">{ref}</b>
        </div>
      )}
      <ErrorNote message={error} />
      <form onSubmit={submit} className="mt-3 space-y-4" noValidate={false}>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="username" className="label">Username</label>
            <span className="text-[11px] text-slate-400">this is how you sign in</span>
          </div>
          <input id="username" className="field" placeholder="letters, numbers, underscore" value={form.username} onChange={set('username')} pattern="[A-Za-z0-9_]{3,30}" title="3-30 letters, numbers or underscores" autoComplete="username" required />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="phone" className="label">Phone</label>
            <span className="text-[11px] text-slate-400">for payouts</span>
          </div>
          <input id="phone" type="tel" className="field" placeholder="07XXXXXXXX" value={form.phone} onChange={set('phone')} pattern="^(\+254|254|0)[17][0-9]{8}$" title="A Kenyan number, e.g. 0712345678" autoComplete="tel" required />
        </div>
        <div>
          <label htmlFor="country" className="label">Country</label>
          <div className="relative">
            <select id="country" className="field appearance-none pr-10" value={form.country} onChange={set('country')}>
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
          </div>
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <PasswordField id="password" icon={false} placeholder="Min. 6 characters" value={form.password} onChange={set('password')} minLength={6} autoComplete="new-password" />
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <input type="checkbox" checked={form.agreeTerms} onChange={set('agreeTerms')} className="mt-0.5 h-4 w-4 rounded accent-brand-600" />
          <span>I agree to the <b className="text-brand-600">Terms of Service</b> and <b className="text-brand-600">No-Refund Policy</b></span>
        </label>
        <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-base">
          {loading ? <Spinner className="!text-white" /> : <UserPlus className="h-5 w-5" />} Create Account
        </button>
      </form>
    </AuthShell>
  );
}
