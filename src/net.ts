const BASE = 'https://qssywpzlxyczxicwumqe.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzc3l3cHpseHljenhpY3d1bXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNDYyNjksImV4cCI6MjEwNjgyMjI2OX0.TuswFvTfjr9OS_E6lgPYJvrne2Str3wdpC14coOzVIU'
export type Score = { name: string; hero: string; time_ms: number; deaths: number; habits: number; combos: number }
export const session: { token: string; refresh: string; uid: string; email: string; username: string; hero: string } = JSON.parse(localStorage.getItem('ily_sess') || 'null') || { token: '', refresh: '', uid: '', email: '', username: '', hero: 'M' }
const save = () => localStorage.setItem('ily_sess', JSON.stringify(session))
const H = (auth = false) => ({ apikey: KEY, Authorization: 'Bearer ' + (auth && session.token ? session.token : KEY), 'Content-Type': 'application/json' })
async function j(r: Response) { const t = await r.text(); let d: any = {}; try { d = JSON.parse(t) } catch {} ; if (!r.ok) throw new Error(d.msg || d.error_description || d.message || d.error || 'Request failed'); return d }
function setTok(d: any) { session.token = d.access_token; session.refresh = d.refresh_token; session.uid = d.user?.id; session.email = d.user?.email; save() }
export async function signUp(email: string, pw: string) {
  const d = await j(await fetch(BASE + '/auth/v1/signup', { method: 'POST', headers: H(), body: JSON.stringify({ email, password: pw }) }))
  if (d.access_token) { setTok(d); return true }
  return false // email confirmation required
}
export async function signIn(email: string, pw: string) { setTok(await j(await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: H(), body: JSON.stringify({ email, password: pw }) }))) }
export async function restore() {
  if (!session.refresh) return false
  try { setTok(await j(await fetch(BASE + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: H(), body: JSON.stringify({ refresh_token: session.refresh }) }))); return true } catch { signOut(); return false }
}
export function signOut() { Object.assign(session, { token: '', refresh: '', uid: '', email: '', username: '' }); save() }
export async function loadProfile() {
  const d = await j(await fetch(BASE + '/rest/v1/ily_players?select=username,hero&id=eq.' + session.uid, { headers: H(true) }))
  if (d[0]) { session.username = d[0].username; session.hero = d[0].hero; save(); return true }
  return false
}
export async function createProfile(username: string, hero: string) {
  const r = await fetch(BASE + '/rest/v1/ily_players', { method: 'POST', headers: { ...H(true), Prefer: 'return=minimal' }, body: JSON.stringify({ id: session.uid, username, hero }) })
  if (!r.ok) { const t = await r.text(); throw new Error(t.includes('duplicate') ? 'That handle is taken. Pick another.' : t.includes('check') ? 'Handle: 2-20 letters, numbers or _' : 'Could not save profile') }
  session.username = username; session.hero = hero; save()
}
export async function submit(s: Score) {
  const l: Score[] = JSON.parse(localStorage.getItem('ily_scores') || '[]'); l.push(s); l.sort((a, b) => a.time_ms - b.time_ms); localStorage.setItem('ily_scores', JSON.stringify(l.slice(0, 20)))
  try { await restore(); const r = await fetch(BASE + '/rest/v1/ily_scores', { method: 'POST', headers: { ...H(true), Prefer: 'return=minimal' }, body: JSON.stringify({ ...s, user_id: session.uid }) }); return r.ok } catch { return false }
}
export async function top(): Promise<{ list: Score[]; global: boolean }> {
  try { const r = await fetch(BASE + '/rest/v1/ily_scores?select=name,hero,time_ms,deaths,habits,combos&order=time_ms.asc&limit=10', { headers: H() }); if (r.ok) return { list: await r.json(), global: true } } catch {}
  return { list: JSON.parse(localStorage.getItem('ily_scores') || '[]').slice(0, 10), global: false }
}
