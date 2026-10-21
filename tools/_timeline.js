#!/usr/bin/env node
/* 单局时间线：看清 玩家DPS / 敌人数量 / 血量 三条曲线的关系 */
'use strict';
const { boot } = require('./leveluptest.js');
const { G, D } = boot();
G.init({ width: 1280, height: 720, style: {}, getContext: () => new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (typeof k === 'string') return () => undefined; }, set() { return true; } }), addEventListener() {}, removeEventListener() {} },
  { settings: {}, onStart() {}, onPause() {}, onResume() {}, onEnd() {}, onKey() {}, updateHUD() {}, openLevelUp() {}, onCardApplied() {}, toast() {} });

const CHAR = process.argv[2] || 'blade';
G.setSeed(4242);
G.start(CHAR, 'normal');
const p = G.player;
const keys = G.input ? G.input.keys : null;

console.log(`\n时间线 · ${CHAR}\n`);
console.log('  时间   等级  敌人  玩家DPS   受伤/s    HP      武器');
console.log('  ' + '─'.repeat(78));

let lastDmg = 0, lastTaken = 0, lastT = 0;
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
  let guard = 0;
  while (p.pendingLevels > 0 && guard++ < 60) {
    if (G.state !== 'levelup') G.state = 'levelup';
    G.applyCard(G.rollCards()[0]);
    if (G.state === 'levelup') G.state = 'playing';
  }

  if (G.t - lastT >= 30) {
    const dt = G.t - lastT;
    const dps = (p.dmgDealt - lastDmg) / dt;
    const tk = (p.dmgTaken - lastTaken) / dt;
    console.log(`  ${(G.t / 60).toFixed(1).padStart(4)}分 ${String(p.level).padStart(4)} ${String(G.enemies.length).padStart(5)} ${dps.toFixed(0).padStart(8)} ${tk.toFixed(1).padStart(8)}   ${String(Math.round(p.hp)).padStart(4)}/${String(Math.round(p.maxHp)).padEnd(4)}  ${p.weapons.map(w => w.id + ':' + w.lv).join(' ')}`);
    lastDmg = p.dmgDealt; lastTaken = p.dmgTaken; lastT = G.t;
  }
  if (G.state !== 'playing' && G.state !== 'levelup') { console.log(`  ✖ 死亡于 ${(G.t / 60).toFixed(1)} 分，Level ${p.level}`); break; }
}
console.log('');
