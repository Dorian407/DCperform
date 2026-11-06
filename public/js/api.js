// Toutes les lectures et écritures dans la base Supabase.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { addDays, todayIso } from './util.js';

// Le client Supabase est livré avec l'appli (pas de dépendance à un CDN).
await new Promise((resolve, reject) => {
  if (window.supabase) return resolve();
  const s = document.createElement('script');
  s.src = '/vendor/supabase-2.117.3.js';
  s.onload = resolve;
  s.onerror = () => reject(new Error('Failed to fetch : impossible de charger Supabase'));
  document.head.appendChild(s);
});
const { createClient } = window.supabase;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const demo = false;

// ---------- Compte ----------
export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}
export function onAuth(cb) { sb.auth.onAuthStateChange((event, session) => cb(event, session?.user ?? null)); }
export async function signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); }
export async function signUp(email, password, fullName) {
  return ok(await sb.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: location.origin } }));
}
export async function signOut() { await sb.auth.signOut(); }
export async function resetPassword(email) {
  ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/#/nouveau-mdp' }));
}
export async function updatePassword(password) { ok(await sb.auth.updateUser({ password })); }

export async function me() {
  const user = await currentUser();
  if (!user) return null;
  const rows = ok(await sb.from('profiles').select('*').eq('id', user.id).limit(1));
  return rows[0] ?? { id: user.id, email: user.email, role: 'pending' };
}

// ---------- Commun ----------
export async function exercises() { return ok(await sb.from('exercises').select('*').order('name')); }

// ---------- Joueur ----------
export async function mySessions(uid) {
  return ok(await sb.from('sessions').select('*').eq('athlete_id', uid).order('planned_date'));
}
export async function myCycles(uid) {
  return ok(await sb.from('cycles').select('*').eq('athlete_id', uid).order('start_date', { ascending: false }));
}
export async function myFeedbacks(uid, sinceDays = 70) {
  return ok(await sb.from('feedbacks').select('*').eq('athlete_id', uid)
    .gte('created_at', addDays(todayIso(), -sinceDays)).order('created_at', { ascending: false }));
}
export async function saveCheckin(row) { return ok(await sb.from('checkins').insert(row).select().single()); }
export async function saveFeedback(row) { return ok(await sb.from('feedbacks').insert(row).select().single()); }
export async function setSession(id, { version = null, status = null }) {
  ok(await sb.rpc('athlete_update_session', { p_session: id, p_version: version, p_status: status }));
}
export async function myWeekly(uid, weekStart) {
  const rows = ok(await sb.from('weekly_reports').select('*').eq('athlete_id', uid).eq('week_start', weekStart).limit(1));
  return rows[0] ?? null;
}
export async function saveWeekly(row) {
  return ok(await sb.from('weekly_reports').upsert(row, { onConflict: 'athlete_id,week_start' }).select().single());
}

// ---------- Coach ----------
export async function profiles() { return ok(await sb.from('profiles').select('*').order('full_name')); }
export async function updateProfile(id, patch) { return ok(await sb.from('profiles').update(patch).eq('id', id).select().single()); }
export async function invitations() { return ok(await sb.from('invitations').select('*').order('created_at', { ascending: false })); }
export async function invite(email, fullName) {
  return ok(await sb.from('invitations').upsert({ email: email.trim().toLowerCase(), full_name: fullName || null, role: 'athlete' }).select().single());
}
export async function deleteInvitation(email) { ok(await sb.from('invitations').delete().eq('email', email)); }

export async function allCycles() { return ok(await sb.from('cycles').select('*').order('start_date', { ascending: false })); }
export async function allSessions(fromIso) {
  return ok(await sb.from('sessions').select('*').gte('planned_date', fromIso).order('planned_date'));
}
export async function allFeedbacks(sinceDays = 70) {
  return ok(await sb.from('feedbacks').select('*').gte('created_at', addDays(todayIso(), -sinceDays)).order('created_at', { ascending: false }));
}
export async function allCheckins(sinceDays = 21) {
  return ok(await sb.from('checkins').select('*').gte('created_at', addDays(todayIso(), -sinceDays)).order('created_at', { ascending: false }));
}
export async function allWeekly(sinceDays = 42) {
  return ok(await sb.from('weekly_reports').select('*').gte('week_start', addDays(todayIso(), -sinceDays)));
}

export async function importCycle(athleteId, startDate, cycle) {
  const c = ok(await sb.from('cycles').insert({
    athlete_id: athleteId, name: cycle.name, goal: cycle.goal ?? null, start_date: startDate,
    weeks: cycle.weeks ?? 4, week_focus: cycle.week_focus ?? [], notes: cycle.notes ?? null,
  }).select().single());
  const rows = cycle.sessions.map((s) => ({
    cycle_id: c.id, athlete_id: athleteId, week: s.week ?? null, planned_date: addDays(startDate, s.day_offset ?? 0),
    code: s.code ?? null, title: s.title, focus: s.focus ?? null,
    minutes_gym: s.minutes_gym ?? null, minutes_home: s.minutes_home ?? null,
    gear_gym: s.gear_gym ?? [], gear_home: s.gear_home ?? [],
    content_gym: s.content_gym ?? [], content_home: s.content_home ?? null,
    nutri_tip: s.nutri_tip ?? null, target_rpe: s.target_rpe ?? null,
  }));
  try { ok(await sb.from('sessions').insert(rows)); }
  catch (e) { await sb.from('cycles').delete().eq('id', c.id); throw e; }
  return c;
}
export async function deleteCycle(id) { ok(await sb.from('cycles').delete().eq('id', id)); }
export async function moveSession(id, date) { return ok(await sb.from('sessions').update({ planned_date: date }).eq('id', id).select().single()); }

export async function upsertExercise(row) {
  if (row.id) return ok(await sb.from('exercises').update(row).eq('id', row.id).select().single());
  return ok(await sb.from('exercises').insert(row).select().single());
}
export async function deleteExercise(id) { ok(await sb.from('exercises').delete().eq('id', id)); }
