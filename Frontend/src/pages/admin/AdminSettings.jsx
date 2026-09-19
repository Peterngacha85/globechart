import { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { ErrorNote, PageHeader, PageLoader, Spinner } from '../../components/Shared/ui';

function SettingRow({ setting, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(String(setting.value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(setting.value)), [setting.value]);
  const changed = Number(value) !== setting.value;

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/admin/settings', { setting: setting.setting, value: Number(value) });
      toast.success('Setting saved', setting.description);
      onSaved();
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{setting.description}</p>
        <p className="font-mono text-xs text-slate-400">{setting.setting}</p>
      </div>
      <input className="field !w-40" type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} aria-label={setting.description} />
      <button className="btn-primary !py-2.5" onClick={save} disabled={!changed || busy || value === ''}>{busy ? <Spinner className="!text-white" /> : <Save className="h-4 w-4" />} Save</button>
    </div>
  );
}

export default function AdminSettings() {
  const { data, loading, error, reload } = useFetch('/admin/settings');
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader icon={Settings} title="Settings" subtitle="Deposit and withdrawal limits. Changes apply immediately." />
      <ErrorNote message={error} onRetry={reload} />
      <section className="card divide-y divide-brand-100/70 overflow-hidden">
        {loading ? <PageLoader /> : data?.map((s) => <SettingRow key={s.setting} setting={s} onSaved={reload} />)}
      </section>
      <section className="card p-5 text-sm text-slate-600">
        <h2 className="mb-1 font-extrabold text-ink">Admin account</h2>
        The admin username, email, phone and password come from the server's <code>.env</code> file (<code>ADMIN_*</code>). Edit them there and restart the backend. The same admin account is updated.
      </section>
    </div>
  );
}
