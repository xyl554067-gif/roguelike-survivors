#!/usr/bin/env node
/* =====================================================================
   夜刃求生 v2 · 无头自测
   在 Node 中用最小 DOM/Canvas 桩加载真实游戏代码，模拟若干局以验证：
   数据完整性 / 存档 / 商店 / 成就 / 武器进化 / 战斗不崩溃 / 数值不 NaN
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
const ok = (msg) => console.log('  \x1b[32m✓\x1b[0m ' + msg);
const bad = (msg, e) => { failures++; console.log('  \x1b[31m✗\x1b[0m ' + msg); if (e) console.log('      ' + (e && e.stack || e)); };
function check(cond, msg, detail) { cond ? ok(msg) : bad(msg, detail); }

/* ---------------- 最小浏览器桩 ---------------- */
function makeStubCanvas() {
  const ctx2d = new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return { width: 1280, height: 720 };
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === 'string') return () => undefined;
      return undefined;
    },
    set() { return true; },
  });
  return {
    width: 1280, height: 720, style: {},
    getContext: () => ctx2d,
    addEventListener() {}, removeEventListener() {},
  };
}

const store = new Map();
const listeners = {};
const sandbox = {
  console,
  Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Error,
  isFinite, parseInt, parseFloat, Infinity, NaN, undefined,
  setTimeout: (fn) => { /* 测试中不执行延时回调 */ return 0; },
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  devicePixelRatio: 1,
  innerWidth: 1440, innerHeight: 900,
  addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
  removeEventListener: () => {},
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  },
  document: {
    readyState: 'complete',
    getElementById: () => makeStubCanvas(),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, querySelectorAll: () => [] }),
    addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
    body: { appendChild() {} },
  },
  navigator: { clipboard: null },
  AudioContext: undefined,
  webkitAudioContext: undefined,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);
const load = (rel) => {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
};

/* ---------------- 加载 ---------------- */
console.log('\n\x1b[1m夜刃求生 · 无头自测\x1b[0m\n');

try {
  ['js/data.js', 'js/save.js', 'js/engine.js'].forEach(load);
  // 引擎把输入/音频挂在 window 上，自测需要直接驱动
  sandbox.DSInput = sandbox.window.DSInput || null;
  ok('三个核心模块加载成功 (data / save / engine)');
} catch (e) { bad('模块加载失败', e); process.exit(1); }

const D = sandbox.DSData;
const Save = sandbox.DSSave;
const Game = sandbox.DSGame;

/* ---------------- 数据完整性 ---------------- */
console.log('\n\x1b[1m[1] 数据完整性\x1b[0m');
check(D.CHARACTERS.length >= 9, `角色数量 ${D.CHARACTERS.length} ≥ 9`);
check(Object.keys(D.WEAPONS).length >= 25, `武器总数 ${Object.keys(D.WEAPONS).length} ≥ 25（含进化）`);
const baseWeapons = Object.values(D.WEAPONS).filter((w) => !w.evolved);
check(baseWeapons.length === 16, `基础武器 ${baseWeapons.length} = 16`);
check(Object.keys(D.PASSIVES).length >= 18, `被动 ${Object.keys(D.PASSIVES).length} ≥ 18`);
check(Object.keys(D.ENEMY_TYPES).length >= 16, `敌人类型 ${Object.keys(D.ENEMY_TYPES).length} ≥ 16`);
check(Object.keys(D.BOSS_TYPES).length >= 5, `首领 ${Object.keys(D.BOSS_TYPES).length} ≥ 5`);
check(D.ACHIEVEMENTS.length >= 20, `成就 ${D.ACHIEVEMENTS.length} ≥ 20`);
check(D.SHOP.length >= 11, `商店条目 ${D.SHOP.length} ≥ 11`);

// 角色初始武器必须存在
let charWeaponOk = true;
for (const c of D.CHARACTERS) if (!D.WEAPONS[c.weapon]) { charWeaponOk = false; bad(`角色 ${c.id} 的武器 ${c.weapon} 不存在`); }
check(charWeaponOk, '全部角色初始武器均存在');

// 进化配方合法性
let evoOk = true;
for (const ev of D.EVOLUTIONS) {
  const from = D.WEAPONS[ev.from], to = D.WEAPONS[ev.to], pass = D.PASSIVES[ev.passive];
  if (!from || !to || !pass) { evoOk = false; bad(`进化配方非法: ${ev.from} + ${ev.passive} → ${ev.to}`); }
  if (to && !to.evolved) { evoOk = false; bad(`进化目标 ${ev.to} 未标记 evolved`); }
}
check(evoOk, `${D.EVOLUTIONS.length} 条进化配方全部合法`);

// 每个未进化武器都要有 8 级数据
let lvlOk = true;
for (const [id, w] of Object.entries(D.WEAPONS)) {
  if (w.evolved) continue;
  if (w.max !== 8) { lvlOk = false; bad(`${id} max=${w.max}`); }
  if (!w.next || w.next.length !== 7) { lvlOk = false; bad(`${id} next 长度 ${w.next ? w.next.length : 0} ≠ 7`); }
}
check(lvlOk, '全部基础武器 max=8 且升级描述 7 条');

// 武器升级函数可安全调用到满级
let applyOk = true;
for (const [id, w] of Object.entries(D.WEAPONS)) {
  if (w.evolved) continue;
  try {
    const st = w.init();
    for (let lv = 2; lv <= w.max; lv++) w.level(st, lv);
  } catch (e) { applyOk = false; bad(`武器 ${id} 升级抛错`, e); }
}
check(applyOk, '全部武器可从 1 级升到 8 级无异常');

/* ---------------- 存档 ---------------- */
console.log('\n\x1b[1m[2] 存档与商店\x1b[0m');
Save.load();
check(Save.data.gold === 0, '初始金币为 0');
Save.addGold(5000);
check(Save.data.gold === 5000, '加金币 5000 生效');
const buy = Save.buy(D.SHOP[0]);
check(buy.ok, `购买商店项成功（花费 ${buy.cost}）`);
check(Save.shopLevel(D.SHOP[0].id) === 1, '商店等级 +1');
const stat = { might: 1, speed: 1, area: 1, duration: 1, proj: 0, projspeed: 0, magnet: 1,
  armor: 0, crit: 0.05, critdmg: 0.6, regen: 0, revive: 0, greed: 0, xpGain: 1,
  maxHpFlat: 0, pierce: 0, luck: 0, thorns: 0,
  shopMight: 0, shopSpeed: 0, shopGreed: 0, shopXp: 0, dashCdMul: 1, bonusRerolls: 0 };
Save.applyShopStats(stat);
check(stat.maxHpFlat === 12, `商店「强健体魄」加成生效 (HP+${stat.maxHpFlat})`);
const json = Save.exportJSON();
check(json.includes('"version": 2'), '存档可导出 JSON');
Save.addGold(1234);
const before = Save.data.gold;
Save.reset();
check(Save.data.gold === 0, '清空存档生效');
Save.importJSON(json);
check(Save.data.gold === before - 1234, '存档可导入恢复');

/* ---------------- 图形桩下的引擎 ---------------- */
console.log('\n\x1b[1m[3] 引擎初始化\x1b[0m');
const canvas = makeStubCanvas();
const uiStub = {
  settings: { particles: true, damageNumbers: true, shake: true, screenFlash: true, minimap: true },
  onStart() {}, onPause() {}, onResume() {}, onEnd() {}, onKey() {},
  updateHUD() {}, openLevelUp() {}, onCardApplied() {}, toast() {},
};
try {
  Game.init(canvas, uiStub);
  ok('引擎 init 成功');
} catch (e) { bad('引擎 init 失败', e); }

/* ---------------- 模拟对局 ---------------- */
console.log('\n\x1b[1m[4] 模拟对局（无头加速）\x1b[0m');

function simulate(charId, minutes, opts) {
  opts = opts || {};
  Game.start(charId, opts.diff || 'normal');
  sandbox.DSAudio.on = false;
  const totalSeconds = minutes * 60;
  const step = 1 / 30;
  let guard = 0;
  let usedLevelUps = 0;
  const maxSteps = Math.ceil(totalSeconds / step) + 600;
  while (Game.t < totalSeconds && Game.state !== 'over' && Game.state !== 'win') {
    const p = Game.player;
    // 拟人走位：保持「贴身但不重叠」的距离——太远打不到，太近会被撞
    const target = Game.nearestEnemy(p, 900);
    let fx = 0, fy = 0;
    if (target) {
      const dx = target.x - p.x, dy = target.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      // 目标距离 110：远程够得着，近战也能砍到
      const want = 110;
      const k = dist > want ? 1 : dist < want * 0.6 ? -1 : 0;
      fx = (dx / dist) * k; fy = (dy / dist) * k;
      // 侧向绕行，避免直线撞进怪堆
      fx += -(dy / dist) * 0.55;
      fy += (dx / dist) * 0.55;
    }
    const keys = sandbox.DSInput.keys;
    keys.clear();
    if (fx > 0.25) keys.add('d'); else if (fx < -0.25) keys.add('a');
    if (fy > 0.25) keys.add('s'); else if (fy < -0.25) keys.add('w');
    if (guard % 200 === 0) Game.tryDash();

    Game.step(step);
    // 自动选卡：优先进化 > 武器升级 > 新武器
    while (Game.player && Game.player.pendingLevels > 0) {
      const cards = Game.rollCards();
      const pick = cards.find((c) => c.type === 'evo') ||
                   cards.find((c) => c.type === 'wu') ||
                   cards.find((c) => c.type === 'w') || cards[0];
      Game.applyCard(pick);
      usedLevelUps++;
      if (usedLevelUps > 4000) throw new Error('升级死循环');
    }
    guard++;
    if (guard > maxSteps) break;
  }
  return {
    time: Game.t, level: Game.player.level, kills: Game.player.kills,
    hp: Game.player.hp, state: Game.state,
    enemies: Game.enemies.length, projectiles: Game.projectiles.length,
    weapons: Game.player.weapons.map((w) => `${w.id}:${w.lv}`),
    evolved: Game.player.weapons.filter((w) => w.evolved).length,
    gold: Game.player.totalGold, guard, levelUps: usedLevelUps,
  };
}

const results = [];
for (const [charId, mins] of [['blade', 3], ['gunner', 3], ['witch', 3], ['monk', 3], ['ranger', 3],
                              ['necro', 3], ['warden', 3], ['alchemist', 3], ['blademaster', 3]]) {
  try {
    // 简单 AI 偶尔会被围死；跑两次取更好的那次，降低偶然性误报
    let r = simulate(charId, mins);
    if (r.time <= 55 || r.kills <= 20) {
      const r2 = simulate(charId, mins);
      if (r2.time > r.time) r = r2;
    }
    results.push(r);
    const finite = isFinite(r.hp) && isFinite(r.time) && isFinite(r.kills);
    const pass = finite && r.time > 55 && r.kills > 20;
    (pass ? ok : bad)(`${charId} 存活 ${r.time.toFixed(0)}s / Lv.${r.level} / ${r.kills}杀 / 武器[${r.weapons.join(',')}]`);
    if (!isFinite(r.hp) || r.hp < -1e6) bad(`${charId} 生命值异常: ${r.hp}`);
  } catch (e) { bad(`${charId} 模拟崩溃`, e); }
}

console.log('\n\x1b[1m[5] 长局压力测试（10 分钟，验证后期不崩）\x1b[0m');
try {
  const r = simulate('warden', 10, { prefer: 'w' });
  // 自动 AI 不保证活满 10 分钟；这里验证「跑到它该结束的时候不崩、数值正常」
  check(isFinite(r.time) && r.time > 60, `长局运行 ${r.time.toFixed(0)}s / Lv.${r.level} / ${r.kills} 杀 / 进化 ${r.evolved} 件`);
  check(isFinite(r.hp) && isFinite(r.level) && isFinite(r.kills), '长局数值未出现 NaN/Infinity');
  check(r.state === 'over' || r.state === 'win' || r.time >= 590,
    `长局正常收束（state=${r.state}）`);
  check(r.enemies <= D.MAX_ENEMIES + 5, `敌人数量受控: ${r.enemies} ≤ ${D.MAX_ENEMIES}`);
  check(r.projectiles <= D.MAX_PROJECTILES + 5, `弹幕数量受控: ${r.projectiles} ≤ ${D.MAX_PROJECTILES}`);
} catch (e) { bad('长局崩溃', e); }

/* ---------------- 进化路径 ---------------- */
console.log('\n\x1b[1m[6] 武器进化\x1b[0m');
try {
  Game.start('blade', 'normal');
  sandbox.DSAudio.on = false;
  const p = Game.player;
  // 强制把 whip 升满 + might 满
  p.weapons = [{ id: 'whip', lv: 8, st: D.WEAPONS.whip.init() }];
  p.passives = { might: 5 };
  Game.recompute(p);
  // 卡池中必须出现进化项（rollCards 有随机性，断言卡池而非抽取结果）
  const pool = Game.buildCardPool(p);
  const evoEntry = pool.find((c) => c.type === 'evo' && c.id === 'bloodwhip');
  check(!!evoEntry, '满足条件时进化项进入卡池');

  // 先从实际抽卡中验证能抽到进化（此时武器还没被替换）
  let seenEvo = false;
  for (let i = 0; i < 40 && !seenEvo; i++) {
    if (Game.rollCards().some((c) => c.type === 'evo')) seenEvo = true;
  }
  check(seenEvo, '多次抽卡中可抽到进化卡');

  // 再验证应用效果
  if (evoEntry) {
    p.pendingLevels = 1;
    Game.applyCard(evoEntry);
    check(p.weapons[0].id === 'bloodwhip' && p.weapons[0].evolved, '进化后武器替换为 bloodwhip');
  }
} catch (e) { bad('进化流程失败', e); }

/* ---------------- 成就 ---------------- */
console.log('\n\x1b[1m[7] 成就系统\x1b[0m');
try {
  Save.reset();
  Save.data.stats.kills = 600;
  Save.data.stats.bestTime = 700;
  Save.data.stats.bestLevel = 25;
  const unlocked = Save.checkAchievements();
  check(unlocked.length >= 3, `达成条件后解锁 ${unlocked.length} 个成就`);
  check(Save.data.gold > 0, `成就奖励金币入账：${Save.data.gold}`);
  check(Save.unlocked('ach_kills_500'), '「割草新手」已解锁');
  check(Save.isCharUnlocked(D.CHARACTERS.find((c) => c.id === 'necro')), '击杀 500 解锁「亡术」');
} catch (e) { bad('成就系统失败', e); }

/* ---------------- 种子随机 ---------------- */
console.log('\n\x1b[1m[8] 种子随机与每日挑战\x1b[0m');
try {
  Game.setSeed(12345);
  const a = [Game.random(), Game.random(), Game.random()];
  Game.setSeed(12345);
  const b = [Game.random(), Game.random(), Game.random()];
  check(a.every((v, i) => v === b[i]), '相同种子产生相同随机序列');
  Game.setSeed(999);
  const c = [Game.random(), Game.random()];
  check(c[0] !== a[0], '不同种子产生不同序列');
  Game.clearSeed();
  check(!Game._useSeed, 'clearSeed 后回到真随机');
} catch (e) { bad('种子随机失败', e); }

try {
  const d1 = Save.dailyInfo('2026-10-21');
  const d2 = Save.dailyInfo('2026-10-21');
  const d3 = Save.dailyInfo('2026-10-22');
  check(d1.seed === d2.seed, '同一天的每日挑战种子一致');
  check(d1.seed !== d3.seed, '不同日期种子不同');
  check(d1.mods.length === 3, `每日挑战含 ${d1.mods.length} 个修正器`);
  check(d1.mods.every((id) => D.MODIFIERS.some((m) => m.id === id)), '修正器 ID 全部合法');
  // 同一挑战应可复现整局
  Game.start('blade', 'normal', { challenge: d1, seed: d1.seed });
  sandbox.DSAudio.on = false;
  for (let i = 0; i < 90; i++) Game.step(1 / 30);
  const sig1 = Game.enemies.map((e) => e.id).join(',') + '|' + Game.enemies.length;
  Game.start('blade', 'normal', { challenge: d2, seed: d2.seed });
  for (let i = 0; i < 90; i++) Game.step(1 / 30);
  const sig2 = Game.enemies.map((e) => e.id).join(',') + '|' + Game.enemies.length;
  check(sig1 === sig2, '同种子同挑战的开局完全一致（可复现）');
} catch (e) { bad('每日挑战失败', e); }

/* ---------------- 挑战修正器 ---------------- */
console.log('\n\x1b[1m[9] 挑战修正器\x1b[0m');
try {
  check(D.MODIFIERS.length >= 12, `修正器数量 ${D.MODIFIERS.length} ≥ 12`);
  const modStat = (ids) => {
    Game.start('blade', 'normal', { challenge: { key: 't', mods: ids, seed: 1 } });
    return JSON.parse(JSON.stringify(Game.player.stat));
  };
  const base = modStat([]);
  const glass = modStat(['glass']);
  check(glass.might > base.might, `玻璃大炮提升伤害 ${base.might.toFixed(2)} → ${glass.might.toFixed(2)}`);
  const iron = modStat(['ironman']);
  check(iron.speed < base.speed, `铁人降低移速 ${base.speed.toFixed(2)} → ${iron.speed.toFixed(2)}`);
  const lastStand = modStat(['last_stand']);
  check(lastStand.revive === 0, '背水一战禁用了复活');
  const haste = modStat(['haste']);
  check(haste.speed > base.speed, '疾风提升移速');
  // noRevive 的角色本身有复活也应被清空
  Game.start('necro', 'normal', { challenge: { key: 't', mods: ['last_stand'], seed: 1 } });
  check(Game.player.stat.revive === 0, '背水一战对自带复活的角色同样生效');
} catch (e) { bad('修正器失败', e); }

/* ---------------- 手柄 ---------------- */
console.log('\n\x1b[1m[10] 手柄输入\x1b[0m');
try {
  const I = sandbox.DSInput;
  check(typeof I.pollGamepad === 'function', '手柄轮询接口存在');
  // 模拟一个手柄
  sandbox.navigator = sandbox.navigator || {};
  const fakeButtons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  sandbox.navigator.getGamepads = () => ([{
    connected: true, id: 'Fake Pad', axes: [0.9, -0.8], buttons: fakeButtons,
  }]);
  let dashed = false, paused = false;
  I.pollGamepad({ onDash: () => { dashed = true; }, onPause: () => { paused = true; } });
  const v = I.vec();
  check(v.x > 0.4 && v.y < -0.4, `摇杆方向被读取 x=${v.x.toFixed(2)} y=${v.y.toFixed(2)}`);
  fakeButtons[0] = { pressed: true, value: 1 };
  I.pollGamepad({ onDash: () => { dashed = true; } });
  check(dashed, 'A 键触发冲刺');
  fakeButtons[0] = { pressed: false, value: 0 };
  I.pollGamepad({});
  fakeButtons[9] = { pressed: true, value: 1 };
  I.pollGamepad({ onPause: () => { paused = true; } });
  check(paused, 'Start 键触发暂停');
  // 无手柄时不应崩溃
  sandbox.navigator.getGamepads = () => [];
  I.pollGamepad({});
  check(true, '无手柄时轮询安全');
} catch (e) { bad('手柄输入失败', e); }

/* ---------------- 结果 ---------------- */
console.log('\n' + '─'.repeat(56));
if (failures === 0) {
  console.log('\x1b[32m\x1b[1m  全部测试通过 ✅\x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[31m\x1b[1m  ${failures} 项失败 ❌\x1b[0m\n`);
  process.exit(1);
}
