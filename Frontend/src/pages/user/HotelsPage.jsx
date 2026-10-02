import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hotel, MapPin, Search, ShieldCheck } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { EmptyState, ErrorNote, PageHeader, PageLoader, Pagination, Stars, StatusChip } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

export const REVIEW_STATUS_LABEL = {
  reserved: 'Visit pending',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
};

function HotelCard({ h }) {
  const mine = h.myReview && ['reserved', 'submitted', 'approved'].includes(h.myReview.status) ? h.myReview : null;
  return (
    <Link to={`/dashboard/hotels/${h.hotelId}`} className="card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-glow">
      <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-100 to-indigo-100">
        {h.image ? <img src={h.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Hotel className="absolute inset-0 m-auto h-10 w-10 text-brand-500/60" />}
        {mine && <span className="absolute left-3 top-3"><StatusChip status={mine.status} label={REVIEW_STATUS_LABEL[mine.status]} /></span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 font-bold">{h.name}</h3>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> {[h.address, h.city].filter(Boolean).join(', ')}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <Stars value={h.averageRating || 0} />
          {h.reviewCount ? `${h.averageRating} · ${h.reviewCount} review${h.reviewCount === 1 ? '' : 's'}` : 'No reviews yet'}
        </div>
        <dl className="mt-auto grid grid-cols-3 gap-2 pt-4 text-center text-xs">
          <div className="rounded-xl bg-brand-50 p-2"><dt className="text-slate-500">Fee</dt><dd className="font-extrabold">{formatKESShort(h.reviewFee)}</dd></div>
          <div className="rounded-xl bg-emerald-50 p-2"><dt className="text-slate-500">Bonus</dt><dd className="font-extrabold text-emerald-700">{formatKESShort(h.reviewBonus)}</dd></div>
          <div className="rounded-xl bg-slate-50 p-2"><dt className="text-slate-500">Slots left</dt><dd className="font-extrabold">{h.slotsLeft}</dd></div>
        </dl>
      </div>
    </Link>
  );
}

function Browse() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/hotels', { page, limit: 12, search: query || undefined });

  return (
    <>
      <section className="card flex gap-3 p-4 text-sm text-slate-600">
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
        <p>
          Pay the review fee to reserve a slot, then visit the hotel within <b>{data?.reservationHours ?? 48} hours</b>. Submit your rating and a photo
          <b> while you are at the hotel</b> (within {data?.radiusMeters ?? 200} m). Once the admin approves it, the bonus goes to your withdrawable wallet.
          If you don't submit in time, or the admin rejects your review for a reason other than fraud, the fee is refunded.
        </p>
      </section>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="field pl-11" placeholder="Search by hotel, town or street…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary" aria-label="Search"><Search className="h-5 w-5" /></button>
      </form>

      <ErrorNote message={error} onRetry={reload} />
      {loading ? <PageLoader /> : data?.hotels?.length ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.hotels.map((h) => <HotelCard key={h.hotelId} h={h} />)}
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      ) : (
        <div className="card"><EmptyState icon={Hotel} title="No hotels open for review" text="New partner hotels are added by the admin. Check back soon." /></div>
      )}
    </>
  );
}

function MyReviews() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/hotels/my-reviews', { page, limit: 10 });
  if (loading) return <PageLoader />;
  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card p-5">
        <p className="label">Earned from hotel reviews</p>
        <p className="text-3xl font-extrabold text-emerald-600">{formatKESShort(data?.totalEarned)}</p>
      </section>
      <section className="card overflow-hidden">
        {data?.reviews?.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.reviews.map((r) => (
              <li key={r.reviewId}>
                <Link to={`/dashboard/hotels/${r.hotel?.hotelId}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-brand-50/50">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{r.hotel?.name}</p>
                    <p className="text-xs text-slate-500">
                      {r.status === 'reserved' ? `Submit before ${formatDateTime(r.expiresAt)}` : r.submittedAt ? `Submitted ${formatDateTime(r.submittedAt)}` : `Reserved, ${formatKESShort(r.fee)} fee`}
                      {r.rejectionReason && ` · ${r.rejectionReason}`}
                      {r.feeRefunded && ' · fee refunded'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.status === 'approved' && <span className="font-extrabold text-emerald-600">+{formatKESShort(r.bonus)}</span>}
                    <StatusChip status={r.status} label={REVIEW_STATUS_LABEL[r.status]} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={Hotel} title="No reviews yet" text="Pick a hotel to start your first review." />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
    </>
  );
}

export default function HotelsPage() {
  const [tab, setTab] = useState('browse');
  return (
    <div className="space-y-5">
      <PageHeader icon={Hotel} title="Hotel Reviews" subtitle="Visit partner hotels, review them on site, and earn a bonus." />
      <div className="flex gap-2">
        {[['browse', 'Hotels'], ['mine', 'My reviews']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${tab === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'browse' ? <Browse /> : <MyReviews />}
    </div>
  );
}
