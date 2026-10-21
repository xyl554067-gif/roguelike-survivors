#!/usr/bin/env node
/* 平衡性评估：用统一的机器人跑多局，量化「存活时长 / 等级 / 死因」 */
'use strict';
const { boot } = require('./leveluptest.js');
const { G, D } = boot();
G.init({ width: 1280, height: 720, style: {}, getContext: () => new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (typeof k === 'string') return () => undefined; }, set() { return true; } }), addEventListener() {}, removeEventListener() {} },
  { settings: {}, onStart() {}, onPause() {}, onResume() {}, onEnd() {}, onKey() {}, updateHUD() {}, openLevelUp() {}, onCardApplied() {}, toast() {} });

const CHARS = process.argv[2] ? process.argv[2].split(',') : ['blade', 'ranger', 'warden', 'fatty'];
const DIFF = process.argv[3] || 'normal';
const SEEDS = Number(process.argv[4] || 5);
const MAXMIN = 30;

function pickCard(p, cards) {
  // 简单优先级：进化 > 已有武器升级 > 新武器 > 被动
  return cards.find(c => c.type === 'evo')
    || cards.find(c => c.type === 'wu')
    || cards.find(c => c.type === 'w')
    || cards.find(c => c.type === 'p')
    || cards[0];
}

function runOne(charId, seed) {
  G.setSeed(seed);
  G.start(charId, DIFF);
  const p = G.player;
  const keys = G.input ? G.input.keys : null;
  let bossAtDeath = null, lowHpTime = 0;

  for (let i = 0; i < 30 * 60 * MAXMIN; i++) {
    // —— 机器人策略：远离敌群密度中心，顺路捡宝石，必要时冲刺脱围 ——
    let fx = 0, fy = 0, danger = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const radius = 130 + (e.boss ? 220 : 0);
      if (d < radius) {
        const w = (radius - d) / radius;
        fx += (dx / d) * w; fy += (dy / d) * w;
        danger += w;
      }
    }
    // 敌人子弹：侧向躲避
    for (const s of G.summons || []) {
      const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1;
      if (d < 170) { const w = (170 - d) / 170; fx += (dy / d) * w * 1.6; fy += (-dx / d) * w * 1.6; danger += w; }
    }
    // 向最近的宝石靠拢（权重低）
    let gbest = null, gd = 1e9;
    for (const gm of G.gems) {
      const dd = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
      if (dd < gd) { gd = dd; gbest = gm; }
    }
    if (gbest && danger < 0.6) {
      const dx = gbest.x - p.x, dy = gbest.y - p.y, d = Math.hypot(dx, dy) || 1;
      fx += (dx / d) * 0.55; fy += (dy / d) * 0.55;
    }
    if (keys) {
      keys.clear();
      if (fx > 0.15) keys.add('d'); else if (fx < -0.15) keys.add('a');
      if (fy > 0.15) keys.add('s'); else if (fy < -0.15) keys.add('w');
    }
    // 危险时冲刺
    if (danger > 2.2 && p.dashCd <= 0) G.tryDash();

    G.step(1 / 30);

    let guard = 0;
    while (p.pendingLevels > 0 && guard++ < 60) {
      if (G.state !== 'levelup') G.state = 'levelup';
      G.applyCard(pickCard(p, G.rollCards()));
      if (G.state === 'levelup') G.state = 'playing';
    }
    if (p.hp / p.maxHp < 0.35) lowHpTime += 1 / 30;
    const boss = G.enemies.find(e => e.boss && !e.dead);
    if (boss) bossAtDeath = boss.def ? boss.def.name : 'boss';

    if (G.state !== 'playing' && G.state !== 'levelup') break;
  }
  return {
    t: G.t / 60, level: p.level, kills: p.kills, boss: bossAtDeath,
    lowHpTime, hp: p.hp, maxHp: p.maxHp, won: G.state === 'win',
  };
}

console.log(`\n平衡性评估 —— 难度「${DIFF}」  每角色 ${SEEDS} 局\n`);
console.log('  角色        存活(分)   等级   击杀   残血%   危险时长(秒)  结束于');
console.log('  ' + '─'.repeat(72));
const agg = {};
for (const ch of CHARS) {
  const rs = [];
  for (let s = 1; s <= SEEDS; s++) rs.push(runOne(ch, 1000 + s * 7919));
  const avg = (f) => rs.reduce((a, b) => a + f(b), 0) / rs.length;
  const name = (D.CHARACTERS.find(c => c.id === ch) || {}).name || ch;
  agg[ch] = { t: avg(r => r.t), lvl: avg(r => r.level), k: avg(r => r.kills) };
  console.log(`  ${name.padEnd(12)} ${avg(r => r.t).toFixed(1).padStart(5)}   ${avg(r => r.level).toFixed(1).padStart(5)}  ${avg(r => r.kills).toFixed(0).padStart(6)}   ${avg(r => r.hp / r.maxHp * 100).toFixed(0).padStart(4)}%   ${avg(r => r.lowHpTime).toFixed(0).padStart(7)}     ${rs[0].boss || '—'}`);
}
const overall = Object.values(agg);
console.log('  ' + '─'.repeat(72));
console.log(`  平均         ${(overall.reduce((a, b) => a + b.t, 0) / overall.length).toFixed(1).padStart(5)}   ` +
  `${(overall.reduce((a, b) => a + b.lvl, 0) / overall.length).toFixed(1).padStart(5)}  ` +
  `${(overall.reduce((a, b) => a + b.k, 0) / overall.length).toFixed(0).padStart(6)}`);
console.log('');
