import { Loader2, Inbox, Star } from 'lucide-react';

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Globechart';

export function Logo({ size = 'md' }) {
  const box = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  return (
    <span className={`grid ${box} place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-glow`}>
      <span className="h-3.5 w-3.5 rounded-full bg-white/95" />
    </span>
  );
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin text-brand-600 ${className}`} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink sm:text-3xl">
          {Icon && <Icon className="h-7 w-7 text-brand-600" />}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-500">
        <Icon className="h-8 w-8" />
      </span>
      <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-bold underline">
          Retry
        </button>
      )}
    </div>
  );
}

const GRADIENTS = {
  green: 'from-emerald-500 to-green-700',
  purple: 'from-fuchsia-600 to-purple-800',
  pink: 'from-rose-500 to-pink-600',
  violet: 'from-violet-500 to-purple-700',
  blue: 'from-sky-500 to-indigo-600',
};

export function GradientStat({ label, value, hint, icon: Icon, tone = 'purple' }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${GRADIENTS[tone]} p-5 text-white shadow-card`}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/85">{label}</p>
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-6 text-2xl font-extrabold sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-sm text-white/80">{hint}</p>}
    </div>
  );
}

export function StatTile({ label, value, tone = 'text-ink' }) {
  return (
    <div className="card p-4 text-center">
      <p className={`text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

const CHIP_TONES = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-rose-100 text-rose-700',
  gray: 'bg-slate-100 text-slate-600',
  purple: 'bg-brand-100 text-brand-700',
};
const STATUS_TONE = {
  active: 'green', completed: 'green', approved: 'green',
  pending: 'amber', inactive: 'gray', reserved: 'purple', submitted: 'amber', paused: 'amber', expired: 'gray', archived: 'gray',
  suspended: 'red', banned: 'red', failed: 'red', rejected: 'red', cancelled: 'gray',
};

export function StatusChip({ status, label }) {
  return <span className={`chip ${CHIP_TONES[STATUS_TONE[status] || 'gray']}`}>{label || status}</span>;
}

/** Read-only star rating, or a picker when `onChange` is given. */
export function Stars({ value = 0, onChange, size = 'h-4 w-4' }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? 'Rating' : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={`${size} ${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />;
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="p-0.5">
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        );
      })}
    </span>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-4 text-sm">
      <button className="btn-ghost !px-4 !py-2" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span className="text-slate-500">
        Page {page} of {totalPages}
      </span>
      <button className="btn-ghost !px-4 !py-2" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
