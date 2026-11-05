let ctx: AudioContext | null = null, master: GainNode, musicGain: GainNode
export const audio = { muted: localStorage.getItem('ily_mute') === '1', musicOn: true }
function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    master = ctx.createGain(); master.gain.value = audio.muted ? 0 : 0.5; master.connect(ctx.destination)
    musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}
export function unlock() { ac() }
export function setMuted(m: boolean) { audio.muted = m; localStorage.setItem('ily_mute', m ? '1' : '0'); if (ctx) master.gain.value = m ? 0 : 0.5 }
export function tone(f: number, d = 0.12, type: OscillatorType = 'square', v = 0.25, slide = 0, delay = 0, dest?: AudioNode) {
  const c = ac(), t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d)
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d)
  o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + d + 0.02)
}
export function noise(d = 0.15, v = 0.3, hp = 800, delay = 0, dest?: AudioNode) {
  const c = ac(), t = c.currentTime + delay, b = c.createBuffer(1, c.sampleRate * d, c.sampleRate), a = b.getChannelData(0)
  for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length)
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
  f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v; s.buffer = b; s.connect(f); f.connect(g); g.connect(dest || master); s.start(t)
}
export const sfx = {
  punch: () => { noise(0.08, 0.35, 1200); tone(180, 0.08, 'square', 0.15, -80) },
  heavy: () => { noise(0.2, 0.5, 300); tone(90, 0.25, 'sawtooth', 0.3, -50) },
  up: () => { tone(220, 0.18, 'square', 0.18, 500); noise(0.1, 0.3, 1500) },
  whiff: () => noise(0.07, 0.12, 3000),
  jump: () => tone(300, 0.12, 'triangle', 0.18, 300),
  roll: () => noise(0.18, 0.15, 2000),
  hurt: () => { tone(160, 0.25, 'sawtooth', 0.25, -100); noise(0.12, 0.3, 600) },
  block: () => { tone(900, 0.08, 'square', 0.15); tone(1300, 0.1, 'square', 0.1, 0, 0.05) },
  pump: () => { for (let i = 0; i < 6; i++) tone(300 + i * 120, 0.12, 'sawtooth', 0.12, 200, i * 0.03); noise(0.4, 0.3, 200, 0.1) },
  shot: () => { tone(700, 0.15, 'square', 0.12, -500) },
  warn: () => { tone(880, 0.1, 'square', 0.12); tone(880, 0.1, 'square', 0.12, 0, 0.15) },
  ko: () => { noise(0.8, 0.6, 100); tone(110, 1.2, 'sawtooth', 0.35, -80) },
  learn: () => { tone(1200, 0.05, 'square', 0.08) },
  learned: () => { tone(200, 0.6, 'sawtooth', 0.2, -120); tone(150, 0.6, 'square', 0.15, -90, 0.1) },
  ui: () => tone(660, 0.07, 'triangle', 0.2, 200),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.25, 0, i * 0.12)),
}
let musicTimer: any = null, step = 0
const prog = [[55, 65.4], [49, 58.3], [43.6, 52], [49, 61.7]]
export function startMusic(intense = false) {
  stopMusic(); if (!audio.musicOn) return; ac(); step = 0
  const bpm = intense ? 128 : 96, dt = 60 / bpm / 2
  musicTimer = setInterval(() => {
    if (audio.muted) { step++; return }
    const bar = Math.floor(step / 8) % 4, s = step % 8, ch = prog[bar]
    if (s % 2 === 0) tone(ch[0] * (s === 4 ? 2 : 1), dt * 0.9, 'triangle', 0.5, 0, 0, musicGain)
    if (intense) { if (s % 4 === 0) { tone(60, 0.15, 'sine', 0.8, -30, 0, musicGain) } if (s % 4 === 2) noise(0.06, 0.2, 5000, 0, musicGain) }
    if (s === 3 || s === 6) tone(ch[1] * 4, dt * 1.6, 'sine', 0.18, 0, 0, musicGain)
    step++
  }, dt * 1000)
}
export function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null }
