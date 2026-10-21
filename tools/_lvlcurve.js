#!/usr/bin/env node
/* 分析升级曲线：几级之后会卡住 */
'use strict';
const { boot } = require('./leveluptest.js');
const { G } = boot();

console.log('\n经验曲线与升级速度分析\n');
console.log('等级  所需经验  累计经验   累计所需');
let cum = 0, cumNeed = 0;
const rows = [];
for (let lv = 1; lv <= 45; lv++) {
  const need = G.xpFor(lv);
  cum += need; cumNeed += need;
  rows.push({ lv, need, cum });
}
for (const r of rows) {
  if (r.lv <= 20 || r.lv % 5 === 0) {
    console.log(`  ${String(r.lv).padStart(2)}   ${String(r.need).padStart(5)}   ${String(r.cum).padStart(6)}   ${String(r.cumNeed).padStart(7)}`);
  }
}

// 模拟：平均每分钟能拿到多少经验
console.log('\n每分钟经验产出估算（假设各阶段击杀速度）\n');
const killsPerMin = [15, 30, 50, 75, 100, 130, 160, 190, 220, 250, 280, 310, 340, 370, 400, 430, 460, 490, 520, 550, 580, 610, 640, 670, 700, 730, 760, 790, 820, 850];
const avgXp = 2.2;   // 平均每只怪的经验
let exp = 0, lv = 1, need = G.xpFor(1);
console.log('时间   等级  经验/需求    本分钟升级?');
for (let min = 1; min <= 30; min++) {
  const gain = killsPerMin[min - 1] * avgXp;
  exp += gain;
  let up = 0;
  while (exp >= need) { exp -= need; lv++; need = G.xpFor(lv); up++; }
  if (min <= 20 || min % 5 === 0) {
    console.log(`${String(min).padStart(3)}分  ${String(lv).padStart(4)}  ${String(Math.round(exp)).padStart(5)}/${String(need).padStart(4)}   ${up ? '↑×' + up : '—'}`);
  }
}
console.log('\n注：实际经验受「贪婪/智慧」被动与难度倍率影响，此为基准估算\n');
