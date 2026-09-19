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

export const CATEGORY_LABELS = {
  ebook: 'eBooks',
  source_code: 'Source Code',
  template: 'Templates',
  software: 'Software',
  course: 'Courses',
  other: 'Other',
};
