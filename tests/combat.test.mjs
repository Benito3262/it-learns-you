// Combat assertions on emulated iPhone touch. Run: node tests/combat.test.mjs  (needs `vite preview --port 4173`)
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const U = process.env.U || 'http://localhost:4173/', w = ms => new Promise(r => setTimeout(r, ms))
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
let pass = 0, fail = 0
const T = async (name, fn) => { try { const r = await fn(); pass++; console.log('PASS', name, r ? JSON.stringify(r) : '') } catch (e) { fail++; console.log('FAIL', name, e.message.split('\n')[0]) } }
async function open(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: vp[2], isMobile: true, hasTouch: true, userAgent: UA })
  const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('PAGEERR', e.message))
  await pg.goto(U); await w(2500)
  await pg.evaluate(() => { const g = window.__game; window.__run.settings.touch = true; window.__run.hero = 'heroM'; window.__run.boss = 0; g.scene.getScenes(true).forEach(s => g.scene.stop(s)); document.getElementById('ov').style.display = 'none'; g.scene.start('fight') })
  await pg.waitForFunction(() => window.__fight?.phase === 'fight', null, { timeout: 15000 })
  const cdp = await ctx.newCDPSession(pg)
  const pos = l => pg.evaluate(l => { const f = window.__fight, c = f.cameras.main, rc = f.game.canvas.getBoundingClientRect(), gs = f.scale.gameSize; const t = f.children.list.find(o => o.type === 'Text' && o.depth === 61 && o.text === l); return [rc.left + (t.x - c.scrollX) * rc.width / gs.width, rc.top + (t.y - c.scrollY) * rc.height / gs.height] }, l)
  const pts = async ls => Promise.all(ls.map(async (l, i) => { const [x, y] = await pos(l); return { x, y, id: i + 1 } }))
  const down = async ls => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: await pts(ls) })
  const up = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const tap = async (ls, hold = 60) => { await down(ls); await w(hold); await up() }
  const S = () => pg.evaluate(() => { const f = window.__fight; return { px: f.p.x, py: f.p.y, hp: f.p.hp, st: f.p.st, g: f.p.ground, bx: f.boss.x, bhp: f.boss.hp, bst: f.boss.st } })
  const setup = (px, bx, extra = {}) => pg.evaluate(([px, bx, e]) => { const f = window.__fight; f.active = []; Object.assign(f.boss, { x: px === null ? f.boss.x : bx, cd: 999, st: 'idle', t: 0, kb: 0, vy: 0, air: false, rush: 0, y: 612, unb: false }); Object.assign(f.p, { x: px, y: 612, vx: 0, vy: 0, st: 'idle', t: 0, hp: 100, iframe: 0, ground: true, stun: 0, meter: 0 }); f.guard = 100; f.boss.hp = f.boss.max; f.stillT = 0; f.candleT = 999; f.pickT = 999; Object.assign(f.boss, e) }, [px, bx, extra])
  const attack = (kind, x) => pg.evaluate(([k, x]) => { const f = window.__fight; f.boss.face = f.p.x > f.boss.x ? 1 : -1; f.boss.cd = 999; f.bossAttack(k, x); f.boss.unb = false }, [kind, x ?? null])
  const until = (fn, arg, ms = 3000) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 'raf' })
  return { ctx, pg, cdp, tap, down, up, S, setup, attack, until }
}
// ---- main combat suite at iPhone 14 landscape ----
const G = await open([844, 390, 3])
const { pg, tap, down, up, S, setup, attack, until } = G
const settleBoss = () => until(() => { const b = window.__fight.boss; return b.st !== 'windup' && b.st !== 'swipe' && !b.air }, null, 4000)

await T('GRAB: boss HP drops and boss is thrown >150px', async () => {
  await setup(560, 740); await w(150); const a = await S()
  await tap(['GRAB']); await w(1400); await until(() => !window.__fight.boss.air, null, 3000); const b = await S()
  assert.ok(b.bhp < a.bhp, `boss hp ${a.bhp} -> ${b.bhp}`)
  assert.ok(Math.abs(b.bx - a.bx) > 150, `boss moved only ${Math.abs(b.bx - a.bx)}px`)
  return { bossHp: [a.bhp, b.bhp], bossX: [Math.round(a.bx), Math.round(b.bx)] }
})
await T('GRAB at 1.3x body width still connects', async () => {
  await setup(500, 720); await w(150); const a = await S(); await tap(['GRAB']); await w(1400); const b = await S()
  assert.ok(b.bhp < a.bhp, 'no damage at 220px'); return { dist: 220, dmg: a.bhp - b.bhp }
})
const meleeLoss = async (kind, block) => {
  await setup(600, 740); await w(100)
  if (block) { await down(['BLOCK']); await w(320); assert.equal((await S()).st, 'block') }
  const h0 = (await S()).hp; await attack(kind, 600); await w(80); await settleBoss(); await w(150)
  const s = await S(); if (block) await up(); await w(300); return h0 - s.hp
}
for (const kind of ['swipe', 'read', 'charge']) await T(`BLOCK vs ${kind}: damage <=20% of unblocked`, async () => {
  const open_ = await meleeLoss(kind, false), blk = await meleeLoss(kind, true)
  assert.ok(open_ > 0, `${kind} did no damage unblocked`); assert.ok(blk <= open_ * 0.2, `blocked took ${blk} vs ${open_}`)
  return { unblocked: open_, blocked: blk }
})
await T('BLOCK shows guard visual', async () => { await setup(600, 740); await down(['BLOCK']); await w(300); await pg.screenshot({ path: 'shots/v5-block.png' }); const st = (await S()).st; await up(); assert.equal(st, 'block') })
await T('DODGE through boss: ends behind it, HP unchanged', async () => {
  await setup(600, 760); await w(100); const h0 = (await S()).hp
  await attack('swipe'); await until(() => window.__fight.boss.st === 'windup' && window.__fight.boss.t < 0.25, null, 3000)
  await down(['▶', 'DODGE']); await w(120); await up(); await settleBoss(); await w(200); const s = await S()
  assert.ok(s.px > s.bx, `player x ${Math.round(s.px)} not past boss ${Math.round(s.bx)}`); assert.equal(s.hp, h0, `hp ${h0} -> ${s.hp}`)
  return { player: Math.round(s.px), boss: Math.round(s.bx), hp: s.hp }
})
await T('DODGE through a charge rush', async () => {
  await setup(500, 820); await w(100); const h0 = (await S()).hp
  await attack('charge'); await until(() => window.__fight.boss.rush > 0 && Math.abs(window.__fight.boss.x - window.__fight.p.x) < 260, null, 3000)
  await down(['▶', 'DODGE']); await w(100); await up(); await settleBoss(); await w(200); const s = await S()
  assert.equal(s.hp, h0, `hp ${h0} -> ${s.hp}`); return { hp: s.hp }
})
await T('JUMP over boss: player x crosses boss x and lands', async () => {
  await setup(600, 760); await w(100)
  await down(['▶', 'JUMP']); await w(900); await up(); await until(() => window.__fight.p.ground, null, 2000); const s = await S()
  assert.ok(s.px > s.bx + 20, `player ${Math.round(s.px)} boss ${Math.round(s.bx)}`); assert.ok(s.g)
  return { player: Math.round(s.px), boss: Math.round(s.bx) }
})
await T('Walk into boss on ground is blocked by body (no walking through)', async () => {
  await setup(500, 700); await down(['▶']); await w(1500); await up(); const s = await S()
  assert.ok(s.px < s.bx, `walked through: ${s.px} ${s.bx}`); return { gap: Math.round(s.bx - s.px) }
})
await T('Facing auto-flips after crossing', async () => {
  await setup(900, 760); await w(300); const f = await pg.evaluate(() => window.__fight.p.face); assert.equal(f, -1); return { face: f }
})
await T('MOTION: eased acceleration, no snapping', async () => {
  await setup(300, 1100); await w(100)
  await pg.evaluate(() => { const f = window.__fight; window.__xs = []; f.events.on('postupdate', window.__pu = () => window.__xs.push(f.p.x)) })
  await down(['▶']); await w(700); await up(); await w(400)
  const xs = await pg.evaluate(() => { window.__fight.events.off('postupdate', window.__pu); return window.__xs })
  const d = xs.slice(1).map((x, i) => x - xs[i]).filter(v => Math.abs(v) > 0.01)
  const maxStep = Math.max(...d.map(Math.abs)), first = d[0], peak = Math.max(...d)
  assert.ok(maxStep < 20, `step ${maxStep}`); assert.ok(first < peak * 0.6, `no ramp-up (first ${first}, peak ${peak})`)
  const tail = d.slice(-3); assert.ok(tail.every(v => v < peak), 'no ease-out')
  return { frames: d.length, firstStep: +first.toFixed(1), peakStep: +peak.toFixed(1), maxStep: +maxStep.toFixed(1) }
})
await G.ctx.close()
// PERF: headless Chrome here composites WebGL in software (swiftshader), which caps fps ~27 regardless of game code; assert the game's own per-frame cost instead
{ const F = await open([844, 390, 3]); await T('PERF: game update+render CPU time < 8ms/frame (60fps budget 16.7ms)', async () => { await F.setup(600, 800, { cd: 0.5 }); await w(1500); const r = await F.pg.evaluate(() => new Promise(res => { const g = window.__game; let u = 0, n = 0; const su = g.scene.update.bind(g.scene), rd = g.scene.render.bind(g.scene); g.scene.update = (a, b) => { const t = performance.now(); su(a, b); u += performance.now() - t; n++ }; g.scene.render = x => { const t = performance.now(); rd(x); u += performance.now() - t }; setTimeout(() => res({ msPerFrame: +(u / n).toFixed(2), headlessFps: Math.round(g.loop.actualFps) }), 2500) })); assert.ok(r.msPerFrame < 8, JSON.stringify(r)); return r }); await F.ctx.close() }
// ---- viewports: all buttons visible + 1-frame response ----
for (const vp of [[844, 390, 3], [932, 430, 3], [1024, 340, 2]]) {
  const V = await open(vp)
  await T(`${vp[0]}x${vp[1]}: all touch buttons fully on screen`, async () => {
    const bad = await V.pg.evaluate(() => { const f = window.__fight, c = f.cameras.main, rc = f.game.canvas.getBoundingClientRect(), gs = f.scale.gameSize, k = rc.width / gs.width; const out = []; f.children.list.filter(o => o.type === 'Arc' && o.depth === 60).forEach(o => { const x = rc.left + (o.x - c.scrollX) * k, y = rc.top + (o.y - c.scrollY) * k, r = o.radius * k; if (x - r < 0 || y - r < 0 || x + r > innerWidth || y + r > innerHeight) out.push([Math.round(x), Math.round(y), Math.round(r)]) }); return { out, n: f.children.list.filter(o => o.type === 'Arc' && o.depth === 60).length } })
    assert.equal(bad.out.length, 0, 'off-screen: ' + JSON.stringify(bad.out)); return { buttons: bad.n }
  })
  for (const [l, st] of [['PUNCH', 'attack'], ['DODGE', 'evade'], ['BLOCK', 'block'], ['GRAB', 'grab'], ['JUMP', 'air']]) await T(`${vp[0]}x${vp[1]}: ${l} responds within 1 frame`, async () => {
    await V.setup(600, 790); await w(150)
    await V.pg.evaluate(() => { const f = window.__fight; window.__f0 = null; window.__hit = null; f.game.canvas.addEventListener('touchstart', window.__ts = () => { if (window.__f0 === null) window.__f0 = f.game.loop.frame }, { capture: true }); f.events.on('postupdate', window.__pu = () => { const p = f.p; if (window.__f0 !== null && window.__hit === null && p.st !== 'idle' || (window.__f0 !== null && window.__hit === null && !p.ground)) window.__hit = f.game.loop.frame }) })
    await V.tap([l], 200); await w(200)
    const r = await V.pg.evaluate(() => { const f = window.__fight; f.events.off('postupdate', window.__pu); f.game.canvas.removeEventListener('touchstart', window.__ts, { capture: true }); return { f0: window.__f0, hit: window.__hit, st: f.p.st } })
    assert.ok(r.hit !== null, 'no response'); assert.ok(r.hit - r.f0 <= 1, `took ${r.hit - r.f0} frames`); return { frames: r.hit - r.f0 }
  })
  await V.ctx.close()
}
await browser.close()
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
