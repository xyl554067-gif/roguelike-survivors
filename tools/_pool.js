#!/usr/bin/env node
/* 分析：卡池容量 vs 升级次数需求 */
'use strict';
const { boot } = require('./leveluptest.js');
const { D } = boot();

console.log('\n卡池容量分析\n');
let passiveCap = 0;
for (const id in D.PASSIVES) passiveCap += D.PASSIVES[id].max;
let weaponCap = 0;
for (const id in D.WEAPONS) if (!D.WEAPONS[id].evolved) weaponCap += D.WEAPONS[id].max;

console.log('被动总升级点 :', passiveCap, `（${Object.keys(D.PASSIVES).length} 种）`);
console.log('武器总升级点 :', weaponCap, `（${Object.keys(D.WEAPONS).filter(k => !D.WEAPONS[k].evolved).length} 种基础武器）`);
console.log('进化路线     :', D.EVOLUTIONS.length, '条（各占 1 个武器位）');
console.log('');

// 实际一局最多能拿到的升级点
const MAXW = 6;
let best = 0;
// 6 件武器（其中可进化）+ 被动全满
for (let w = 0; w <= MAXW; w++) {
  // w 件武器都升满 8 级 = w*7 升级点（初始 Lv1）
  const wPts = w * 7;
  // 进化不额外给点
  best = Math.max(best, wPts + passiveCap);
}
console.log('单局理论最大升级点 :', best, '次');
console.log('（6 武器全满 + 18 被动全满）');
console.log('');

// 实际可达：武器位有限，只有 6 个
console.log('现实可达的升级点数：');
console.log('  最优策略 6 件武器升满 + 部分被动 :', 6 * 7, '+ 被动若干');
console.log('  典型中局   3 件武器(各 5 级) + 8 项被动(各 2 级) :', 3 * 4, '+', 8 * 2, '=', 3 * 4 + 8 * 2);
console.log('');

// 关键问题：武器位满 6 后，新武器卡不再出现
console.log('\n\x1b[33m问题：6 件武器占满位置后，剩余升级只能吃被动\x1b[0m');
console.log('  被动 18 种共', passiveCap, '级 —— 够用，但');
console.log('  武器升级点（6×7=42）需要"始终优先升同一件武器"才能吃到。');
console.log('  若玩家每级都换新武器，会很快 6 件满级且都只有 1-2 级，后期成长极慢。');
console.log('');

// Lv.14 大概需要多少升级点
console.log('前 14 级需要的升级点 :', 13, '次（每级一次）');
console.log('  13 次升级里，如果平均分给 6 件武器 → 每件 2-3 级');
console.log('  此时所有武器都远未满级，理论上不该卡住。');
console.log('');
console.log('=> 更可能的原因：\x1b[33m经验获取不足\x1b[0m（怪物经验值太低 / 宝石没捡到）');
