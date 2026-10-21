#!/usr/bin/env node
/* 死因分析：统计各类伤害来源占比与 Boss 技能命中情况 */
'use strict';
const { boot } = require('./leveluptest.js');
const { G, D } = boot();
G.init({ width: 1280, height: 720, style: {}, getContext: () => new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (typeof k === 'string') return () => undefined; }, set() { return true; } }), addEventListener() {}, removeEventListener() {} },
  { settings: {}, onStart() {}, onPause() {}, onResume() {}, onEnd() {}, onKey() {}, updateHUD() {}, openLevelUp() {}, onCardApplied() {}, toast() {} });

const tally = {};
function note(k, v) { tally[k] = (tally[k] || 0) + v; }

// 精确归因：直接包裹 damagePlayer 记录来源
const origDamage = G.damagePlayer.bind(G);
G.damagePlayer = function (dmg, src) {
  const hpBefore = this.player.hp;
  origDamage(dmg, src);
  const lost = hpBefore - this.player.hp;
  if (lost > 0) {
    let key;
    if (!src) key = '无源( indifference )';
    else if (src.kind === 'orb') key = 'Boss 弹幕';
    else if (src.kind === 'spit') key = '喷吐者唾液';
    else if (src.boss) key = 'Boss 接触';
    else if (src.def && (src.def.selfDestruct || src.def.boomOnDeath)) key = '自爆/邪符';
    else if (src.def) key = '普通怪接触(' + (src.def.name || '?') + ')';
    else key = '其它';
    note(key, lost);
  }
};

function runOne(charId, seed) {
  G.setSeed(seed);
  G.start(charId, 'normal');
  const p = G.player;
  const keys = G.input ? G.input.keys : null;
  for (let i = 0; i < 30 * 60 * 30; i++) {
    let fx = 0, fy = 0, danger = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const radius = 130 + (e.boss ? 220 : 0);
      if (d < radius) { const w = (radius - d) / radius; fx += dx / d * w; fy += dy / d * w; danger += w; }
    }
    for (const s of G.summons || []) {
      const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1;
      if (d < 170) { const w = (170 - d) / 170; fx += dy / d * w * 1.6; fy += -dx / d * w * 1.6; danger += w; }
    }
    let gb = null, gd = 1e9;
    for (const gm of G.gems) { const dd = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2; if (dd < gd) { gd = dd; gb = gm; } }
    if (gb && danger < 0.6) { const dx = gb.x - p.x, dy = gb.y - p.y, d = Math.hypot(dx, dy) || 1; fx += dx / d * 0.55; fy += dy / d * 0.55; }
    if (keys) { keys.clear(); if (fx > 0.15) keys.add('d'); else if (fx < -0.15) keys.add('a'); if (fy > 0.15) keys.add('s'); else if (fy < -0.15) keys.add('w'); }
    if (danger > 2.2 && p.dashCd <= 0) G.tryDash();

    G.step(1 / 30);
    // 归因已在包裹后的 damagePlayer 中完成
    let guard = 0;
    while (p.pendingLevels > 0 && guard++ < 60) {
      if (G.state !== 'levelup') G.state = 'levelup';
      G.applyCard(G.rollCards()[0]);
      if (G.state === 'levelup') G.state = 'playing';
    }
    if (G.state !== 'playing' && G.state !== 'levelup') break;
  }
  return { t: G.t / 60, lvl: p.level, taken: p.dmgTaken };
}

const CHARS = ['blade', 'ranger', 'warden', 'fatty'];
console.log('\n死因分析（各跑 4 局，取合计）\n');
for (const ch of CHARS) {
  const before = JSON.stringify(tally);
  const rs = [];
  for (let s = 1; s <= 4; s++) rs.push(runOne(ch, 2000 + s * 104729));
  console.log(`  ${ch.padEnd(8)} 存活 ${(rs.reduce((a, b) => a + b.t, 0) / rs.length).toFixed(1)} 分  等级 ${(rs.reduce((a, b) => a + b.lvl, 0) / rs.length).toFixed(1)}  承伤 ${rs.reduce((a, b) => a + b.taken, 0)}`);
}
const total = Object.values(tally).reduce((a, b) => a + b, 0);
console.log('\n  承伤来源占比:');
for (const k of Object.keys(tally).sort((a, b) => tally[b] - tally[a])) {
  const pct = tally[k] / total * 100;
  console.log(`    ${k.padEnd(22)} ${String(Math.round(tally[k])).padStart(6)}  ${pct.toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(pct / 2))}`);
}
console.log(`\n  合计承伤 ${Math.round(total)}\n`);
