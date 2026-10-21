#!/usr/bin/env node
/* =====================================================================
   回归测试：锁死一批「曾经真实发生过」的严重 bug
   1) 投射类武器必须会移动（projspeed 乘数被写成 0 导致原地不动）
   2) 飞斧必须是平直弹道（曾带重力抛物线，1 秒下坠 435px）
   3) 击杀 Boss 不得污染 p.xp 为 NaN（曾导致等级永久卡死 ~14 级）
   4) 所有角色的初始武器必须存在且可用
   ===================================================================== */
'use strict';
const { boot } = require('./leveluptest.js');
const { G, D } = boot();
G.init({ width: 1280, height: 720, style: {}, getContext: () => new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (typeof k === 'string') return () => undefined; }, set() { return true; } }), addEventListener() {}, removeEventListener() {} },
  { settings: {}, onStart() {}, onPause() {}, onResume() {}, onEnd() {}, onKey() {}, updateHUD() {}, openLevelUp() {}, onCardApplied() {}, toast() {} });

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + msg); }
  else { fail++; bad.push(msg); console.log('  \x1b[31m✗ ' + msg + '\x1b[0m' + (extra ? '  → ' + extra : '')); }
}

/* 构造一个干净的战斗场景 */
function fresh(charId) {
  G.setSeed(12345);
  G.start(charId || 'blade', 'normal');
  G.enemies.length = 0;   // 清场，避免弹体立刻命中消失
  G.summons.length = 0;
  return G.player;
}

/* 发射一件武器并跟踪其首个弹体 */
function track(wid, frames) {
  const p = fresh('blade');
  p.weapons = [];
  p.aimAng = 0; p.aimX = 1;
  const def = D.WEAPONS[wid];
  const st = def.init();
  def.fire(G, p, st);
  const q = G.projectiles[G.projectiles.length - 1];
  if (!q) return null;
  const s = { x: q.x, y: q.y };
  for (let i = 0; i < (frames || 15); i++) {
    G.updateProjectiles(1 / 30);
    if (!G.projectiles.includes(q)) break;
  }
  return { dx: q.x - s.x, dy: q.y - s.y, moved: Math.hypot(q.x - s.x, q.y - s.y), q };
}

console.log('\n\x1b[1m夜刃求生 —— 核心 bug 回归测试\x1b[0m');

/* ---------- 1. 投射类武器必须真的会动 ---------- */
console.log('\n\x1b[1m[1] 投射类武器位移检查\x1b[0m');
const PROJ = ['kunai', 'fireball', 'axe', 'bolt', 'boomerang', 'saw'];
for (const wid of PROJ) {
  const r = track(wid, 15);
  ok(r && Number.isFinite(r.moved) && r.moved > 50,
    `${(D.WEAPONS[wid].name + '(' + wid + ')').padEnd(22)} 0.5 秒内位移 ${r ? r.moved.toFixed(0) : 'N/A'} px`,
    '弹体未移动或速度非法');
}

/* ---------- 2. 直线弹道（不得有明显下坠） ---------- */
console.log('\n\x1b[1m[2] 飞斧弹道：应为直线，不得抛物线下坠\x1b[0m');
{
  const r = track('axe', 30);   // 1 秒
  ok(r && Math.abs(r.dy) < 60,
    `飞斧 1 秒纵向偏移 ${r ? r.dy.toFixed(0) : 'N/A'} px（阈值 ±60，旧版下坠 435px）`,
    '仍有重力下坠');
  ok(r && Math.abs(r.dx) > 300,
    `飞斧 1 秒纵向推进 ${r ? Math.abs(r.dx).toFixed(0) : 'N/A'} px`,
    '水平推进不足');
}

/* ---------- 3. Boss 掉落不得污染经验 ---------- */
console.log('\n\x1b[1m[3] 击杀 Boss 后仍可持续升级（NaN 防护）\x1b[0m');
{
  const p = fresh('blade');
  ok(Number.isFinite(p.xp), '初始 p.xp 为有限数');
  ok(p.stat.projspeed === 1, `projspeed 基线为 1（当前 ${p.stat.projspeed}）——乘数基线写成 0 会让所有弹静止`);

  // 依次击杀全部 Boss，检查经验是否被污染
  const bossIds = Object.keys(D.BOSS_TYPES);
  for (const id of bossIds) {
    G.spawnBoss(id, false);
    const b = G.enemies.find((e) => e.boss && e.id === id);
    ok(Number.isFinite(b.xp) && b.xp > 0,
      `Boss ${id} 携带合法 xp（${b.xp}）`, '缺少 xp 字段会导致 NaN 宝石');
    G.killEnemy(p, b, 'test');
  }
  ok(Number.isFinite(p.xp), '击杀全部 Boss 后 p.xp 仍为有限数', 'p.xp 被污染成 NaN');

  // 拾取全部掉落的宝石，确认能正常升级
  const before = p.level;
  for (let i = 0; i < 30 * 12; i++) {
    // 把玩家挪到最近的宝石上，强制拾取
    if (G.gems.length) { p.x = G.gems[0].x; p.y = G.gems[0].y; }
    G.step(1 / 30);
    let guard = 0;
    while (p.pendingLevels > 0 && guard++ < 80) {
      if (G.state !== 'levelup') G.state = 'levelup';
      G.applyCard(G.rollCards()[0]);
      if (G.state === 'levelup') G.state = 'playing';
    }
  }
  ok(Number.isFinite(p.xp), '拾取 Boss 掉落后 p.xp 仍为有限数', '拾取后出现 NaN');
  ok(p.level > before, `等级正常提升 ${before} → ${p.level}`, '等级被卡死，未再增长');
}

/* ---------- 4. 全角色可用性 ---------- */
console.log('\n\x1b[1m[4] 全部角色初始武器可用\x1b[0m');
for (const ch of D.CHARACTERS) {
  const w = D.WEAPONS[ch.weapon];
  ok(!!w, `${ch.name.padEnd(14)} 武器 ${ch.weapon} 存在`, '武器未定义');
  if (!w) continue;
  let err = null;
  try {
    const p = fresh(ch.id);
    const st = w.init();
    if (w.update) { for (let i = 0; i < 120; i++) w.update(G, p, st, 1 / 30); }
    else for (let i = 0; i < 60; i++) w.fire(G, p, st);
    ok(Number.isFinite(p.hp) && Number.isFinite(p.x), `${ch.name.padEnd(14)} 武器可正常释放且未产生 NaN`);
  } catch (e) { err = e; }
  if (err) ok(false, `${ch.name} 武器运行异常`, err.message);
}

/* ---------- 5. 长时间运行稳定性 ---------- */
console.log('\n\x1b[1m[5] 长时间运行稳定性（无敌 6 分钟）\x1b[0m');
{
  G.damagePlayer = function () {};
  const p = fresh('blade');
  let nan = null;
  for (let i = 0; i < 30 * 60 * 6; i++) {
    if (G.gems.length) { p.x = G.gems[0].x; p.y = G.gems[0].y; }
    G.step(1 / 30);
    let guard = 0;
    while (p.pendingLevels > 0 && guard++ < 80) {
      if (G.state !== 'levelup') G.state = 'levelup';
      G.applyCard(G.rollCards()[0]);
      if (G.state === 'levelup') G.state = 'playing';
    }
    if (!Number.isFinite(p.xp) && !nan) nan = { t: G.t, lv: p.level };
  }
  ok(!nan, `6 分钟内未出现 xp 卡死（最终 Lv.${p.level}）`,
    nan ? `在 ${(nan.t / 60).toFixed(1)} 分 Lv.${nan.lv} 处 xp 变为 NaN` : '');
  ok(p.level > 20, `等级持续增长到 Lv.${p.level}`, '等级增长异常缓慢');
}

console.log('\n' + '─'.repeat(56));
if (fail) {
  console.log(`\x1b[31m  ${fail} 项失败\x1b[0m / ${pass + fail} 项`);
  bad.forEach((b) => console.log('    · ' + b));
  process.exit(1);
} else {
  console.log(`\x1b[32m  全部 ${pass} 项回归测试通过 ✅\x1b[0m`);
}
console.log('');
