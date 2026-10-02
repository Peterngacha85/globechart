import { useState } from 'react';
import { Award, GraduationCap, Plus, Ticket } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, StatTile, StatusChip } from '../../components/Shared/ui';
import { PROGRAMS, formatDateTime, formatKESShort } from '../../utils/format';

const EMPTY = { program: 'ai_prompt', title: PROGRAMS.ai_prompt.defaultTitle, description: '', venue: '', mapUrl: '', startsAt: '', durationMinutes: 120, fee: 100, seats: 30 };

// <input type="datetime-local"> works in local time without a zone
const toLocalInput = (d) => {
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function TrainingForm({ training, program, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(training
    ? { ...EMPTY, ...training, description: training.description || '', mapUrl: training.mapUrl || '', startsAt: toLocalInput(training.startsAt) }
    : { ...EMPTY, program, title: PROGRAMS[program].defaultTitle });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      program: f.program, title: f.title.trim(), description: f.description.trim() || undefined, venue: f.venue.trim(), mapUrl: f.mapUrl.trim() || undefined,
      startsAt: new Date(f.startsAt).toISOString(), durationMinutes: Number(f.durationMinutes), fee: Number(f.fee), seats: Number(f.seats),
    };
    try {
      if (training) await api.put(`/admin/trainings/${training.trainingId}`, body);
      else await api.post('/admin/trainings', body);
      toast.success(training ? 'Session updated' : 'Session created');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={training ? 'Edit session' : 'New training session'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <div><label className="label">Programme</label>
          <select className="field" value={f.program}
            onChange={(e) => setF((s) => ({ ...s, program: e.target.value, title: s.title === PROGRAMS[s.program].defaultTitle ? PROGRAMS[e.target.value].defaultTitle : s.title }))}>
            {Object.entries(PROGRAMS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
          </select></div>
        <div><label className="label">Title</label><input className="field" value={f.title} onChange={set('title')} required maxLength={120} /></div>
        <div><label className="label">What members will learn</label><textarea className="field" rows={3} value={f.description} onChange={set('description')} maxLength={2000} /></div>
        <div><label className="label">Venue</label><input className="field" value={f.venue} onChange={set('venue')} required maxLength={200} placeholder="e.g. Room 4, Hilton, Nairobi CBD" /></div>
        <div><label className="label">Google Maps link (optional)</label><input className="field" type="url" value={f.mapUrl} onChange={set('mapUrl')} placeholder="https://maps.app.goo.gl/…" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Starts</label><input className="field" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} required /></div>
          <div><label className="label">Length (minutes)</label><input className="field" type="number" min="15" max="1440" step="15" value={f.durationMinutes} onChange={set('durationMinutes')} required /></div>
          <div><label className="label">Registration fee (Ksh)</label><input className="field" type="number" min="0" step="1" value={f.fee} onChange={set('fee')} required /></div>
          <div><label className="label">Seats</label><input className="field" type="number" min={training?.seatsTaken || 0} step="1" value={f.seats} onChange={set('seats')} required /></div>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="!text-white" />} {training ? 'Save changes' : 'Create session'}</button>
      </form>
    </Modal>
  );
}

const REG_LABEL = { registered: 'Booked', attended: 'Attended', absent: 'Absent' };

function SessionModal({ trainingId, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/admin/trainings/${trainingId}/registrations`);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');

  const act = async (key, request, success) => {
    setBusy(key);
    try {
      const res = await request();
      toast.success(success(res));
      reload();
      onChanged();
      return true;
    } catch (err) {
      toast.error('Could not complete', errorMessage(err));
      return false;
    } finally {
      setBusy('');
    }
  };

  const checkIn = async (e) => {
    e.preventDefault();
    if (await act('code', () => api.post(`/admin/trainings/${trainingId}/check-in`, { ticketCode: code.trim() }), (r) => `${r.data.message}: ${r.data.data.member.username}`)) setCode('');
  };

  const cancelSession = async () => {
    const reason = window.prompt('Why is this session cancelled? Members will see this, and everyone booked is refunded.');
    if (!reason || reason.trim().length < 3) return;
    await act('cancel', () => api.post(`/admin/trainings/${trainingId}/cancel`, { reason: reason.trim() }), (r) => r.data.message);
  };

  if (loading) return <Modal title="Session" onClose={onClose}><PageLoader /></Modal>;
  const t = data?.training;
  return (
    <Modal title={t?.title || 'Session'} onClose={onClose}>
      <ErrorNote message={error} onRetry={reload} />
      {t && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>{formatDateTime(t.startsAt)} · {t.venue}</span>
            <StatusChip status={t.status} />
          </div>
          {t.status !== 'cancelled' && (
            <form onSubmit={checkIn} className="flex gap-2">
              <input className="field flex-1 font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ticket code" aria-label="Ticket code" maxLength={20} />
              <button className="btn-primary" disabled={busy === 'code' || code.trim().length < 4}>{busy === 'code' ? <Spinner className="!text-white" /> : <Ticket className="h-4 w-4" />} Check in</button>
            </form>
          )}
          <ul className="divide-y divide-brand-100/70 rounded-2xl ring-1 ring-brand-100">
            {data.registrations.length ? data.registrations.map((r) => (
              <li key={r.registrationId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className="font-bold">{r.member?.username} <span className="font-mono text-xs font-normal text-slate-500">{r.ticketCode}</span></p>
                  <p className="text-xs text-slate-500">{r.member?.phone}{r.certificateCode && ` · certificate ${r.certificateCode}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={r.status} label={REG_LABEL[r.status]} />
                  {t.status !== 'cancelled' && r.status !== 'attended' && (
                    <button className="font-bold text-brand-600 hover:underline" disabled={!!busy}
                      onClick={() => act(r.registrationId, () => api.post(`/admin/trainings/${trainingId}/check-in`, { registrationId: r.registrationId }), () => `${r.member?.username} checked in`)}>Mark present</button>
                  )}
                  {r.status === 'attended' && !r.certificateCode && (
                    <>
                      <button className="font-bold text-emerald-600 hover:underline" disabled={!!busy}
                        onClick={() => act(r.registrationId, () => api.post(`/admin/trainings/${trainingId}/certify`, { registrationId: r.registrationId }), () => `Certificate issued to ${r.member?.username}`)}>
                        <Award className="inline h-4 w-4" /> Certify
                      </button>
                      <button className="text-xs text-slate-500 hover:underline" disabled={!!busy}
                        onClick={() => act(r.registrationId, () => api.post(`/admin/trainings/${trainingId}/undo-check-in`, { registrationId: r.registrationId }), () => 'Check-in removed')}>Undo</button>
                    </>
                  )}
                </div>
              </li>
            )) : <li className="px-3 py-6 text-center text-sm text-slate-500">No bookings yet.</li>}
          </ul>
          {t.status === 'scheduled' && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-success flex-1" disabled={!!busy || new Date(t.startsAt) > new Date()}
                title={new Date(t.startsAt) > new Date() ? 'Available once the session has started' : undefined}
                onClick={() => window.confirm('Finish this session? Anyone not checked in is marked absent (no refund).') && act('complete', () => api.post(`/admin/trainings/${trainingId}/complete`), (r) => `Session completed · ${r.data.data.absent} absent`)}>
                Complete session
              </button>
              <button className="btn-danger" disabled={!!busy} onClick={cancelSession}>Cancel and refund all</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function AdminTrainings() {
  const [page, setPage] = useState(1);
  const [program, setProgram] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const { data, loading, error, reload } = useFetch('/admin/trainings', { page, limit: 20, program: program || undefined });

  return (
    <div className="space-y-5">
      <PageHeader icon={GraduationCap} title="Training & Y99" subtitle="In-person sessions for AI Prompt Training and the Y99 Earn Program: bookings, door check-in and certificates."
        action={<button className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New session</button>} />
      <div className="flex flex-wrap gap-2">
        {[['', 'All'], ...Object.entries(PROGRAMS).map(([key, p]) => [key, p.label])].map(([key, label]) => (
          <button key={key || 'all'} onClick={() => { setProgram(key); setPage(1); }}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${program === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote message={error} onRetry={reload} />
      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Registration fees kept" value={formatKESShort(data.feesKept)} tone="text-emerald-600" />
          <StatTile label="Upcoming sessions" value={data.trainings.filter((t) => t.status === 'scheduled').length} />
          <StatTile label="Certificates (this page)" value={data.trainings.reduce((s, t) => s + t.certified, 0)} tone="text-brand-600" />
        </div>
      )}
      <section className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.trainings.length ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Session', 'When', 'Seats', 'Attended', 'Status', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-brand-100/70">
              {data.trainings.map((t) => (
                <tr key={t.trainingId}>
                  <td className="px-4 py-3">
                    <span className={`chip mb-1 ${t.program === 'y99' ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'}`}>{PROGRAMS[t.program]?.label}</span>
                    <p className="font-bold">{t.title}</p><p className="text-xs text-slate-500">{t.venue} · {formatKESShort(t.fee)}</p>
                  </td>
                  <td className="px-4 py-3">{formatDateTime(t.startsAt)}</td>
                  <td className="px-4 py-3">{t.seatsTaken} / {t.seats}</td>
                  <td className="px-4 py-3">{t.attended}{t.absent > 0 && <span className="text-xs text-slate-500"> · {t.absent} absent</span>}</td>
                  <td className="px-4 py-3"><StatusChip status={t.status} /></td>
                  <td className="space-x-2 px-4 py-3 text-right">
                    <button className="font-bold text-brand-600 hover:underline" onClick={() => setOpen(t.trainingId)}>Attendees</button>
                    {t.status === 'scheduled' && <button className="font-bold text-slate-600 hover:underline" onClick={() => setEditing(t)}>Edit</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={GraduationCap} title="No sessions yet" text="Create your first session." action={<button className="btn-primary" onClick={() => setEditing('new')}>New session</button>} />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {editing && <TrainingForm training={editing === 'new' ? null : editing} program={program || 'ai_prompt'} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {open && <SessionModal trainingId={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
