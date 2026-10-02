import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, CalendarDays, GraduationCap, MapPin, Rocket, Ticket, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Spinner, StatusChip } from '../../components/Shared/ui';
import { PROGRAMS, formatDateTime, formatKESShort } from '../../utils/format';

const REG_LABEL = { registered: 'Booked', attended: 'Attended', absent: 'Did not attend', cancelled: 'Cancelled · refunded' };

const sessionTime = (t) => `${formatDateTime(t.startsAt)} · ${Math.round(t.durationMinutes / 60 * 10) / 10} h`;

function RegisterModal({ training, cancelHours, onClose, onDone }) {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bonus = user.bonusWallet?.balance || 0;
  const short = user.mainWallet.balance + bonus < training.fee;

  const book = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/trainings/${training.trainingId}/register`);
      toast.success('Seat booked', `Your ticket code is ${res.data.data.ticketCode}`);
      refreshUser().catch(() => {});
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Book a seat" onClose={onClose}>
      <p className="font-bold">{training.title}</p>
      <p className="text-sm text-slate-600">{sessionTime(training)} · {training.venue}</p>
      <dl className="mt-4 space-y-2 rounded-2xl bg-brand-50 p-4 text-sm">
        <div className="flex justify-between"><dt>Registration fee</dt><dd className="font-bold">{formatKESShort(training.fee)}</dd></div>
        <div className="flex justify-between"><dt>Bonus credit (used first)</dt><dd className="font-bold">{formatKESShort(bonus)}</dd></div>
        <div className="flex justify-between"><dt>Main wallet balance</dt><dd className={`font-bold ${short ? 'text-rose-600' : ''}`}>{formatKESShort(user.mainWallet.balance)}</dd></div>
      </dl>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>You get a ticket code. Show it at the door to be checked in.</li>
        <li>Can't make it? Cancel at least <b>{cancelHours} hours</b> before the session for a full refund. Later cancellations and no-shows are not refunded.</li>
        <li>If the session is cancelled by the organiser, you are refunded automatically.</li>
        <li>Attendees can receive a certificate with a code anyone can verify.</li>
      </ul>
      <div className="mt-3"><ErrorNote message={error} /></div>
      <div className="mt-4 flex gap-3">
        {short ? (
          <button className="btn-primary flex-1" onClick={() => navigate('/dashboard/recharge')}>Add money first</button>
        ) : (
          <button className="btn-primary flex-1" onClick={book} disabled={busy}>{busy && <Spinner className="!text-white" />} Pay {formatKESShort(training.fee)} and book</button>
        )}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function Upcoming({ program, onBooked }) {
  const { data, loading, error, reload } = useFetch('/trainings', { program });
  const [booking, setBooking] = useState(null);
  if (loading) return <PageLoader />;
  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      {data?.trainings?.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {data.trainings.map((t) => (
            <article key={t.trainingId} className="card flex flex-col p-5">
              <h3 className="text-lg font-extrabold">{t.title}</h3>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-4 w-4" /> {sessionTime(t)}</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4" />
                {t.mapUrl ? <a href={t.mapUrl} target="_blank" rel="noreferrer" className="hover:underline">{t.venue}</a> : t.venue}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Users className="h-4 w-4" /> {t.seatsLeft} of {t.seats} seats left</p>
              {t.description && <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{t.description}</p>}
              <div className="mt-auto pt-4">
                {t.myRegistration ? (
                  <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">Booked · ticket <b className="font-mono">{t.myRegistration.ticketCode}</b></p>
                ) : t.seatsLeft > 0 ? (
                  <button className="btn-primary w-full" onClick={() => setBooking(t)}>Book seat · {formatKESShort(t.fee)}</button>
                ) : <button className="btn-ghost w-full" disabled>Full</button>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><EmptyState icon={GraduationCap} title="No sessions scheduled" text="New sessions will appear here." /></div>}
      {booking && <RegisterModal training={booking} cancelHours={data.cancelHours} onClose={() => setBooking(null)} onDone={() => { setBooking(null); reload(); onBooked(); }} />}
    </>
  );
}

function MyTickets({ program }) {
  const toast = useToast();
  const { refreshUser } = useAuth();
  const { data, loading, error, reload } = useFetch('/trainings/my', { limit: 50, program });
  const [busy, setBusy] = useState('');

  const cancel = async (r) => {
    if (!window.confirm(`Cancel your seat for "${r.training.title}"? Your ${formatKESShort(r.fee)} will be refunded.`)) return;
    setBusy(r.registrationId);
    try {
      await api.post(`/trainings/registrations/${r.registrationId}/cancel`);
      toast.success('Cancelled and refunded');
      reload();
      refreshUser().catch(() => {});
    } catch (err) {
      toast.error('Could not cancel', errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  if (loading) return <PageLoader />;
  const cutoff = (data?.cancelHours ?? 24) * 60 * 60 * 1000;
  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      {data?.registrations?.length ? (
        <div className="space-y-3">
          {data.registrations.map((r) => {
            const t = r.training;
            const canCancel = r.status === 'registered' && t && new Date(t.startsAt).getTime() - Date.now() >= cutoff;
            return (
              <article key={r.registrationId} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="font-bold">{t?.title}</p>
                  <p className="text-sm text-slate-500">{t && sessionTime(t)} · {t?.venue}</p>
                  {t?.status === 'cancelled' && <p className="text-sm text-rose-600">Class cancelled: {t.cancelReason}</p>}
                  <div className="mt-2"><StatusChip status={r.status} label={REG_LABEL[r.status]} /></div>
                </div>
                <div className="text-right">
                  {r.status === 'registered' && (
                    <>
                      <p className="label !mb-0">Ticket</p>
                      <p className="flex items-center gap-2 font-mono text-2xl font-extrabold tracking-widest"><Ticket className="h-5 w-5 text-brand-600" />{r.ticketCode}</p>
                      {canCancel
                        ? <button className="mt-1 text-sm font-bold text-rose-600 hover:underline" onClick={() => cancel(r)} disabled={busy === r.registrationId}>Cancel and refund</button>
                        : <p className="mt-1 text-xs text-slate-500">Cancellation closed</p>}
                    </>
                  )}
                  {r.certificateCode && (
                    <a href={`/verify/${r.certificateCode}`} target="_blank" rel="noreferrer" className="btn-ghost"><Award className="h-4 w-4" /> Certificate</a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="card"><EmptyState icon={Ticket} title="No bookings yet" text="Book a session to get your ticket." /></div>}
    </>
  );
}

export default function TrainingPage({ program = 'ai_prompt' }) {
  const [tab, setTab] = useState('upcoming');
  const info = PROGRAMS[program];
  return (
    <div className="space-y-5">
      <PageHeader icon={program === 'y99' ? Rocket : GraduationCap} title={info.label} subtitle={info.subtitle} />
      <div className="flex gap-2">
        {[['upcoming', 'Upcoming sessions'], ['mine', 'My tickets']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${tab === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'upcoming' ? <Upcoming program={program} onBooked={() => setTab('mine')} /> : <MyTickets program={program} />}
    </div>
  );
}
