export const formatKES = (n = 0) =>
  `Ksh ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatKESShort = (n = 0) => `Ksh ${Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const greeting = (date = new Date()) => {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// In-person programmes that share the training system (sessions, tickets, attendance, certificates)
export const PROGRAMS = {
  ai_prompt: {
    label: 'AI Prompt Training',
    path: '/dashboard/training',
    subtitle: 'In-person classes on writing prompts for AI. Book a seat, attend, and earn a certificate.',
    defaultTitle: 'Prompt Writing for AI',
  },
  y99: {
    label: 'Y99 Earn Program',
    path: '/dashboard/y99',
    subtitle: 'In-person sessions on practical skills you can earn from, as a day job or a side hustle.',
    defaultTitle: 'Y99 Earn Program',
  },
};

export const CATEGORY_LABELS = {
  ebook: 'eBooks',
  source_code: 'Source Code',
  template: 'Templates',
  software: 'Software',
  course: 'Courses',
  other: 'Other',
};
