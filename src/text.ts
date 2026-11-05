export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
export const HABITS: Record<string, { lines: string[]; counter: string }> = {
  dodgeL: { lines: ["You dodge left like it's support. It isn't.", 'Every roll goes left. Very predictable price action.', 'Left roll again? Chart says double bottom. Boss says free hit.'], counter: 'It now waits where your left roll lands' },
  dodgeR: { lines: ['You roll right like you only know one candle colour.', 'Right roll, every time. Momentum trader behaviour.', 'You dodge right. It already front-ran that.'], counter: 'It now waits where your right roll lands' },
  jumper: { lines: ['You jump more than a memecoin on launch day.', 'Always airborne. Gravity is not FUD.', 'You hop like the floor has a tax.'], counter: 'Anti-air swipes armed' },
  still: { lines: ['You stand still like you are waiting for a reply from support.', 'You froze. Hodling is not a defence.', 'Zero movement. Stablecoin energy.'], counter: 'Snipes anything that stops moving' },
  campL: { lines: ['You live on the left side of the order book.', 'Left edge, again. Comfort zone located.'], counter: 'Hazards drop on the left' },
  campR: { lines: ['You camp the right like it is your bag.', 'Right side only. Exit liquidity found you.'], counter: 'Hazards drop on the right' },
  campM: { lines: ['You hug the middle. Centrist trader.', 'Dead centre, every time. It drew a circle.'], counter: 'Hazards drop in the middle' },
  runLow: { lines: ['Low HP and you run. Paper hands confirmed.', 'You panic sell your position when hurt.', 'Red health, red candle, you exit. It noticed.'], counter: 'It hunts harder when you are hurt' },
  noDodge: { lines: ['You never dodge. Full send, zero risk management.', 'No rolls at all. Leverage maxi.'], counter: 'Attacks come faster' },
  turtle: { lines: ['You block everything. Cold wallet personality.', 'Guard up, all fight. It brought a crowbar.'], counter: 'Guard-crushing hits unlocked' },
  grabby: { lines: ['You grab like it is a free airdrop.', 'Grab, throw, repeat. It learned to slip out.'], counter: 'It escapes grabs more often' },
  spam_punch: { lines: ['You jab like you are clicking refresh on a pending tx.', 'Punch, punch, punch. Spam filter enabled.'], counter: 'It blocks your jabs' },
  spam_uppercut: { lines: ['Your uppercut is your whole thesis.', 'Uppercut again? It read the whitepaper.'], counter: 'It blocks your uppercut' },
  spam_finisher: { lines: ['You only trust the three-hit combo. Diversify.', 'Same finisher, same chart pattern.'], counter: 'It blocks your finisher' },
  spam_heavy: { lines: ['You charge every punch like a gas war.', 'Holding attack is not a strategy. It is a tell.'], counter: 'It blocks charged punches' },
  spam_dash: { lines: ['You dash in like an influencer shilling a launch.', 'Dash strike opener every time. Front-ran.'], counter: 'It blocks dash strikes' },
  spam_slam: { lines: ['You slam from the sky like a whale dumping.', 'Down slam again. It looked up.'], counter: 'It blocks down slams' },
  spam_sweep: { lines: ['You sweep the legs more than a rug sweeps a treasury.', 'Low sweep spam. It learned to jump.'], counter: 'It blocks low sweeps' },
  spam_air: { lines: ['You air combo like your bags are going to the moon.', 'Always fighting from the sky. It aims up now.'], counter: 'It blocks air combos' },
}
export const BOSS_LINES: Record<string, { intro: string[]; retry: string[]; win: string[] }> = {
  stoploss: { intro: ['Stand still and I close your position.', 'I trigger at the worst possible price. Yours.'], retry: ['Back already? Your entry was terrible.', 'Same setup, same exit. Mine.'], win: ['Stop Loss triggered. On him.', 'You moved. He did not see that coming.'] },
  exitliq: { intro: ['Every corner you run to, I am already there.', 'Someone has to be left holding. It is you.'], retry: ['The walls remember you.', 'More liquidity just arrived. It was yours.'], win: ['Exit Liquidity has left the arena.', 'You found the exit. He was the liquidity.'] },
  rugpull: { intro: ['Nice floor you are standing on. Shame about it.', 'Trust the team. I am the team.'], retry: ['Devs are doing something. It is me.', 'I already sold your favourite tile.'], win: ['Rug Pull got rugged.', "The floor held. His didn't."] },
  bear: { intro: ['I have read every habit you showed them. All of them.', 'Bull runs end. I do not.'], retry: ['Still here? Most people capitulate by now.', 'Your chart, your habits, my lunch.'], win: ['Bear Szn is cancelled.', 'Bear market over. Touch grass, champion.'] },
}
export const DEATH = ['LIQUIDATED', 'REKT', 'NGMI (YET)', 'MARGIN CALLED', 'FUNDS ARE NOT SAFU', 'PAPER HANDED']
export const DEATH_SUB = ['Should have set a tighter stop.', 'Down bad. Run it back.', 'That was a learning experience. For it.', 'Your health went to zero faster than a shitcoin.', 'Cope, then queue again.']
