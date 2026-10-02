import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, ChevronRight, CreditCard, GraduationCap, History, Home, Hotel, Layers, LayoutDashboard, LogOut, Menu, MessagesSquare, Package, PackageOpen,
  Rocket, Send, Settings, ShoppingBag, Sparkles, Store, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLive } from '../../context/LiveContext';
import { useSite } from '../../context/SiteContext';
import { APP_NAME, Logo } from './ui';

const USER_NAV = [
  { group: 'Main', items: [
    { to: '/dashboard', label: 'Dashboard', icon: Home, end: true },
    { to: '/dashboard/team', label: 'Team Members', icon: Users },
    { to: '/dashboard/levels', label: 'My Levels', icon: Layers },
    { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  ] },
  { group: 'Store', items: [
    { to: '/dashboard/store', label: 'Products', icon: Store },
    { to: '/dashboard/library', label: 'My Library', icon: PackageOpen },
  ] },
  { group: 'Earn', items: [
    { to: '/dashboard/hotels', label: 'Hotel Reviews', icon: Hotel },
    { to: '/dashboard/jobs', label: 'Chat Jobs', icon: MessagesSquare },
    { to: '/dashboard/spin', label: 'Lucky Spin', icon: Sparkles },
    { to: '/dashboard/training', label: 'AI Prompt Training', icon: GraduationCap },
    { to: '/dashboard/y99', label: 'Y99 Earn Program', icon: Rocket },
  ] },
  { group: 'Finance', items: [
    { to: '/dashboard/withdraw', label: 'Withdraw', icon: Send },
    { to: '/dashboard/recharge', label: 'Recharge', icon: CreditCard },
    { to: '/dashboard/history', label: 'History', icon: History },
  ] },
  { group: 'Account', items: [{ to: '/dashboard/profile', label: 'Profile', icon: UserRound }] },
];

const ADMIN_NAV = [
  { group: 'Admin', items: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/deposits', label: 'Deposits', icon: CreditCard },
    { to: '/admin/withdrawals', label: 'Withdrawals', icon: Wallet },
    { to: '/admin/products', label: 'Products', icon: Package },
    { to: '/admin/hotels', label: 'Hotel Reviews', icon: Hotel },
    { to: '/admin/chat-jobs', label: 'Chat Jobs', icon: MessagesSquare },
    { to: '/admin/spin', label: 'Lucky Spin', icon: Sparkles },
    { to: '/admin/training', label: 'Training & Y99', icon: GraduationCap },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ] },
];

const BUSINESS_NAV = [{ group: 'Business', items: [{ to: '/business', label: 'Applicants', icon: MessagesSquare, end: true }] }];

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="hidden items-center gap-2 text-sm text-slate-600 md:flex">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      {now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

function Sidebar({ nav, onNavigate, admin }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <nav className="flex h-full flex-col overflow-y-auto px-3 pb-6 pt-4" aria-label="Main navigation">
      <div className="mb-3 px-3">
        <p className="text-lg font-extrabold text-brand-600">{APP_NAME.toUpperCase()}</p>
        <p className="text-xs text-slate-500">Earn smarter. Move faster.</p>
      </div>
      {nav.map(({ group, items }) => (
        <div key={group} className="mt-4">
          <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">{group}</p>
          <ul className="space-y-1">
            {items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      isActive ? 'bg-brand-nav text-white shadow-glow' : 'text-slate-700 hover:bg-brand-50'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`grid h-8 w-8 place-items-center rounded-xl ${isActive ? 'bg-white/25' : 'bg-brand-100 text-brand-600'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1">{label}</span>
                      {isActive && <ChevronRight className="h-4 w-4" />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button
        onClick={() => { logout(); navigate(admin ? '/admin/login' : '/login'); }}
        className="mt-6 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
      >
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-100"><LogOut className="h-4 w-4" /></span>
        Sign Out
      </button>
    </nav>
  );
}

export default function Layout({ admin = false, business = false }) {
  const { user } = useAuth();
  const site = useSite();
  const live = useLive();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const nav = admin ? ADMIN_NAV : business ? BUSINESS_NAV : USER_NAV;

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-brand-100/70 bg-white/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button className="rounded-xl p-2 text-slate-600 hover:bg-brand-50 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
          <span className="text-lg font-extrabold tracking-tight">{APP_NAME.toUpperCase()}</span>
          {admin && <span className="chip bg-brand-100 text-brand-700">Admin</span>}
          {business && <span className="chip bg-emerald-100 text-emerald-700">Business</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Clock />
          {user?.role === 'super_admin' && (
            <button className="btn-ghost !px-3 !py-2" onClick={() => navigate(admin ? '/dashboard' : '/admin')}>
              {admin ? 'Member view' : 'Admin panel'}
            </button>
          )}
          {business ? (
            // Business accounts only use the applicants inbox, so the member shortcuts are hidden
            <span className="rounded-full bg-brand-50 px-3 py-2 text-sm font-semibold ring-1 ring-brand-200">{user?.username}</span>
          ) : (
            <>
              <button onClick={() => navigate('/dashboard/store')} aria-label="Store" className="hidden h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-600 sm:grid">
                <ShoppingBag className="h-5 w-5" />
              </button>
              <button onClick={() => navigate('/dashboard/notifications')} aria-label={`Notifications (${live?.unread || 0} unread)`} className="relative grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-500">
                <Bell className="h-5 w-5" />
                {live?.unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {live.unread > 99 ? '99+' : live.unread}
                  </span>
                )}
              </button>
              <button onClick={() => navigate('/dashboard/profile')} className="flex items-center gap-2 rounded-full bg-brand-50 py-1 pl-1 pr-3 ring-1 ring-brand-200">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-sm font-bold uppercase text-white">
                  {user?.username?.[0]}
                </span>
                <span className="max-w-24 truncate text-sm font-semibold">{user?.username}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {site.comingSoon && user?.role === 'super_admin' && (
        <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
          Coming Soon mode is ON. Members see the launch page and cannot sign in. Set COMING_SOON=OFF in the backend .env to open the site.
        </div>
      )}

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 border-r border-brand-100/70 bg-white/70 lg:block">
          <Sidebar nav={nav} admin={admin} />
        </aside>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
              <button className="absolute right-3 top-3 rounded-lg p-1 text-slate-500" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
              <Sidebar nav={nav} admin={admin} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
          <footer className="mt-10 border-t border-brand-100 pt-4 text-xs text-slate-400">
            © {new Date().getFullYear()} {APP_NAME.toUpperCase()}. All rights reserved.
          </footer>
        </main>
      </div>
    </div>
  );
}
