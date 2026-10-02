import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Hotel, MessagesSquare, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Spinner } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

// One colour per prize, cool for small prizes through hot for the big ones
const COLORS = {
  30: '#6d28d9', 35: '#7c3aed', 45: '#4f46e5', 50: '#2563eb', 55: '#0284c7', 60: '#0891b2', 70: '#0d9488',
  80: '#059669', 90: '#65a30d', 100: '#ca8a04', 150: '#ea580c', 210: '#dc2626', 300: '#be123c',
};
const colorOf = (amount) => COLORS[amount] || '#64748b';
const ROLL_RANGE = 10000;
const SPIN_MS = 4500;

// Point on the circle at `deg` degrees clockwise from 12 o'clock
const polar = (deg, r, c = 100) => {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
};

function slicePath(from, to, r = 96) {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M100 100 L${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/** 40 equal slices drawn from the server's own list, so a prize's chance is how many slices it has. */
function Wheel({ wheel, rotation, spinning }) {
  const step = 360 / wheel.length;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm">
      <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-xl" role="img" aria-label="Prize wheel">
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '100px 100px', transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.1, 1)` : 'none' }}>
          {wheel.map((amount, i) => {
            const mid = (i + 0.5) * step;
            const [lx, ly] = polar(mid, 72);
            return (
              <g key={i}>
                <path d={slicePath(i * step, (i + 1) * step)} fill={colorOf(amount)} stroke="#fff" strokeWidth="0.6" />
                {/* Reads outward from the centre */}
                <text x={lx} y={ly} fill="#fff" fontSize="6.5" fontWeight="800" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${mid - 90} ${lx} ${ly})`}>
                  {amount}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx="100" cy="100" r="16" fill="#fff" stroke="#ede9fe" strokeWidth="2" />
        <text x="100" y="101" fontSize="7" fontWeight="800" textAnchor="middle" dominantBaseline="middle" fill="#6d28d9">KSH</text>
      </svg>
      {/* Pointer at 12 o'clock */}
      <div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 -translate-y-1 border-x-[12px] border-t-[22px] border-x-transparent border-t-ink drop-shadow" aria-hidden="true" />
    </div>
  );
}

export default function SpinPage() {
  const { refreshUser } = useAuth();
  const { data, loading, error, reload } = useFetch('/spin');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [spinError, setSpinError] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const spin = async () => {
    setSpinError('');
    setSpinning(true);
    try {
      const res = await api.post('/spin');
      const won = res.data.data;
      // Stop exactly where the server's roll lands, so the wheel shows the real draw
      const landing = ((won.roll + 0.5) / ROLL_RANGE) * 360;
      setRotation((r) => {
        const base = r - (r % 360) + 360 * (reduceMotion ? 1 : 6);
        return base + (360 - landing);
      });
      timer.current = setTimeout(() => {
        setSpinning(false);
        setResult(won);
        reload();
        refreshUser().catch(() => {});
      }, reduceMotion ? 300 : SPIN_MS + 200);
    } catch (err) {
      setSpinning(false);
      setSpinError(errorMessage(err));
      reload();
    }
  };

  if (loading) return <PageLoader />;
  if (!data) return <ErrorNote message={error} onRetry={reload} />;

  const canSpin = data.spinsLeft > 0 && data.prizesAvailable && !spinning;

  return (
    <div className="space-y-5">
      <PageHeader icon={Sparkles} title="Lucky Spin" subtitle={`${data.spinsPerDay} free spins every day. Every spin wins bonus credit.`} />

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="card space-y-5 p-6 lg:col-span-3">
          <Wheel wheel={data.wheel} rotation={rotation} spinning={spinning} />
          <div className="flex items-center justify-center gap-2" aria-label={`${data.spinsLeft} of ${data.spinsPerDay} spins left today`}>
            {Array.from({ length: data.spinsPerDay }, (_, i) => (
              <span key={i} className={`h-3 w-3 rounded-full ${i < data.spinsLeft ? 'bg-brand-600' : 'bg-slate-200'}`} />
            ))}
            <span className="ml-2 text-sm font-semibold text-slate-600">{data.spinsLeft} of {data.spinsPerDay} left today</span>
          </div>
          <ErrorNote message={spinError} />
          <button className="btn-primary w-full !py-4 text-lg" onClick={spin} disabled={!canSpin}>
            {spinning ? <><Spinner className="!text-white" /> Spinning…</> : data.spinsLeft === 0 ? 'Come back after midnight' : !data.prizesAvailable ? "Today's prizes are all given out" : 'Spin for free'}
          </button>
        </section>

        <div className="space-y-5 lg:col-span-2">
          <section className="card p-5">
            <p className="label">Your bonus credit</p>
            <p className="text-3xl font-extrabold text-brand-600">{formatKESShort(data.bonusBalance)}</p>
            <p className="mt-1 text-sm text-slate-500">Spend it on hotel review fees and chat job unlocks. It's used before your main wallet. It can't be withdrawn and never expires.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/dashboard/hotels" className="btn-ghost !py-2"><Hotel className="h-4 w-4" /> Hotel reviews</Link>
              <Link to="/dashboard/jobs" className="btn-ghost !py-2"><MessagesSquare className="h-4 w-4" /> Chat jobs</Link>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-extrabold"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Fair odds</h2>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="py-1">Prize</th><th>Slices</th><th className="text-right">Chance</th></tr></thead>
              <tbody>
                {data.odds.map((o) => (
                  <tr key={o.amount} className="border-t border-brand-100/70">
                    <td className="py-1.5 font-bold"><span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: colorOf(o.amount) }} />{formatKESShort(o.amount)}</td>
                    <td>{o.slices} of {data.wheel.length}</td>
                    <td className="text-right">{(o.chance * 100).toFixed(1).replace(/\.0$/, '')}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">
              The wheel has {data.wheel.length} equal slices. The server draws a random number from 0 to 9,999; every {data.rollsPerSlice} numbers is one slice,
              counted clockwise from the top. Average prize: {formatKESShort(data.averagePrize)}. Each spin's number and slice are in your history below.
            </p>
          </section>
        </div>
      </div>

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-5 font-extrabold">Your spins</h2>
        {data.history.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.history.map((s) => (
              <li key={s.spinId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>{formatDateTime(s.createdAt)} · spin {s.number} · <span className="font-mono text-xs text-slate-500">roll {s.roll} → slice {s.slice}</span></span>
                <span className="font-extrabold text-emerald-600">+{formatKESShort(s.prize)}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={Gift} title="No spins yet" text="Your first free spin is waiting." />}
      </section>

      {result && (
        <Modal title="You won!" onClose={() => setResult(null)}>
          <div className="text-center">
            <Gift className="mx-auto h-12 w-12 text-brand-600" />
            <p className="mt-3 text-4xl font-extrabold text-brand-600">{formatKESShort(result.prize)}</p>
            <p className="mt-2 text-sm text-slate-600">Added to your bonus credit (now {formatKESShort(result.bonusBalance)}). {result.spinsLeft > 0 ? `${result.spinsLeft} spin${result.spinsLeft === 1 ? '' : 's'} left today.` : 'That was your last spin today.'}</p>
            <button className="btn-primary mt-5 w-full" onClick={() => setResult(null)}>Great!</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
