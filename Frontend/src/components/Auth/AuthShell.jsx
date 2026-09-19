import { APP_NAME, Logo } from '../Shared/ui';

export default function AuthShell({ subtitle, heading, children, footer }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#eef2f7] to-[#f3e9fb] px-4 py-8">
      <div className="w-full max-w-[460px] rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-brand-100/60 sm:p-7">
        <div className="flex items-center gap-4 rounded-3xl bg-brand-header p-5 text-white shadow-glow">
          <Logo size="lg" />
          <div>
            <p className="text-xl font-extrabold tracking-wide">{APP_NAME.toUpperCase()}</p>
            <p className="text-sm font-semibold text-white/85">{subtitle}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <h2 className="text-xs font-extrabold uppercase tracking-[0.25em] text-brand-600">{heading}</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-brand-200 to-transparent" />
        </div>
        <div className="mt-4">{children}</div>
        <div className="mt-6 border-t border-brand-100 pt-4 text-center text-sm text-slate-600">{footer}</div>
        <p className="mt-3 text-center text-[11px] text-slate-400">© {new Date().getFullYear()} {APP_NAME.toUpperCase()}. All rights reserved.</p>
      </div>
    </div>
  );
}
