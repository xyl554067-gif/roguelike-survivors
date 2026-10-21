#!/usr/bin/env node
/* 诊断：各武器弹道的实际轨迹 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 复用 leveluptest 的完整 DOM 桩
const { boot } = require('./leveluptest.js');
const { sb, G, D, Save } = boot();
const ui = { settings: {}, onStart() {}, onPause() {}, onResume() {}, onEnd() {}, onKey() {}, updateHUD() {}, openLevelUp() {}, onCardApplied() {}, toast() {} };
G.init({ width: 1280, height: 720, style: {}, getContext: () => new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (typeof k === 'string') return () => undefined; }, set() { return true; } }), addEventListener() {}, removeEventListener() {} }, ui);
sb.DSAudio.on = false;
Save.load();

const TRACK = ['kunai', 'fireball', 'axe', 'bolt', 'boomerang', 'poison', 'rocket', 'saw'];
console.log('\n弹道诊断（1 秒内的位移与形状）\n');
for (const wid of TRACK) {
  G.start('blade', 'normal');
  const p = G.player;
  p.weapons = [];
  p.aimAng = 0; p.aimX = 1;
  // 不放敌人，避免弹体立刻命中消失
  G.enemies.length = 0;
  const def = D.WEAPONS[wid];
  const st = def.init(p);
  def.fire(G, p, st);
  const born = G.projectiles.length;
  if (!born) { console.log(`${wid.padEnd(10)} 未生成弹体`); continue; }
  const id0 = G.projectiles[0];
  const startX = id0.x, startY = id0.y;
  const v0x = id0.vx, v0y = id0.vy;
  const pts = [];
  for (let i = 0; i < 30; i++) {
    G.updateProjectiles(1 / 30);
    const q = G.projectiles.find((x) => x === id0 || (x._born && x._born === born));
    // 用起始点匹配第一个弹体
    const cur = G.projectiles[0];
    if (!cur) break;
    pts.push({ x: cur.x, y: cur.y, vx: cur.vx, vy: cur.vy });
  }
  if (!pts.length) { console.log(`${wid.padEnd(10)} 弹体立即消失（life=0）`); continue; }
  const last = pts[pts.length - 1];
  const moved = Math.hypot(last.x - startX, last.y - startY);
  let maxTurn = 0;
  for (let i = 2; i < pts.length; i++) {
    const a1 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
    const a2 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    let d = a2 - a1; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    maxTurn = Math.max(maxTurn, Math.abs(d));
  }
  const yMin = Math.min(...pts.map(q => q.y));
  const yMax = Math.max(...pts.map(q => q.y));
  const spd = Math.hypot(v0x, v0y);
  console.log(
    `${wid.padEnd(10)} 初速${spd.toFixed(0).padStart(4)}  1秒位移${moved.toFixed(0).padStart(4)}  ` +
    `y范围[${yMin.toFixed(0)},${yMax.toFixed(0)}]  最大转向${(maxTurn * 57.3).toFixed(0).padStart(3)}°  ` +
    `弧线:${maxTurn > 0.1 ? '是' : '否'}  采样${pts.length}`);
}
console.log('');
