// DC Perform : application joueur + espace coach.
import {
  esc, todayIso, addDays, daysBetween, mondayOf, localDay, longDate, shortDate, dow, dayNum, relDay,
  fmtNum, plural, youtubeEmbed, safeUrl, store, icon,
} from './util.js';

const params = new URLSearchParams(location.search);
let api;
try {
  api = params.has('demo') ? await import('./mock.js') : await import('./api.js');
} catch (e) {
  console.error(e);
  document.getElementById('app').innerHTML = '<div class="auth"><img src="/logo.png" alt="DC Perform" class="auth-logo"><div class="card"><h1>Pas de connexion</h1><p>Vérifie ta connexion internet, puis recharge la page.</p><button class="btn primary big" onclick="location.reload()">Recharger</button></div></div>';
  throw e;
}

const LOGO = '/logo.png';
const ZONES = ['Cheville', 'Mollet', 'Genou', 'Quadriceps', 'Ischios', 'Adducteurs', 'Hanche', 'Bas du dos', 'Épaule', 'Poignet'];
const RPE_WORDS = ['Très facile', 'Facile', 'Modéré', 'Un peu dur', 'Dur', 'Dur', 'Très dur', 'Très dur', 'Extrême', 'Maximal'];
const FORM_WORDS = ['Pas en forme', 'Moyen', 'Correct', 'Bonne forme', 'Au top'];
const CATS = ['Mobilité', 'Activation et isométrie', 'Force bas du corps', 'Force haut du corps', 'Puissance et pliométrie', 'Vitesse et appuis', 'Gainage', 'Conditioning et Hyrox'];

const S = {
  profile: null,
  ex: new Map(), exList: [],
  p: null,          // données joueur
  c: null,          // données coach
  flow: store.get('dc-flow'),
  ui: {},           // état d'écran éphémère
};
const $app = document.getElementById('app');

// ---------------------------------------------------------------- outils d'interface
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3200);
}
function errMsg(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton e-mail : clique sur le lien reçu dans ta boîte mail.";
  if (/already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Pas de connexion internet. Réessaie dans un instant.';
  return 'Une erreur est survenue : ' + m;
}
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
const route = () => (location.hash.slice(1) || '/').split('?')[0];
const top = () => { try { window.scrollTo(0, 0); } catch { /* rien */ } };
const exOf = (name) => S.ex.get(String(name || '').toLowerCase());

function seg(options, value, action) {
  return `<div class="seg">${options.map(([v, l]) => `<button type="button" class="${v === value ? 'on' : ''}" data-a="${action}" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join('')}</div>`;
}
function scale(n, value, action, from = 1, extra = '') {
  let h = `<div class="scale ${extra}">`;
  for (let i = from; i < from + n; i++) h += `<button type="button" class="${i === value ? 'on' : ''}" data-a="${action}" data-v="${i}" aria-pressed="${i === value}">${i}</button>`;
  return h + '</div>';
}
const pill = (txt, kind = '') => `<span class="pill ${kind}">${esc(txt)}</span>`;
const chips = (arr) => (arr || []).length ? `<div class="chips">${arr.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : '';

// ---------------------------------------------------------------- démarrage
async function boot() {
  api.onAuth(async (event) => {
    if (event === 'PASSWORD_RECOVERY') { S.ui.recovery = true; location.hash = '#/nouveau-mdp'; }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') { await loadProfile(); render(); }
  });
  await loadProfile();
  window.addEventListener('hashchange', () => { render(); top(); });
  render();
}
async function loadProfile() {
  try { S.profile = await api.me(); } catch (e) { S.profile = null; console.error(e); }
  S.p = null; S.c = null;
  if (S.profile && S.profile.role !== 'pending') {
    try { S.exList = await api.exercises(); S.ex = new Map(S.exList.map((e) => [e.name.toLowerCase(), e])); } catch (e) { console.error(e); }
  }
}

async function render() {
  const r = route();
  try {
    if (r === '/nouveau-mdp' && (S.ui.recovery || S.profile)) return paint(vNewPassword());
    if (!S.profile) {
      if (r === '/inscription') return paint(vSignup());
      if (r === '/mdp-oublie') return paint(vForgot());
      return paint(vLogin());
    }
    if (S.profile.role === 'pending') return paint(vPending());
    if (S.profile.role === 'coach') return paint(await coachRoute(r), 'coach');
    return paint(await playerRoute(r), 'player');
  } catch (e) {
    console.error(e);
    paint(`<div class="page"><div class="card"><h2>Oups</h2><p>${esc(errMsg(e))}</p><button class="btn" data-a="reload">Réessayer</button></div></div>`);
  }
}
function paint(html, mode = 'auth') {
  document.body.dataset.mode = mode;
  $app.innerHTML = html;
  const f = $app.querySelector('[autofocus]'); if (f) f.focus();
}

// ---------------------------------------------------------------- connexion
const authShell = (inner) => `<div class="auth"><img src="${LOGO}" alt="DC Perform" class="auth-logo">${inner}</div>`;
function vLogin() {
  return authShell(`<form class="card" data-form="login">
    <h1>Connexion</h1>
    <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required autofocus></label>
    <label class="field"><span>Mot de passe</span><input name="password" type="password" autocomplete="current-password" required></label>
    <p class="err" data-err></p>
    <button class="btn primary big" type="submit">Se connecter</button>
    <div class="auth-links"><a href="#/inscription">Créer mon compte</a><a href="#/mdp-oublie">Mot de passe oublié</a></div>
  </form>`);
}
function vSignup() {
  return authShell(`<form class="card" data-form="signup">
    <h1>Créer mon compte</h1>
    <p class="muted">Utilise l'e-mail que tu as donné à ton coach.</p>
    <label class="field"><span>Prénom et nom</span><input name="name" autocomplete="name" required autofocus></label>
    <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
    <label class="field"><span>Mot de passe (6 caractères minimum)</span><input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
    <p class="err" data-err></p>
    <button class="btn primary big" type="submit">Créer mon compte</button>
    <div class="auth-links"><a href="#/">J'ai déjà un compte</a></div>
  </form>`);
}
function vForgot() {
  return authShell(`<form class="card" data-form="forgot">
    <h1>Mot de passe oublié</h1>
    <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required autofocus></label>
    <p class="err" data-err></p>
    <button class="btn primary big" type="submit">Recevoir un lien</button>
    <div class="auth-links"><a href="#/">Retour à la connexion</a></div>
  </form>`);
}
function vNewPassword() {
  return authShell(`<form class="card" data-form="newpass">
    <h1>Nouveau mot de passe</h1>
    <label class="field"><span>Nouveau mot de passe</span><input name="password" type="password" autocomplete="new-password" minlength="6" required autofocus></label>
    <p class="err" data-err></p>
    <button class="btn primary big" type="submit">Enregistrer</button>
  </form>`);
}
function vPending() {
  return authShell(`<div class="card">
    <h1>Compte créé</h1>
    <p>Ton compte <b>${esc(S.profile.email)}</b> est bien créé. Ton coach doit maintenant t'ajouter à DC Perform. Dès que c'est fait, recharge cette page.</p>
    <button class="btn primary big" data-a="reload">Recharger</button>
    <button class="btn ghost" data-a="logout">Se déconnecter</button>
  </div>`);
}

// ================================================================ JOUEUR
async function loadPlayer(force = false) {
  if (S.p && !force) return S.p;
  const uid = S.profile.id;
  const [sessions, cycles, feedbacks] = await Promise.all([api.mySessions(uid), api.myCycles(uid), api.myFeedbacks(uid)]);
  sessions.sort((a, b) => a.planned_date.localeCompare(b.planned_date) || String(a.code).localeCompare(String(b.code)));
  S.p = { sessions, cycles, feedbacks };
  return S.p;
}
function activeCycle(cycles, t = todayIso()) {
  const live = cycles.find((c) => c.start_date <= t && t < addDays(c.start_date, (c.weeks || 4) * 7));
  if (live) return live;
  const upcoming = cycles.filter((c) => c.start_date > t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  return upcoming || [...cycles].sort((a, b) => b.start_date.localeCompare(a.start_date))[0] || null;
}
const cycleWeek = (c, t = todayIso()) => Math.min(c.weeks || 4, Math.max(1, Math.floor(daysBetween(c.start_date, t) / 7) + 1));
const contentOf = (s) => (s.version === 'maison' && Array.isArray(s.content_home) && s.content_home.length ? s.content_home : s.content_gym) || [];
const minutesOf = (s) => (s.version === 'maison' ? s.minutes_home || s.minutes_gym : s.minutes_gym) || null;
const gearOf = (s) => (s.version === 'maison' && s.content_home ? s.gear_home : s.gear_gym) || [];

async function playerRoute(r) {
  const p = await loadPlayer();
  const parts = r.split('/').filter(Boolean);
  if (parts[0] === 'programme') return playerShell(vProgramme(p), 'programme');
  if (parts[0] === 'progres') return playerShell(vProgress(p), 'progres');
  if (parts[0] === 'profil') return playerShell(vProfile(), 'profil');
  if (parts[0] === 'bilan') return playerShell(await vWeekly(), '');
  if (parts[0] === 'seance' && parts[1]) return playerShell(vSessionPreview(p, parts[1]), 'programme');
  if (parts[0] === 'go' && parts[1]) return vFlow(p, parts[1]);
  return playerShell(await vToday(p), 'today');
}
function playerShell(inner, tab) {
  const t = (id, href, ic, label) => `<a href="${href}" class="${tab === id ? 'on' : ''}">${ic}<span>${label}</span></a>`;
  return `<div class="pwrap">${inner}</div>
  <nav class="tabbar" aria-label="Navigation">${t('today', '#/', icon.home, "Aujourd'hui")}${t('programme', '#/programme', icon.cal, 'Programme')}${t('progres', '#/progres', icon.chart, 'Progrès')}${t('profil', '#/profil', icon.user, 'Profil')}</nav>
  ${api.demo ? '<div class="demo-flag">Mode démo · rien n\'est enregistré</div>' : ''}`;
}
function sessionCard(s, label) {
  const hasHome = Array.isArray(s.content_home) && s.content_home.length > 0;
  const blocks = contentOf(s);
  return `<section class="card hero-card">
    <div class="row-between"><span class="tag">${esc(label)}</span><span class="muted sm">${minutesOf(s) ? minutesOf(s) + ' min · ' : ''}${s.version === 'maison' ? 'Maison' : 'Salle'}</span></div>
    <div><div class="h-display green">${esc(s.title)}</div>${s.focus ? `<div class="strong">${esc(s.focus)}</div>` : ''}</div>
    ${hasHome ? seg([['salle', 'En salle'], ['maison', 'À la maison']], s.version, 'version" data-id="' + s.id) : ''}
    <div class="blocklist">${blocks.map((b) => `<div class="bl-row"><span>${esc(b.name)}</span><span class="muted">${b.minutes ? b.minutes + "'" : ''}</span></div>`).join('')}</div>
    ${gearOf(s).length ? `<div class="label">Matériel</div>${chips(gearOf(s))}` : ''}
    <a class="btn primary big" href="#/go/${s.id}">Commencer ${icon.arrow}</a>
    <a class="link-sm" href="#/seance/${s.id}">Voir le détail de la séance</a>
  </section>`;
}
async function vToday(p) {
  const t = todayIso();
  const prof = S.profile;
  const first = (prof.full_name || '').split(' ')[0];
  const cyc = activeCycle(p.cycles);
  const planned = p.sessions.filter((s) => s.status === 'planned');
  const overdue = planned.filter((s) => s.planned_date < t && s.planned_date >= addDays(t, -7));
  const next = planned.find((s) => s.planned_date >= t);
  let h = `<header class="phead"><div class="row-between"><img src="${LOGO}" alt="DC Perform" class="logo-sm"></div>
    <div><div class="eyebrow light">${esc(longDate(t))}</div><div class="h-display">Salut ${esc(first || 'champion')}</div></div>`;
  if (cyc) {
    const w = cycleWeek(cyc);
    h += `<a class="cycle-bar" href="#/programme"><div class="grow"><div class="row-between sm"><b>${esc(cyc.name)}</b><span>Semaine ${w} / ${cyc.weeks}</span></div>
      <div class="bars">${Array.from({ length: cyc.weeks }, (_, i) => `<span class="${i + 1 < w ? 'done' : i + 1 === w ? 'now' : ''}"></span>`).join('')}</div></div></a>`;
  }
  h += '</header><div class="pbody">';

  // Relance : séance prévue non faite
  for (const s of overdue.slice(0, 1)) {
    h += `<section class="card warn-card"><b>Tu as fait ta séance de ${esc(longDate(s.planned_date).toLowerCase())} ?</b><span class="muted sm">${esc(s.title)}</span>
      <div class="btn-col"><a class="btn" href="#/go/${s.id}?retour">Oui, je donne mon retour</a><a class="btn" href="#/go/${s.id}">Je la fais aujourd'hui</a><button class="btn ghost" data-a="skip" data-id="${s.id}">Pas cette semaine</button></div></section>`;
  }
  // Bilan du dimanche
  const wd = new Date().getDay();
  if (wd === 0 || wd === 1) {
    const ws = wd === 0 ? mondayOf(t) : addDays(mondayOf(t), -7);
    let rep = null; try { rep = await api.myWeekly(prof.id, ws); } catch { /* rien */ }
    if (!rep) h += `<a class="card info-card" href="#/bilan"><b>Bilan de la semaine · 10 s</b><span class="sm">Tes entraînements basket et tes minutes de match.</span></a>`;
  }
  if (next) h += sessionCard(next, next.planned_date === t ? 'Séance du jour' : 'Prochaine séance · ' + relDay(next.planned_date));
  else if (!overdue.length) h += `<section class="card"><h2>Pas de séance prévue</h2><p class="muted">Ton coach prépare la suite. Tu la verras ici dès qu'elle est prête.</p></section>`;
  if (next?.nutri_tip) h += `<section class="card dark-card"><span class="label mint">Tip nutri</span><p>${esc(next.nutri_tip)}</p></section>`;
  return h + '</div>';
}
function vProgramme(p) {
  const cyc = activeCycle(p.cycles);
  if (!cyc) return `<div class="pbody pt"><h1 class="h-page">Mon programme</h1><section class="card"><p class="muted">Aucun cycle pour l'instant.</p></section></div>`;
  const w = S.ui.week ?? cycleWeek(cyc);
  const list = p.sessions.filter((s) => s.cycle_id === cyc.id && (s.week ?? (Math.floor(daysBetween(cyc.start_date, s.planned_date) / 7) + 1)) === w);
  const focus = (cyc.week_focus || [])[w - 1];
  const t = todayIso();
  let h = `<header class="phead compact"><div class="eyebrow light">${esc(shortDate(cyc.start_date))} → ${esc(shortDate(addDays(cyc.start_date, cyc.weeks * 7 - 1)))}</div>
    <div class="h-display">Mon programme</div><div class="sm light">${esc(cyc.name)}</div>
    <div class="weektabs">${Array.from({ length: cyc.weeks }, (_, i) => `<button type="button" class="${i + 1 === w ? 'on' : ''}" data-a="week" data-v="${i + 1}">S${i + 1}</button>`).join('')}</div></header>
    <div class="pbody">${focus ? `<div class="h-small">${esc(focus)}</div>` : ''}`;
  if (!list.length) h += '<p class="muted">Pas de séance cette semaine.</p>';
  for (const s of list) {
    const hasHome = Array.isArray(s.content_home) && s.content_home.length > 0;
    const st = s.status === 'done' ? pill('Faite', 'ok') : s.status === 'skipped' ? pill('Pas faite', 'warn') : s.planned_date === t ? pill("Aujourd'hui", 'solid') : s.planned_date < t ? pill('En retard', 'warn') : pill('À venir');
    h += `<section class="card day-card ${s.planned_date === t ? 'today' : ''}">
      <div class="day"><span>${esc(dow(s.planned_date))}</span><b>${esc(dayNum(s.planned_date))}</b></div>
      <div class="grow">
        <div class="row-between"><a class="strong" href="#/seance/${s.id}">${esc(s.title)}</a><span class="muted sm nowrap">${minutesOf(s) ? minutesOf(s) + ' min · ' : ''}${s.version === 'maison' ? 'Maison' : 'Salle'}</span></div>
        ${s.focus ? `<div class="sm muted2">${esc(s.focus)}</div>` : ''}
        ${chips(gearOf(s))}
        <div class="row-between mt">${st}${hasHome && s.status === 'planned' ? `<button class="btn sm outline" data-a="version" data-id="${s.id}" data-v="${s.version === 'maison' ? 'salle' : 'maison'}">${s.version === 'maison' ? 'Revenir en salle' : 'Version maison'}</button>` : ''}</div>
      </div></section>`;
  }
  return h + '<p class="muted sm center">Pas de salle ce jour-là ? Passe la séance en version maison : ton coach le verra.</p></div>';
}
function exerciseLine(it, opts = {}) {
  const ex = exOf(it.name);
  const video = ex?.video_url ? safeUrl(ex.video_url) : '';
  const key = opts.key || '';
  const open = key && S.ui.video === key;
  const emb = open ? youtubeEmbed(video) : null;
  return `<div class="ex">
    <div class="row-between"><div><div class="strong">${esc(it.name)}</div><div class="dose">${esc(it.dose || '')}</div></div>
    ${video ? (youtubeEmbed(video) ? `<button class="vid-btn" data-a="video" data-v="${esc(key)}" aria-expanded="${open}">${icon.play}<span>${open ? 'Fermer' : 'Vidéo'}</span></button>` : `<a class="vid-btn" href="${esc(video)}" target="_blank" rel="noopener">${icon.play}<span>Vidéo</span></a>`) : ''}</div>
    ${open && emb ? `<div class="video"><iframe src="${esc(emb)}" title="Vidéo ${esc(it.name)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : ''}
    ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
    ${ex?.cues && opts.cues !== false ? `<div class="cue">${esc(ex.cues)}</div>` : ''}
  </div>`;
}
function vSessionPreview(p, id) {
  const s = p.sessions.find((x) => x.id === id);
  if (!s) return '<div class="pbody pt"><p>Séance introuvable.</p></div>';
  const hasHome = Array.isArray(s.content_home) && s.content_home.length > 0;
  let h = `<div class="pbody pt"><a class="back" href="#/programme">${icon.back} Programme</a>
    <div><div class="eyebrow">${esc(longDate(s.planned_date))}</div><h1 class="h-page">${esc(s.title)}</h1>${s.focus ? `<p class="muted">${esc(s.focus)}</p>` : ''}</div>
    ${hasHome && s.status === 'planned' ? seg([['salle', 'En salle'], ['maison', 'À la maison']], s.version, 'version" data-id="' + s.id) : ''}
    ${gearOf(s).length ? `<div class="label">Matériel</div>${chips(gearOf(s))}` : ''}`;
  contentOf(s).forEach((b, bi) => {
    h += `<section class="card"><div class="row-between"><h2>${esc(b.name)}</h2><span class="muted sm">${b.minutes ? b.minutes + "'" : ''}</span></div>
      <div class="muted sm">${esc([b.format, b.rest ? 'R : ' + fmtRest(b.rest) : ''].filter(Boolean).join(' · '))}</div>
      ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
      ${(b.items || []).map((it, ii) => exerciseLine(it, { key: `p${bi}-${ii}`, cues: false })).join('')}</section>`;
  });
  if (s.nutri_tip) h += `<section class="card dark-card"><span class="label mint">Tip nutri</span><p>${esc(s.nutri_tip)}</p></section>`;
  if (s.status === 'planned') h += `<a class="btn primary big" href="#/go/${s.id}">Commencer ${icon.arrow}</a>`;
  return h + '</div>';
}
const fmtRest = (sec) => (sec >= 60 ? (sec % 60 ? `${Math.floor(sec / 60)}'${String(sec % 60).padStart(2, '0')}` : `${sec / 60}'`) : `${sec} s`);

// ---------- Déroulé d'une séance : forme du jour → blocs → retour
function getFlow(id) {
  if (!S.flow || S.flow.id !== id) {
    S.flow = { id, step: 'checkin', bi: 0, startedAt: null, form: 4, sleep: 'bien', painBefore: false, ticks: {},
      rpe: null, custom: 0, pain: false, side: 'D', zones: [], level: 3, comment: '', minutes: null };
  }
  return S.flow;
}
const saveFlow = () => store.set('dc-flow', S.flow);
function vFlow(p, id) {
  const s = p.sessions.find((x) => x.id === id);
  if (!s) return playerShell('<div class="pbody pt"><p>Séance introuvable.</p></div>', '');
  const f = getFlow(id);
  if (location.hash.includes('?retour') && f.step === 'checkin') { f.step = 'retour'; f.manual = true; saveFlow(); }
  if (f.step === 'checkin') return vCheckin(s, f);
  if (f.step === 'retour') return vRetour(s, f);
  if (f.step === 'done') return vDone(s);
  return vBlock(s, f);
}
function flowHead(s, title, sub) {
  return `<div class="fhead"><a class="icon-btn" href="#/" aria-label="Quitter">${icon.close}</a><div class="grow"><div class="eyebrow">${esc(sub)}</div><div class="h-small">${esc(title)}</div></div></div>`;
}
function vCheckin(s, f) {
  return `<div class="flow">${flowHead(s, 'Comment tu te sens ?', 'Avant la séance · 3 touches')}
    <section class="card"><div class="row-between"><b>Forme du jour</b><span class="green sm strong">${FORM_WORDS[f.form - 1]}</span></div>${scale(5, f.form, 'f-form')}
      <div class="row-between xs muted"><span>Pas en forme</span><span>Au top</span></div></section>
    <section class="card"><b>Ta nuit</b>${seg([['bien', 'Bien dormi'], ['moyen', 'Moyen'], ['mal', 'Mal dormi']], f.sleep, 'f-sleep')}</section>
    <section class="card"><b>Une douleur avant de commencer ?</b><span class="muted sm">Si oui, ton coach la verra tout de suite.</span>${seg([['non', 'Non'], ['oui', 'Oui']], f.painBefore ? 'oui' : 'non', 'f-painb')}</section>
    <div class="grow"></div>
    <button class="btn primary big" data-a="f-start">Démarrer la séance</button></div>`;
}
function vBlock(s, f) {
  const blocks = contentOf(s);
  const b = blocks[f.bi];
  if (!b) { f.step = 'retour'; saveFlow(); return vRetour(s, f); }
  const sets = b.sets || 0;
  const done = f.ticks[f.bi] || 0;
  const elapsed = f.startedAt ? Math.floor((Date.now() - f.startedAt) / 60000) : 0;
  let h = `<div class="flow">
    <div class="fhead green-head"><a class="icon-btn light" href="#/" aria-label="Quitter">${icon.close}</a><div class="grow"><div class="eyebrow light">${esc(s.title)}</div>
      <div class="h-small light">${esc(b.name)}</div></div><span class="light sm">${elapsed} min</span></div>
    <div class="progress">${blocks.map((_, i) => `<span class="${i < f.bi ? 'done' : i === f.bi ? 'now' : ''}"></span>`).join('')}</div>
    <div class="row-between sm muted"><span>Bloc ${f.bi + 1} / ${blocks.length}${b.minutes ? ' · ' + b.minutes + "'" : ''}</span><span>${esc(b.format || '')}</span></div>
    ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
    <section class="card">${(b.items || []).map((it, ii) => exerciseLine(it, { key: `b${f.bi}-${ii}` })).join('')}</section>`;
  if (sets) {
    h += `<section class="card"><div class="row-between"><b>Séries</b><span class="muted sm">${done} / ${sets}</span></div><div class="sets">`;
    for (let i = 1; i <= sets; i++) h += `<button type="button" class="${i <= done ? 'on' : ''}" data-a="tick" data-v="${i}" aria-label="Série ${i}">${i <= done ? icon.check : i}</button>`;
    h += '</div></section>';
  }
  if (b.rest) h += `<button class="btn dark big" data-a="rest" data-v="${b.rest}">Récup ${fmtRest(b.rest)}</button>`;
  h += `<div class="grow"></div><div class="row-gap">${f.bi > 0 ? '<button class="btn" data-a="prev">Précédent</button>' : ''}
    <button class="btn primary big grow" data-a="next">${f.bi < blocks.length - 1 ? 'Bloc suivant' : 'Terminer la séance'}</button></div></div>`;
  return h;
}
function vRetour(s, f) {
  const auto = f.startedAt && !f.manual ? Math.max(1, Math.min(300, Math.round((Date.now() - f.startedAt) / 60000))) : null;
  const q = S.profile.custom_question;
  let h = `<div class="flow">${flowHead(s, 'Ton retour', auto ? `Séance terminée · ${auto} min` : 'Retour de séance')}
    <section class="card"><div class="row-between"><b>Difficulté (RPE)</b><span class="green sm strong">${f.rpe ? f.rpe + '/10 · ' + RPE_WORDS[f.rpe - 1] : 'Choisis de 1 à 10'}</span></div>${scale(10, f.rpe, 'r-rpe', 1, 'five')}</section>`;
  if (!auto) h += `<section class="card"><label class="field"><span>Durée de la séance (min)</span><input type="number" inputmode="numeric" min="1" max="300" data-f="minutes" value="${esc(f.minutes ?? minutesOf(s) ?? '')}"></label></section>`;
  if (q) h += `<section class="card"><div class="row-between"><b>${esc(q)}</b><span class="xs muted">Question de ton coach</span></div>
    <div class="stepper"><button type="button" data-a="r-custom" data-v="-1" aria-label="Moins">−</button><span>${f.custom}/10</span><button type="button" data-a="r-custom" data-v="1" aria-label="Plus">+</button></div>
    <div class="row-between xs muted"><span>0 = aucune douleur</span><span>10 = maximale</span></div></section>`;
  h += `<section class="card"><div class="row-between"><b>${q ? 'Une autre douleur ?' : 'Une douleur ?'}</b>${seg([['non', 'Non'], ['oui', 'Oui']], f.pain ? 'oui' : 'non', 'r-pain')}</div>`;
  if (f.pain) {
    h += `${seg([['G', 'Gauche'], ['D', 'Droite']], f.side, 'r-side')}<div class="chips pick">${ZONES.map((z) => `<button type="button" class="${f.zones.includes(z) ? 'on' : ''}" data-a="r-zone" data-v="${esc(z)}">${esc(z)}</button>`).join('')}</div>
      <div class="pain-row"><span>${esc(f.zones.length ? f.zones.join(', ') : 'Choisis la zone')} ${f.side === 'D' ? 'droit(e)' : 'gauche'}</span>
      <div class="stepper small"><button type="button" data-a="r-level" data-v="-1" aria-label="Moins">−</button><span>${f.level}/10</span><button type="button" data-a="r-level" data-v="1" aria-label="Plus">+</button></div></div>`;
  }
  h += `</section><section class="card"><label class="field"><span>Un mot pour ton coach (facultatif)</span><textarea data-f="comment" rows="2" placeholder="Ex. : bonnes sensations sur les sauts">${esc(f.comment)}</textarea></label></section>
    <p class="err" data-err></p>
    <button class="btn primary big" data-a="r-send">Envoyer à mon coach</button></div>`;
  return h;
}
function vDone(s) {
  return `<div class="flow center-flow"><img src="${LOGO}" alt="" class="logo-done"><div class="h-display green">Bien joué</div>
    <p>Ton retour est envoyé à ton coach. Récupère bien.</p>${s.nutri_tip ? `<section class="card dark-card"><span class="label mint">Tip nutri</span><p>${esc(s.nutri_tip)}</p></section>` : ''}
    <button class="btn primary big" data-a="f-home">Retour à l'accueil</button></div>`;
}

// ---------- Progrès, profil, bilan
function weekLoads(feedbacks, weeks = 6, t = todayIso()) {
  const m0 = mondayOf(t);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(m0, -7 * i), we = addDays(ws, 7);
    const list = feedbacks.filter((f) => { const d = localDay(f.created_at); return d >= ws && d < we; });
    out.push({ ws, load: list.reduce((a, f) => a + (f.load ?? f.rpe * f.duration_min), 0), n: list.length });
  }
  return out;
}
function barChart(data, labelFn) {
  const max = Math.max(1, ...data.map((d) => d.load));
  return `<div class="bchart" role="img" aria-label="Charge par semaine">${data.map((d, i) => `<div class="bcol">
    <span class="bval">${d.load ? fmtNum(d.load) : ''}</span><span class="bar ${i === data.length - 1 ? 'cur' : ''}" style="height:${Math.round((d.load / max) * 120)}px"></span><span class="blab">${esc(labelFn(d))}</span></div>`).join('')}</div>`;
}
function vProgress(p) {
  const wl = weekLoads(p.feedbacks);
  const last = p.feedbacks.slice(0, 8);
  return `<div class="pbody pt"><h1 class="h-page">Mes progrès</h1>
    <section class="card"><div class="row-between"><h2>Charge par semaine</h2><span class="xs muted">RPE × minutes</span></div>${barChart(wl, (d) => shortDate(d.ws))}</section>
    <section class="card"><h2>Dernières séances</h2>${last.length ? last.map((f) => {
      const s = p.sessions.find((x) => x.id === f.session_id);
      return `<div class="bl-row"><span>${esc(shortDate(localDay(f.created_at)))} · ${esc(s?.title || 'Séance')}</span><span class="strong">RPE ${f.rpe}</span></div>`;
    }).join('') : '<p class="muted">Tes séances apparaîtront ici.</p>'}</section></div>`;
}
function vProfile() {
  const pr = S.profile;
  return `<div class="pbody pt"><h1 class="h-page">Profil</h1>
    <section class="card"><b>${esc(pr.full_name || '')}</b><span class="muted">${esc(pr.email)}</span>${pr.sport ? `<span class="sm">${esc(pr.sport)}${pr.position ? ' · ' + esc(pr.position) : ''}</span>` : ''}</section>
    <section class="card"><h2>Installer l'appli sur ton téléphone</h2>
      <p class="sm"><b>iPhone</b> : ouvre ce site dans Safari, touche le bouton Partager, puis « Sur l'écran d'accueil ».</p>
      <p class="sm"><b>Android</b> : ouvre ce site dans Chrome, touche les trois points, puis « Ajouter à l'écran d'accueil » ou « Installer l'application ».</p></section>
    <button class="btn" data-a="logout">Se déconnecter</button></div>`;
}
async function vWeekly() {
  const t = todayIso();
  const ws = new Date().getDay() === 1 ? addDays(mondayOf(t), -7) : mondayOf(t);
  if (!S.ui.weekly || S.ui.weekly.ws !== ws) {
    let rep = null; try { rep = await api.myWeekly(S.profile.id, ws); } catch { /* rien */ }
    S.ui.weekly = { ws, basket: rep?.basket_sessions ?? 4, minutes: rep?.match_minutes ?? 0 };
  }
  const w = S.ui.weekly;
  return `<div class="pbody pt"><a class="back" href="#/">${icon.back} Accueil</a><h1 class="h-page">Bilan de la semaine</h1>
    <p class="muted">Semaine du ${esc(shortDate(ws))} au ${esc(shortDate(addDays(ws, 6)))}</p>
    <section class="card"><b>Entraînements basket faits</b><div class="stepper"><button type="button" data-a="w-basket" data-v="-1" aria-label="Moins">−</button><span>${w.basket}</span><button type="button" data-a="w-basket" data-v="1" aria-label="Plus">+</button></div></section>
    <section class="card"><b>Minutes jouées en match</b><div class="stepper"><button type="button" data-a="w-min" data-v="-5" aria-label="Moins 5">−</button><span>${w.minutes}</span><button type="button" data-a="w-min" data-v="5" aria-label="Plus 5">+</button></div>
      <span class="xs muted">Pas de match : laisse 0.</span></section>
    <button class="btn primary big" data-a="w-save">Envoyer</button></div>`;
}

// ================================================================ COACH
async function loadCoach(force = false) {
  if (S.c && !force) return S.c;
  const from = addDays(todayIso(), -70);
  const [profiles, cycles, sessions, feedbacks, checkins, weekly, invitations] = await Promise.all([
    api.profiles(), api.allCycles(), api.allSessions(from), api.allFeedbacks(70), api.allCheckins(21), api.allWeekly(56), api.invitations(),
  ]);
  S.c = { profiles, cycles, sessions, feedbacks, checkins, weekly, invitations };
  return S.c;
}
async function coachRoute(r) {
  const c = await loadCoach();
  const parts = r.split('/').filter(Boolean);
  if (parts[0] === 'athlete' && parts[1]) return coachShell(vAthlete(c, parts[1]), 'athletes');
  if (parts[0] === 'exercices') return coachShell(vLibrary(), 'exercices');
  if (parts[0] === 'importer') return coachShell(vImport(c), 'importer');
  if (parts[0] === 'joueurs') return coachShell(vPlayers(c), 'joueurs');
  return coachShell(vDashboard(c), 'dashboard');
}
function coachShell(inner, tab) {
  const t = (id, href, label) => `<a href="${href}" class="${tab === id ? 'on' : ''}">${label}</a>`;
  return `<header class="chead"><div class="cwrap chead-in"><img src="${LOGO}" alt="DC Perform" class="logo-sm">
    <nav class="cnav" aria-label="Sections">${t('dashboard', '#/', 'Tableau de bord')}${t('joueurs', '#/joueurs', 'Joueurs')}${t('exercices', '#/exercices', 'Exercices')}${t('importer', '#/importer', 'Importer un cycle')}</nav>
    <button class="btn sm light-btn" data-a="logout">Déconnexion</button></div></header>
    <main class="cwrap cmain">${inner}</main>${api.demo ? '<div class="demo-flag">Mode démo · rien n\'est enregistré</div>' : ''}`;
}
const athletesOf = (c) => c.profiles.filter((p) => p.role === 'athlete');

/** Calcule l'état d'un athlète : charge, sommeil, alertes. */
function athleteStatus(c, a, t = todayIso()) {
  const desc = (x, y) => String(y.created_at).localeCompare(String(x.created_at));
  const fb = c.feedbacks.filter((f) => f.athlete_id === a.id).sort(desc);
  const ck = c.checkins.filter((x) => x.athlete_id === a.id).sort(desc);
  const ses = c.sessions.filter((s) => s.athlete_id === a.id);
  const cyc = activeCycle(c.cycles.filter((x) => x.athlete_id === a.id), t);
  const m0 = mondayOf(t);
  const loadIn = (from, to) => fb.filter((f) => { const d = localDay(f.created_at); return d >= from && d < to; }).reduce((s, f) => s + (f.load ?? f.rpe * f.duration_min), 0);
  const week = loadIn(m0, addDays(m0, 7));
  const prev4 = loadIn(addDays(m0, -28), m0) / 4;
  // Comparaison à jour égal : on projette la semaine en cours seulement si elle est terminée ; sinon on compare la semaine écoulée.
  const lastWeek = loadIn(addDays(m0, -7), m0);
  const prev4b = loadIn(addDays(m0, -35), addDays(m0, -7)) / 4;
  const pct = prev4b > 0 ? Math.round(((lastWeek - prev4b) / prev4b) * 100) : null;
  const alerts = [];
  // Retours des 7 derniers jours (du plus récent au plus ancien) : une alerte par zone, la plus récente.
  const recentFb = fb.filter((f) => localDay(f.created_at) >= addDays(t, -7));
  const seenZones = new Set();
  for (const f of recentFb) {
    for (const pn of f.pains || []) {
      const key = pn.zone + pn.side;
      if (seenZones.has(key)) continue;
      seenZones.add(key);
      const lvl = Number(pn.level) || 0;
      const times = recentFb.filter((x) => (x.pains || []).some((q) => q.zone + q.side === key)).length;
      alerts.push({ level: lvl >= 4 ? 'alert' : 'warn', text: `${pn.zone} ${pn.side === 'G' ? 'gauche' : 'droit(e)'} · ${lvl}/10`,
        sub: `Dernier signalement le ${shortDate(localDay(f.created_at))}${times > 1 ? ` (${times} fois en 7 jours)` : ''}${f.comment ? ' : « ' + f.comment + ' »' : ''}` });
    }
  }
  const lastCustom = a.custom_question ? recentFb.find((f) => f.custom_answer != null) : null;
  if (lastCustom && lastCustom.custom_answer >= 4) {
    alerts.push({ level: lastCustom.custom_answer >= 6 ? 'alert' : 'warn', text: `${a.custom_question} : ${lastCustom.custom_answer}/10`, sub: `Le ${shortDate(localDay(lastCustom.created_at))}` });
  }
  if (pct != null && pct > 30) alerts.push({ level: 'alert', text: `Charge +${pct} %`, sub: `Semaine dernière : ${fmtNum(lastWeek)} UA contre ${fmtNum(Math.round(prev4b))} UA en moyenne avant.` });
  const last3 = ck.slice(0, 3);
  const badSleep = last3.filter((x) => x.sleep === 'mal').length;
  if (badSleep >= 2) alerts.push({ level: 'warn', text: 'Mauvais sommeil', sub: `${badSleep} mauvaises nuits sur les 3 dernières séances.` });
  const lowForm = last3.filter((x) => x.form <= 2).length;
  if (lowForm >= 2) alerts.push({ level: 'warn', text: 'Forme basse', sub: `${lowForm} check-ins à 2/5 ou moins.` });
  for (const x of ck.filter((x) => x.pain_before && localDay(x.created_at) >= addDays(t, -7)).slice(0, 1)) alerts.push({ level: 'warn', text: 'Douleur avant séance', sub: `Le ${shortDate(localDay(x.created_at))}` });
  const missed = ses.filter((s) => s.status === 'planned' && s.planned_date < addDays(t, -1) && s.planned_date >= addDays(t, -10));
  if (missed.length) alerts.push({ level: 'warn', text: plural(missed.length, 'séance') + ' non faite' + (missed.length > 1 ? 's' : ''), sub: missed.map((s) => `${s.title} (${shortDate(s.planned_date)})`).join(', ') });
  const skipped = ses.filter((s) => s.status === 'skipped' && s.planned_date >= addDays(t, -10));
  if (skipped.length) alerts.push({ level: 'warn', text: 'Séance sautée', sub: skipped.map((s) => `${s.title} (${shortDate(s.planned_date)})`).join(', ') });
  const homeSwitch = ses.filter((s) => s.version === 'maison' && s.planned_date >= t && s.planned_date <= addDays(t, 7) && s.content_home && JSON.stringify(s.content_home) !== JSON.stringify(s.content_gym));
  const state = alerts.some((x) => x.level === 'alert') ? 'alert' : alerts.length ? 'warn' : 'ok';
  const lastFb = fb[0];
  const sleepAvg = last3.length ? last3.map((x) => x.sleep) : [];
  return { cyc, week, lastWeek, prev4, prev4b, pct, alerts, state, lastFb, sleepAvg, homeSwitch, ses, fb, ck };
}
function stateChip(st) {
  if (st.state === 'alert') return pill(st.alerts.find((x) => x.level === 'alert').text, 'alert');
  if (st.state === 'warn') return pill(st.alerts[0].text, 'warn');
  return pill('OK', 'ok');
}
function vDashboard(c) {
  const t = todayIso(), m0 = mondayOf(t);
  const ath = athletesOf(c);
  const sts = ath.map((a) => ({ a, st: athleteStatus(c, a) }));
  const weekSes = c.sessions.filter((s) => s.planned_date >= m0 && s.planned_date < addDays(m0, 7));
  const weekFb = c.feedbacks.filter((f) => localDay(f.created_at) >= m0);
  const avgRpe = weekFb.length ? (weekFb.reduce((s, f) => s + f.rpe, 0) / weekFb.length).toFixed(1).replace('.', ',') : '–';
  const nAlerts = sts.reduce((n, x) => n + x.st.alerts.length, 0);
  let h = `<div class="view-head"><div><div class="eyebrow">Semaine du ${esc(shortDate(m0))} au ${esc(shortDate(addDays(m0, 6)))}</div><h1 class="h-page">Tableau de bord</h1></div>
    <a class="btn primary" href="#/importer">Importer un cycle</a></div>
    <div class="kpis"><div class="kpi"><span>Séances faites</span><b>${weekSes.filter((s) => s.status === 'done').length} <small>/ ${weekSes.length}</small></b></div>
    <div class="kpi"><span>Retours reçus</span><b>${weekFb.length}</b></div><div class="kpi"><span>RPE moyen</span><b>${avgRpe}</b></div>
    <div class="kpi ${nAlerts ? 'kpi-alert' : ''}"><span>À traiter</span><b>${plural(nAlerts, 'alerte')}</b></div></div>`;
  if (!ath.length) {
    return h + `<section class="card"><h2>Ajoute ton premier joueur</h2><p>Va dans <a href="#/joueurs">Joueurs</a>, entre son e-mail, puis envoie-lui le lien de l'appli pour qu'il crée son compte.</p></section>`;
  }
  h += `<div class="cols"><section class="col-main"><h2 class="h-sec">Tes athlètes</h2><div class="table-box"><table class="tbl"><thead><tr><th>Athlète</th><th>Phase</th><th>Dernière séance</th><th>Charge sem. passée</th><th>Nuits</th><th>État</th></tr></thead><tbody>`;
  for (const { a, st } of sts) {
    const maxL = Math.max(1, ...sts.map((x) => x.st.lastWeek));
    const lastS = st.lastFb ? c.sessions.find((s) => s.id === st.lastFb.session_id) : null;
    h += `<tr><td><a class="strong" href="#/athlete/${a.id}">${esc(a.full_name || a.email)}</a><div class="xs muted">${esc([a.sport, a.position].filter(Boolean).join(' · '))}</div></td>
      <td>${st.cyc ? `${esc(st.cyc.name)}<div class="xs muted">Semaine ${cycleWeek(st.cyc)} / ${st.cyc.weeks}</div>` : '<span class="muted">Aucun cycle</span>'}</td>
      <td>${st.lastFb ? `${esc(shortDate(localDay(st.lastFb.created_at)))} · RPE ${st.lastFb.rpe}<div class="xs muted">${esc(lastS?.title || '')}</div>` : '<span class="muted">–</span>'}</td>
      <td><div class="tnum">${fmtNum(st.lastWeek)} UA ${st.pct != null ? `<span class="xs ${st.pct > 30 ? 'red' : 'muted'}">${st.pct > 0 ? '+' : ''}${st.pct} %</span>` : ''}</div><span class="mini"><span style="width:${Math.round((st.lastWeek / maxL) * 100)}%" class="${st.pct > 30 ? 'red-bg' : ''}"></span></span></td>
      <td class="xs">${st.sleepAvg.length ? st.sleepAvg.map((x) => `<span class="dot ${x}"></span>`).join('') : '<span class="muted">–</span>'}</td>
      <td>${stateChip(st)}</td></tr>`;
  }
  h += `</tbody></table></div><p class="xs muted">Charge = RPE × durée, cumulée sur la semaine passée, comparée à la moyenne des 4 semaines d'avant. Nuits : 3 derniers check-ins.</p></section><aside class="col-side"><h2 class="h-sec">À traiter</h2><div class="card list-card">`;
  const all = sts.flatMap(({ a, st }) => st.alerts.map((x) => ({ a, ...x }))).sort((x, y) => (x.level === 'alert' ? 0 : 1) - (y.level === 'alert' ? 0 : 1));
  h += all.length ? all.map((x) => `<a class="alert-row" href="#/athlete/${x.a.id}"><span class="dot ${x.level === 'alert' ? 'red' : 'orange'}"></span><div><b>${esc(x.a.full_name || '')} · ${esc(x.text)}</b><div class="sm muted2">${esc(x.sub)}</div></div></a>`).join('') : '<p class="muted">Rien à signaler.</p>';
  h += '</div>';
  const home = sts.flatMap(({ a, st }) => st.homeSwitch.map((s) => ({ a, s })));
  if (home.length) h += `<h2 class="h-sec">Passées en version maison</h2><div class="card list-card">${home.map(({ a, s }) => `<div class="alert-row"><span class="dot"></span><div><b>${esc(a.full_name || '')}</b><div class="sm muted2">${esc(s.title)} · ${esc(relDay(s.planned_date))}</div></div></div>`).join('')}</div>`;
  const nextDays = c.sessions.filter((s) => s.status === 'planned' && s.planned_date >= t && s.planned_date <= addDays(t, 2));
  h += `<h2 class="h-sec">Prochaines séances</h2><div class="card list-card">${nextDays.length ? nextDays.map((s) => {
    const a = c.profiles.find((p) => p.id === s.athlete_id);
    return `<div class="alert-row"><span class="when">${esc(relDay(s.planned_date))}</span><div><b>${esc(a?.full_name || '')}</b><div class="sm muted2">${esc(s.title)}</div></div></div>`;
  }).join('') : '<p class="muted">Aucune dans les 3 prochains jours.</p>'}</div></aside></div>`;
  return h;
}
function vAthlete(c, id) {
  const a = c.profiles.find((p) => p.id === id);
  if (!a) return '<p>Athlète introuvable.</p>';
  const st = athleteStatus(c, a);
  const cycles = c.cycles.filter((x) => x.athlete_id === a.id);
  const wl = weekLoads(st.fb, 8);
  const weekly = c.weekly.filter((w) => w.athlete_id === a.id);
  let h = `<a class="back" href="#/">${icon.back} Tableau de bord</a>
    <div class="view-head"><div><div class="eyebrow">${esc([a.sport, a.position].filter(Boolean).join(' · ') || 'Athlète')}</div><h1 class="h-page">${esc(a.full_name || a.email)}</h1></div>${stateChip(st)}</div>
    <div class="cols"><section class="col-main">`;
  if (st.alerts.length) h += `<div class="card list-card">${st.alerts.map((x) => `<div class="alert-row"><span class="dot ${x.level === 'alert' ? 'red' : 'orange'}"></span><div><b>${esc(x.text)}</b><div class="sm muted2">${esc(x.sub)}</div></div></div>`).join('')}</div>`;
  h += `<div class="card"><div class="row-between"><h2>Charge par semaine</h2><span class="xs muted">UA = RPE × minutes</span></div>${barChart(wl, (d) => shortDate(d.ws))}
    ${weekly.length ? `<p class="xs muted">Basket déclaré : ${weekly.sort((x, y) => y.week_start.localeCompare(x.week_start)).slice(0, 4).map((w) => `sem. du ${shortDate(w.week_start)} : ${w.basket_sessions} entraînements, ${w.match_minutes} min de match`).join(' · ')}</p>` : ''}</div>`;
  const cyc = st.cyc;
  if (cyc) {
    const list = st.ses.filter((s) => s.cycle_id === cyc.id);
    h += `<div class="card"><div class="row-between"><h2>${esc(cyc.name)}</h2><span class="muted sm">${esc(shortDate(cyc.start_date))} → ${esc(shortDate(addDays(cyc.start_date, cyc.weeks * 7 - 1)))}</span></div>
      ${cyc.goal ? `<p class="sm">${esc(cyc.goal)}</p>` : ''}<div class="table-box"><table class="tbl"><thead><tr><th>Sem.</th><th>Date</th><th>Séance</th><th>Version</th><th>Statut</th></tr></thead><tbody>
      ${list.map((s) => `<tr><td>S${s.week ?? ''}</td><td><input type="date" value="${s.planned_date}" data-a2="move" data-id="${s.id}" aria-label="Date de ${esc(s.title)}"></td><td>${esc(s.title)}</td><td>${s.version === 'maison' ? 'Maison' : 'Salle'}</td>
        <td>${s.status === 'done' ? pill('Faite', 'ok') : s.status === 'skipped' ? pill('Sautée', 'warn') : s.planned_date < todayIso() ? pill('Non faite', 'warn') : pill('Prévue')}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }
  h += `<div class="card"><h2>Derniers retours</h2><div class="table-box"><table class="tbl"><thead><tr><th>Date</th><th>Séance</th><th>Forme</th><th>Nuit</th><th>RPE</th><th>Durée</th>${a.custom_question ? '<th>Question perso</th>' : ''}<th>Douleurs</th><th>Commentaire</th></tr></thead><tbody>`;
  const fbs = st.fb.slice(0, 15);
  h += fbs.length ? fbs.map((f) => {
    const s = c.sessions.find((x) => x.id === f.session_id);
    const ck = st.ck.find((x) => x.session_id === f.session_id);
    return `<tr><td class="nowrap">${esc(shortDate(localDay(f.created_at)))}</td><td>${esc(s?.title || '')}${f.version === 'maison' ? ' <span class="xs muted">(maison)</span>' : ''}</td><td>${ck ? ck.form + '/5' : '–'}</td><td>${ck ? esc(ck.sleep) : '–'}</td>
      <td class="strong">${f.rpe}</td><td>${f.duration_min} min</td>${a.custom_question ? `<td>${f.custom_answer ?? '–'}/10</td>` : ''}
      <td>${(f.pains || []).length ? f.pains.map((p) => pill(`${p.zone} ${p.side} ${p.level}/10`, p.level >= 4 ? 'alert' : 'warn')).join(' ') : '<span class="muted">Aucune</span>'}</td><td class="sm">${esc(f.comment || '')}</td></tr>`;
  }).join('') : `<tr><td colspan="9" class="muted">Pas encore de retour.</td></tr>`;
  h += `</tbody></table></div></div></section><aside class="col-side">
    <form class="card" data-form="profile" data-id="${a.id}"><h2>Profil</h2>
      <label class="field"><span>Nom</span><input name="full_name" value="${esc(a.full_name || '')}"></label>
      <label class="field"><span>Sport</span><input name="sport" value="${esc(a.sport || '')}" placeholder="Basket"></label>
      <label class="field"><span>Poste / niveau</span><input name="position" value="${esc(a.position || '')}" placeholder="Arrière · N2"></label>
      <label class="field"><span>Question perso après chaque séance</span><input name="custom_question" value="${esc(a.custom_question || '')}" placeholder="Ton genou aujourd'hui"></label>
      <span class="xs muted">Réponse de 0 à 10. Laisse vide pour ne rien demander.</span>
      <button class="btn primary" type="submit">Enregistrer</button></form>
    <div class="card"><h2>Cycles</h2>${cycles.length ? cycles.map((x) => `<div class="bl-row"><span>${esc(x.name)}<div class="xs muted">${esc(shortDate(x.start_date))} · ${x.weeks} sem.</div></span>
      ${S.ui.confirmCycle === x.id ? `<span class="row-gap"><button class="btn sm danger" data-a="del-cycle" data-id="${x.id}">Supprimer</button><button class="btn sm" data-a="cancel-cycle">Annuler</button></span>` : `<button class="btn sm ghost" data-a="ask-cycle" data-id="${x.id}">Supprimer</button>`}</div>`).join('') : '<p class="muted">Aucun cycle.</p>'}
      <a class="btn" href="#/importer?athlete=${a.id}">Importer un cycle</a></div>
    <div class="card"><span class="xs muted">${esc(a.email)}</span></div></aside></div>`;
  return h;
}
function vLibrary() {
  const q = (S.ui.exq || '').toLowerCase();
  const cat = S.ui.excat || '';
  let list = S.exList.filter((e) => (!cat || e.category === cat) && (!q || e.name.toLowerCase().includes(q)));
  const withVideo = S.exList.filter((e) => e.video_url).length;
  let h = `<div class="view-head"><div><div class="eyebrow">${S.exList.length} exercices · ${withVideo} avec vidéo</div><h1 class="h-page">Exercices</h1></div><button class="btn primary" data-a="ex-new">Nouvel exercice</button></div>`;
  if (S.ui.exEdit) {
    const e = S.ui.exEdit;
    h += `<form class="card" data-form="exercise"><h2>${e.id ? 'Modifier' : 'Nouvel exercice'}</h2><div class="grid2">
      <label class="field"><span>Nom</span><input name="name" value="${esc(e.name || '')}" required autofocus></label>
      <label class="field"><span>Catégorie</span><select name="category"><option value="">À classer</option>${CATS.map((x) => `<option ${x === e.category ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field wide"><span>Lien de la vidéo (YouTube non répertorié, Drive, Instagram…)</span><input name="video_url" value="${esc(e.video_url || '')}" placeholder="https://youtu.be/…"></label>
      <label class="field wide"><span>Consignes clés</span><textarea name="cues" rows="2">${esc(e.cues || '')}</textarea></label>
      <label class="field wide"><span>Équivalent maison</span><input name="home_alt" value="${esc(e.home_alt || '')}" list="exnames" placeholder="Nom d'un exercice de la bibliothèque"></label></div>
      <datalist id="exnames">${S.exList.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>
      <p class="err" data-err></p>
      <div class="row-gap"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-a="ex-cancel">Annuler</button>
      ${e.id ? (S.ui.exDel ? `<button class="btn danger" type="button" data-a="ex-del">Confirmer la suppression</button>` : `<button class="btn ghost" type="button" data-a="ex-askdel">Supprimer</button>`) : ''}</div></form>`;
  }
  h += `<div class="filters"><input type="search" placeholder="Chercher un exercice" value="${esc(S.ui.exq || '')}" data-f="exq" aria-label="Chercher">
    <div class="chips pick">${['', ...CATS].map((x) => `<button type="button" class="${x === cat ? 'on' : ''}" data-a="ex-cat" data-v="${esc(x)}">${esc(x || 'Toutes')}</button>`).join('')}</div></div><div id="exlist">${libraryList(list)}</div>`;
  return h;
}
function libraryList(list) {
  if (!list.length) return '<p class="muted">Aucun exercice.</p>';
  const groups = {};
  for (const e of list) (groups[e.category || 'À classer'] ||= []).push(e);
  return Object.keys(groups).sort((x, y) => (CATS.indexOf(x) + 99) % 99 - (CATS.indexOf(y) + 99) % 99).map((g) => `<h2 class="h-sec">${esc(g)} <span class="muted">${groups[g].length}</span></h2>
    <div class="card list-card">${groups[g].map((e) => `<button class="ex-row" data-a="ex-edit" data-id="${e.id}"><span><b>${esc(e.name)}</b>${e.home_alt ? `<span class="xs muted"> · maison : ${esc(e.home_alt)}</span>` : ''}</span>${e.video_url ? pill('Vidéo', 'ok') : '<span class="xs muted">Pas de vidéo</span>'}</button>`).join('')}</div>`).join('');
}
function vImport(c) {
  const ath = athletesOf(c);
  const pre = new URLSearchParams(location.hash.split('?')[1] || '').get('athlete');
  const st = S.ui.imp ||= { athlete: pre || ath[0]?.id || '', start: nextMonday(), json: '', parsed: null, error: '' };
  if (pre && !S.ui.impPre) { st.athlete = pre; S.ui.impPre = true; }
  let h = `<div class="view-head"><div><div class="eyebrow">Depuis la conversation avec Claude</div><h1 class="h-page">Importer un cycle</h1></div></div>
    <div class="cols"><section class="col-main"><div class="card"><div class="grid2">
      <label class="field"><span>Athlète</span><select data-f="imp-athlete">${ath.map((a) => `<option value="${a.id}" ${a.id === st.athlete ? 'selected' : ''}>${esc(a.full_name || a.email)}</option>`).join('')}</select></label>
      <label class="field"><span>Début du cycle (un lundi)</span><input type="date" value="${st.start}" data-f="imp-start"></label></div>
      <label class="field"><span>Fichier du cycle (.json)</span><input type="file" accept=".json,application/json" data-f="imp-file"></label>
      <label class="field"><span>Ou colle le contenu ici</span><textarea rows="6" data-f="imp-json" placeholder='{"name": "Cycle 5", "sessions": [...]}'>${esc(st.json)}</textarea></label>
      ${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}</div>`;
  if (st.parsed) {
    const p = st.parsed;
    h += `<div class="card"><h2>${esc(p.name)}</h2>${p.goal ? `<p class="sm">${esc(p.goal)}</p>` : ''}<div class="table-box"><table class="tbl"><thead><tr><th>Sem.</th><th>Date</th><th>Séance</th><th>Blocs</th><th>Maison</th></tr></thead><tbody>
      ${p.sessions.map((s) => `<tr><td>S${s.week ?? ''}</td><td class="nowrap">${esc(longDate(addDays(st.start, s.day_offset ?? 0)))}</td><td>${esc(s.title)}</td><td>${(s.content_gym || []).length}</td><td>${s.content_home ? 'Oui' : 'Non'}</td></tr>`).join('')}
      </tbody></table></div><button class="btn primary big" data-a="imp-go" ${st.athlete ? '' : 'disabled'}>Importer ${plural(p.sessions.length, 'séance')}</button></div>`;
  }
  h += `</section><aside class="col-side"><div class="card"><h2>Comment ça marche</h2><ol class="sm steps"><li>Dans la conversation, demande à Claude le cycle d'un joueur « au format d'import DC Perform ».</li><li>Choisis le joueur et le lundi de départ.</li><li>Dépose le fichier ou colle son contenu, vérifie les dates, puis importe.</li></ol>
    <p class="xs muted">Les dates se calculent à partir du lundi choisi. Tu pourras déplacer une séance depuis la fiche du joueur.</p></div></aside></div>`;
  return h;
}
function nextMonday() { const t = todayIso(); const m = mondayOf(t); return m === t ? t : addDays(m, 7); }
function parseCycle(txt) {
  const p = JSON.parse(txt);
  if (!p || typeof p !== 'object') throw new Error('Le contenu n\'est pas un cycle.');
  if (!p.name) throw new Error('Il manque le nom du cycle (« name »).');
  if (!Array.isArray(p.sessions) || !p.sessions.length) throw new Error('Il manque la liste des séances (« sessions »).');
  p.sessions.forEach((s, i) => {
    if (!s.title) throw new Error(`La séance n° ${i + 1} n'a pas de titre.`);
    if (!Array.isArray(s.content_gym)) throw new Error(`La séance « ${s.title} » n'a pas de contenu (« content_gym »).`);
  });
  return p;
}
function vPlayers(c) {
  const ath = c.profiles.filter((p) => p.role === 'athlete');
  const pending = c.profiles.filter((p) => p.role === 'pending');
  const link = location.origin;
  const msg = `Salut ! Voici l'appli DC Perform pour tes séances : ${link}\nCrée ton compte avec cette adresse e-mail, puis ajoute l'appli à ton écran d'accueil.`;
  let h = `<div class="view-head"><div><div class="eyebrow">${plural(ath.length, 'athlète')}</div><h1 class="h-page">Joueurs</h1></div></div>
    <div class="cols"><section class="col-main"><form class="card" data-form="invite"><h2>Ajouter un joueur</h2><div class="grid2">
      <label class="field"><span>Prénom et nom</span><input name="name" required></label><label class="field"><span>E-mail</span><input name="email" type="email" required></label></div>
      <p class="err" data-err></p><button class="btn primary" type="submit">Ajouter</button></form>`;
  if (pending.length) h += `<div class="card"><h2>Comptes en attente</h2><p class="sm muted">Ces personnes ont créé un compte sans invitation.</p>${pending.map((p) => `<div class="bl-row"><span>${esc(p.full_name || '')} <span class="muted sm">${esc(p.email)}</span></span><button class="btn sm primary" data-a="activate" data-v="${esc(p.email)}" data-n="${esc(p.full_name || '')}">Accepter</button></div>`).join('')}</div>`;
  h += `<div class="card"><h2>Athlètes</h2>${ath.length ? ath.map((a) => `<a class="bl-row" href="#/athlete/${a.id}"><span><b>${esc(a.full_name || '')}</b> <span class="muted sm">${esc(a.email)}</span></span><span class="sm">Voir la fiche</span></a>`).join('') : '<p class="muted">Aucun pour l\'instant.</p>'}</div>`;
  const invited = c.invitations.filter((i) => i.role === 'athlete' && !c.profiles.some((p) => p.email.toLowerCase() === i.email.toLowerCase()));
  if (invited.length) h += `<div class="card"><h2>Invités, compte pas encore créé</h2>${invited.map((i) => `<div class="bl-row"><span>${esc(i.full_name || '')} <span class="muted sm">${esc(i.email)}</span></span><button class="btn sm ghost" data-a="uninvite" data-v="${esc(i.email)}">Retirer</button></div>`).join('')}</div>`;
  h += `</section><aside class="col-side"><div class="card"><h2>Message à envoyer</h2><p class="sm">Après l'avoir ajouté, envoie-lui ce message par WhatsApp ou SMS :</p><textarea rows="5" readonly id="invite-msg">${esc(msg)}</textarea><button class="btn" data-a="copy-invite">Copier le message</button></div></aside></div>`;
  return h;
}

// ================================================================ ÉVÉNEMENTS
let restTimer = null;
function startRest(sec) {
  clearInterval(restTimer);
  const end = Date.now() + sec * 1000;
  const ov = document.getElementById('rest');
  ov.hidden = false;
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    ov.querySelector('[data-left]').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left <= 0) { clearInterval(restTimer); try { navigator.vibrate?.([200, 100, 200]); } catch { /* rien */ } ov.querySelector('[data-left]').textContent = "C'est reparti"; setTimeout(() => { ov.hidden = true; }, 1500); }
  };
  tick(); restTimer = setInterval(tick, 250);
}

const actions = {
  reload: () => location.reload(),
  logout: async () => { await api.signOut(); S.flow = null; store.del('dc-flow'); location.hash = '#/'; },
  version: async (el) => {
    const s = S.p?.sessions.find((x) => x.id === el.dataset.id); if (!s) return;
    const v = el.dataset.v; if (v === s.version) return;
    s.version = v; render();
    try { await api.setSession(s.id, { version: v }); toast(v === 'maison' ? 'Version maison : ton coach le verra.' : 'Retour en version salle.'); } catch (e) { toast(errMsg(e)); }
  },
  skip: async (el) => {
    try { await api.setSession(el.dataset.id, { status: 'skipped' }); await loadPlayer(true); toast('Noté. Ton coach est prévenu.'); render(); } catch (e) { toast(errMsg(e)); }
  },
  week: (el) => { S.ui.week = Number(el.dataset.v); render(); },
  video: (el) => { S.ui.video = S.ui.video === el.dataset.v ? null : el.dataset.v; render(); },
  'f-form': (el) => { S.flow.form = Number(el.dataset.v); saveFlow(); render(); },
  'f-sleep': (el) => { S.flow.sleep = el.dataset.v; saveFlow(); render(); },
  'f-painb': (el) => { S.flow.painBefore = el.dataset.v === 'oui'; saveFlow(); render(); },
  'f-start': async (el) => {
    const f = S.flow; el.disabled = true;
    try {
      await api.saveCheckin({ session_id: f.id, athlete_id: S.profile.id, form: f.form, sleep: f.sleep, pain_before: f.painBefore });
      f.step = 'block'; f.bi = 0; f.startedAt = Date.now(); saveFlow(); render(); top();
    } catch (e) { el.disabled = false; toast(errMsg(e)); }
  },
  tick: (el) => { const v = Number(el.dataset.v); const cur = S.flow.ticks[S.flow.bi] || 0; S.flow.ticks[S.flow.bi] = cur === v ? v - 1 : v; saveFlow(); render(); },
  rest: (el) => startRest(Number(el.dataset.v)),
  'rest-stop': () => { clearInterval(restTimer); document.getElementById('rest').hidden = true; },
  prev: () => { S.flow.bi = Math.max(0, S.flow.bi - 1); S.ui.video = null; saveFlow(); render(); top(); },
  next: () => {
    const s = S.p.sessions.find((x) => x.id === S.flow.id);
    S.ui.video = null;
    if (S.flow.bi >= contentOf(s).length - 1) S.flow.step = 'retour'; else S.flow.bi += 1;
    saveFlow(); render(); top();
  },
  'r-rpe': (el) => { S.flow.rpe = Number(el.dataset.v); saveFlow(); render(); },
  'r-custom': (el) => { S.flow.custom = Math.max(0, Math.min(10, S.flow.custom + Number(el.dataset.v))); saveFlow(); render(); },
  'r-pain': (el) => { S.flow.pain = el.dataset.v === 'oui'; saveFlow(); render(); },
  'r-side': (el) => { S.flow.side = el.dataset.v; saveFlow(); render(); },
  'r-zone': (el) => { const z = el.dataset.v; const f = S.flow; f.zones = f.zones.includes(z) ? f.zones.filter((x) => x !== z) : [...f.zones, z]; saveFlow(); render(); },
  'r-level': (el) => { S.flow.level = Math.max(0, Math.min(10, S.flow.level + Number(el.dataset.v))); saveFlow(); render(); },
  'r-send': async (el) => {
    const f = S.flow;
    const s = S.p.sessions.find((x) => x.id === f.id);
    const err = $app.querySelector('[data-err]');
    if (!f.rpe) { err.textContent = 'Choisis ton RPE de 1 à 10.'; return; }
    if (f.pain && !f.zones.length) { err.textContent = 'Choisis la zone de la douleur, ou réponds « Non ».'; return; }
    const auto = f.startedAt && !f.manual ? Math.round((Date.now() - f.startedAt) / 60000) : null;
    const minutes = Math.max(1, Math.min(300, auto ?? Number(f.minutes || minutesOf(s) || 60)));
    el.disabled = true;
    try {
      await api.saveFeedback({
        session_id: f.id, athlete_id: S.profile.id, started_at: f.startedAt ? new Date(f.startedAt).toISOString() : null,
        duration_min: minutes, rpe: f.rpe, custom_answer: S.profile.custom_question ? f.custom : null,
        pains: f.pain ? f.zones.map((zone) => ({ zone, side: f.side, level: f.level })) : [], comment: f.comment?.trim() || null, version: s?.version || 'salle',
      });
      f.step = 'done'; saveFlow(); await loadPlayer(true); render(); top();
    } catch (e) { el.disabled = false; err.textContent = errMsg(e); }
  },
  'f-home': () => { S.flow = null; store.del('dc-flow'); go('#/'); },
  'w-basket': (el) => { S.ui.weekly.basket = Math.max(0, Math.min(14, S.ui.weekly.basket + Number(el.dataset.v))); render(); },
  'w-min': (el) => { S.ui.weekly.minutes = Math.max(0, Math.min(300, S.ui.weekly.minutes + Number(el.dataset.v))); render(); },
  'w-save': async (el) => {
    const w = S.ui.weekly; el.disabled = true;
    try { await api.saveWeekly({ athlete_id: S.profile.id, week_start: w.ws, basket_sessions: w.basket, match_minutes: w.minutes }); toast('Bilan envoyé. Merci !'); go('#/'); }
    catch (e) { el.disabled = false; toast(errMsg(e)); }
  },
  // --- coach
  'ex-new': () => { S.ui.exEdit = { name: '', category: S.ui.excat || '' }; S.ui.exDel = false; render(); top(); },
  'ex-edit': (el) => { S.ui.exEdit = { ...S.exList.find((e) => e.id === el.dataset.id) }; S.ui.exDel = false; render(); top(); },
  'ex-cancel': () => { S.ui.exEdit = null; render(); },
  'ex-askdel': () => { S.ui.exDel = true; render(); },
  'ex-del': async () => {
    try { await api.deleteExercise(S.ui.exEdit.id); S.exList = S.exList.filter((e) => e.id !== S.ui.exEdit.id); S.ex = new Map(S.exList.map((e) => [e.name.toLowerCase(), e])); S.ui.exEdit = null; toast('Exercice supprimé'); render(); }
    catch (e) { toast(errMsg(e)); }
  },
  'ex-cat': (el) => { S.ui.excat = el.dataset.v; render(); },
  'imp-go': async (el) => {
    const st = S.ui.imp; el.disabled = true;
    try {
      await api.importCycle(st.athlete, st.start, st.parsed);
      toast(`Cycle importé : ${plural(st.parsed.sessions.length, 'séance')}.`);
      const id = st.athlete; S.ui.imp = null; S.ui.impPre = false; await loadCoach(true); go('#/athlete/' + id);
    } catch (e) { el.disabled = false; toast(errMsg(e)); }
  },
  'ask-cycle': (el) => { S.ui.confirmCycle = el.dataset.id; render(); },
  'cancel-cycle': () => { S.ui.confirmCycle = null; render(); },
  'del-cycle': async (el) => {
    try { await api.deleteCycle(el.dataset.id); S.ui.confirmCycle = null; await loadCoach(true); toast('Cycle supprimé'); render(); } catch (e) { toast(errMsg(e)); }
  },
  activate: async (el) => {
    try { await api.invite(el.dataset.v, el.dataset.n); await loadCoach(true); toast('Joueur accepté'); render(); } catch (e) { toast(errMsg(e)); }
  },
  uninvite: async (el) => {
    try { await api.deleteInvitation(el.dataset.v); await loadCoach(true); render(); } catch (e) { toast(errMsg(e)); }
  },
  'copy-invite': async () => {
    const t = document.getElementById('invite-msg');
    try { await navigator.clipboard.writeText(t.value); toast('Message copié'); } catch { t.select(); toast('Sélectionné : copie-le avec Ctrl+C'); }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const fn = actions[el.dataset.a];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target, f = el.dataset.f;
  if (!f) return;
  if (f === 'comment' && S.flow) { S.flow.comment = el.value; saveFlow(); }
  else if (f === 'minutes' && S.flow) { S.flow.minutes = el.value; saveFlow(); }
  else if (f === 'exq') {
    S.ui.exq = el.value;
    const q = el.value.toLowerCase(), cat = S.ui.excat || '';
    document.getElementById('exlist').innerHTML = libraryList(S.exList.filter((x) => (!cat || x.category === cat) && (!q || x.name.toLowerCase().includes(q))));
  } else if (f === 'imp-json') {
    const st = S.ui.imp; st.json = el.value;
    clearTimeout(S.ui.impT); S.ui.impT = setTimeout(() => { try { st.parsed = st.json.trim() ? parseCycle(st.json) : null; st.error = ''; } catch (err) { st.parsed = null; st.error = 'Contenu illisible : ' + err.message; } render(); }, 500);
  }
});
document.addEventListener('change', async (e) => {
  const el = e.target, f = el.dataset.f;
  if (f === 'imp-athlete') { S.ui.imp.athlete = el.value; }
  else if (f === 'imp-start') { S.ui.imp.start = el.value; render(); }
  else if (f === 'imp-file' && el.files?.[0]) {
    const st = S.ui.imp; st.json = await el.files[0].text();
    try { st.parsed = parseCycle(st.json); st.error = ''; } catch (err) { st.parsed = null; st.error = 'Fichier illisible : ' + err.message; }
    render();
  } else if (el.dataset.a2 === 'move' && el.value) {
    try { await api.moveSession(el.dataset.id, el.value); const s = S.c.sessions.find((x) => x.id === el.dataset.id); if (s) s.planned_date = el.value; toast('Séance déplacée'); } catch (err) { toast(errMsg(err)); }
  }
});
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form).entries());
  const err = form.querySelector('[data-err]');
  const btn = form.querySelector('[type=submit]');
  const fail = (x) => { if (err) err.textContent = errMsg(x); else toast(errMsg(x)); if (btn) btn.disabled = false; };
  if (btn) btn.disabled = true;
  try {
    switch (form.dataset.form) {
      case 'login': await api.signIn(d.email.trim(), d.password); break;
      case 'signup': {
        const r = await api.signUp(d.email.trim(), d.password, d.name.trim());
        if (!r?.session) { form.innerHTML = `<h1>Vérifie ta boîte mail</h1><p>Un lien de confirmation a été envoyé à <b>${esc(d.email)}</b>. Clique dessus, puis reviens te connecter.</p><a class="btn primary big" href="#/">Me connecter</a>`; return; }
        break;
      }
      case 'forgot': await api.resetPassword(d.email.trim()); form.innerHTML = `<h1>E-mail envoyé</h1><p>Si un compte existe pour <b>${esc(d.email)}</b>, tu vas recevoir un lien pour choisir un nouveau mot de passe.</p><a class="btn" href="#/">Retour</a>`; return;
      case 'newpass': await api.updatePassword(d.password); S.ui.recovery = false; toast('Mot de passe modifié'); await loadProfile(); go('#/'); return;
      case 'profile': {
        const p = await api.updateProfile(form.dataset.id, { full_name: d.full_name || null, sport: d.sport || null, position: d.position || null, custom_question: d.custom_question?.trim() || null });
        Object.assign(S.c.profiles.find((x) => x.id === form.dataset.id), p); toast('Profil enregistré'); render(); return;
      }
      case 'exercise': {
        const row = { name: d.name.trim(), category: d.category || null, video_url: d.video_url.trim() || null, cues: d.cues.trim() || null, home_alt: d.home_alt.trim() || null };
        if (S.ui.exEdit?.id) row.id = S.ui.exEdit.id;
        const saved = await api.upsertExercise(row);
        S.exList = S.exList.filter((x) => x.id !== saved.id).concat(saved).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        S.ex = new Map(S.exList.map((x) => [x.name.toLowerCase(), x]));
        S.ui.exEdit = null; toast('Exercice enregistré'); render(); return;
      }
      case 'invite': await api.invite(d.email, d.name.trim()); await loadCoach(true); toast('Joueur ajouté : envoie-lui le message à droite.'); render(); return;
    }
    if (btn) btn.disabled = false;
  } catch (x) { fail(x); }
});

if ('serviceWorker' in navigator && !params.has('demo')) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* hors ligne non disponible */ });
}
boot();
