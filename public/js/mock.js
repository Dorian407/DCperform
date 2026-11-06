// Mode démo : mêmes fonctions que api.js, avec des données fictives en mémoire.
// Ouvre l'appli avec ?demo=joueur ou ?demo=coach. Rien n'est enregistré.
import { addDays, todayIso, mondayOf } from './util.js';

export const demo = true;
const role = new URLSearchParams(location.search).get('demo') === 'coach' ? 'coach' : 'athlete';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

const COACH = { id: 'coach-1', email: 'coach@exemple.fr', full_name: 'Coach DC Perform', role: 'coach' };
const A1 = { id: 'ath-1', email: 'joueur1@exemple.fr', full_name: 'Joueur Exemple', role: 'athlete', sport: 'Basket', position: 'Arrière', custom_question: 'Ton poignet aujourd\'hui' };
const A2 = { id: 'ath-2', email: 'joueur2@exemple.fr', full_name: 'Joueuse Exemple', role: 'athlete', sport: 'Basket', position: 'Ailière', custom_question: 'Ton genou aujourd\'hui' };
const db = { profiles: [COACH, A1, A2], invitations: [], exercises: [], cycles: [], sessions: [], checkins: [], feedbacks: [], weekly_reports: [] };

const EX = [
  ['Ankle dorsiflexion band', 'Mobilité'], ['Hip complex', 'Mobilité'], ['Glute bridge band', 'Activation et isométrie'],
  ['Pogos', 'Puissance et pliométrie'], ['Trap bar deadlift', 'Force bas du corps', 'RDL haltères'], ['RDL haltères', 'Force bas du corps'],
  ['CMJ', 'Puissance et pliométrie'], ['Bulgarian split squat', 'Force bas du corps'], ['Split jump', 'Puissance et pliométrie'],
  ['Tractions prise neutre', 'Force haut du corps', 'Rowing élastique'], ['Rowing élastique', 'Force haut du corps'],
  ['Pompes sur poignées', 'Force haut du corps'], ['Copenhague plank', 'Gainage'], ['Skater jumps', 'Puissance et pliométrie'],
  ['Spanish squat iso', 'Activation et isométrie'], ['Nordic hamstring curl', 'Force bas du corps'],
];
db.exercises = EX.map(([name, category, home_alt]) => ({ id: uid(), name, category, home_alt: home_alt ?? null, video_url: name === 'CMJ' ? 'https://youtu.be/dQw4w9WgXcQ' : '', cues: name === 'CMJ' ? 'Contre-mouvement rapide, réception amortie.' : '' }));

const blk = (name, minutes, format, sets, rest, items) => ({ name, minutes, format, sets, rest, items: items.map(([n, d]) => ({ name: n, dose: d })) });
function sessionA(home) {
  return [
    blk('Mobilité', 5, '1 tour', null, null, [['Ankle dorsiflexion band', '×6 (D/G)'], ['Hip complex', '×5']]),
    blk('Activation', 8, '2 tours', 2, 30, [['Glute bridge band', '×8'], ['Pogos', '×10']]),
    blk('Power lower body', 20, 'Contraste · 4 séries', 4, 180, home ? [['RDL haltères', '×6'], ['CMJ', '×3']] : [['Trap bar deadlift', '×4 à 80 %'], ['CMJ', '×3']]),
    blk('Unilatéral', 15, '3 séries', 3, 120, [['Bulgarian split squat', '×5 (D/G)'], ['Split jump', '×3 (D/G)']]),
    blk('Upper body', 12, '3 séries', 3, 120, home ? [['Pompes sur poignées', '×12'], ['Rowing élastique', '×12']] : [['Tractions prise neutre', '×6'], ['Pompes sur poignées', '×10']]),
    blk('Accessory', 8, '2 séries', 2, 60, [['Copenhague plank', '20 s (D/G)'], ['Nordic hamstring curl', '×4']]),
  ];
}
function addCycle(athlete, start) {
  const c = { id: uid(), athlete_id: athlete.id, name: 'Cycle exemple · Force-puissance', goal: 'Exemple de cycle de 4 semaines.', start_date: start, weeks: 4,
    week_focus: ['Reprise · RPE 7', 'Montée · RPE 8', 'Pic · RPE 8', 'Allègement · RPE 6'], notes: '' };
  db.cycles.push(c);
  for (let w = 0; w < 4; w++) {
    for (const [code, off, title] of [['A', 0, 'Séance A · Force'], ['B', 2, 'Séance B · Puissance']]) {
      db.sessions.push({ id: uid(), cycle_id: c.id, athlete_id: athlete.id, week: w + 1, planned_date: addDays(start, w * 7 + off), code, title,
        focus: code === 'A' ? 'Force lower + haut du corps' : 'Puissance et appuis', minutes_gym: 70, minutes_home: 65,
        gear_gym: ['Trap bar', 'Haltères', 'Barre de traction', 'Mini-band'], gear_home: ['Haltères', 'Élastiques', 'Mini-band'],
        content_gym: sessionA(false), content_home: sessionA(true), nutri_tip: 'Exemple de tip nutri : un repas avec glucides 2 h avant.',
        target_rpe: 7, version: 'salle', status: 'planned', done_at: null });
    }
  }
}
const start = addDays(mondayOf(todayIso()), -7);
addCycle(A1, start); addCycle(A2, start);
// Historique fictif : semaine passée faite
for (const s of db.sessions.filter((x) => x.planned_date < todayIso())) {
  s.status = 'done'; s.done_at = s.planned_date + 'T10:00:00Z';
  db.feedbacks.push({ id: uid(), session_id: s.id, athlete_id: s.athlete_id, duration_min: 70, rpe: s.athlete_id === A2.id ? 8 : 7, custom_answer: s.athlete_id === A2.id ? 4 : 1,
    pains: s.athlete_id === A2.id ? [{ zone: 'Genou', side: 'D', level: 4 }] : [], comment: 'Données de démonstration', version: 'salle', load: (s.athlete_id === A2.id ? 8 : 7) * 70, created_at: s.planned_date + 'T11:00:00Z' });
  db.checkins.push({ id: uid(), session_id: s.id, athlete_id: s.athlete_id, form: 4, sleep: s.athlete_id === A2.id ? 'mal' : 'bien', pain_before: false, created_at: s.planned_date + 'T09:00:00Z' });
}

const me_ = role === 'coach' ? COACH : A1;
let authCb = null;
let signedIn = true;
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 60));

export async function currentUser() { return signedIn ? { id: me_.id, email: me_.email } : null; }
export function onAuth(cb) { authCb = cb; }
export async function signIn() { signedIn = true; authCb?.('SIGNED_IN', { id: me_.id }); }
export async function signUp() { return { user: null }; }
export async function signOut() { signedIn = false; authCb?.('SIGNED_OUT', null); }
export async function resetPassword() {}
export async function updatePassword() {}
export async function me() { return signedIn ? wait(me_) : null; }
export async function exercises() { return wait(db.exercises); }

export async function mySessions(u) { return wait(db.sessions.filter((s) => s.athlete_id === u)); }
export async function myCycles(u) { return wait(db.cycles.filter((c) => c.athlete_id === u)); }
export async function myFeedbacks(u) { return wait(db.feedbacks.filter((f) => f.athlete_id === u)); }
export async function saveCheckin(row) { const r = { id: uid(), created_at: new Date().toISOString(), ...row }; db.checkins.unshift(r); return wait(r); }
export async function saveFeedback(row) {
  const r = { id: uid(), created_at: new Date().toISOString(), load: row.rpe * row.duration_min, ...row }; db.feedbacks.unshift(r);
  const s = db.sessions.find((x) => x.id === row.session_id); if (s) { s.status = 'done'; s.done_at = r.created_at; s.version = row.version || s.version; }
  return wait(r);
}
export async function setSession(id, { version = null, status = null }) {
  const s = db.sessions.find((x) => x.id === id); if (s && s.status !== 'done') { if (version) s.version = version; if (status) s.status = status; }
}
export async function myWeekly(u, w) { return wait(db.weekly_reports.find((r) => r.athlete_id === u && r.week_start === w) ?? null); }
export async function saveWeekly(row) {
  db.weekly_reports = db.weekly_reports.filter((r) => !(r.athlete_id === row.athlete_id && r.week_start === row.week_start));
  db.weekly_reports.push({ id: uid(), ...row }); return wait(row);
}

export async function profiles() { return wait(db.profiles); }
export async function updateProfile(id, patch) { const p = db.profiles.find((x) => x.id === id); Object.assign(p, patch); return wait(p); }
export async function invitations() { return wait(db.invitations); }
export async function invite(email, full_name) { const r = { email, full_name, role: 'athlete', created_at: new Date().toISOString() }; db.invitations.unshift(r); return wait(r); }
export async function deleteInvitation(email) { db.invitations = db.invitations.filter((i) => i.email !== email); }
export async function allCycles() { return wait(db.cycles); }
export async function allSessions(from) { return wait(db.sessions.filter((s) => s.planned_date >= from)); }
export async function allFeedbacks() { return wait(db.feedbacks); }
export async function allCheckins() { return wait(db.checkins); }
export async function allWeekly() { return wait(db.weekly_reports); }
export async function importCycle(athleteId, startDate, cycle) {
  const c = { id: uid(), athlete_id: athleteId, name: cycle.name, goal: cycle.goal, start_date: startDate, weeks: cycle.weeks ?? 4, week_focus: cycle.week_focus ?? [], notes: cycle.notes };
  db.cycles.push(c);
  for (const s of cycle.sessions) db.sessions.push({ id: uid(), cycle_id: c.id, athlete_id: athleteId, ...s, planned_date: addDays(startDate, s.day_offset ?? 0), version: 'salle', status: 'planned' });
  return wait(c);
}
export async function deleteCycle(id) { db.cycles = db.cycles.filter((c) => c.id !== id); db.sessions = db.sessions.filter((s) => s.cycle_id !== id); }
export async function moveSession(id, date) { const s = db.sessions.find((x) => x.id === id); s.planned_date = date; return wait(s); }
export async function upsertExercise(row) {
  if (row.id) { const e = db.exercises.find((x) => x.id === row.id); Object.assign(e, row); return wait(e); }
  const e = { id: uid(), ...row }; db.exercises.push(e); return wait(e);
}
export async function deleteExercise(id) { db.exercises = db.exercises.filter((e) => e.id !== id); }
