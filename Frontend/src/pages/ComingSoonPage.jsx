import { useEffect, useState } from 'react';
import { GraduationCap, Hotel, MessagesSquare, Rocket, Sparkles, Store } from 'lucide-react';
import { APP_NAME, Logo } from '../components/Shared/ui';

const FEATURES = [
  { icon: Hotel, title: 'Hotel Reviews', text: 'Visit partner hotels, review them on site, and earn a bonus for every approved review.' },
  { icon: MessagesSquare, title: 'Chat Jobs', text: 'Chat directly with businesses hiring customer support agents, and get hired.' },
  { icon: Sparkles, title: 'Lucky Spin', text: '3 free spins every day. Every spin wins credit you can use on Globechart.' },
  { icon: GraduationCap, title: 'AI Prompt Training', text: 'In-person classes on writing prompts for AI, with a certificate employers can verify.' },
  { icon: Rocket, title: 'Y99 Earn Program', text: 'Practical skills you can earn from, as a day job or a side hustle.' },
  { icon: Store, title: 'Digital Store', text: 'eBooks, templates and courses, plus commissions when friends you invite buy.' },
];

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const ms = Math.max(new Date(target).getTime() - now, 0);
  return {
    done: ms === 0,
    parts: [
      ['Days', Math.floor(ms / 86400000)],
      ['Hours', Math.floor((ms % 86400000) / 3600000)],
      ['Minutes', Math.floor((ms % 3600000) / 60000)],
      ['Seconds', Math.floor((ms % 60000) / 1000)],
    ],
  };
}

export default function ComingSoonPage({ launchDate }) {
  const countdown = useCountdown(launchDate);
  const launchText = launchDate
    ? new Date(launchDate).toLocaleString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-header text-white">
      {/* Soft background glows */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-fuchsia-400/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-indigo-500/40 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6">
        <header className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight">{APP_NAME.toUpperCase()}</span>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-extrabold uppercase tracking-[0.25em] ring-1 ring-white/25">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Launching soon
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
            Something big is coming to {APP_NAME}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
            We're putting the final touches on new ways to learn, work and earn. The doors open very soon.
          </p>

          {countdown && !countdown.done && (
            <div className="mt-10" aria-label={`Launching ${launchText}`}>
              <div className="grid grid-cols-4 gap-2 sm:gap-4">
                {countdown.parts.map(([label, value]) => (
                  <div key={label} className="min-w-16 rounded-2xl bg-white/15 px-2 py-3 ring-1 ring-white/25 backdrop-blur sm:min-w-24 sm:px-4 sm:py-4">
                    <p className="text-3xl font-extrabold tabular-nums sm:text-5xl">{String(value).padStart(2, '0')}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/75 sm:text-xs">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-white/80">{launchText}</p>
            </div>
          )}
          {countdown?.done && <p className="mt-10 text-lg font-bold">Launching any moment now. Refresh this page shortly!</p>}

          <section className="mt-14 w-full" aria-labelledby="whats-coming">
            <h2 id="whats-coming" className="text-xs font-extrabold uppercase tracking-[0.3em] text-white/80">What's coming</h2>
            <ul className="mt-5 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-brand-600 shadow-glow">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-extrabold">{title}</h3>
                  <p className="mt-1 text-sm text-white/80">{text}</p>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <footer className="border-t border-white/20 pt-5 text-center text-xs text-white/70">
          © {new Date().getFullYear()} {APP_NAME.toUpperCase()}. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
