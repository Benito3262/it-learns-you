export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
export const HABITS: Record<string, { lines: string[]; counter: string }> = {
  dodgeL: { lines: ['You always roll left.'], counter: 'It now waits where your left roll lands' },
  dodgeR: { lines: ['You always roll right.'], counter: 'It now waits where your right roll lands' },
  jumper: { lines: ['You jump too much.'], counter: 'It now hits you in the air' },
  still: { lines: ['You stand still too long.'], counter: 'It now attacks when you stop moving' },
  campL: { lines: ['You stay on the left side.'], counter: 'Hazards now drop on the left' },
  campR: { lines: ['You stay on the right side.'], counter: 'Hazards now drop on the right' },
  campM: { lines: ['You stay in the middle.'], counter: 'Hazards now drop in the middle' },
  runLow: { lines: ['You run away when your health is low.'], counter: 'It chases harder when you are hurt' },
  noDodge: { lines: ['You never dodge.'], counter: 'Its attacks are faster now' },
  turtle: { lines: ['You block too much.'], counter: 'It now breaks your guard' },
  grabby: { lines: ['You grab too often.'], counter: 'It escapes grabs more often' },
  spam_punch: { lines: ['You only punch.'], counter: 'It now blocks your punches' },
  spam_uppercut: { lines: ['You overuse the uppercut.'], counter: 'It now blocks your uppercut' },
  spam_finisher: { lines: ['You always use the same 3-hit combo.'], counter: 'It now blocks your finisher' },
  spam_heavy: { lines: ['You overuse the power punch.'], counter: 'It now blocks power punches' },
  spam_dash: { lines: ['You always open with a dash.'], counter: 'It now blocks dash strikes' },
  spam_slam: { lines: ['You overuse the down slam.'], counter: 'It now blocks down slams' },
  spam_sweep: { lines: ['You overuse the low sweep.'], counter: 'It now jumps your sweeps' },
  spam_air: { lines: ['You fight from the air too much.'], counter: 'It now blocks air attacks' },
}
const L = (intro: string, retry: string, win: string) => ({ intro: [intro], retry: [retry], win: [win] })
export const BOSS_LINES: Record<string, { intro: string[]; retry: string[]; win: string[] }> = {
  stoploss: L('Stand still and you lose.', 'Back again? Keep moving.', 'Boss defeated!'),
  gasfee: L('Every move costs you.', 'Try again. Watch the coins.', 'Boss defeated!'),
  exitliq: L('The walls are closing in.', 'Stay off the walls.', 'Boss defeated!'),
  fud: L('Watch out for the clouds.', 'It will appear behind you.', 'Boss defeated!'),
  rugpull: L('Watch the floor.', 'The floor will drop again.', 'Boss defeated!'),
  liquidation: L('Dodge the lasers.', 'Watch for the red columns.', 'Boss defeated!'),
  bear: L('Final boss. It knows all your habits.', 'Try again. Change your style.', 'You win!'),
}
export const DEATH = ['GAME OVER', 'YOU LOSE']
export const DEATH_SUB = ['Try again.', 'The boss learned from you.', 'Change your style and retry.']
