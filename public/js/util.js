// Petits outils partagés : dates, échappement HTML, formats.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');

/** Date locale -> 'AAAA-MM-JJ' */
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'AAAA-MM-JJ' -> Date locale (minuit) */
export const parseIso = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayIso = () => iso(new Date());
export const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);

/** Lundi de la semaine qui contient la date */
export const mondayOf = (s) => { const d = parseIso(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };

/** Horodatage (UTC) -> date locale 'AAAA-MM-JJ' */
export const localDay = (ts) => iso(new Date(ts));

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const longDate = (s) => cap(parseIso(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
export const shortDate = (s) => parseIso(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const dow = (s) => cap(parseIso(s).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''));
export const dayNum = (s) => String(parseIso(s).getDate());

/** « aujourd'hui », « demain », « hier », sinon la date courte */
export const relDay = (s) => {
  const n = daysBetween(todayIso(), s);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  if (n === -1) return 'Hier';
  return longDate(s);
};

export const fmtNum = (n) => Number(n || 0).toLocaleString('fr-FR');
export const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Lien YouTube -> lien d'intégration sans cookies, sinon null */
export const youtubeEmbed = (url) => {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1&playsinline=1` : null;
};

export const safeUrl = (u) => {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  return u;
};

export const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* rien */ } },
};

export const icon = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
};
