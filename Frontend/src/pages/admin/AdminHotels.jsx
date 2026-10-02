import { useState } from 'react';
import { Hotel, LocateFixed, MapPin, Plus } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, Stars, StatTile, StatusChip } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';
import { getCurrentLocation, mapsLink } from '../../utils/device';
import { REVIEW_STATUS_LABEL } from '../user/HotelsPage';

const EMPTY = { name: '', description: '', address: '', city: '', image: '', lat: '', lng: '', reviewFee: 100, reviewBonus: 200, slots: 20, status: 'active' };

const toForm = (h) => ({
  name: h.name, description: h.description || '', address: h.address, city: h.city || '', image: h.image || '',
  lat: h.location.lat, lng: h.location.lng, reviewFee: h.reviewFee, reviewBonus: h.reviewBonus, slots: h.slots, status: h.status,
});

// Accepts "-1.2864, 36.8172" pasted from Google Maps into either field
const splitCoords = (value) => {
  const m = String(value).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? { lat: m[1], lng: m[2] } : null;
};

function HotelForm({ hotel, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(hotel ? toForm(hotel) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setCoord = (k) => (e) => {
    const both = splitCoords(e.target.value);
    setF((s) => (both ? { ...s, ...both } : { ...s, [k]: e.target.value }));
  };

  const useHere = async () => {
    setLocating(true);
    setError('');
    try {
      const { lat, lng, accuracy } = await getCurrentLocation();
      setF((s) => ({ ...s, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
      toast.success('Location set', `GPS accuracy ±${accuracy} m`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: f.name.trim(), description: f.description.trim() || undefined, address: f.address.trim(), city: f.city.trim() || undefined,
      image: f.image.trim() || undefined, lat: Number(f.lat), lng: Number(f.lng),
      reviewFee: Number(f.reviewFee), reviewBonus: Number(f.reviewBonus), slots: Number(f.slots), status: f.status,
    };
    try {
      if (hotel) await api.put(`/admin/hotels/${hotel.hotelId}`, body);
      else await api.post('/admin/hotels', body);
      toast.success(hotel ? 'Hotel updated' : 'Hotel added');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const funding = Number(f.slots || 0) * Number(f.reviewBonus || 0);

  return (
    <Modal title={hotel ? 'Edit hotel' : 'Add hotel'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <div><label className="label">Hotel name</label><input className="field" value={f.name} onChange={set('name')} required maxLength={120} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Street / area</label><input className="field" value={f.address} onChange={set('address')} required maxLength={200} /></div>
          <div><label className="label">Town</label><input className="field" value={f.city} onChange={set('city')} maxLength={60} /></div>
        </div>
        <div><label className="label">Description</label><textarea className="field" rows={3} value={f.description} onChange={set('description')} maxLength={2000} /></div>
        <div><label className="label">Image URL</label><input className="field" type="url" value={f.image} onChange={set('image')} placeholder="https://…" /></div>

        <div className="rounded-2xl bg-brand-50 p-3">
          <p className="label">Hotel GPS location</p>
          <div className="grid grid-cols-2 gap-3">
            <input className="field" inputMode="decimal" value={f.lat} onChange={setCoord('lat')} placeholder="Latitude e.g. -1.2864" required aria-label="Latitude" />
            <input className="field" inputMode="decimal" value={f.lng} onChange={setCoord('lng')} placeholder="Longitude e.g. 36.8172" required aria-label="Longitude" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost !py-2" onClick={useHere} disabled={locating}>{locating ? <Spinner /> : <LocateFixed className="h-4 w-4" />} Use my current location</button>
            {f.lat && f.lng && <a className="text-sm font-bold text-brand-600 hover:underline" href={mapsLink({ lat: f.lat, lng: f.lng })} target="_blank" rel="noreferrer">Check on map</a>}
          </div>
          <p className="mt-2 text-xs text-slate-500">Stand at the hotel entrance and tap "Use my current location", or paste coordinates from Google Maps (long-press the hotel, then copy the numbers). Members must be within 200 m of this point.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Fee (Ksh)</label><input className="field" type="number" min="0" step="1" value={f.reviewFee} onChange={set('reviewFee')} required /></div>
          <div><label className="label">Bonus (Ksh)</label><input className="field" type="number" min="0" step="1" value={f.reviewBonus} onChange={set('reviewBonus')} required /></div>
          <div><label className="label">Slots</label><input className="field" type="number" min={hotel?.slotsUsed || 0} step="1" value={f.slots} onChange={set('slots')} required /></div>
        </div>
        <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
          You are committing to pay up to <b>{formatKESShort(funding)}</b> in bonuses for this hotel ({f.slots || 0} slots × {formatKESShort(f.reviewBonus)}).
          Only open as many slots as you have funds and a hotel agreement for. Changing the fee or bonus only affects new reservations.
        </p>
        <div><label className="label">Status</label>
          <select className="field" value={f.status} onChange={set('status')}><option value="active">Active (members can start reviews)</option><option value="paused">Paused (no new reviews)</option><option value="archived">Archived (hidden)</option></select></div>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="!text-white" />} {hotel ? 'Save changes' : 'Add hotel'}</button>
      </form>
    </Modal>
  );
}

function ReviewModal({ reviewId, onClose, onDone }) {
  const toast = useToast();
  const { data: r, loading, error } = useFetch(`/admin/hotel-reviews/${reviewId}`);
  const [reason, setReason] = useState('');
  const [fraud, setFraud] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');

  const act = async (kind) => {
    setBusy(kind);
    setActionError('');
    try {
      if (kind === 'approve') await api.put(`/admin/hotel-reviews/${reviewId}/approve`);
      else await api.put(`/admin/hotel-reviews/${reviewId}/reject`, { reason: reason.trim(), fraud });
      toast.success(kind === 'approve' ? `Approved, ${formatKESShort(r.bonus)} paid` : fraud ? 'Rejected as fraud, fee kept' : 'Rejected, fee refunded');
      onDone();
    } catch (err) {
      setActionError(errorMessage(err));
      setBusy('');
    }
  };

  return (
    <Modal title="Hotel review" onClose={onClose}>
      {loading ? <PageLoader /> : !r ? <ErrorNote message={error} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold">{r.hotel?.name}</p>
              <p className="text-sm text-slate-500">by {r.user?.username} · {r.user?.phone}</p>
            </div>
            <StatusChip status={r.status} label={REVIEW_STATUS_LABEL[r.status]} />
          </div>
          {r.photo && <img src={r.photo} alt="Photo submitted by the member" className="max-h-80 w-full rounded-2xl object-cover ring-1 ring-brand-100" />}
          {r.rating && <Stars value={r.rating} size="h-5 w-5" />}
          {r.comment && <p className="whitespace-pre-line text-sm text-slate-700">{r.comment}</p>}

          {r.location?.lat !== undefined && (
            <dl className="space-y-1 rounded-2xl bg-brand-50 p-3 text-sm">
              <div className="flex justify-between"><dt>Distance from hotel</dt><dd className={`font-bold ${r.distanceMeters > 150 ? 'text-amber-600' : 'text-emerald-600'}`}>{r.distanceMeters} m</dd></div>
              <div className="flex justify-between"><dt>GPS accuracy</dt><dd className={`font-bold ${r.location.accuracy > 100 ? 'text-amber-600' : ''}`}>{r.location.accuracy != null ? `±${r.location.accuracy} m` : '—'}</dd></div>
              <div className="flex justify-between"><dt>Submitted</dt><dd>{formatDateTime(r.submittedAt)}</dd></div>
              <div className="flex justify-between"><dt>Member's position</dt><dd><a className="font-bold text-brand-600 hover:underline" href={mapsLink(r.location)} target="_blank" rel="noreferrer">Open map</a></dd></div>
            </dl>
          )}
          {r.rejectionReason && <p className="text-sm text-rose-700">Rejected: {r.rejectionReason}{r.fraud ? ' (fraud, fee kept)' : ' (fee refunded)'}</p>}

          {r.status === 'submitted' && (
            <>
              <p className="text-xs text-slate-500">
                Check that the photo really shows this hotel and isn't copied from the internet. Phone GPS can be faked, so the photo is your main proof.
              </p>
              <ErrorNote message={actionError} />
              <button className="btn-success w-full" onClick={() => act('approve')} disabled={!!busy}>
                {busy === 'approve' && <Spinner className="!text-white" />} Approve and pay {formatKESShort(r.bonus)}
              </button>
              <div className="space-y-2 rounded-2xl border border-rose-200 p-3">
                <label className="label" htmlFor="reject-reason">Reject: reason shown to the member</label>
                <input id="reject-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Photo is too dark to see the hotel" />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={fraud} onChange={(e) => setFraud(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
                  <span><b>Fake review</b>: wrong place or copied photo. The fee is kept and the member can't review this hotel again. Otherwise the {formatKESShort(r.fee)} fee is refunded.</span>
                </label>
                <button className="btn-danger w-full" onClick={() => act('reject')} disabled={!!busy || reason.trim().length < 3}>
                  {busy === 'reject' && <Spinner className="!text-white" />} Reject
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function ReviewQueue({ onChanged }) {
  const [status, setStatus] = useState('submitted');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, loading, error, reload } = useFetch('/admin/hotel-reviews', { status, page, limit: 20 });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {Object.entries(REVIEW_STATUS_LABEL).map(([key, label]) => (
          <button key={key} onClick={() => { setStatus(key); setPage(1); }}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${status === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.reviews.length ? (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Member', 'Hotel', 'Rating', 'Distance', 'When', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-brand-100/70">
              {data.reviews.map((r) => (
                <tr key={r.reviewId}>
                  <td className="px-4 py-3 font-bold">{r.user?.username}</td>
                  <td className="px-4 py-3">{r.hotel?.name}</td>
                  <td className="px-4 py-3">{r.rating ? <Stars value={r.rating} /> : '—'}</td>
                  <td className="px-4 py-3">{r.distanceMeters != null ? `${r.distanceMeters} m` : '—'}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(r.submittedAt || r.createdAt)}{r.status === 'reserved' && <><br />expires {formatDateTime(r.expiresAt)}</>}</td>
                  <td className="px-4 py-3 text-right"><button className="font-bold text-brand-600 hover:underline" onClick={() => setOpen(r.reviewId)}>{r.status === 'submitted' ? 'Review' : 'View'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Hotel} title={status === 'submitted' ? 'Nothing waiting for approval' : 'No reviews here'} />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {open && <ReviewModal reviewId={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); onChanged(); }} />}
    </>
  );
}

function Hotels({ onChanged }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | hotel
  const { data, loading, error, reload } = useFetch('/admin/hotels', { page, limit: 20 });

  const archive = async (h) => {
    if (!window.confirm(`Archive "${h.name}"? Members can no longer see it. Reviews already in progress can still be approved or rejected.`)) return;
    try {
      await api.delete(`/admin/hotels/${h.hotelId}`);
      toast.success('Hotel archived');
      reload();
      onChanged();
    } catch (err) {
      toast.error('Could not archive', errorMessage(err));
    }
  };

  return (
    <>
      <button className="btn-primary w-fit" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add hotel</button>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.hotels.length ? (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Hotel', 'Fee / bonus', 'Slots used', 'In progress', 'Rating', 'Status', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-brand-100/70">
              {data.hotels.map((h) => (
                <tr key={h.hotelId}>
                  <td className="px-4 py-3">
                    <p className="font-bold">{h.name}</p>
                    <a className="flex items-center gap-1 text-xs text-slate-500 hover:underline" href={mapsLink(h.location)} target="_blank" rel="noreferrer"><MapPin className="h-3 w-3" /> {h.city || h.address}</a>
                  </td>
                  <td className="px-4 py-3">{formatKESShort(h.reviewFee)} / <span className="font-bold text-emerald-700">{formatKESShort(h.reviewBonus)}</span></td>
                  <td className="px-4 py-3">{h.slotsUsed} / {h.slots}<p className="text-xs text-slate-500">{h.reviewCount} approved</p></td>
                  <td className="px-4 py-3 text-xs">{h.reserved} visiting<br />{h.awaitingApproval} to check</td>
                  <td className="px-4 py-3">{h.averageRating ? <span className="flex items-center gap-1"><Stars value={h.averageRating} /> {h.averageRating}</span> : '—'}</td>
                  <td className="px-4 py-3"><StatusChip status={h.status} /></td>
                  <td className="space-x-2 px-4 py-3 text-right">
                    <button className="font-bold text-brand-600 hover:underline" onClick={() => setEditing(h)}>Edit</button>
                    {h.status !== 'archived' && <button className="font-bold text-rose-600 hover:underline" onClick={() => archive(h)}>Archive</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Hotel} title="No hotels yet" text="Add a hotel once you have an agreement with it." action={<button className="btn-primary" onClick={() => setEditing('new')}>Add hotel</button>} />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {editing && <HotelForm hotel={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); onChanged(); }} />}
    </>
  );
}

export default function AdminHotels() {
  const [tab, setTab] = useState('queue');
  const summary = useFetch('/admin/hotels/summary');
  const s = summary.data;

  return (
    <div className="space-y-5">
      <PageHeader icon={Hotel} title="Hotel Reviews" subtitle="Partner hotels, the review queue, and what you have committed to pay." />
      <ErrorNote message={summary.error} onRetry={summary.reload} />
      {s && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={`Waiting for you (${s.awaitingApproval.count})`} value={formatKESShort(s.awaitingApproval.bonuses)} tone="text-amber-600" />
          <StatTile label={`Bonuses paid (${s.approvedReviews})`} value={formatKESShort(s.bonusesPaid)} tone="text-emerald-600" />
          <StatTile label="Fees kept (after refunds)" value={formatKESShort(s.feesCollected)} />
          <StatTile label="Max still owed if all approved" value={formatKESShort(s.outstandingCommitment)} tone="text-rose-600" />
        </div>
      )}
      <div className="flex gap-2">
        {[['queue', 'Review queue'], ['hotels', 'Hotels']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${tab === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'queue' ? <ReviewQueue onChanged={summary.reload} /> : <Hotels onChanged={summary.reload} />}
    </div>
  );
}
