import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import authService from '../../services/authService';
import { errorMessage } from '../../services/api';
import AuthShell from './AuthShell';
import PasswordField from './PasswordField';
import { ErrorNote, Spinner } from '../Shared/ui';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Reset your password" heading="Forgot password" footer={<Link to="/login" className="font-bold text-brand-600 hover:underline">Back to sign in</Link>}>
      {sent ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          If that email is registered, a reset link has been sent. Check your inbox.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorNote message={error} />
          <p className="text-sm text-slate-600">Enter the email on your account. Accounts without an email should contact support.</p>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Spinner className="!text-white" />} Send reset link
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Choose a new password" heading="Reset password" footer={<Link to="/login" className="font-bold text-brand-600 hover:underline">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote message={error} />
        <div>
          <label htmlFor="password" className="label">New password</label>
          <PasswordField id="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Spinner className="!text-white" />} Reset password
        </button>
      </form>
    </AuthShell>
  );
}
