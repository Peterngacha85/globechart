import { useState } from 'react';
import { KeyRound, Save, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api, { errorMessage } from '../../services/api';
import CopyButton from '../../components/Shared/CopyButton';
import PasswordField from '../../components/Auth/PasswordField';
import { ErrorNote, Spinner, StatusChip } from '../../components/Shared/ui';
import { formatDate, formatKESShort } from '../../utils/format';

function EditProfile() {
  const { user, refreshUser, isAdmin } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ country: user.country || 'Kenya', email: user.email || '', mpesaPhone: user.mpesaPhone || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const body = { country: form.country };
    if (form.email && !isAdmin) body.email = form.email;
    if (form.mpesaPhone) body.mpesaPhone = form.mpesaPhone;
    try {
      await api.put('/users/profile', body);
      await refreshUser();
      toast.success('Profile updated');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <ErrorNote message={error} />
      <div>
        <label className="label">Phone number</label>
        <input className="field opacity-70" value={user.phone} disabled />
        <p className="mt-1 text-xs text-slate-500">Contact support to change your phone.</p>
      </div>
      <div>
        <label htmlFor="country" className="label">Country</label>
        <input id="country" className="field" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required />
      </div>
      <div>
        <label htmlFor="email" className="label">Email {isAdmin && <span className="normal-case">(managed in server .env)</span>}</label>
        <input id="email" type="email" className="field" placeholder="Optional. Needed to reset your password" value={form.email} disabled={isAdmin} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div>
        <label htmlFor="mpesa" className="label">Default M-Pesa number for payouts</label>
        <input id="mpesa" className="field" placeholder={user.phone} value={form.mpesaPhone} onChange={(e) => setForm({ ...form, mpesaPhone: e.target.value })} />
      </div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="!text-white" /> : <Save className="h-4 w-4" />} Save Changes</button>
    </form>
  );
}

function ChangePassword() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user.role === 'super_admin') {
    return <p className="p-5 text-sm text-slate-600">The admin password is managed in the server's <code>.env</code> file (ADMIN_PASSWORD). Change it there and restart the server.</p>;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/users/change-password', form);
      toast.success('Password changed', 'Please sign in again.');
      logout();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <ErrorNote message={error} />
      <div><label className="label">Current password</label><PasswordField value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} icon={false} autoComplete="current-password" /></div>
      <div><label className="label">New password</label><PasswordField value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} icon={false} minLength={6} autoComplete="new-password" /></div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="!text-white" /> : <KeyRound className="h-4 w-4" />} Update Password</button>
    </form>
  );
}

const Panel = ({ icon: Icon, title, children }) => (
  <section className="card overflow-hidden">
    <h2 className="flex items-center gap-3 bg-brand-50 px-5 py-3 font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><Icon className="h-4 w-4" /></span>{title}</h2>
    {children}
  </section>
);

export default function ProfilePage() {
  const { user } = useAuth();
  const link = `${window.location.origin}/register?ref=${user.referralCode}`;

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-20 w-20 place-items-center rounded-2xl bg-brand-600 text-3xl font-extrabold uppercase text-white shadow-glow">{user.username.slice(0, 2)}</span>
          <div>
            <h1 className="text-2xl font-extrabold">{user.username}</h1>
            <p className="text-sm text-slate-500">{user.email || 'No email on file'}</p>
            <div className="mt-2 flex gap-2"><StatusChip status={user.status} /><span className="chip bg-brand-50 text-brand-700">Joined {formatDate(user.createdAt)}</span></div>
          </div>
        </div>
        <div className="rounded-2xl bg-brand-50 p-4 text-center">
          <p className="label !mb-1">Ref code</p>
          <p className="font-mono text-lg font-extrabold tracking-widest text-brand-700">{user.referralCode}</p>
          <CopyButton text={user.referralCode} className="btn-primary mt-2 !px-3 !py-1.5 !text-xs" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[['Direct referrals', user.directReferrals, 'text-brand-600'], ['Withdrawn', formatKESShort(user.totalWithdrawn), 'text-emerald-600'], ['Team size', user.totalTeamSize, 'text-amber-500'], ['Account', user.status, 'text-pink-500 capitalize']].map(([k, v, c]) => (
          <div key={k} className="card border-b-4 border-brand-200 p-4"><p className={`text-2xl font-extrabold ${c}`}>{v}</p><p className="label !mb-0">{k}</p></div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel icon={UserRound} title="Account details">
            <dl className="divide-y divide-brand-100/70 px-5 text-sm">
              {[['Username', user.username], ['Email', user.email || '—'], ['Phone', user.phone], ['Country', user.country || '—'], ['Joined', formatDate(user.createdAt)]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-3"><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>
              ))}
            </dl>
            <div className="m-5 flex items-center gap-2 rounded-2xl bg-brand-50 p-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
              <CopyButton text={link} label="Copy Link" className="btn-primary !px-3 !py-1.5 !text-xs" />
            </div>
          </Panel>
          {user.referredBy && (
            <Panel icon={UserRound} title="Referred by">
              <div className="flex items-center gap-3 p-5"><span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500 font-bold uppercase text-white">{user.referredBy.username.slice(0, 2)}</span><div><p className="font-bold capitalize">{user.referredBy.username}</p><p className="text-xs text-slate-500">{user.referredBy.country}</p></div></div>
            </Panel>
          )}
        </div>
        <div className="space-y-5">
          <Panel icon={Save} title="Edit profile"><EditProfile /></Panel>
          <Panel icon={KeyRound} title="Change password"><ChangePassword /></Panel>
        </div>
      </div>
    </div>
  );
}
