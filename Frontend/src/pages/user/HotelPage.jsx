import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Camera, Clock, Hotel, LocateFixed, MapPin, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { EmptyState, ErrorNote, Modal, PageLoader, Spinner, Stars } from '../../components/Shared/ui';
import { formatDate, formatDateTime, formatKESShort } from '../../utils/format';
import { compressImage, distanceMeters, getCurrentLocation, mapsLink } from '../../utils/device';

function useCountdown(until) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(new Date(until).getTime() - now, 0);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return ms ? `${h}h ${m}m left` : 'Time is up';
}

function StartModal({ hotel, onClose, onDone }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bonus = user.bonusWallet?.balance || 0;
  const short = user.mainWallet.balance + bonus < hotel.reviewFee;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/hotels/${hotel.hotelId}/start`);
      toast.success('Slot reserved', `Visit ${hotel.name} within ${hotel.reservationHours} hours.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Start a hotel review" onClose={onClose}>
      <p className="font-bold">{hotel.name}</p>
      <dl className="mt-4 space-y-2 rounded-2xl bg-brand-50 p-4 text-sm">
        <div className="flex justify-between"><dt>Review fee (now)</dt><dd className="font-bold">{formatKESShort(hotel.reviewFee)}</dd></div>
        <div className="flex justify-between"><dt>Bonus after approval</dt><dd className="font-bold text-emerald-700">{formatKESShort(hotel.reviewBonus)}</dd></div>
        <div className="flex justify-between"><dt>Bonus credit (used first)</dt><dd className="font-bold">{formatKESShort(bonus)}</dd></div>
        <div className="flex justify-between"><dt>Main wallet balance</dt><dd className={`font-bold ${short ? 'text-rose-600' : ''}`}>{formatKESShort(user.mainWallet.balance)}</dd></div>
      </dl>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>You must submit <b>from the hotel</b> (within {hotel.radiusMeters} m) within <b>{hotel.reservationHours} hours</b>.</li>
        <li>If you don't submit in time, the fee is refunded automatically.</li>
        <li>If the admin rejects your review, the fee is refunded, unless the review is fake (wrong place, copied photo).</li>
        <li>Approved reviews are published on this page, marked as sponsored.</li>
      </ul>
      <div className="mt-3"><ErrorNote message={error} /></div>
      <div className="mt-4 flex gap-3">
        {short ? (
          <button className="btn-primary flex-1" onClick={() => navigate('/dashboard/recharge')}>Add money first</button>
        ) : (
          <button className="btn-primary flex-1" onClick={start} disabled={busy}>{busy && <Spinner className="!text-white" />} Pay {formatKESShort(hotel.reviewFee)} and reserve</button>
        )}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function ReviewForm({ hotel, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState('');
  const [check, setCheck] = useState(null); // { distance, accuracy }
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const left = useCountdown(hotel.myReview.expiresAt);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      setPhoto(await compressImage(file));
    } catch (err) {
      setError(err.message);
    }
  };

  const locate = async () => {
    const loc = await getCurrentLocation();
    const distance = distanceMeters(hotel.location, loc);
    setCheck({ distance, accuracy: loc.accuracy });
    return loc;
  };

  const checkLocation = async () => {
    setBusy('locate');
    setError('');
    try {
      await locate();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Choose a star rating.');
    if (comment.trim().length < 20) return setError('Write at least 20 characters about your visit.');
    if (!photo) return setError('Take a photo at the hotel.');
    setBusy('submit');
    setError('');
    try {
      const loc = await locate(); // always a fresh fix at the moment of submitting
      await api.post(`/hotels/${hotel.hotelId}/submit`, { rating, comment: comment.trim(), photo, ...loc });
      toast.success('Review submitted', 'The admin will check it shortly.');
      onDone();
    } catch (err) {
      setError(err.response ? errorMessage(err) : err.message);
      setBusy('');
    }
  };

  const near = check && check.distance <= hotel.radiusMeters;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        <Clock className="h-4 w-4 shrink-0" />
        <span>Submit from the hotel before <b>{formatDateTime(hotel.myReview.expiresAt)}</b> ({left}).</span>
      </div>

      <div>
        <p className="label">1. Your location</p>
        <button type="button" className="btn-ghost" onClick={checkLocation} disabled={!!busy}>
          {busy === 'locate' ? <Spinner /> : <LocateFixed className="h-4 w-4" />} Check I'm at the hotel
        </button>
        {check && (
          <p className={`mt-2 text-sm font-semibold ${near ? 'text-emerald-600' : 'text-rose-600'}`}>
            {near ? '✓ ' : ''}You are {check.distance} m from the hotel{near ? '.' : `. You must be within ${hotel.radiusMeters} m to submit.`}
            <span className="font-normal text-slate-500"> GPS accuracy ±{check.accuracy} m.</span>
          </p>
        )}
      </div>

      <div>
        <p className="label">2. Rating</p>
        <Stars value={rating} onChange={setRating} size="h-8 w-8" />
      </div>

      <div>
        <label className="label" htmlFor="review-comment">3. Your review</label>
        <textarea id="review-comment" className="field" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="Rooms, cleanliness, staff, food, value for money…" />
        <p className="mt-1 text-xs text-slate-500">{comment.trim().length}/2000 · at least 20 characters</p>
      </div>

      <div>
        <p className="label">4. Photo taken at the hotel</p>
        <label className="btn-ghost cursor-pointer">
          <Camera className="h-4 w-4" /> {photo ? 'Retake photo' : 'Take photo'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickPhoto} />
        </label>
        {photo && <img src={photo} alt="Your hotel photo" className="mt-3 max-h-56 rounded-2xl object-cover ring-1 ring-brand-100" />}
      </div>

      <ErrorNote message={error} />
      <button className="btn-primary w-full" disabled={!!busy}>{busy === 'submit' && <Spinner className="!text-white" />} Submit review</button>
      <p className="text-center text-xs text-slate-500">Your location is checked again when you press Submit.</p>
    </form>
  );
}

function ActionPanel({ hotel, onStart, reload }) {
  const r = hotel.myReview;
  const canRetry = !r || r.status === 'expired' || (r.status === 'rejected' && !r.fraud);

  if (r?.status === 'reserved') return <ReviewForm hotel={hotel} onDone={reload} />;
  if (r?.status === 'submitted') {
    return <Notice icon={Clock} tone="amber" title="Awaiting admin approval" text={`Submitted ${formatDateTime(r.submittedAt)}, ${r.distanceMeters} m from the hotel. You'll be notified when it is checked.`} />;
  }
  if (r?.status === 'approved') {
    return <Notice icon={BadgeCheck} tone="green" title={`Approved: you earned ${formatKESShort(r.bonus)}`} text="The bonus is in your commission wallet and can be withdrawn." />;
  }
  if (r?.status === 'rejected' && r.fraud) {
    return <Notice icon={ShieldAlert} tone="red" title="Review rejected as invalid" text={`${r.rejectionReason}. You can't review this hotel again.`} />;
  }
  return (
    <div className="space-y-3">
      {r?.status === 'rejected' && <Notice icon={ShieldAlert} tone="amber" title="Your last review was rejected" text={`${r.rejectionReason}. Your fee was refunded. You can try again.`} />}
      {r?.status === 'expired' && <Notice icon={Clock} tone="amber" title="Your last reservation expired" text="Your fee was refunded. You can reserve again." />}
      {hotel.status !== 'active' ? (
        <p className="text-sm text-slate-500">Reviews for this hotel are paused.</p>
      ) : hotel.slotsLeft < 1 ? (
        <p className="text-sm text-slate-500">All review slots are taken right now. Check back later; slots free up when reservations expire.</p>
      ) : canRetry && (
        <button className="btn-primary w-full" onClick={onStart}>Start review · {formatKESShort(hotel.reviewFee)} fee, {formatKESShort(hotel.reviewBonus)} bonus</button>
      )}
    </div>
  );
}

const NOTICE_TONES = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-800 ring-rose-200',
};

function Notice({ icon: Icon, tone, title, text }) {
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ring-1 ${NOTICE_TONES[tone]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div><p className="font-bold">{title}</p><p className="text-sm">{text}</p></div>
    </div>
  );
}

export default function HotelPage() {
  const { id } = useParams();
  const { refreshUser } = useAuth();
  const [starting, setStarting] = useState(false);
  const { data: hotel, loading, error, reload } = useFetch(`/hotels/${id}`);
  const refresh = () => { reload(); refreshUser().catch(() => {}); };

  if (loading) return <PageLoader />;
  if (!hotel) return <div className="space-y-4"><ErrorNote message={error} onRetry={reload} /><Link to="/dashboard/hotels" className="btn-ghost">Back to hotels</Link></div>;

  return (
    <div className="space-y-5">
      <Link to="/dashboard/hotels" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600"><ArrowLeft className="h-4 w-4" /> All hotels</Link>

      <section className="card overflow-hidden">
        <div className="relative aspect-[21/9] max-h-72 w-full bg-gradient-to-br from-brand-100 to-indigo-100">
          {hotel.image ? <img src={hotel.image} alt="" className="h-full w-full object-cover" /> : <Hotel className="absolute inset-0 m-auto h-14 w-14 text-brand-500/60" />}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">{hotel.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-4 w-4" /> {[hotel.address, hotel.city].filter(Boolean).join(', ')}</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <Stars value={hotel.averageRating || 0} />
              {hotel.reviewCount ? `${hotel.averageRating} from ${hotel.reviewCount} review${hotel.reviewCount === 1 ? '' : 's'}` : 'No reviews yet'}
            </div>
          </div>
          <a href={mapsLink(hotel.location)} target="_blank" rel="noreferrer" className="btn-ghost"><MapPin className="h-4 w-4" /> Directions</a>
        </div>
        {hotel.description && <p className="whitespace-pre-line px-5 pb-5 text-sm text-slate-600">{hotel.description}</p>}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-extrabold">Your review</h2>
        <ActionPanel hotel={hotel} onStart={() => setStarting(true)} reload={refresh} />
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">Member reviews</h2>
        <p className="text-sm text-slate-500">Every review here is a sponsored evaluation: the reviewer visited the hotel and was paid a bonus after approval.</p>
        {hotel.reviews.length ? (
          <ul className="mt-4 divide-y divide-brand-100/70">
            {hotel.reviews.map((r) => (
              <li key={r.reviewId} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{r.username}</span>
                  <Stars value={r.rating} />
                  <span className="chip bg-slate-100 text-slate-600">Sponsored</span>
                  <span className="text-xs text-slate-400">{formatDate(r.reviewedAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.comment}</p>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={Hotel} title="No reviews yet" text="Be the first member to review this hotel." />}
      </section>

      {starting && <StartModal hotel={hotel} onClose={() => setStarting(false)} onDone={() => { setStarting(false); refresh(); }} />}
    </div>
  );
}
