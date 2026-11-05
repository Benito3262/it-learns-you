import Phaser from 'phaser'
export const ARENAS = [
  { key: 'floor', name: 'Trading Floor', sub: 'city office at night', floor: 0x1d1a26 },
  { key: 'roof', name: 'Rooftop', sub: 'high above the city', floor: 0x23202e },
  { key: 'vault', name: 'Neon Vault', sub: 'glowing steel vault', floor: 0x0e1424 },
  { key: 'desert', name: 'Desert', sub: 'hot sand and old ruins', floor: 0x5a3a22 },
]
export const HOME = ['floor', 'roof', 'vault', 'desert', 'roof', 'floor', 'desert']
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
export function paintArena(s: Phaser.Scene, key: string, W = 1280, H = 720, FY = 612) {
  seed = 7; const g = s.add.graphics(); const anim: Phaser.GameObjects.GameObject[] = []
  if (key === 'floor') {
    g.fillGradientStyle(0x0b1020, 0x0b1020, 0x2a1830, 0x2a1830, 1).fillRect(0, 0, W, H)
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      const x = 30 + i * 140, y = 140 + r * 120
      g.fillStyle(0x05070d).fillRect(x, y, 120, 90); g.lineStyle(3, 0x30384a).strokeRect(x, y, 120, 90)
      let py = y + 45; g.lineStyle(2, rnd() < 0.7 ? 0xff4d4d : 0x2fbf71, 0.9).beginPath(); g.moveTo(x + 6, py)
      for (let k = 1; k <= 10; k++) { py = Phaser.Math.Clamp(py + (rnd() - 0.6) * 22 * (r + 1) / 2, y + 8, y + 82); g.lineTo(x + 6 + k * 10.8, py) } g.strokePath()
    }
    g.fillStyle(0x000000, 0.5).fillRect(0, 470, W, 40); for (let i = 0; i < 12; i++) g.fillStyle(0x2a2436).fillRect(i * 110, 500, 80, 112)
    const t = s.add.text(0, 30, '  BTC -12.4%   ETH -15.1%   SOL -21.7%   $BEAR +420%   USDT 0.998   PEPE -34.0%   ', { fontFamily: 'monospace', fontSize: '22px', color: '#ff6b6b', backgroundColor: '#000a' }).setAlpha(0.8)
    s.tweens.add({ targets: t, x: -700, duration: 14000, repeat: -1 }); anim.push(t)
  } else if (key === 'roof') {
    g.fillGradientStyle(0x1a1440, 0x1a1440, 0xc0566a, 0xc0566a, 1).fillRect(0, 0, W, H)
    g.fillStyle(0xfff1c0, 0.9).fillCircle(1030, 150, 60); g.fillStyle(0xfff1c0, 0.15).fillCircle(1030, 150, 110)
    for (let layer = 0; layer < 2; layer++) for (let x = -20; x < W; ) {
      const w = 50 + rnd() * 90, h = (layer ? 180 : 280) + rnd() * 200; const c = layer ? 0x1a1228 : 0x2b2140
      g.fillStyle(c).fillRect(x, FY - 60 - h, w, h + 60)
      for (let wy = FY - 50 - h; wy < FY - 80; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16) if (rnd() < 0.35) g.fillStyle(0xffd27a, layer ? 0.9 : 0.4).fillRect(wx, wy, 7, 10)
      x += w + 8
    }
    g.fillStyle(0x3a3346).fillRect(0, FY - 30, W, 30); g.fillStyle(0x7a2a2a).fillRect(140, FY - 200, 8, 170); g.fillStyle(0xff3030).fillCircle(144, FY - 205, 7)
  } else if (key === 'vault') {
    g.fillGradientStyle(0x050816, 0x050816, 0x10183a, 0x10183a, 1).fillRect(0, 0, W, H)
    for (let x = 0; x <= W; x += 80) g.lineStyle(1, 0x00e5ff, 0.15).lineBetween(x, 0, x, FY)
    for (let y = 0; y <= FY; y += 80) g.lineStyle(1, 0xff2bd6, 0.12).lineBetween(0, y, W, y)
    g.lineStyle(14, 0x00e5ff, 0.5).strokeCircle(W / 2, 300, 210); g.lineStyle(4, 0xff2bd6, 0.7).strokeCircle(W / 2, 300, 170)
    for (let a = 0; a < 8; a++) { const r = (a * Math.PI) / 4; g.lineStyle(10, 0x00e5ff, 0.35).lineBetween(W / 2 + Math.cos(r) * 60, 300 + Math.sin(r) * 60, W / 2 + Math.cos(r) * 160, 300 + Math.sin(r) * 160) }
    for (let i = 0; i < 10; i++) { g.fillStyle(0xf5c84c, 0.5).fillRect(30 + i * 26, FY - 40 - (i % 3) * 14, 22, 12); g.fillRect(W - 280 + i * 26, FY - 30 - (i % 4) * 12, 22, 12) }
    const glow = s.add.circle(W / 2, 300, 230, 0x00e5ff, 0.06); s.tweens.add({ targets: glow, alpha: 0.18, duration: 1400, yoyo: true, repeat: -1 }); anim.push(glow)
  } else {
    g.fillGradientStyle(0xff9a4a, 0xff9a4a, 0x7a2f4a, 0x7a2f4a, 1).fillRect(0, 0, W, H)
    g.fillStyle(0xffe08a).fillCircle(320, 300, 90)
    g.fillStyle(0x8a4a2a).beginPath(); g.moveTo(0, 470); for (let x = 0; x <= W; x += 40) g.lineTo(x, 450 + Math.sin(x / 140) * 40); g.lineTo(W, FY); g.lineTo(0, FY); g.closePath(); g.fillPath()
    const names = ['LUNA', 'FTT', 'SQUID', 'BITCONNECT', 'SAFEMOON', 'TITAN']
    names.forEach((n, i) => { const x = 120 + i * 200, y = 520 + (i % 2) * 30; g.fillStyle(0x4a3326).fillRoundedRect(x, y - 70, 70, 80, { tl: 30, tr: 30, bl: 0, br: 0 }); anim.push(s.add.text(x + 35, y - 35, 'RIP\n' + n, { fontFamily: 'monospace', fontSize: '11px', color: '#e8cfa8', align: 'center' }).setOrigin(0.5)) })
    for (let i = 0; i < 14; i++) { g.fillStyle(0xc9a84a, 0.7).fillEllipse(rnd() * W, 560 + rnd() * 40, 26, 9) }
  }
  g.fillStyle(0x000000, 0.25).fillRect(0, 0, W, H) // mood
  return [g, ...anim]
}
