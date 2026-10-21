#!/usr/bin/env node
/* 复现：升级到某级后卡住 */
'use strict';
const { boot } = require('./leveluptest.js');
const { G, D, sb } = boot();
sb.DSAudio.on = false;

console.log('\n长局升级追踪（自动选卡，优先武器升级）\n');
G.start('warden', 'normal');
const p = G.player;
const keys = sb.DSInput.keys;

// 模拟 12 分钟
let lastLevel = 1, stuckAt = null, sameLevelFrames = 0;
const log = [];
for (let i = 0; i < 30 * 60 * 12; i++) {
  // 走位：朝最近敌人靠近
  const t = G.nearestEnemy(p, 900);
  keys.clear();
  if (t) {
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
    const want = 110, k = d > want ? 1 : d < want * 0.6 ? -1 : 0;
    let fx = (dx / d) * k - (dy / d) * 0.55, fy = (dy / d) * k + (dx / d) * 0.55;
    if (fx > 0.25) keys.add('d'); else if (fx < -0.25) keys.add('a');
    if (fy > 0.25) keys.add('s'); else if (fy < -0.25) keys.add('w');
  }
  G.step(1 / 30);
  // 自动选卡（无论 state 如何都处理）
  let guard = 0;
  while (p.pendingLevels > 0 && guard++ < 50) {
    const cards = G.rollCards();
    const pick = cards.find(c => c.type === 'evo') || cards.find(c => c.type === 'wu')
              || cards.find(c => c.type === 'w') || cards[0];
    G.applyCard(pick);
    if (G.state === 'levelup') G.state = 'playing';
  }
  if (p.level !== lastLevel) {
    sameLevelFrames = 0;
    if (i % (30 * 30) === 0 || p.level % 5 === 0) {
      log.push(`  ${(G.t / 60).toFixed(1)}分 → Lv.${p.level}  武器[${p.weapons.map(w => w.id + ':' + w.lv).join(',')}]`);
    }
    lastLevel = p.level;
  } else {
    sameLevelFrames++;
    if (sameLevelFrames > 30 * 240 && !stuckAt) {  // 4 分钟没升级
      stuckAt = { level: p.level, t: G.t, xp: p.xp, need: p.xpNeed };
    }
  }
  if (G.state !== 'playing') { log.push(`  结束于 ${(G.t / 60).toFixed(1)} 分，state=${G.state}`); break; }
}
console.log(log.join('\n'));
console.log('');
console.log('最终:', `Lv.${p.level}`, `存活 ${(G.t / 60).toFixed(1)} 分`, `击杀 ${p.kills}`,
  `经验 ${p.xp.toFixed(0)}/${p.xpNeed}`);
console.log('武器:', p.weapons.map(w => `${w.id}:${w.lv}`).join(', '));
console.log('被动:', Object.entries(p.passives).map(([k, v]) => `${k}${v}`).join(', '));
if (stuckAt) {
  console.log(`\n\x1b[31m卡住了：Lv.${stuckAt.level}，${(stuckAt.t / 60).toFixed(1)} 分钟没升级\x1b[0m`);
  console.log('  经验:', stuckAt.xp.toFixed(0), '/', stuckAt.need);
} else {
  console.log('\n\x1b[32m未出现长时间卡级\x1b[0m');
}
console.log('');
