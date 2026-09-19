import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PackageOpen, Search, ShoppingBag, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { EmptyState, ErrorNote, Modal, PageLoader, Pagination, Spinner } from '../../components/Shared/ui';
import { CATEGORY_LABELS, formatKESShort } from '../../utils/format';

function ProductCard({ p, onBuy }) {
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-100 to-indigo-100">
        {p.image ? <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ShoppingBag className="absolute inset-0 m-auto h-10 w-10 text-brand-500/60" />}
        {p.sold >= 10 && <span className="chip absolute left-3 top-3 bg-amber-400 text-amber-950">Hot</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span className="chip w-fit bg-brand-700 text-white">{CATEGORY_LABELS[p.category]}</span>
        <h3 className="mt-2 line-clamp-2 font-bold">{p.name}</h3>
        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xl font-extrabold">{formatKESShort(p.price)}</p>
              {p.discount > 0 && <p className="text-xs text-slate-400 line-through">{formatKESShort(p.originalPrice)}</p>}
            </div>
            {p.discount > 0 && <span className="chip bg-amber-100 text-amber-700">-{p.discount}%</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{p.sold} sold</p>
          {p.owned ? (
            <Link to="/dashboard/library" className="btn-ghost mt-3 w-full"><PackageOpen className="h-4 w-4" /> In your library</Link>
          ) : p.inStock ? (
            <button className="btn-primary mt-3 w-full" onClick={() => onBuy(p)}><Zap className="h-4 w-4" /> Access Now</button>
          ) : (
            <button className="btn-ghost mt-3 w-full" disabled>Sold out</button>
          )}
        </div>
      </div>
    </article>
  );
}

function BuyModal({ product, balance, onClose, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const short = balance < product.price;

  const buy = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/products/${product.productId}/purchase`);
      toast.success('Purchase successful', `"${product.name}" is now in your library.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Confirm purchase" onClose={onClose}>
      <p className="font-bold">{product.name}</p>
      <p className="mt-1 line-clamp-3 text-sm text-slate-600">{product.description}</p>
      <dl className="mt-4 space-y-2 rounded-2xl bg-brand-50 p-4 text-sm">
        <div className="flex justify-between"><dt>Price</dt><dd className="font-bold">{formatKESShort(product.price)}</dd></div>
        <div className="flex justify-between"><dt>Main wallet balance</dt><dd className={`font-bold ${short ? 'text-rose-600' : ''}`}>{formatKESShort(balance)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Digital products are delivered instantly and are non-refundable.</p>
      <div className="mt-3"><ErrorNote message={error} /></div>
      <div className="mt-4 flex gap-3">
        {short ? (
          <button className="btn-primary flex-1" onClick={() => navigate('/dashboard/recharge')}>Add money first</button>
        ) : (
          <button className="btn-primary flex-1" onClick={buy} disabled={busy}>{busy && <Spinner className="!text-white" />} Pay {formatKESShort(product.price)}</button>
        )}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

export default function StorePage() {
  const { user, refreshUser } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [buying, setBuying] = useState(null);
  const { data, loading, error, reload } = useFetch('/products', { page, limit: 12, sort, category: category || undefined, search: query || undefined });

  const counts = data?.categories || {};
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-end justify-between gap-4 p-6">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-brand-600">Digital store</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight">Buy once,<br />access instantly.</h1>
          <p className="mt-2 text-sm text-slate-500">Premium products. Earn commissions every time someone in your network buys.</p>
        </div>
        <Link to="/dashboard/library" className="btn-ghost"><PackageOpen className="h-4 w-4" /> My Library</Link>
      </section>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="field pl-11" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="field !w-auto" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort products">
          <option value="newest">Newest</option><option value="popular">Most popular</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
        </select>
        <button className="btn-primary" aria-label="Search"><Search className="h-5 w-5" /></button>
      </form>

      <div className="flex flex-wrap gap-2">
        {[['', 'All', totalAll], ...Object.entries(CATEGORY_LABELS).map(([k, v]) => [k, v, counts[k] || 0])].map(([key, label, n]) => (
          <button key={key} onClick={() => { setCategory(key); setPage(1); }}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${category === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label} <span className="ml-1 text-xs opacity-70">{n}</span>
          </button>
        ))}
      </div>

      <ErrorNote message={error} onRetry={reload} />
      {loading ? <PageLoader /> : data?.products?.length ? (
        <>
          <p className="text-sm text-slate-500">{data.total} product{data.total === 1 ? '' : 's'}</p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.products.map((p) => <ProductCard key={p.productId} p={p} onBuy={setBuying} />)}
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      ) : (
        <div className="card"><EmptyState icon={ShoppingBag} title="No products found" text="Try another category or search term." /></div>
      )}

      {buying && (
        <BuyModal product={buying} balance={user.mainWallet.balance} onClose={() => setBuying(null)}
          onDone={() => { setBuying(null); reload(); refreshUser().catch(() => {}); }} />
      )}
    </div>
  );
}
