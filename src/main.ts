import Phaser from 'phaser'
import { sfx, unlock, setMuted, audio, startMusic, stopMusic } from './audio'
import { submit, top, session, restore, loadProfile, signIn, signUp, signOut, createProfile } from './net'
import { HABITS, BOSS_LINES, DEATH, DEATH_SUB, pick } from './text'
import { ARENAS, HOME, paintArena } from './arenas'

const W = 1280, H = 720, FY = 612
const Q = new URLSearchParams(location.search)
const DEMO = Q.has('demo')
const FONT = '"Lilita One", Impact, sans-serif'
const BOSSES = [
  { key: 'stoploss', name: 'STOP LOSS', sub: 'Twitchy. Punishes standing still.', hp: 220, speed: 250, h: 270, flip: true, tint: [0x3a1620, 0x7a2a2a], native: 'still' },
  { key: 'exitliq', name: 'EXIT LIQUIDITY', sub: 'The walls close in. Punishes corner campers.', hp: 260, speed: 130, h: 290, flip: false, tint: [0x1c1638, 0x4a2f7a], native: 'walls' },
  { key: 'rugpull', name: 'RUG PULL', sub: 'Pulls the floor where you stand most.', hp: 260, speed: 190, h: 280, flip: true, tint: [0x231a33, 0x6b3f6e], native: 'tiles' },
  { key: 'bear', name: 'BEAR SZN', sub: 'Remembers everything. Uses all of it.', hp: 420, speed: 200, h: 330, flip: false, tint: [0x1a1410, 0x5a3420], native: 'all' },
]
const MOVES: Record<string, { dmg: number; range: number; dur: number; a0: number; a1: number; kb: number; label: string; launch?: number; meter: number }> = {
  punch: { dmg: 6, range: 125, dur: 0.24, a0: 0.06, a1: 0.13, kb: 90, label: 'PUNCH', meter: 6 },
  uppercut: { dmg: 9, range: 120, dur: 0.34, a0: 0.07, a1: 0.16, kb: 60, launch: 720, label: 'UPPERCUT', meter: 9 },
  finisher: { dmg: 15, range: 150, dur: 0.42, a0: 0.1, a1: 0.22, kb: 420, label: '3-HIT FINISHER', meter: 12 },
  heavy: { dmg: 24, range: 160, dur: 0.45, a0: 0.08, a1: 0.2, kb: 560, label: 'POWER PUNCH', meter: 14 },
  dash: { dmg: 13, range: 150, dur: 0.32, a0: 0.02, a1: 0.2, kb: 300, label: 'DASH STRIKE', meter: 10 },
  sweep: { dmg: 8, range: 150, dur: 0.34, a0: 0.06, a1: 0.18, kb: 60, label: 'LOW SWEEP', meter: 9 },
  air: { dmg: 7, range: 120, dur: 0.22, a0: 0.04, a1: 0.14, kb: 80, label: 'AIR COMBO', meter: 7 },
  squeeze: { dmg: 3, range: 130, dur: 0.9, a0: 0.05, a1: 0.85, kb: 20, label: 'SHORT SQUEEZE', meter: 0 },
  slam: { dmg: 16, range: 130, dur: 0.4, a0: 0.0, a1: 0.4, kb: 200, label: 'DOWN SLAM', meter: 10 },
}
const hl = (k: string) => run.lines[k] || (run.lines[k] = pick(HABITS[k]?.lines || ['You have a habit. It has notes.']))

// ---------- run state ----------
type Stats = { block: number; rolls: [number, number]; heat: number[]; still: number; t: number; jumps: number; moves: Record<string, number>; low: number; lowRetreat: number }
const newStats = (): Stats => ({ block: 0, rolls: [0, 0], heat: [0, 0, 0], still: 0, t: 0, jumps: 0, moves: {}, low: 0, lowRetreat: 0 })
const run = { arena: 'home', lines: {} as Record<string, string>, hero: 'heroM', start: 0, time: 0, deaths: 0, learned: [] as string[], combos: 0, moveUse: {} as Record<string, number>, boss: 0, total: newStats(), settings: { shake: localStorage.getItem('ily_shake') !== '0', touch: 'ontouchstart' in window } }

function analyze(s: Stats, max = 2): string[] {
  const out: string[] = [], has = (k: string) => run.learned.includes(k) || out.includes(k)
  const add = (k: string) => { if (!has(k) && out.length < max) out.push(k) }
  const thr = DEMO ? 2 : 3, rt = s.rolls[0] + s.rolls[1]
  if (rt >= thr && s.rolls[0] / rt >= 0.7) add('dodgeL')
  if (rt >= thr && s.rolls[1] / rt >= 0.7) add('dodgeR')
  const mv = Object.entries(s.moves).sort((a, b) => b[1] - a[1]), tm = mv.reduce((a, b) => a + b[1], 0)
  if (mv.length && mv[0][1] >= 6 && mv[0][1] / tm > 0.5 && HABITS['spam_' + mv[0][0]]) add('spam_' + mv[0][0])
  if (s.t > 8 && s.jumps / s.t > 0.25) add('jumper')
  if (s.t > 8 && s.still / s.t > 0.3) add('still')
  const ht = s.heat[0] + s.heat[1] + s.heat[2]
  if (ht > 8) { const i = s.heat.indexOf(Math.max(...s.heat)); if (s.heat[i] / ht > 0.55) add(['campL', 'campM', 'campR'][i]) }
  if (s.low > 2 && s.lowRetreat / s.low > 0.55) add('runLow')
  if (s.t > 8 && s.block / s.t > 0.3) add('turtle')
  if ((s.moves['grab'] || 0) >= 4) add('grabby')
  if (s.t > 15 && rt === 0) add('noDodge')
  return out
}
const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

// ---------- input ----------
const inp = { block: false, grab: false, special2: false, pause: false, left: false, right: false, jump: false, down: false, atk: false, special: false, dodge: false, dash: false }
const prev = { ...inp }
const pressed = (k: keyof typeof inp) => inp[k] && !prev[k]
const released = (k: keyof typeof inp) => !inp[k] && prev[k]

function bindKeys(scene: Phaser.Scene) {
  const kb = scene.input.keyboard!, K = Phaser.Input.Keyboard.KeyCodes
  const map: [keyof typeof inp, number[]][] = [['left', [K.LEFT, K.A]], ['right', [K.RIGHT, K.D]], ['jump', [K.UP, K.W, K.SPACE]], ['down', [K.DOWN, K.S]], ['atk', [K.J, K.Z]], ['special', [K.K, K.X]], ['dodge', [K.L, K.C]], ['dash', [K.SHIFT]], ['block', [K.I]], ['grab', [K.U]], ['special2', [K.O]], ['pause', [K.ESC, K.P]]]
  const keys = map.map(([n, cs]) => [n, cs.map(c => kb.addKey(c, true))] as const)
  return () => { if (DEMO) return; for (const [n, ks] of keys) (inp as any)[n] = ks.some(k => k.isDown) || (touch as any)[n] }
}
const touch: any = {}

function btn(scene: Phaser.Scene, x: number, y: number, label: string, cb: () => void, w = 300) {
  const c = scene.add.container(x, y)
  const g = scene.add.graphics()
  const draw = (hover: boolean) => { g.clear(); g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 4, -28 + 6, w, 60, 18); g.fillStyle(hover ? 0xffd966 : 0xf5c84c).fillRoundedRect(-w / 2, -30, w, 60, 18); g.lineStyle(3, 0x7a5a10).strokeRoundedRect(-w / 2, -30, w, 60, 18) }
  draw(false)
  const t = scene.add.text(0, 0, label, { fontFamily: FONT, fontSize: '28px', color: '#3b2600' }).setOrigin(0.5)
  c.add([g, t]); c.setSize(w, 60).setInteractive({ useHandCursor: true })
  c.on('pointerover', () => { draw(true); scene.tweens.add({ targets: c, scale: 1.06, duration: 120 }) })
  c.on('pointerout', () => { draw(false); scene.tweens.add({ targets: c, scale: 1, duration: 120 }) })
  c.on('pointerdown', () => { unlock(); sfx.ui(); cb() })
  return c
}
function bg(scene: Phaser.Scene, c1 = 0x1e1834, c2 = 0x5a3a6a) {
  const g = scene.add.graphics()
  g.fillGradientStyle(c1, c1, c2, c2, 1).fillRect(0, 0, W, H)
  // skyline of candles
  for (let i = 0; i < 26; i++) {
    const x = i * 52 + 10, h = 60 + ((i * 97) % 170), up = (i * 7) % 3 !== 0
    g.fillStyle(up ? 0x2fbf71 : 0xd9534f, 0.18).fillRect(x, FY - 120 - h, 26, h); g.fillRect(x + 12, FY - 140 - h, 3, h + 40)
  }
  return g
}
function goLandscape() {
  if (!('ontouchstart' in window)) return
  try { const el: any = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.then?.(() => (screen.orientation as any)?.lock?.('landscape').catch(() => {})).catch(() => {}) } catch {}
}
function authScreen(done: () => void) {
  let mode = localStorage.getItem('ily_sess') ? 'in' : 'up'
  const needProfile = () => {
    overlay(`<h2>CLAIM YOUR HANDLE</h2><p>One handle per wallet. It goes on the leaderboard, so choose wisely.</p>
<label>Username or X handle</label><input id="hn" maxlength="20" placeholder="e.g. trextxxy" value="${esc(localStorage.getItem('ily_pending') || '')}">
<label>Main fighter</label><div class="row"><button id="hm" class="alt">HIM</button><button id="hf" class="alt">HER</button></div>
<button id="go" style="width:100%">Lock it in</button><div class="err" id="er"></div>`)
    let hero = 'M'; const $ = (i: string) => document.getElementById(i) as any
    const hi = () => { $('hm').className = hero === 'M' ? '' : 'alt'; $('hf').className = hero === 'F' ? '' : 'alt' }; hi()
    $('hm').onclick = () => { hero = 'M'; hi() }; $('hf').onclick = () => { hero = 'F'; hi() }
    $('go').onclick = async () => { const u = $('hn').value.trim().replace(/^@/, ''); $('er').textContent = ''; try { await createProfile(u, hero); done() } catch (e: any) { $('er').textContent = e.message } }
  }
  const draw = () => {
    overlay(`<h2>${mode === 'up' ? 'REGISTER TO FIGHT' : 'WELCOME BACK'}</h2><p>${mode === 'up' ? 'The bosses need to know who they are studying.' : 'They remember you. Log in.'}</p>
<label>Email</label><input id="em" type="email" autocomplete="email" placeholder="you@domain.com">
<label>Password</label><input id="pw" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" placeholder="8+ characters">
${mode === 'up' ? '<label>Username or X handle</label><input id="hn" maxlength="20" placeholder="e.g. trextxxy">' : ''}
<button id="go" style="width:100%">${mode === 'up' ? 'Create account' : 'Log in'}</button>
<button id="sw" class="alt" style="width:100%">${mode === 'up' ? 'Have an account? Log in' : 'New here? Register'}</button><div class="err" id="er"></div>`)
    const $ = (i: string) => document.getElementById(i) as any
    $('sw').onclick = () => { mode = mode === 'up' ? 'in' : 'up'; draw() }
    $('go').onclick = async () => {
      const em = $('em').value.trim(), pw = $('pw').value; $('er').textContent = ''
      if (!/^\S+@\S+\.\S+$/.test(em)) { $('er').textContent = 'That email looks like a scam address.'; return }
      if (pw.length < 8) { $('er').textContent = 'Password needs 8+ characters. This is not a seed phrase, but still.'; return }
      $('go').disabled = true
      try {
        if (mode === 'up') {
          const hn = ($('hn').value || '').trim().replace(/^@/, '')
          if (!/^[A-Za-z0-9_]{2,20}$/.test(hn)) throw new Error('Handle: 2-20 letters, numbers or _')
          localStorage.setItem('ily_pending', hn)
          const live = await signUp(em, pw)
          if (!live) { mode = 'in'; draw(); document.getElementById('er')!.textContent = 'Check your inbox to confirm your email, then log in here.'; return }
        } else await signIn(em, pw)
        if (await loadProfile()) done(); else if (mode === 'up' && localStorage.getItem('ily_pending')) { try { await createProfile(localStorage.getItem('ily_pending')!, 'M'); done() } catch { needProfile() } } else needProfile()
      } catch (e: any) { $('er').textContent = e.message; $('go').disabled = false }
    }
  }
  draw()
}
function overlay(html: string) { const o = document.getElementById('ov')!; document.getElementById('ovc')!.innerHTML = html; o.style.display = html ? 'flex' : 'none' }

// ---------- scenes ----------
class Boot extends Phaser.Scene {
  constructor() { super('boot') }
  preload() {
    const L = this.add.text(W / 2, H / 2, 'Loading…', { fontFamily: FONT, fontSize: '40px' }).setOrigin(0.5)
    this.load.on('progress', (p: number) => L.setText('Loading… ' + Math.round(p * 100) + '%'))
    for (const k of ['heroM', 'heroF', 'stoploss', 'exitliq', 'rugpull', 'bear']) this.load.image(k, 'sprites/' + k + '.png')
  }
  create() {
    const g = this.make.graphics({}, false); g.fillStyle(0xffffff).fillCircle(8, 8, 8); g.generateTexture('dot', 16, 16)
    g.clear(); g.fillStyle(0xffffff).fillRect(0, 0, 6, 6); g.generateTexture('sq', 6, 6)
    document.fonts?.ready.then(() => this.start()); setTimeout(() => this.start(), 1500)
  }
  started = false
  start() {
    if (this.started) return; this.started = true
    if (DEMO) { run.hero = Q.get('hero') === 'F' ? 'heroF' : 'heroM'; run.boss = +(Q.get('boss') || 0); run.start = performance.now(); this.scene.start('fight') }
    else this.auth()
  }
  async auth() {
    const ok = (await restore()) && (await loadProfile().catch(() => false))
    if (ok) { run.hero = session.hero === 'F' ? 'heroF' : 'heroM'; this.scene.start('title'); return }
    authScreen(() => { run.hero = session.hero === 'F' ? 'heroF' : 'heroM'; overlay(''); this.scene.start('title') })
  }
}

class Title extends Phaser.Scene {
  constructor() { super('title') }
  create() {
    overlay(''); paintArena(this, 'roof')
    const hero = this.add.image(250, FY + 40, 'heroM').setOrigin(0.5, 1).setScale(0.55)
    const her = this.add.image(1040, FY + 40, 'heroF').setOrigin(0.5, 1).setScale(0.55).setFlipX(true)
    const bear = this.add.image(W / 2, FY + 70, 'bear').setOrigin(0.5, 1).setScale(0.62).setAlpha(0.35).setTint(0x553344)
    this.tweens.add({ targets: [hero, her], scaleY: 0.57, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.tweens.add({ targets: bear, scale: 0.66, alpha: 0.5, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    const t = this.add.text(W / 2, 110, 'IT LEARNS YOU', { fontFamily: FONT, fontSize: '104px', color: '#f5c84c', stroke: '#2a1600', strokeThickness: 12 }).setOrigin(0.5)
    t.setShadow(0, 8, '#000', 12, true, true)
    this.tweens.add({ targets: t, y: 118, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.add.text(W / 2, 188, 'Four bosses. One dataset. The dataset is you.', { fontFamily: 'Nunito', fontSize: '24px', color: '#fff', fontStyle: '800', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5)
    this.add.text(W / 2, 222, 'gm, @' + (session.username || 'anon'), { fontFamily: 'Nunito', fontSize: '18px', color: '#7dffb0', fontStyle: '800', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5)
    btn(this, W / 2, 290, 'APE IN', () => { goLandscape(); this.scene.start('select') })
    btn(this, W / 2, 365, 'READ THE DOCS', () => this.scene.start('howto'))
    btn(this, W / 2, 440, 'LEADERBOARD', () => showBoard(() => this.scene.restart()))
    btn(this, W / 2, 515, 'SETTINGS', () => this.scene.start('settings'))
    const lo = this.add.text(W - 20, H - 20, 'log out', { fontFamily: 'Nunito', fontSize: '16px', color: '#ddd' }).setOrigin(1).setInteractive({ useHandCursor: true })
    lo.on('pointerdown', () => { signOut(); location.reload() })
    const ticker = Object.values(HABITS).map(h => 'IT LEARNED: ' + h.lines[0])
    const tk = this.add.text(W / 2, 680, '', { fontFamily: 'monospace', fontSize: '20px', color: '#ffb0b0', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5)
    let i = 0; const nx = () => { tk.setText(ticker[i++ % ticker.length]).setAlpha(0); this.tweens.add({ targets: tk, alpha: 1, duration: 300 }) }; nx()
    this.time.addEvent({ delay: 2600, loop: true, callback: nx })
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('select'))
  }
}

class Select extends Phaser.Scene {
  constructor() { super('select') }
  create() {
    bg(this, 0x16233a, 0x2f5a6a)
    this.add.text(W / 2, 60, 'PICK YOUR WALLET', { fontFamily: FONT, fontSize: '60px', color: '#f5c84c', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5)
    const pick_ = (k: string) => { run.hero = k; this.scene.start('arena') }
    ;([['heroM', 380, 'HIM', 'Special: GREEN CANDLE beam'], ['heroF', 900, 'HER', 'Special: SHORT SQUEEZE flurry']] as const).forEach(([k, x, n, sp]) => {
      const g = this.add.graphics(); g.fillStyle(0xffffff, 0.08).fillRoundedRect(x - 190, 110, 380, 470, 30)
      const im = this.add.image(x, 540, k).setOrigin(0.5, 1).setScale(0.64).setInteractive({ useHandCursor: true })
      this.tweens.add({ targets: im, scaleY: 0.66, duration: 800 + x / 3, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      this.add.text(x, 560, sp, { fontFamily: 'Nunito', fontStyle: '800', fontSize: '18px', color: '#7dffb0' }).setOrigin(0.5)
      im.on('pointerdown', () => { unlock(); sfx.ui(); pick_(k) })
      btn(this, x, 640, 'PLAY ' + n, () => pick_(k), 260)
    })
  }
}

class Arena extends Phaser.Scene {
  constructor() { super('arena') }
  create() {
    bg(this, 0x1e1834, 0x3a2a5a)
    this.add.text(W / 2, 50, 'CHOOSE YOUR CHART', { fontFamily: FONT, fontSize: '56px', color: '#f5c84c', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5)
    const go = (a: string) => { run.arena = a; run.start = performance.now(); run.deaths = 0; run.learned = []; run.lines = {}; run.combos = 0; run.moveUse = {}; run.boss = 0; run.total = newStats(); this.scene.start('fight') }
    ARENAS.forEach((a, i) => {
      const x = 180 + (i % 2) * 460 + 160, y = 140 + Math.floor(i / 2) * 230
      const rt = this.add.renderTexture(0, 0, W, H).setVisible(false)
      const objs = paintArena(this, a.key); rt.draw(objs as any); objs.forEach(o => o.destroy())
      rt.saveTexture('thumb_' + a.key)
      const im = this.add.image(x, y + 90, 'thumb_' + a.key).setDisplaySize(400, 170).setInteractive({ useHandCursor: true })
      this.add.text(x, y + 190, a.name.toUpperCase(), { fontFamily: FONT, fontSize: '26px', color: '#fff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5)
      this.add.text(x, y + 216, a.sub, { fontFamily: 'Nunito', fontStyle: '800', fontSize: '15px', color: '#cfe' }).setOrigin(0.5)
      im.on('pointerover', () => im.setTint(0xfff2c0)); im.on('pointerout', () => im.clearTint())
      im.on('pointerdown', () => { sfx.ui(); go(a.key) })
    })
    btn(this, 1110, 330, 'HOME TURF', () => go('home'), 260)
    this.add.text(1110, 380, 'each boss fights\nin its own arena', { fontFamily: 'Nunito', fontStyle: '800', fontSize: '15px', color: '#cfe', align: 'center' }).setOrigin(0.5, 0)
  }
}

class HowTo extends Phaser.Scene {
  constructor() { super('howto') }
  create() {
    paintArena(this, 'floor'); this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6)
    this.add.text(W / 2, 36, 'THE DOCS (nobody reads these. You did. Bullish.)', { fontFamily: FONT, fontSize: '34px', color: '#f5c84c', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5)
    const rows = [
      ['Move / Jump', 'A D / Arrows · W or Space', 'Walk. Jump. Touch no grass.'],
      ['Punch · Uppercut · Finisher', 'J · J J · J J J', 'Tap, double tap (launches), triple tap'],
      ['Power Punch', 'Hold J, release', 'Charge it like gas fees'],
      ['Low Sweep', 'Down + J', 'Knocks it off its feet'],
      ['Air Combo · Down Slam', 'J in air · Down + J in air', 'Up to 3 air hits, then crash down'],
      ['Dash Strike', 'Shift, then J', 'Close distance, front-run the boss'],
      ['Grab & Throw', 'U (up close)', 'Throw it into a wall for a bounce'],
      ['Block · Parry', 'Hold I · tap I as it hits', 'Guard drains a meter. Perfect timing stuns and reflects'],
      ['Dodge Roll', 'L (+ direction)', 'Invincible. Roll late for PERFECT DODGE slow-mo'],
      ['PUMP Blast', 'K (meter full)', 'Big green energy'],
      ['Hero Special', 'O (half meter)', 'HIM: Green Candle beam · HER: Short Squeeze flurry'],
      ['Pause / Quit', 'Esc or P', 'Resume, restart, or rage quit'],
    ]
    rows.forEach((r, i) => {
      const y = 82 + i * 42
      this.add.text(70, y, r[0], { fontFamily: FONT, fontSize: '23px', color: '#7dffb0' })
      this.add.text(430, y + 2, r[1], { fontFamily: 'Nunito', fontStyle: '800', fontSize: '20px', color: '#fff' })
      this.add.text(760, y + 4, r[2], { fontFamily: 'Nunito', fontSize: '17px', color: '#dde' })
    })
    this.add.text(W / 2, 600, 'The catch: every boss is watching. Die, and it tells you exactly what it LEARNED, then\ncomes back built to punish it. Change your style or stay exit liquidity. Bear Szn uses everything.', { fontFamily: 'Nunito', fontStyle: '800', fontSize: '19px', color: '#ffd9a0', align: 'center' }).setOrigin(0.5)
    btn(this, W / 2, 672, 'GOT IT', () => this.scene.start('title'))
  }
}

class Settings extends Phaser.Scene {
  constructor() { super('settings') }
  create() {
    bg(this)
    this.add.text(W / 2, 90, 'SETTINGS', { fontFamily: FONT, fontSize: '60px', color: '#f5c84c', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5)
    const mk = (y: number, label: () => string, f: () => void) => { const b = btn(this, W / 2, y, label(), () => { f(); (b.list[1] as Phaser.GameObjects.Text).setText(label()) }, 460); return b }
    mk(220, () => 'SOUND: ' + (audio.muted ? 'OFF' : 'ON'), () => setMuted(!audio.muted))
    mk(310, () => 'MUSIC: ' + (audio.musicOn ? 'ON' : 'OFF'), () => { audio.musicOn = !audio.musicOn })
    mk(400, () => 'SCREEN SHAKE: ' + (run.settings.shake ? 'ON' : 'OFF'), () => { run.settings.shake = !run.settings.shake; localStorage.setItem('ily_shake', run.settings.shake ? '1' : '0') })
    mk(490, () => 'TOUCH BUTTONS: ' + (run.settings.touch ? 'ON' : 'OFF'), () => { run.settings.touch = !run.settings.touch })
    btn(this, W / 2, 620, 'BACK', () => this.scene.start('title'))
  }
}

type Proj = { o: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle; vx: number; vy: number; dmg: number; fromBoss: boolean; life: number; big?: boolean }
class Fight extends Phaser.Scene {
  constructor() { super('fight') }
  B: any; p: any; boss: any; pImg!: Phaser.GameObjects.Image; bImg!: Phaser.GameObjects.Image
  ui!: Phaser.GameObjects.Graphics; fx!: Phaser.GameObjects.Graphics; timerT!: Phaser.GameObjects.Text; info!: Phaser.GameObjects.Text
  emit!: Phaser.GameObjects.Particles.ParticleEmitter; projs: Proj[] = []; hazards: any[] = []
  stats!: Stats; freeze = 0; slow = 1; phase = 'intro'; readKeys!: () => void
  walls = { l: 40, r: 1240 }; tiles: { gone: number; warn: number }[] = []; tileHeat: number[] = []; tileT = 0
  tapCount = 0; lastTap = 0; holdT = 0; stillT = 0; lastPX = 0; lowPrev = 0; demoT = 0; demoLife = 0; retry = false; active: string[] = []
  init(d: any) { this.retry = !!d?.retry; (window as any).__fight = this }
  create() {
    this.B = BOSSES[run.boss]; const B = this.B
    const AK = run.arena === 'home' ? HOME[run.boss] : run.arena; this.arenaKey = AK
    paintArena(this, AK); this.add.rectangle(W / 2, H / 2, W, H, B.tint[1], 0.12)
    const fl = this.add.graphics(); fl.fillStyle(ARENAS.find(a => a.key === AK)!.floor, 1).fillRect(0, FY, W, H - FY); fl.fillStyle(0x000000, 0.25).fillRect(0, FY, W, H - FY); fl.fillStyle(0xffffff, 0.08).fillRect(0, FY, W, 4)
    this.fx = this.add.graphics()
    this.stats = newStats(); this.projs = []; this.hazards = []; this.freeze = 0; this.slow = 1; this.tapCount = 0; this.holdT = 0; this.stillT = 0
    this.walls = { l: 40, r: 1240 }; this.tiles = Array.from({ length: 12 }, () => ({ gone: 0, warn: 0 })); this.tileHeat = new Array(12).fill(0); this.tileT = 4
    const ph = 200
    this.p = { x: 330, y: FY, vx: 0, vy: 0, face: 1, hp: DEMO && !this.retry && run.boss === 0 ? 12 : 100, meter: DEMO ? 60 : 0, st: 'idle', t: 0, move: '', hit: false, iframe: 0, ground: true, h: ph, dashT: 0, rollDir: 0 }
    this.boss = { x: 960, y: FY, vy: 0, face: -1, hp: B.hp, max: B.hp, st: 'idle', t: 1.2, cd: 1.2, hit: false, air: false, armor: 0, flash: 0, atk: '', tx: 0, sniper: 0, blocked: 0 }
    if (DEMO && this.retry) this.boss.hp = this.boss.max = 70
    this.add.ellipse(0, 0, 10, 10).setVisible(false)
    this.pImg = this.add.image(this.p.x, FY, run.hero).setOrigin(0.5, 1); this.pImg.setScale(ph / this.pImg.height)
    this.bImg = this.add.image(this.boss.x, FY, B.key).setOrigin(0.5, 1); this.bImg.setScale(B.h / this.bImg.height)
    this.emit = this.add.particles(0, 0, 'dot', { speed: { min: 150, max: 520 }, scale: { start: 0.9, end: 0 }, lifespan: 420, gravityY: 900, emitting: false, tint: [0xffe066, 0xffffff, 0xff9f43] })
    this.ui = this.add.graphics().setDepth(50)
    this.timerT = this.add.text(W / 2, 22, '', { fontFamily: FONT, fontSize: '34px', color: '#fff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5, 0).setDepth(51)
    this.add.text(40, 18, run.hero === 'heroF' ? 'YOU (HER)' : 'YOU (HIM)', { fontFamily: FONT, fontSize: '22px', color: '#7dffb0', stroke: '#000', strokeThickness: 5 }).setDepth(51)
    this.add.text(W - 40, 18, B.name, { fontFamily: FONT, fontSize: '22px', color: '#ff8f8f', stroke: '#000', strokeThickness: 5 }).setOrigin(1, 0).setDepth(51)
    this.info = this.add.text(W / 2, 80, 'Boss ' + (run.boss + 1) + '/4 · Deaths ' + run.deaths + ' · Habits caught ' + run.learned.length, { fontFamily: 'Nunito', fontStyle: '800', fontSize: '17px', color: '#ddd' }).setOrigin(0.5, 0).setDepth(51)
    // counters active this fight
    this.active = run.boss === 3 ? [...run.learned] : run.learned.slice(-3)
    if (this.active.length) this.add.text(W / 2, 104, 'COUNTERS ARMED: ' + this.active.map(k => hl(k)).join(' · '), { fontFamily: 'Nunito', fontStyle: '800', fontSize: '14px', color: '#ff9f9f', wordWrap: { width: 1000 }, align: 'center' }).setOrigin(0.5, 0).setDepth(51)
    this.readKeys = bindKeys(this)
    if (run.settings.touch && !DEMO) this.touchUI()
    const mute = this.add.text(W - 40, 54, audio.muted ? '🔇' : '🔊', { fontSize: '26px' }).setOrigin(1, 0).setDepth(52).setInteractive({ useHandCursor: true })
    mute.on('pointerdown', () => { setMuted(!audio.muted); mute.setText(audio.muted ? '🔇' : '🔊') })
    this.input.keyboard!.on('keydown-M', () => { setMuted(!audio.muted); mute.setText(audio.muted ? '🔇' : '🔊') })
    const pz = this.add.text(W / 2 + 120, 22, 'II', { fontFamily: FONT, fontSize: '30px', color: '#fff', backgroundColor: '#0007', padding: { x: 12, y: 2 } }).setDepth(52).setInteractive({ useHandCursor: true })
    pz.on('pointerdown', () => this.pause())
    this.intro()
  }
  pause() {
    if (this.phase !== 'fight' || DEMO) return
    this.scene.pause(); stopMusic()
    const resume = () => { overlay(''); document.removeEventListener('keydown', kd); this.scene.resume(); startMusic(true); for (const k in inp) (inp as any)[k] = false; Object.assign(prev, inp) }
    const kd = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'p') resume() }
    setTimeout(() => document.addEventListener('keydown', kd), 50)
    overlay(`<h2>PAUSED</h2><p>Funds are frozen. Unlike the timer, which isn't.</p><button id="rs" style="width:100%">Resume</button><button id="rt" class="alt" style="width:100%">Restart fight</button><button id="qt" class="alt" style="width:100%">Quit to menu</button><div class="err" id="er"></div>`)
    const $ = (i: string) => document.getElementById(i) as any
    $('rs').onclick = resume
    $('rt').onclick = () => { overlay(''); document.removeEventListener('keydown', kd); this.scene.resume(); this.scene.restart({ retry: true }) }
    let sure = false
    $('qt').onclick = () => { if (!sure) { sure = true; $('qt').textContent = 'Sure? Run progress is lost. Tap again'; return } overlay(''); document.removeEventListener('keydown', kd); this.scene.resume(); stopMusic(); this.scene.start('title') }
  }
  touchUI() {
    this.input.addPointer(3)
    const mk = (x: number, y: number, r: number, label: string, k: string) => {
      const c = this.add.circle(x, y, r, 0xffffff, 0.16).setStrokeStyle(3, 0xffffff, 0.4).setDepth(60).setInteractive()
      this.add.text(x, y, label, { fontFamily: FONT, fontSize: r > 50 ? '24px' : '18px', color: '#fff' }).setOrigin(0.5).setDepth(61).setAlpha(0.85)
      c.on('pointerdown', () => { unlock(); touch[k] = true; c.setFillStyle(0xf5c84c, 0.5) })
      const up = () => { touch[k] = false; c.setFillStyle(0xffffff, 0.16) }; c.on('pointerup', up); c.on('pointerout', up)
    }
    mk(85, 625, 54, '◀', 'left'); mk(215, 625, 54, '▶', 'right'); mk(150, 520, 44, '▲', 'jump'); mk(150, 690, 30, '▼', 'down')
    mk(1185, 610, 64, 'HIT', 'atk'); mk(1060, 660, 42, 'ROLL', 'dodge'); mk(1050, 555, 42, 'BLOCK', 'block'); mk(1110, 470, 40, 'GRAB', 'grab')
    mk(1205, 470, 40, 'PUMP', 'special'); mk(1205, 375, 38, 'HERO', 'special2'); mk(1105, 375, 38, 'DASH', 'dash')
  }
  intro() {
    this.phase = 'intro'; const B = this.B
    const band = this.add.rectangle(W / 2, H / 2, W, 190, 0x000000, 0.75).setDepth(70)
    const n = this.add.text(-400, H / 2 - 30, B.name, { fontFamily: FONT, fontSize: '96px', color: '#f5c84c', stroke: '#2a1600', strokeThickness: 10 }).setOrigin(0.5).setDepth(71)
    const s = this.add.text(W + 400, H / 2 + 50, (run.boss === 3 ? 'FINAL BOSS — ' : 'BOSS ' + (run.boss + 1) + ' — ') + pick(BOSS_LINES[B.key].intro), { fontFamily: 'Nunito', fontStyle: '800', fontSize: '26px', color: '#fff' }).setOrigin(0.5).setDepth(71)
    if (this.retry) s.setText('ROUND 2 — ' + pick(BOSS_LINES[B.key].retry))
    this.tweens.add({ targets: n, x: W / 2, duration: 450, ease: 'Back.out' }); this.tweens.add({ targets: s, x: W / 2, duration: 450, delay: 150, ease: 'Back.out' })
    this.tweens.add({ targets: this.bImg, scale: this.bImg.scale * 1.12, yoyo: true, duration: 250, delay: 300 })
    sfx.warn(); startMusic(true)
    this.time.delayedCall(DEMO ? 1300 : 1700, () => { [band, n, s].forEach(o => this.tweens.add({ targets: o, alpha: 0, duration: 250, onComplete: () => o.destroy() })); this.phase = 'fight' })
  }
  shake(i = 0.01, d = 120) { if (run.settings.shake) this.cameras.main.shake(d, i) }
  num(x: number, y: number, txt: string, col = '#fff', size = 34) {
    const t = this.add.text(x, y, txt, { fontFamily: FONT, fontSize: size + 'px', color: col, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(40)
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, scale: 1.3, duration: 800, ease: 'Cubic.out', onComplete: () => t.destroy() })
  }
  // ---- demo bot ----
  demoInput(dt: number) {
    for (const k in inp) (inp as any)[k] = false
    const p = this.p, b = this.boss, d = b.x - p.x, ad = Math.abs(d)
    this.demoT += dt
    const danger = (b.st === 'windup' && ad < 260) || this.projs.some(q => q.fromBoss && Math.abs(q.o.x - p.x) < 200)
    this.demoLife -= dt
    if ((this.retry ? danger : true) && p.st === 'idle' && this.demoLife <= 0) { this.demoLife = this.retry ? 1.6 : 1.3; inp.dodge = true; inp.left = true; return }
    if (ad > 140) { inp[d > 0 ? 'right' : 'left'] = true; if (ad > 420 && Math.random() < 0.03) inp.dash = true }
    this.demoAtkCd -= dt
    if (ad < 190 && this.demoAtkCd <= 0) { inp.atk = !prev.atk; if (released('atk') === false && !inp.atk && this.tapCount === 0 && this.p.st === 'attack' && this.p.move === 'finisher') this.demoAtkCd = 0.35 }
    if (ad < 160 && Math.random() < 0.004) inp.jump = true
    if (p.meter >= 100 && ad < 600) inp.special = true
    if (this.retry || run.boss > 0) {
      this.demoMv = (this.demoMv || 0) + dt
      if (b.st === 'windup' && b.t < 0.12 && ad < 260 && !b.unb) { inp.block = true; inp.atk = false }
      else if (this.demoMv > 1.1 && ad < 170) { this.demoMv = 0; const r = this.demoK = ((this.demoK || 0) + 1) % 4; if (r === 0) inp.grab = true; else if (r === 1) { inp.down = true; inp.atk = !prev.atk } else if (r === 2 && p.meter >= 50) inp.special2 = true; else if (r === 3) inp.jump = true }
    }
    if (inp.dash && ad < 300) inp.atk = true
  }
  update(_t: number, dms: number) {
    let dt = Math.min(dms / 1000, 1 / 30)
    if (DEMO && this.phase === 'fight') this.demoInput(dt); else this.readKeys()
    if (pressed('pause')) { Object.assign(prev, inp); this.pause(); return }
    if (this.phase !== 'fight' && this.phase !== 'ko') { Object.assign(prev, inp); this.draw(); return }
    if (this.freeze > 0) { this.freeze -= dt; Object.assign(prev, inp); return }
    dt *= this.slow
    run.time = performance.now() - run.start
    this.stats.t += dt
    if (this.phase === 'fight') { this.updPlayer(dt); this.updBoss(dt) } else this.updBossKO(dt)
    this.updProj(dt); this.updArena(dt)
    Object.assign(prev, inp)
    this.draw()
  }
  updPlayer(dt: number) {
    const p = this.p, b = this.boss, S = this.stats
    p.t += dt; p.iframe = Math.max(0, p.iframe - dt); p.dashT = Math.max(0, p.dashT - dt)
    const mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0)
    // tracking
    const zone = p.x < W / 3 ? 0 : p.x > (2 * W) / 3 ? 2 : 1; S.heat[zone] += dt
    this.tileHeat[Math.floor(Phaser.Math.Clamp((p.x - 40) / 100, 0, 11))] += dt
    if (Math.abs(p.x - this.lastPX) < 0.5 && p.ground && p.st === 'idle') { S.still += dt; this.stillT += dt } else this.stillT = 0
    if (p.hp < 35) { S.low += dt; if (Math.sign(p.x - this.lastPX) === -Math.sign(b.x - p.x) && Math.abs(p.x - this.lastPX) > 0.5) S.lowRetreat += dt }
    this.lastPX = p.x
    if (p.ground) this.airN = 0
    if (p.st !== 'block') this.guard = Math.min(100, this.guard + 14 * dt)
    if (p.st === 'hurt') { if (p.t > (p.stun || 0.32)) { p.st = 'idle'; p.stun = 0 } }
    else if (p.st === 'block') { p.vx = 0; S.block += dt; if (!inp.block) p.st = 'idle' }
    else if (p.st === 'roll') { p.vx = p.rollDir * 620; if (p.t > 0.38) { p.st = 'idle'; p.vx = 0 } }
    else if (p.st === 'attack') {
      const m = MOVES[p.move]
      if (p.move === 'dash') p.vx = p.face * Math.max(0, 900 * (1 - p.t / m.dur))
      else if (p.move === 'slam') { p.vx = 0; if (p.ground) { if (p.t < 2) { this.shake(0.02, 180); this.burst(p.x + p.face * 40, FY, 14, 0xd8c8a0); this.tryHit(true) }; p.st = 'idle' } }
      else if (p.move === 'squeeze') { p.vx = 0; if (p.t - this.sq > 0.09) { this.sq = p.t; p.hit = false } }
      else if (p.move !== 'air') p.vx *= 0.85
      if (p.move !== 'slam' && p.t >= m.a0 && p.t <= m.a1) this.tryHit(false)
      if (p.move !== 'slam' && p.t > m.dur) p.st = 'idle'
    }
    if (p.st === 'idle' || p.st === 'charge') {
      if (p.st === 'idle') { p.vx = mv * 360; if (mv) p.face = mv }
      else p.vx = 0
      if (pressed('jump') && p.ground) { p.vy = -900; p.ground = false; S.jumps++; sfx.jump() }
      if ((pressed('dash') || (pressed('dodge') === false && false)) && p.dashT <= 0 && p.ground) { p.dashT = 0.25; sfx.roll(); this.burst(p.x, FY - 10, 6, 0xffffff) }
      if (p.dashT > 0 && p.st === 'idle') p.vx = p.face * 820
      if (pressed('dodge') && p.ground) {
        p.rollDir = mv || -p.face; p.st = 'roll'; p.t = 0; p.iframe = 0.36; sfx.roll()
        S.rolls[p.rollDir < 0 ? 0 : 1]++
        const key = p.rollDir < 0 ? 'dodgeL' : 'dodgeR'
        if (this.active.includes(key) && b.st !== 'windup' && b.st !== 'swipe' && Math.random() < 0.85) this.bossAttack('read', p.x + p.rollDir * 230)
      }
      if (pressed('special') && p.meter >= 100) this.pump()
      if (pressed('special2') && p.meter >= 50) this.heroSpecial()
      if (inp.block && p.ground && p.st === 'idle') { if (!prev.block) this.blockT0 = this.time.now; p.st = 'block'; p.t = 0; return }
      if (pressed('grab') && p.ground && p.st === 'idle') { this.grab(); return }
      // attack input
      if (pressed('atk')) { this.holdT = 0 }
      if (inp.atk) { this.holdT += dt; if (this.holdT > 0.22 && p.st === 'idle' && p.ground && p.dashT <= 0) { p.st = 'charge'; p.t = 0 } }
      if (released('atk')) {
        if (p.st === 'charge') { p.st = 'idle'; this.doMove(this.holdT > 0.55 ? 'heavy' : 'punch') }
        else if (!p.ground && inp.down) this.doMove('slam')
        else if (!p.ground) { if (this.airN < 3) { this.airN++; this.doMove('air'); p.vy = Math.min(p.vy, -160) } }
        else if (inp.down) this.doMove('sweep')
        else if (p.dashT > 0) { p.dashT = 0; this.doMove('dash') }
        else {
          const now = this.time.now
          this.tapCount = now - this.lastTap < 380 ? this.tapCount + 1 : 1; this.lastTap = now
          this.doMove(this.tapCount === 1 ? 'punch' : this.tapCount === 2 ? 'uppercut' : 'finisher')
          if (this.tapCount >= 3) this.tapCount = 0
        }
      }
    }
    if (p.st === 'attack' && pressed('atk') && p.ground && p.move !== 'slam' && p.t > MOVES[p.move].a1) {
      // cancel into next combo hit for responsive chains
      const now = this.time.now; this.tapCount = now - this.lastTap < 420 ? this.tapCount + 1 : 1; this.lastTap = now
      p.st = 'idle'; this.doMove(this.tapCount === 1 ? 'punch' : this.tapCount === 2 ? 'uppercut' : 'finisher'); if (this.tapCount >= 3) this.tapCount = 0
      this.holdT = -10
    }
    // physics
    p.vy += 2400 * dt; p.y += p.vy * dt; p.x += p.vx * dt
    const tileGone = this.tileUnder(p.x)
    if (p.y >= FY && !(tileGone && p.y < FY + 5 && false)) {
      if (tileGone && run.boss >= 2) { if (p.y > FY + 120) this.fall() }
      else { if (!p.ground) { this.shakeLand() } p.y = FY; p.vy = 0; p.ground = true }
    } else p.ground = p.y >= FY && !tileGone
    p.x = Phaser.Math.Clamp(p.x, this.walls.l + 30, this.walls.r - 30)
    if (p.st !== 'attack' && p.st !== 'roll' && p.st !== 'hurt') p.face = mv || (b.x > p.x ? 1 : -1)
  }
  shakeLand() { this.burst(this.p.x, FY, 4, 0xd8c8a0) }
  tileUnder(x: number) { if (run.boss < 2) return false; const i = Math.floor((x - 40) / 100); return i >= 0 && i < 12 && this.tiles[i].gone > 0 }
  fall() { const p = this.p; this.hurtPlayer(12, 0, true); p.x = (this.walls.l + this.walls.r) / 2; p.y = FY - 300; p.vy = 0; p.iframe = 1.2; this.num(p.x, FY - 330, 'RUGGED!', '#ff6b6b', 44) }
  doMove(m: string) {
    const p = this.p; p.st = 'attack'; p.move = m; p.t = 0; p.hit = false
    this.stats.moves[m] = (this.stats.moves[m] || 0) + 1; run.moveUse[m] = (run.moveUse[m] || 0) + 1
    if (m !== 'punch') run.combos++
    if (m === 'slam') { p.vy = 1400 } else if (m === 'heavy') { sfx.heavy(); p.vx = p.face * 200 } else if (m === 'uppercut') sfx.up(); else sfx.whiff()
    const lbl = MOVES[m].label; if (m !== 'punch') this.num(p.x, p.y - p.h - 20, lbl, '#7dffb0', 26)
  }
  tryHit(slam: boolean) {
    const p = this.p, b = this.boss; if (p.hit) return
    const m = MOVES[p.move], cx = p.x + p.face * m.range / 2
    const bw = this.B.h * 0.32
    if (Math.abs(b.x - cx) < m.range / 2 + bw && Math.abs((b.y - this.B.h / 2) - (p.y - p.h / 2)) < this.B.h / 2 + p.h / 2 + (slam ? 40 : 0)) {
      p.hit = true
      const counterKey = 'spam_' + p.move
      if (this.active.includes(counterKey) && Math.random() < 0.6 && b.st !== 'stagger') {
        sfx.block(); this.num(b.x, b.y - this.B.h - 10, 'BLOCKED — IT KNOWS', '#ff8f8f', 30); this.burst(cx, p.y - p.h / 2, 8, 0x88ccff); this.freeze = 0.06; p.vx = -p.face * 300
        b.blocked++; return
      }
      this.damageBoss(m.dmg, m.kb * p.face, m.launch || 0, m.meter, cx)
      if (p.move === 'finisher' || p.move === 'heavy') this.pushWalls(60)
    }
  }
  damageBoss(dmg: number, kb: number, launch: number, meter: number, hx: number) {
    const b = this.boss, p = this.p
    b.hp = Math.max(0, b.hp - dmg); b.flash = 0.09; p.meter = Math.min(100, p.meter + meter)
    b.x += Math.sign(kb) * Math.min(80, Math.abs(kb) / 6); b.kb = kb * 0.6
    if (launch && run.boss !== 3) { b.vy = -launch; b.air = true } else if (launch) { b.vy = -launch * 0.5; b.air = true }
    if (this.p.move === 'sweep' && b.st !== 'windup') { b.st = 'stagger'; b.t = 0.75; this.num(b.x, b.y - this.B.h - 20, 'SWEPT', '#7dffb0', 30) }
    else if (b.st === 'windup' && dmg >= 13) { b.st = 'stagger'; b.t = 0.5 }
    else if (b.st !== 'windup' && b.st !== 'swipe') { b.st = 'stagger'; b.t = 0.25 + dmg / 80 }
    this.freeze = dmg > 14 ? 0.11 : 0.055
    this.shake(dmg > 14 ? 0.018 : 0.008, dmg > 14 ? 200 : 100)
    if (dmg > 14) sfx.heavy(); else sfx.punch()
    this.burst(hx, b.y - this.B.h * 0.55, dmg > 14 ? 22 : 10, 0xffe066)
    this.num(hx, b.y - this.B.h * 0.7, '' + dmg, dmg > 14 ? '#ffd23f' : '#ffffff', dmg > 14 ? 46 : 34)
    if (b.hp <= 0) this.ko()
  }
  perfect() {
    const p = this.p; p.iframe = 0.5; p.meter = Math.min(100, p.meter + 15); sfx.up()
    this.num(p.x, p.y - p.h - 30, 'PERFECT DODGE', '#7dffb0', 38); this.slow = 0.35; this.cameras.main.flash(120, 120, 255, 180)
    this.time.delayedCall(260, () => { if (this.phase === 'fight') this.slow = 1 })
  }
  parry() {
    const p = this.p, b = this.boss; p.meter = Math.min(100, p.meter + 20); sfx.block(); sfx.up()
    b.st = 'stagger'; b.t = 1.0; b.flash = 0.15; this.freeze = 0.14; this.slow = 0.4; this.shake(0.02, 200)
    this.time.delayedCall(320, () => { if (this.phase === 'fight') this.slow = 1 })
    this.num(p.x, p.y - p.h - 30, 'PARRY! SAFU', '#ffffff', 46); this.burst(p.x + p.face * 40, p.y - p.h / 2, 24, 0xffffff)
    this.stats.moves['parry'] = (this.stats.moves['parry'] || 0) + 1; run.combos++
  }
  grab() {
    const p = this.p, b = this.boss, S = this.stats; S.moves['grab'] = (S.moves['grab'] || 0) + 1; run.moveUse['grab'] = (run.moveUse['grab'] || 0) + 1
    if (Math.abs(b.x - p.x) > 190 || b.air || b.st === 'windup') { sfx.whiff(); p.st = 'hurt'; p.t = 0.1; return }
    if ((this.active.includes('grabby') || run.boss === 3) && Math.random() < 0.5) { this.num(b.x, b.y - this.B.h - 10, 'SLIPPED. IT KNEW.', '#ff8f8f', 30); sfx.block(); p.st = 'hurt'; p.t = 0; return }
    run.combos++; const dir = -p.face
    this.tweens.add({ targets: b, x: p.x + dir * 40, duration: 120, onComplete: () => { b.vy = -600; b.air = true; this.damageBoss(14, dir * 900, 0, 12, b.x); this.num(p.x, p.y - p.h - 30, 'THROW', '#7dffb0', 34) } })
    p.face = dir; p.st = 'attack'; p.move = 'punch'; p.t = 0.2; p.hit = true
  }
  heroSpecial() {
    const p = this.p; p.meter -= 50; run.combos++
    const key = run.hero === 'heroF' ? 'squeeze' : 'beam'; this.stats.moves[key] = (this.stats.moves[key] || 0) + 1; run.moveUse[key] = (run.moveUse[key] || 0) + 1
    if (key === 'squeeze') { this.num(p.x, p.y - p.h - 40, 'SHORT SQUEEZE!', '#ffd23f', 48); sfx.pump(); this.sq = 0; this.doMove('squeeze'); return }
    this.num(p.x, p.y - p.h - 40, 'GREEN CANDLE!', '#5dff9a', 48); sfx.pump(); this.shake(0.015, 400)
    const x0 = p.x + p.face * 50, len = p.face > 0 ? W - x0 : x0
    const beam = this.add.rectangle(p.face > 0 ? x0 : 0, p.y - p.h * 0.55, len, 70, 0x2fbf71).setOrigin(0, 0.5).setDepth(30).setStrokeStyle(8, 0xd8ffe6)
    this.tweens.add({ targets: beam, scaleY: 0.1, alpha: 0, duration: 650, onComplete: () => beam.destroy() })
    for (let i = 0; i < 3; i++) this.time.delayedCall(i * 140, () => { const b = this.boss; if (this.phase === 'fight' && Math.sign(b.x - p.x) === p.face) this.damageBoss(9, p.face * 200, 0, 0, b.x - p.face * 40) })
    p.st = 'attack'; p.move = 'punch'; p.t = 0; p.hit = true
  }
  pump() {
    const p = this.p; p.meter = 0; sfx.pump(); this.shake(0.012, 300); run.combos++
    this.stats.moves['pump'] = (this.stats.moves['pump'] || 0) + 1; run.moveUse['pump'] = (run.moveUse['pump'] || 0) + 1
    const o = this.add.rectangle(p.x + p.face * 60, p.y - p.h * 0.55, 120, 46, 0x5dff9a).setDepth(30).setStrokeStyle(6, 0xd8ffe6)
    this.projs.push({ o, vx: p.face * 1300, vy: 0, dmg: 34, fromBoss: false, life: 1.5, big: true })
    this.num(p.x, p.y - p.h - 30, 'PUMP!', '#5dff9a', 56)
    p.st = 'attack'; p.move = 'punch'; p.t = 0; p.hit = true
  }
  hurtPlayer(dmg: number, kx: number, force = false, unblock = false): boolean | string {
    const p = this.p
    if (!force && p.st === 'roll' && p.t > 0.12 && this.slow === 1) { this.perfect(); return false }
    if (!force && (p.iframe > 0 || p.st === 'dead')) return false
    if (!force && p.st === 'block' && !unblock) {
      if (this.time.now - this.blockT0 < 180) { this.parry(); return 'parry' }
      this.guard -= dmg * 4; sfx.block(); this.burst(p.x + p.face * 30, p.y - p.h / 2, 6, 0x88ccff); p.vx = kx * 0.3; p.x += Math.sign(kx) * 20
      if (this.guard <= 0) { this.guard = 0; p.st = 'hurt'; p.t = 0; p.stun = 0.9; this.num(p.x, p.y - p.h - 20, 'GUARD BROKEN', '#ffb347', 34); this.shake(0.015) }
      else this.num(p.x, p.y - p.h - 10, 'BLOCKED', '#88ccff', 24)
      return false
    }
    p.hp = Math.max(0, p.hp - dmg); p.st = 'hurt'; p.t = 0; p.vx = kx; p.iframe = 0.5
    sfx.hurt(); this.shake(0.014, 160); this.freeze = 0.07; this.cameras.main.flash(80, 255, 60, 60)
    this.burst(p.x, p.y - p.h / 2, 12, 0xff6b6b); this.num(p.x, p.y - p.h - 10, '-' + dmg, '#ff6b6b', 34)
    if (p.hp <= 0) this.die()
    return true
  }
  // ---- boss ----
  bossAttack(kind: string, tx = 0) {
    const b = this.boss; b.st = 'windup'; b.atk = kind; b.tx = tx
    b.unb = (kind === 'swipe' || kind === 'read') && (this.active.includes('turtle') || run.boss === 3) && Math.random() < 0.45
    if (b.unb) this.num(b.x, FY - this.B.h - 30, 'UNBLOCKABLE', '#c38bff', 30)
    const fast = this.active.includes('noDodge') ? 0.75 : 1
    b.t = (kind === 'read' ? 0.38 : kind === 'swipe' ? 0.5 : kind === 'anti' ? 0.32 : kind === 'leap' ? 0.55 : kind === 'snipe' ? 0.8 : 0.5) * fast * (run.boss === 0 ? 0.85 : 1)
    if (kind === 'read') this.num(tx, FY - 260, 'READ YOU!', '#ff6b6b', 40)
    if (kind === 'snipe') this.num(this.p.x, FY - 280, 'STOP!', '#ff4040', 40)
    sfx.warn()
  }
  updBoss(dt: number) {
    const b = this.boss, p = this.p, B = this.B, act = (k: string) => this.active.includes(k)
    b.flash = Math.max(0, b.flash - dt); b.t -= dt; b.cd -= dt
    // physics
    if (b.air || b.y < FY) { b.vy += 2200 * dt; b.y += b.vy * dt; if (b.y >= FY) { b.y = FY; b.vy = 0; if (b.air) { this.shake(0.01, 100); this.burst(b.x, FY, 8, 0xd8c8a0) } b.air = false } }
    if (b.kb) { b.x += b.kb * dt; b.kb *= 0.85; if (Math.abs(b.kb) < 5) b.kb = 0
      if (Math.abs(b.kb) > 250 && (b.x < this.walls.l + 70 || b.x > this.walls.r - 70)) { b.kb = -b.kb * 0.5; b.hp = Math.max(1, b.hp - 6); this.num(b.x, b.y - this.B.h, 'WALL BOUNCE +6', '#ffd23f', 34); this.shake(0.02, 160); sfx.heavy(); this.burst(b.x, b.y - this.B.h / 2, 16, 0xffffff) } }
    b.x = Phaser.Math.Clamp(b.x, this.walls.l + 60, this.walls.r - 60)
    const d = p.x - b.x, ad = Math.abs(d)
    let speed = B.speed * (act('runLow') && p.hp < 35 ? 1.5 : 1)
    if (b.st === 'stagger') { if (b.t <= 0) { b.st = 'idle'; b.cd = 0.3 } return }
    if (b.st === 'windup') {
      if (b.atk === 'leap' && b.t < 0.15 && !b.air) { b.vy = -1000; b.air = true; b.tx = p.x }
      if (b.atk === 'leap' && b.air) b.x += (b.tx - b.x) * 4 * dt
      if (b.t <= 0) this.release()
      return
    }
    if (b.st === 'swipe') { if (b.t <= 0) { b.st = 'idle'; b.cd = (run.boss === 0 ? 0.55 : 0.85) * (act('noDodge') ? 0.7 : 1) } return }
    if (b.air) return
    b.face = d > 0 ? 1 : -1
    // decide
    if (b.cd <= 0) {
      const still = this.stillT > (B.native === 'still' ? 0.9 : 1.4) && (B.native === 'still' || act('still'))
      if (still) { this.bossAttack('snipe'); return }
      if (!p.ground && ad < 330 && (act('jumper') || run.boss === 3)) { this.bossAttack('anti'); return }
      const camp = ['campL', 'campM', 'campR'].find(k => act(k))
      if ((camp || B.native === 'walls') && Math.random() < 0.25) { this.hazard(camp ? ['campL', 'campM', 'campR'].indexOf(camp) : -1); b.cd = 0.6 }
      if (ad < 210) { this.bossAttack('swipe'); return }
      const r = Math.random()
      if (r < 0.35) { this.bossAttack('shoot'); return }
      if (r < 0.55 && run.boss !== 1) { this.bossAttack('leap'); return }
      if (run.boss === 3 && r < 0.7) { this.bossAttack('roar'); return }
      b.cd = 0.4
    }
    if (ad > 170) b.x += Math.sign(d) * speed * dt
    if (B.native === 'still' && Math.random() < dt * 1.5) b.x += (Math.random() - 0.5) * 60
  }
  release() {
    const b = this.boss, p = this.p
    b.st = 'swipe'; b.t = 0.3
    const a = b.atk
    if (a === 'swipe' || a === 'anti' || a === 'read') {
      const cx = a === 'read' ? b.tx : b.x + b.face * 120
      if (a === 'read') { b.x = Phaser.Math.Clamp(b.tx - Math.sign(b.tx - b.x || 1) * 110, this.walls.l + 60, this.walls.r - 60); b.face = b.tx > b.x ? 1 : -1 }
      this.slash(a === 'read' ? b.tx : cx, a === 'anti' ? FY - 300 : FY - 120)
      const range = a === 'read' ? 170 : 190
      const hitY = a === 'anti' ? p.y < FY - 20 || Math.abs(p.x - b.x) < 150 : p.y > FY - 230
      if (Math.abs(p.x - (a === 'read' ? b.tx : b.x + b.face * 80)) < range && hitY) {
        if (this.hurtPlayer(a === 'read' ? 14 : 11, b.face * 420, false, b.unb) === true && a === 'read') this.num(p.x, FY - 330, 'COUNTERED', '#ff4040', 40)
      }
      sfx.whiff()
    } else if (a === 'shoot') {
      sfx.shot()
      const lead = this.active.includes('dodgeL') ? -1 : this.active.includes('dodgeR') ? 1 : 0
      this.shot(b.x + b.face * 80, FY - this.B.h * 0.55, b.face * 620, 0, 10)
      if (run.boss >= 2 || lead) this.shot(b.x + b.face * 80, FY - 40, b.face * 520, 0, 8)
    } else if (a === 'snipe') {
      sfx.shot(); this.shake(0.01, 100)
      this.shot(b.x + b.face * 80, FY - 110, b.face * 1500, 0, 14)
    } else if (a === 'leap') {
      this.shockwave(b.x)
    } else if (a === 'roar') {
      this.shockwave(b.x); this.time.delayedCall(250, () => this.shockwave(b.x)); this.num(b.x, FY - 380, 'ROAAAR', '#ffb347', 50)
    }
  }
  slash(x: number, y: number) {
    const s = this.add.ellipse(x, y, 260, 90, 0xff5050, 0.6).setDepth(25)
    this.tweens.add({ targets: s, scaleX: 1.4, alpha: 0, duration: 220, onComplete: () => s.destroy() })
  }
  shot(x: number, y: number, vx: number, vy: number, dmg: number) {
    const o = this.add.circle(x, y, 16, 0xff4d4d).setStrokeStyle(5, 0xffd0d0).setDepth(30)
    this.projs.push({ o, vx, vy, dmg, fromBoss: true, life: 3 })
  }
  shockwave(x: number) {
    this.shake(0.02, 220); sfx.heavy(); this.burst(x, FY, 18, 0xd8c8a0)
    for (const dir of [-1, 1]) { const o = this.add.rectangle(x, FY - 22, 40, 44, 0xffb347).setDepth(30); this.projs.push({ o, vx: dir * 560, vy: 0, dmg: 10, fromBoss: true, life: 2 }) }
  }
  hazard(zone: number) {
    const p = this.p
    const x = zone < 0 ? (p.x < W / 2 ? this.walls.l + 120 : this.walls.r - 120) : Phaser.Math.Clamp([W / 6, W / 2, (5 * W) / 6][zone] + (Math.random() - 0.5) * 200, this.walls.l + 60, this.walls.r - 60)
    const mark = this.add.ellipse(x, FY + 4, 160, 26, 0xff3030, 0.5).setDepth(5)
    this.tweens.add({ targets: mark, alpha: 0.15, yoyo: true, repeat: 3, duration: 120 })
    this.time.delayedCall(800, () => {
      mark.destroy(); if (this.phase !== 'fight') return
      const drop = this.add.rectangle(x, FY - 400, 40, 120, run.boss === 1 ? 0x9b6bff : 0xff5050).setDepth(30)
      this.tweens.add({ targets: drop, y: FY - 60, duration: 220, ease: 'Quad.in', onComplete: () => { this.burst(x, FY, 14, 0x9b6bff); this.shake(0.01); drop.destroy(); if (Math.abs(this.p.x - x) < 95 && this.p.y > FY - 200) this.hurtPlayer(9, Math.sign(this.p.x - x) * 300) } })
    })
  }
  updProj(dt: number) {
    const p = this.p, b = this.boss
    this.projs = this.projs.filter(q => {
      q.life -= dt; q.o.x += q.vx * dt; q.o.y += q.vy * dt
      if (q.big) this.emit.emitParticle(2, q.o.x, q.o.y)
      if (q.fromBoss) {
        const hy = q.o.y > p.y - p.h && q.o.y < p.y + 10
        if (Math.abs(q.o.x - p.x) < 50 && hy && p.iframe <= 0) { if (this.hurtPlayer(q.dmg, Math.sign(q.vx) * 300) === 'parry') { q.vx = -q.vx * 1.4; q.fromBoss = false; q.life = 1.5; q.dmg = 15 } else q.life = 0 }
      } else if (Math.abs(q.o.x - b.x) < this.B.h * 0.35 && this.phase === 'fight') { this.damageBoss(q.dmg, Math.sign(q.vx) * 500, 0, 0, q.o.x); this.pushWalls(120); q.life = 0 }
      if (q.life <= 0 || q.o.x < -100 || q.o.x > W + 100) { q.o.destroy(); return false }
      return true
    })
  }
  pushWalls(n: number) { if (run.boss !== 1) return; this.walls.l = Math.max(40, this.walls.l - n); this.walls.r = Math.min(1240, this.walls.r + n) }
  updArena(dt: number) {
    if (this.phase !== 'fight') return
    const p = this.p
    if (run.boss === 1 || (run.boss === 3 && this.active.some(k => k.startsWith('camp')))) {
      const rate = run.boss === 1 ? 14 : 6
      this.walls.l = Math.min(330, this.walls.l + rate * dt); this.walls.r = Math.max(950, this.walls.r - rate * dt)
      if (p.x < this.walls.l + 45 || p.x > this.walls.r - 45) { this.cornerT = (this.cornerT || 0) + dt; if (this.cornerT > 2) { this.cornerT = 0; this.hurtPlayer(7, (p.x < W / 2 ? 1 : -1) * 500); this.num(p.x, FY - 260, 'NO EXIT', '#b38bff', 36) } } else this.cornerT = 0
    }
    if (run.boss === 2 || (run.boss === 3 && this.tiles)) {
      for (const t of this.tiles) { if (t.warn > 0) { t.warn -= dt; if (t.warn <= 0) t.gone = run.boss === 2 ? 3.2 : 2.4 } else if (t.gone > 0) t.gone -= dt }
      this.tileT -= dt
      if (this.tileT <= 0) {
        this.tileT = run.boss === 2 ? 3.4 : 5
        const i = this.tileHeat.indexOf(Math.max(...this.tileHeat))
        for (const j of [i, i + (Math.random() < 0.5 ? -1 : 1)]) if (this.tiles[j] && !this.tiles[j].gone) this.tiles[j].warn = 0.9
        this.tileHeat = this.tileHeat.map(h => h * 0.5); sfx.warn()
      }
    }
  }
  cornerT = 0
  demoMv = 0
  demoK = 0
  arenaKey = ''
  airN = 0
  guard = 100
  blockT0 = 0
  sq = 0
  demoAtkCd = 0
  burst(x: number, y: number, n: number, tint: number) { this.emit.setParticleTint(tint); this.emit.explode(n, x, y) }
  // ---- ko / death ----
  ko() {
    this.phase = 'ko'; sfx.ko(); this.slow = 0.25; this.cameras.main.zoomTo(1.25, 400); this.cameras.main.pan(this.boss.x, FY - 200, 400)
    this.shake(0.03, 500); this.burst(this.boss.x, FY - 150, 40, 0xffe066)
    const t = this.add.text(W / 2, H / 2 - 40, 'K.O.', { fontFamily: FONT, fontSize: '170px', color: '#f5c84c', stroke: '#000', strokeThickness: 14 }).setOrigin(0.5).setScrollFactor(0).setDepth(80).setScale(3)
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.out' })
    this.boss.vy = -700; this.boss.air = true; this.boss.kb = this.p.face * 900
    this.time.delayedCall(1700, () => {
      this.slow = 1; this.cameras.main.zoomTo(1, 300); this.cameras.main.pan(W / 2, H / 2, 300); sfx.win()
      this.mergeStats()
      const learned = analyze(this.stats); run.learned.push(...learned)
      if (run.boss === 3) { stopMusic(); this.time.delayedCall(600, () => this.scene.start('results')); return }
      this.learnedCard(learned, pick(BOSS_LINES[this.B.key].win), () => { run.boss++; this.scene.restart({ retry: false }) })
    })
  }
  updBossKO(dt: number) { const b = this.boss; b.vy += 2200 * dt; b.y = Math.min(FY, b.y + b.vy * dt); b.x += b.kb * dt; b.kb *= 0.95 }
  mergeStats() { const T = run.total, s = this.stats; T.t += s.t; T.jumps += s.jumps; T.rolls[0] += s.rolls[0]; T.rolls[1] += s.rolls[1] }
  die() {
    const p = this.p; p.st = 'dead'; this.phase = 'dead'; run.deaths++; this.mergeStats()
    this.slow = 0.3; sfx.ko(); this.cameras.main.zoomTo(1.15, 300)
    this.tweens.add({ targets: this.pImg, angle: -p.face * 90, y: FY - 10, duration: 500 })
    const dsub = this.add.text(W / 2, H / 2 + 40, pick(DEATH_SUB), { fontFamily: 'Nunito', fontStyle: '800', fontSize: '28px', color: '#fff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setScrollFactor(0).setDepth(80)
    const t = this.add.text(W / 2, H / 2 - 60, pick(DEATH), { fontFamily: FONT, fontSize: '110px', color: '#ff5b5b', stroke: '#000', strokeThickness: 12 }).setOrigin(0.5).setScrollFactor(0).setDepth(80)
    this.tweens.add({ targets: t, scale: { from: 2, to: 1 }, duration: 300 })
    this.time.delayedCall(1300, () => {
      this.cameras.main.zoomTo(1, 200); t.destroy(); dsub.destroy()
      const learned = analyze(this.stats); run.learned.push(...learned)
      this.learnedCard(learned, 'IT WATCHED YOU LOSE. IT TOOK NOTES.', () => this.scene.restart({ retry: true }))
    })
  }
  learnedCard(learned: string[], head: string, next: () => void) {
    this.phase = 'card'; sfx.learned()
    const c = this.add.container(0, 0).setDepth(90).setScrollFactor(0)
    const bgR = this.add.rectangle(W / 2, H / 2, W, H, 0x07050f, 0.86)
    const hd = this.add.text(W / 2, 110, head, { fontFamily: FONT, fontSize: '40px', color: '#ddd' }).setOrigin(0.5)
    const big = this.add.text(W / 2, 200, 'IT LEARNED', { fontFamily: FONT, fontSize: '96px', color: '#ff5b5b', stroke: '#2a0000', strokeThickness: 10 }).setOrigin(0.5)
    c.add([bgR, hd, big])
    this.tweens.add({ targets: big, x: { from: W / 2 - 8, to: W / 2 + 8 }, yoyo: true, repeat: 5, duration: 40 })
    const lines = learned.length ? learned : []
    const msg = lines.length ? lines.map(k => '▸ ' + hl(k)) : [run.learned.length ? '▸ Nothing new. It still holds ' + run.learned.length + ' habit' + (run.learned.length > 1 ? 's' : '') + '.' : '▸ Not enough data yet. Keep feeding it.']
    msg.forEach((m, i) => {
      const t = this.add.text(W / 2, 310 + i * 90, '', { fontFamily: 'monospace', fontSize: '36px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5)
      const k = lines[i], cn = k ? this.add.text(W / 2, 352 + i * 90, '', { fontFamily: 'Nunito', fontStyle: '800', fontSize: '22px', color: '#ffb0b0' }).setOrigin(0.5) : null
      c.add(t); if (cn) c.add(cn)
      let n = 0; this.time.addEvent({ delay: 28, repeat: m.length, startAt: 0, callback: () => { t.setText(m.slice(0, ++n)); if (n % 2) sfx.learn() }, timeScale: 1 })
      if (cn) this.time.delayedCall(m.length * 28 + 200, () => cn.setText('COUNTER ARMED → ' + HABITS[k].counter))
    })
    const nx = this.add.text(W / 2, 640, 'press ATTACK / tap to continue', { fontFamily: 'Nunito', fontStyle: '800', fontSize: '24px', color: '#f5c84c' }).setOrigin(0.5).setAlpha(0)
    c.add(nx); this.tweens.add({ targets: nx, alpha: 1, delay: 1200, duration: 300, yoyo: true, repeat: -1, hold: 500 })
    let done = false
    const go = () => { if (done) return; done = true; next() }
    this.time.delayedCall(1100, () => { this.input.once('pointerdown', go); this.input.keyboard!.once('keydown', go) })
    if (DEMO) this.time.delayedCall(3200, go)
  }
  draw() {
    const p = this.p, b = this.boss, B = this.B, g = this.ui, f = this.fx, tm = this.time.now / 1000
    f.clear()
    // walls
    if (run.boss === 1 || this.walls.l > 41) { f.fillStyle(0x6b3fb0, 0.85).fillRect(0, 0, this.walls.l, FY); f.fillRect(this.walls.r, 0, W - this.walls.r, FY); f.fillStyle(0xb38bff).fillRect(this.walls.l - 6, 0, 6, FY).fillRect(this.walls.r, 0, 6, FY) }
    // tiles
    if (run.boss >= 2) this.tiles.forEach((t, i) => {
      const x = 40 + i * 100
      if (t.gone > 0) { f.fillStyle(0x000000, 1).fillRect(x, FY, 100, H - FY) }
      else { f.fillStyle(t.warn > 0 && Math.floor(tm * 12) % 2 ? 0xff4040 : 0x6b3f6e, t.warn > 0 ? 0.9 : 0.6).fillRect(x + 2, FY + 2, 96, 26); f.lineStyle(2, 0xd9a0ff, 0.4).strokeRect(x + 2, FY + 2, 96, 26) }
    })
    // shadows
    f.fillStyle(0x000000, 0.35).fillEllipse(p.x, FY + 4, 120 * Math.max(0.4, 1 - (FY - p.y) / 500), 22).fillEllipse(b.x, FY + 6, B.h * 0.6 * Math.max(0.4, 1 - (FY - b.y) / 600), 28)
    // windup telegraph
    if (b.st === 'windup' && this.phase === 'fight') { const a = 0.3 + 0.3 * Math.sin(tm * 40); f.fillStyle(b.unb ? 0xb050ff : 0xff3030, a); if (b.atk === 'snipe') f.fillRect(Math.min(b.x, p.x), FY - 115, Math.abs(p.x - b.x), 6); else if (b.atk === 'read') f.fillEllipse(b.tx, FY, 260, 30); else f.fillEllipse(b.x + b.face * 100, FY, 300, 34) }
    // player sprite
    const pi = this.pImg, ps = p.h / pi.height
    let sx = 1, sy = 1, ang = 0
    if (p.st === 'idle' && p.ground) { const bob = Math.sin(tm * 6) * 0.025; sx = 1 - bob; sy = 1 + bob; if (Math.abs(p.vx) > 10) ang = p.face * 4 + Math.sin(tm * 18) * 3 }
    if (!p.ground) { sx = 0.9; sy = 1.1 }
    if (p.st === 'charge') { const c = Math.min(1, this.holdT / 0.55); sx = 1 + c * 0.15; sy = 1 - c * 0.12; if (c >= 1 && Math.floor(tm * 20) % 2) pi.setTint(0xffe066); else pi.clearTint() }
    if (p.st === 'attack') { const m = MOVES[p.move], k = Math.min(1, p.t / m.dur); const pk = Math.sin(k * Math.PI); sx = 1 + pk * 0.18; sy = 1 - pk * 0.1; ang = p.face * pk * (p.move === 'uppercut' ? -14 : 10); if (p.move === 'slam') { sx = 1.2; sy = 0.85 } }
    if (p.st === 'roll') { ang = p.rollDir * (p.t / 0.38) * 360; sx = sy = 0.8 }
    if (p.st === 'block') { sx = 0.92; sy = 0.95; pi.setTint(0x99ccff) } else if (p.st === 'hurt') pi.setTintFill(0xff8080); else if (p.st !== 'charge' && p.st !== 'block') pi.clearTint()
    if (p.st !== 'dead') { pi.setPosition(p.x, p.y - (p.st === 'roll' ? 30 : 0)).setScale(ps * sx * (p.face < 0 ? -1 : 1), ps * sy).setFlipX(false).setAngle(ang).setOrigin(0.5, p.st === 'roll' ? 0.5 : 1); if (p.st === 'roll') pi.y = p.y - p.h * 0.4 }
    pi.setAlpha(p.iframe > 0 && p.st !== 'roll' && Math.floor(tm * 20) % 2 ? 0.5 : 1)
    // boss sprite
    const bi = this.bImg, bs = B.h / bi.height
    let bx = 1, by = 1, ba = 0
    const breathe = Math.sin(tm * (run.boss === 0 ? 9 : 3.5)) * 0.03
    bx = 1 - breathe; by = 1 + breathe
    if (b.st === 'windup') { bx = 1.1; by = 0.92; bi.setTint(0xff9090) } else if (b.flash > 0) bi.setTintFill(0xffffff); else bi.clearTint()
    if (b.st === 'swipe') { bx = 1.15; by = 0.95; ba = b.face * 8 }
    if (b.st === 'stagger') ba = -b.face * 6
    if (this.phase === 'ko') ba = -b.face * 70
    const fl = B.flip ? (b.face < 0 ? -1 : 1) : 1
    bi.setPosition(b.x, b.y).setScale(bs * bx * fl, bs * by).setAngle(ba)
    // UI bars
    g.clear()
    const bar = (x: number, y: number, w: number, v: number, col: number, right = false) => {
      g.fillStyle(0x000000, 0.6).fillRoundedRect(x - 4, y - 4, w + 8, 30, 10); g.fillStyle(0x3a2a2a).fillRoundedRect(x, y, w, 22, 8)
      const ww = Math.max(0, w * v); g.fillStyle(col).fillRoundedRect(right ? x + w - ww : x, y, ww, 22, ww > 16 ? 8 : 0)
    }
    bar(40, 48, 440, p.hp / 100, p.hp < 35 ? 0xff6b6b : 0x5dff9a)
    bar(W - 480, 48, 440, b.hp / b.max, 0xff5b5b, true)
    g.fillStyle(0x000000, 0.6).fillRoundedRect(36, 84, 228, 18, 8); g.fillStyle(p.meter >= 100 ? (Math.floor(tm * 8) % 2 ? 0x5dff9a : 0xd8ffe6) : 0x2fbf71).fillRoundedRect(40, 87, 220 * p.meter / 100, 12, 6)
    g.fillStyle(0x000000, 0.6).fillRoundedRect(276, 84, 128, 18, 8); g.fillStyle(this.guard < 30 ? 0xffb347 : 0x88ccff).fillRoundedRect(280, 87, 120 * this.guard / 100, 12, 6)
    if (p.meter >= 100) { g.fillStyle(0x5dff9a, 0.2 + 0.15 * Math.sin(tm * 10)).fillCircle(p.x, p.y - p.h / 2, 90) }
    this.timerT.setText(fmt(run.time))
  }
}

function showBoard(back: () => void) {
  overlay('<h2>LEADERBOARD</h2><p>Loading…</p>')
  top().then(({ list, global }) => {
    overlay('<h2>LEADERBOARD</h2><div class="learned">' + (global ? 'Global · fastest full clear' : 'Offline · this device only') + '</div><ol>' +
      (list.length ? list.map(s => '<li>' + esc(s.name) + ' <span>' + fmt(s.time_ms) + ' · ' + s.deaths + '💀</span></li>').join('') : '<li>No clears yet. Early is a state of mind.</li>') +
      '</ol><button id="bk" class="alt">Close</button>')
    document.getElementById('bk')!.onclick = () => { overlay(''); back() }
  })
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

class Results extends Phaser.Scene {
  constructor() { super('results') }
  create() {
    bg(this, 0x1a2a1a, 0x3a5a2a)
    const im = this.add.image(W / 2 - 300, FY + 40, run.hero).setOrigin(0.5, 1).setScale(0.6)
    this.tweens.add({ targets: im, y: FY + 20, yoyo: true, repeat: -1, duration: 400, ease: 'Quad.out' })
    this.add.text(W / 2, 80, 'BEAR SZN CANCELLED', { fontFamily: FONT, fontSize: '80px', color: '#f5c84c', stroke: '#000', strokeThickness: 10 }).setOrigin(0.5)
    sfx.win(); startMusic(false)
    const t = run.time, fav = Object.entries(run.moveUse).sort((a, b) => b[1] - a[1])[0]?.[0] || 'punch'
    const habits = run.learned.length
    const shareText = `I beat Bear Szn in ${fmt(t)} on It Learns You — it caught ${habits} of my habits${run.learned[0] ? ' ("' + hl(run.learned[0]) + '")' : ''}. Can you beat it without getting read?`
    const html = `<h2>RUN COMPLETE</h2><div class="stats">
<div class="stat">Time<b>${fmt(t)}</b></div><div class="stat">Deaths<b>${run.deaths}</b></div>
<div class="stat">Habits caught<b>${habits}</b></div><div class="stat">Combos used<b>${run.combos}</b></div></div>
<div class="learned">${run.learned.map(k => 'IT LEARNED: ' + hl(k)).join('<br>') || 'It learned nothing. You are a ghost wallet.'}</div>
<p style="margin:10px 0 4px">Favourite move: <b>${MOVES[fav]?.label || 'PUMP'}</b></p>
<p>Signed in as <b>@${esc(session.username)}</b></p>
<div><button id="sb">Submit to leaderboard</button><button id="card" class="alt">Download share card</button><a class="btn" id="x" target="_blank" rel="noopener">Share on X</a></div>
<div><button id="lb" class="alt">Leaderboard</button><button id="again" class="alt">Play again</button></div><div id="msg" class="learned"></div>`
    overlay(html)
    const $ = (id: string) => document.getElementById(id) as any
    const url = location.origin + location.pathname
    $('x').href = 'https://x.com/intent/post?text=' + encodeURIComponent(shareText + ' ' + url + ' @loadoutprotocol')
    $('sb').onclick = async () => {
      const name = session.username
      if (!name) { $('msg').textContent = 'Log in first.'; return }
      $('sb').disabled = true
      const ok = await submit({ name, hero: run.hero === 'heroF' ? 'F' : 'M', time_ms: Math.max(30000, Math.round(t)), deaths: Math.min(999, run.deaths), habits, combos: Math.min(100000, run.combos) })
      $('msg').textContent = ok ? 'On the global board. Screenshot it before someone faster shows up.' : 'Saved on this device. The global board is having a moment.'
    }
    $('card').onclick = () => this.card(t, habits, fav)
    $('lb').onclick = () => showBoard(() => this.scene.restart())
    $('again').onclick = () => { overlay(''); this.scene.start('select') }
  }
  card(t: number, habits: number, fav: string) {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const x = c.getContext('2d')!
    const gr = x.createLinearGradient(0, 0, 0, 630); gr.addColorStop(0, '#1e1834'); gr.addColorStop(1, '#5a3a6a'); x.fillStyle = gr; x.fillRect(0, 0, 1200, 630)
    const src = (k: string) => (this.textures.get(k).getSourceImage() as HTMLImageElement)
    const hi = src(run.hero), be = src('bear')
    x.globalAlpha = 0.35; x.drawImage(be, 760, 160, 420, 420 * be.height / be.width); x.globalAlpha = 1
    x.drawImage(hi, 40, 120, 380 * hi.width / hi.height, 380 + 100)
    x.fillStyle = '#f5c84c'; x.font = '72px "Lilita One", Impact'; x.fillText('IT LEARNS YOU', 420, 110)
    x.fillStyle = '#fff'; x.font = '52px "Lilita One", Impact'; x.fillText('Beat Bear Szn in ' + fmt(t), 420, 200)
    x.fillStyle = '#ff8f8f'; x.font = '36px "Lilita One", Impact'; x.fillText('It caught ' + habits + ' of my habits', 420, 260)
    x.font = 'bold 26px monospace'; run.learned.slice(0, 4).forEach((k, i) => x.fillText('IT LEARNED: ' + hl(k), 420, 320 + i * 40))
    x.fillStyle = '#7dffb0'; x.font = '30px "Lilita One", Impact'; x.fillText(run.deaths + ' deaths · ' + run.combos + ' combos · fav: ' + (MOVES[fav]?.label || 'PUMP'), 420, 520)
    x.fillStyle = '#ccc'; x.font = '24px Nunito, sans-serif'; x.fillText(location.host + location.pathname, 420, 580)
    const a = document.createElement('a'); a.download = 'it-learns-you.png'; a.href = c.toDataURL('image/png'); a.click()
  }
}

(window as any).__game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#120f1c',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Title, Select, Arena, HowTo, Settings, Fight, Results],
})
;(window as any).__run = run
;['touchstart', 'pointerdown', 'keydown'].forEach(e => document.addEventListener(e, () => unlock(), { once: true, passive: true }))
document.addEventListener('gesturestart', e => e.preventDefault())
document.addEventListener('dblclick', e => e.preventDefault())
document.addEventListener('touchmove', e => { if (!(e.target as HTMLElement).closest?.('#ov')) e.preventDefault() }, { passive: false })
