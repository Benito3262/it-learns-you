const URL_ = 'https://qssywpzlxyczxicwumqe.supabase.co/rest/v1/ily_scores'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzc3l3cHpseHljenhpY3d1bXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNDYyNjksImV4cCI6MjEwNjgyMjI2OX0.TuswFvTfjr9OS_E6lgPYJvrne2Str3wdpC14coOzVIU'
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }
export type Score = { name: string; hero: string; time_ms: number; deaths: number; habits: number; combos: number }
function local(): Score[] { try { return JSON.parse(localStorage.getItem('ily_scores') || '[]') } catch { return [] } }
export async function submit(s: Score) {
  const l = local(); l.push(s); l.sort((a, b) => a.time_ms - b.time_ms); localStorage.setItem('ily_scores', JSON.stringify(l.slice(0, 20)))
  try { const r = await fetch(URL_, { method: 'POST', headers: H, body: JSON.stringify(s) }); return r.ok } catch { return false }
}
export async function top(): Promise<{ list: Score[]; global: boolean }> {
  try {
    const r = await fetch(URL_ + '?select=name,hero,time_ms,deaths,habits,combos&order=time_ms.asc&limit=10', { headers: H })
    if (r.ok) return { list: await r.json(), global: true }
  } catch {}
  return { list: local().slice(0, 10), global: false }
}
