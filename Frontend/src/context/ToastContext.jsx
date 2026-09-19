import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, bar: 'border-emerald-500', text: 'text-emerald-600' },
  error: { icon: XCircle, bar: 'border-rose-500', text: 'text-rose-600' },
  warning: { icon: TriangleAlert, bar: 'border-amber-500', text: 'text-amber-600' },
  info: { icon: Info, bar: 'border-brand-500', text: 'text-brand-600' },
};
// Server notification types -> toast styles
const TYPE_MAP = { earnings: 'success', withdrawal: 'info', system: 'info' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    ({ title, message, type = 'info', duration = 5000 }) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, title, message, type: TYPE_MAP[type] || type }]);
      if (duration) setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      success: (title, message) => push({ title, message, type: 'success' }),
      error: (title, message) => push({ title, message, type: 'error' }),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          const Icon = s.icon;
          return (
            <div key={t.id} className={`pointer-events-auto flex animate-slide-in items-start gap-3 rounded-2xl border-l-4 bg-white p-4 shadow-card ${s.bar}`}>
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.text}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{t.title}</p>
                {t.message && <p className="mt-0.5 text-sm text-slate-600">{t.message}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
