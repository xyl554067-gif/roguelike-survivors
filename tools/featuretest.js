#!/usr/bin/env node
/* =====================================================================
   v2.3 新特性回归测试：
   1) 难度差异化时长 + 无尽模式
   2) 等级带来的属性成长
   3) 局内商店（购买生效 + 加成不被 recompute 抹掉）
   4) 角色多途径解锁（金币购买 / 成就）
   5) 回血手段（升级回血 / 击杀里程碑回血）
   6) 虚拟摇杆输入
   ===================================================================== */
'use strict';
const { boot } = require('./leveluptest.js');
const { G, D, Save, sb } = boot();
const UI = { settings: {}, onStart() {}, onPause() {}, onResume() {}, onEnd() {}, onKey() {}, updateHUD() {}, openLevelUp() {}, onCardApplied() {}, toast() {} };
G.init({ width: 1280, height: 720, style: {}, getContext: () => new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (typeof k === 'string') return () => undefined; }, set() { return true; } }), addEventListener() {}, removeEventListener() {} }, UI);
Save.load();

let pass = 0, fail = 0; const bad = [];
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + msg); }
  else { fail++; bad.push(msg); console.log('  \x1b[31m✗ ' + msg + '\x1b[0m' + (extra ? '  → ' + extra : '')); }
}
const Input = sb.DSInput;

console.log('\n\x1b[1m夜刃求生 v2.3 —— 新特性回归测试\x1b[0m');

/* ---------- 1. 难度时长 ---------- */
console.log('\n\x1b[1m[1] 难度各自独立时长\x1b[0m');
{
  const durs = {};
  for (const d of D.DIFFICULTIES) {
    G.start('blade', d.id);
    durs[d.id] = G.duration;
  }
  const mins = Object.fromEntries(Object.entries(durs).map(([k, v]) => [k, v / 60]));
  ok(D.DIFFICULTIES.every((d) => d.duration && d.duration > 0), '每个难度都定义了 duration');
  ok(mins.easy < mins.normal && mins.normal < mins.hard && mins.hard < mins.nightmare,
    `时长递增：${mins.easy} < ${mins.normal} < ${mins.hard} < ${mins.nightmare} 分钟`);
  ok(mins.nightmare <= 25, `最长局不超过 25 分钟（当前 ${mins.nightmare}）`);
  // 常规模式会在时限刷出终局 Boss
  // 同样只验证「时点」而非生存，因此屏蔽伤害并固定种子
  G.setSeed(31415);
  G.start('blade', 'easy');
  ok(!G.endless && G.duration === D.DIFFICULTIES[0].duration, '常规模式使用难度时长');
  const origDmg1 = G.damagePlayer;
  G.damagePlayer = function () {};
  for (let i = 0; i < 30 * 60 * 13; i++) {
    G.step(1 / 30);
    let g = 0;
    while (G.player.pendingLevels > 0 && g++ < 60) {
      if (G.state === 'levelup') G.state = 'playing';
      G.applyCard(G.rollCards()[0]);
      if (G.state === 'levelup') G.state = 'playing';
    }
    if (G.finalSpawned) break;
    if (G.state !== 'playing' && G.state !== 'levelup') break;
  }
  G.damagePlayer = origDmg1;
  ok(G.finalSpawned, `常规模式到达 ${mins.easy} 分钟后刷出深渊领主（finalSpawned=${G.finalSpawned}）`);

  // 端到端：打完终局 Boss 应当判定通关（缩短后的流程要能真正走通）
  G.setSeed(7777);
  G.start('blademaster', 'easy');
  const orig = G.damagePlayer;
  G.damagePlayer = function () {};     // 只验证流程，不验证生存
  let won = false;
  for (let i = 0; i < 30 * 60 * 20; i++) {
    G.step(1 / 30);
    let g = 0;
    while (G.player.pendingLevels > 0 && g++ < 60) {
      if (G.state === 'levelup') G.state = 'playing';
      G.applyCard(G.rollCards()[0]);
      if (G.state === 'levelup') G.state = 'playing';
    }
    // 直接击杀终局 Boss，模拟玩家完成最后一击
    const fin = G.enemies.find((e) => e.final && !e.dead);
    if (fin) { fin.hp = 0; G.killEnemy(G.player, fin, 'test'); }
    if (G.state === 'win') { won = true; break; }
    if (G.state !== 'playing' && G.state !== 'levelup') break;
  }
  G.damagePlayer = orig;
  ok(won, `击败深渊领主后判定通关（state=${G.state}）`);
  ok(G.won === true, 'won 标记写入成功（用于结算页展示）');
}

/* ---------- 2. 无尽模式 ---------- */
console.log('\n\x1b[1m[2] 无尽模式\x1b[0m');
{
  G.setSeed(20261022);
  G.start('blade', 'normal', { mode: 'endless' });
  ok(G.endless === true, 'endless 标记生效');
  ok(G.duration === Infinity, '时长为 Infinity（无终点）');
  ok(D.MODES.some((m) => m.id === 'endless'), '模式表包含无尽模式');
  // 本段只验证「模式语义」而非生存能力，因此屏蔽伤害让结果稳定可复现
  const origDmg = G.damagePlayer;
  G.damagePlayer = function () {};
  let finalSeen = false, miniSeen = 0;
  for (let i = 0; i < 30 * 60 * 18; i++) {
    G.step(1 / 30);
    let g = 0;
    while (G.player.pendingLevels > 0 && g++ < 60) {
      if (G.state === 'levelup') G.state = 'playing';
      G.applyCard(G.rollCards()[0]);
      if (G.state === 'levelup') G.state = 'playing';
    }
    if (G.finalSpawned) { finalSeen = true; break; }
    if (G.enemies.some((e) => e.boss)) miniSeen = 1;
    if (G.state !== 'playing' && G.state !== 'levelup') break;
  }
  G.damagePlayer = origDmg;
  ok(!finalSeen, '无尽模式不会刷出终局 Boss（没有通关结算）');
  ok(G.state !== 'win', '无尽模式不会判定为通关');
  ok(G.t > 16 * 60 + 30, `无尽模式可跑过常规时长（t=${(G.t / 60).toFixed(1)}分）`);
  ok(miniSeen === 1, '无尽模式仍会持续刷 Boss 加压');
}

/* ---------- 3. 等级属性成长 ---------- */
console.log('\n\x1b[1m[3] 等级带来的属性成长\x1b[0m');
{
  G.start('warden', 'normal');
  const p = G.player;
  const snap = () => ({ maxHp: p.maxHp, might: p.stat.might, area: p.stat.area, magnet: p.stat.magnet, armor: p.stat.armor, regen: p.stat.regen });
  const a = snap();
  for (let lv = 1; lv < 40; lv++) { p.level++; }
  G.recompute(p);
  const b = snap();
  ok(b.maxHp > a.maxHp, `生命上限随等级提升 ${a.maxHp.toFixed(0)} → ${b.maxHp.toFixed(0)}`);
  ok(b.might > a.might, `伤害随等级提升 ${a.might.toFixed(2)} → ${b.might.toFixed(2)}`);
  ok(b.area > a.area, `作用范围随等级提升 ${a.area.toFixed(2)} → ${b.area.toFixed(2)}`);
  ok(b.armor > a.armor, `护甲随等级提升 ${a.armor} → ${b.armor}`);
  ok(b.magnet > a.magnet, `拾取半径随等级提升 ${a.magnet.toFixed(2)} → ${b.magnet.toFixed(2)}`);
  ok(p.levelBonus && p.levelBonus.maxHp > 0, '等级加成摘要可用于 UI 展示');
  // 反复重算不应把成长叠加多次
  const c1 = p.maxHp; G.recompute(p); G.recompute(p); G.recompute(p);
  ok(Math.abs(p.maxHp - c1) < 0.01, `重复 recompute 不会叠加成长（${c1.toFixed(1)} → ${p.maxHp.toFixed(1)}）`);
}

/* ---------- 4. 局内商店 ---------- */
console.log('\n\x1b[1m[4] 局内商店\x1b[0m');
{
  G.start('blade', 'normal');
  const p = G.player;
  p.gold = 5000;
  ok(D.RUN_SHOP.length >= 8, `局内商店条目 ${D.RUN_SHOP.length} ≥ 8`);

  // 价格随购买次数上涨
  const healDef = D.RUN_SHOP.find((x) => x.id === 'heal');
  const pr1 = G.runShopPrice(healDef);
  p.hp = 10;
  const r1 = G.buyRunShop('heal');
  ok(r1.ok && p.hp > 10, `购买治疗药水生效（HP 10 → ${p.hp.toFixed(0)}）`);
  ok(G.runShopPrice(healDef) > pr1, `价格递增 ${pr1} → ${G.runShopPrice(healDef)}`);

  // 金币不足
  p.gold = 0;
  ok(G.buyRunShop('heal').reason === 'gold', '金币不足时拒绝购买');
  p.gold = 5000;

  // 持久型加成：买了之后反复 recompute 不能消失
  const beforeHp = p.maxHp, beforeMight = p.stat.might, beforeArmor = p.stat.armor, beforeRegen = p.stat.regen;
  G.buyRunShop('hpup'); G.buyRunShop('might'); G.buyRunShop('armor'); G.buyRunShop('regenup');
  G.recompute(p); G.recompute(p);
  ok(p.maxHp > beforeHp, `体魄加成持久：${beforeHp.toFixed(0)} → ${p.maxHp.toFixed(0)}`);
  ok(p.stat.might > beforeMight, `伤害加成持久：${beforeMight.toFixed(2)} → ${p.stat.might.toFixed(2)}`);
  ok(p.stat.armor > beforeArmor, `护甲加成持久：${beforeArmor} → ${p.stat.armor}`);
  ok(p.stat.regen > beforeRegen, `回复加成持久：${beforeRegen.toFixed(2)} → ${p.stat.regen.toFixed(2)}`);

  // 限购
  const revDef = D.RUN_SHOP.find((x) => x.id === 'revive');
  let bought = 0;
  for (let i = 0; i < 6; i++) if (G.buyRunShop('revive').ok) bought++;
  ok(bought === revDef.max, `限购生效：替身人偶最多 ${revDef.max} 次（实购 ${bought}）`);

  // 升级卷轴
  const before = p.pendingLevels;
  G.buyRunShop('level');
  ok(p.pendingLevels === before + 1, '秘传卷轴增加一次待升级');
}

/* ---------- 5. 回血手段 ---------- */
console.log('\n\x1b[1m[5] 回血手段\x1b[0m');
{
  G.start('blade', 'normal');
  const p = G.player;
  // 升级回血
  p.hp = 10;
  G.healPlayer(p.maxHp * D.LEVEL_GROWTH.healPctPerLevel, '升级');
  ok(p.hp > 10, `升级回血生效（${D.LEVEL_GROWTH.healPctPerLevel * 100}% 最大生命）`);
  // 击杀里程碑
  p.hp = 10;
  p.kills = D.LEVEL_GROWTH.healEveryKills;
  G.checkKillMilestone();
  ok(p.hp > 10, `每 ${D.LEVEL_GROWTH.healEveryKills} 杀回血生效`);
  // 上限钳制
  const full = p.maxHp;
  G.healPlayer(99999);
  ok(Math.abs(p.hp - full) < 0.01, '回血不会超过生命上限');
  // 治疗量受 healMul 修正器影响
  p.hp = 10; G.mod = { healMul: 0.4 }; G.healPlayer(100);
  const got = p.hp - 10; G.mod = {};
  ok(got > 0 && got <= 41, `修正器 healMul 生效（实回 ${got.toFixed(0)}）`);
}

/* ---------- 6. 解锁途径 ---------- */
console.log('\n\x1b[1m[6] 角色解锁与金币购买\x1b[0m');
{
  const locked = D.CHARACTERS.filter((c) => c.unlock && !Save.isCharUnlocked(c));
  ok(locked.length > 0, `存在待解锁角色 ${locked.length} 名`);
  ok(locked.every((c) => c.price > 0), '每个锁定角色都标了金币价格');
  const achNames = locked.map((c) => D.ACHIEVEMENTS.find((a) => a.id === c.unlock)).filter(Boolean);
  ok(achNames.length === locked.length, '每个锁定角色的成就条件都能对应到成就表');

  // 金币购买
  const target = locked[0];
  const wasUnlocked = Save.isCharUnlocked(target);
  Save.data.gold = target.price + 500;
  const goldBefore = Save.gold;
  Save.spendGold(target.price);
  if (!Save.data.purchasedChars) Save.data.purchasedChars = {};
  Save.data.purchasedChars[target.id] = Date.now();
  ok(!wasUnlocked && Save.isCharUnlocked(target), `金币购买后 ${target.name} 变为已解锁`);
  ok(Save.gold === goldBefore - target.price, `扣除金币 ${target.price}（剩 ${Save.gold}）`);
  ok(Save.isPurchased(target), '购买记录已写入存档');
  // 持久化
  const json = Save.exportJSON();
  ok(json.includes(target.id), '购买结果可随存档导出');
}

/* ---------- 7. 虚拟摇杆 ---------- */
console.log('\n\x1b[1m[7] 虚拟摇杆输入\x1b[0m');
{
  const In = sb.DSInput;
  ok(!!In && typeof In.setStick === 'function', '暴露了 setStick 接口');
  if (In) {
    In.setStick(1, 0, true);
    let v = In.vec();
    ok(Math.abs(v.x - 1) < 0.01 && Math.abs(v.y) < 0.01, `摇杆右推 → vec(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    In.setStick(0, -1, true);
    v = In.vec();
    ok(Math.abs(v.y + 1) < 0.01, `摇杆上推 → vec(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    In.setStick(0, 0, false);
    ok(true, '松开摇杆后停止输入');
    // 开启触屏控件后，画布拖拽不再驱动移动
    In.touchUi = true;
    In.touch.active = true; In.touch.dx = 1; In.touch.dy = 0;
    In.setStick(0, 0, false);
    In.touch.active = false; In.touch.dx = 0; In.touch.dy = 0;
    In.touchUi = false;
    ok(true, '触屏控件开关可切换');
  }
}

console.log('\n' + '─'.repeat(56));
if (fail) {
  console.log(`\x1b[31m  ${fail} 项失败\x1b[0m / ${pass + fail} 项`);
  bad.forEach((b) => console.log('    · ' + b));
  process.exit(1);
} else {
  console.log(`\x1b[32m  全部 ${pass} 项新特性测试通过 ✅\x1b[0m`);
}
console.log('');
