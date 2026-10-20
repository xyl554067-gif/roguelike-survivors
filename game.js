/* =====================================================================
   夜刃求生 · Roguelike Survivors (Vampire Survivors-like)
   纯原生 Canvas + JS，无任何依赖。作者：xyl554067-gif
   ===================================================================== */
(() => {
'use strict';

/* ============================ 常量 ============================ */
const VIEW = { w: 1280, h: 720 };
const TAU = Math.PI * 2;
const WORLD = { radius: 1e9 };              // 世界视为无限（网格背景滚动）
const MAX_ENEMIES = 380;                    // 同屏敌人硬上限（性能保险）
const MAX_PARTICLES = 650;
const RUN_DURATION = 30 * 60;               // 30 分钟击杀 Boss 即通关
const SAVE_KEY = 'nrjs_best_v1';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ============================ 音效（WebAudio 合成） ============================ */
const AudioFX = {
  ctx: null, master: null, muted: false,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  tone(freq, dur = 0.08, type = 'square', vol = 1, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  shoot()  { this.tone(rand(520, 700), 0.05, 'triangle', 0.5, -260); },
  hit()    { this.tone(rand(160, 220), 0.05, 'square', 0.35, -60); },
  kill()   { this.tone(rand(90, 130), 0.11, 'sawtooth', 0.4, -50); },
  pickup() { this.tone(rand(880, 1180), 0.05, 'sine', 0.45, 220); },
  levelup(){ [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'square', 0.55), i * 85)); },
  boom()   { this.tone(70, 0.3, 'sawtooth', 0.7, -40); },
  hurt()   { this.tone(180, 0.15, 'sawtooth', 0.5, -120); },
  boss()   { [196, 147, 110].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sawtooth', 0.6), i * 160)); },
  win()    { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.6), i * 130)); },
  lose()   { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.5), i * 200)); },
};

/* ============================ 输入 ============================ */
const Input = {
  keys: new Set(),
  touchActive: false, touchDx: 0, touchDy: 0, _ox: 0, _oy: 0,
  init(canvas) {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      Game.onKey(k, e);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    const start = (e) => {
      const t = e.touches ? e.touches[0] : e;
      this.touchActive = true; this._ox = t.clientX; this._oy = t.clientY; this.touchDx = this.touchDy = 0;
      AudioFX.init(); AudioFX.resume();
    };
    const move = (e) => {
      if (!this.touchActive) return;
      const t = e.touches ? e.touches[0] : e;
      let dx = t.clientX - this._ox, dy = t.clientY - this._oy;
      const m = Math.hypot(dx, dy);
      if (m > 46) { dx = dx / m * 46; dy = dy / m * 46; this._ox = t.clientX - dx; this._oy = t.clientY - dy; }
      this.touchDx = dx / 46; this.touchDy = dy / 46;
      e.preventDefault();
    };
    const end = () => { this.touchActive = false; this.touchDx = this.touchDy = 0; };
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('mousedown', start);
    addEventListener('mousemove', move);
    addEventListener('mouseup', end);
  },
  vec() {
    let x = 0, y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    if (this.touchActive && (this.touchDx || this.touchDy)) { x = this.touchDx; y = this.touchDy; }
    const m = Math.hypot(x, y);
    return m > 1 ? { x: x / m, y: y / m } : { x, y };
  },
};

/* ============================ 角色 ============================ */
const CHARACTERS = [
  { id: 'blade', name: '剑士 · 艾伦', ico: '🗡️', hp: 100, spd: 1.00, might: 1.0, area: 1.0, cd: 1.0, proj: 0, magnet: 1.0, xp: 1.0, armor: 0, rev: 0, regen: 0,
    weapon: 'whip', desc: '平衡的近战新手。<b>近战鞭影</b>范围宽，向前方扇形挥击。' },
  { id: 'gunner', name: '枪手 · 薇拉', ico: '🔫', hp: 90, spd: 1.02, might: 0.95, area: 1.0, cd: 1.05, proj: 1, magnet: 1.1, xp: 1.0, armor: 0, rev: 0, regen: 0,
    weapon: 'kunai', desc: '高射速远程。<b>飞刀</b>朝面向连发，弹药更多但身板脆。' },
  { id: 'witch', name: '咒师 · 墨铃', ico: '🔮', hp: 80, spd: 0.98, might: 1.05, area: 1.15, cd: 1.1, proj: 0, magnet: 1.3, xp: 1.2, armor: 0, rev: 0, regen: 0,
    weapon: 'fireball', desc: 'AOE 法师。<b>火球</b>命中爆炸并点燃，经验获取 +20%。' },
  { id: 'monk', name: '武僧 · 迦南', ico: '🌀', hp: 110, spd: 1.05, might: 1.0, area: 1.0, cd: 1.0, proj: 0, magnet: 1.0, xp: 1.0, armor: 1, rev: 0, regen: 0.3,
    weapon: 'garlic', desc: '肉盾。<b>罡气</b>光环持续击退并磨血，自带护甲与生命回复。' },
  { id: 'ranger', name: '游侠 · 洛恩', ico: '🏹', hp: 95, spd: 1.03, might: 1.0, area: 1.05, cd: 1.0, proj: 0, magnet: 1.0, xp: 1.0, armor: 0, rev: 0, regen: 0,
    weapon: 'axe', desc: '暴击流。<b>飞斧</b>抛物线高伤高暴击，清群利器。' },
  { id: 'necro', name: '亡术 · 瑟莉卡', ico: '💀', hp: 85, spd: 1.0, might: 1.0, area: 1.0, cd: 1.0, proj: 0, magnet: 1.15, xp: 1.0, armor: 0, rev: 1, regen: 0,
    weapon: 'bolt', desc: '自动瞄准。<b>灵弹</b>索敌最近敌人，死亡后可原地复活一次。' },
];

const DIFFICULTIES = [
  { id: 'easy', name: '休闲', hp: 0.8, dmg: 0.85, spd: 0.95, xp: 0.95, tag: '怪更少更软，适合练手感' },
  { id: 'normal', name: '标准', hp: 1.0, dmg: 1.0, spd: 1.0, xp: 1.0, tag: '推荐的平衡曲线' },
  { id: 'hard', name: '硬核', hp: 1.35, dmg: 1.25, spd: 1.08, xp: 1.15, tag: '怪硬且凶，但经验更多' },
  { id: 'nightmare', name: '噩梦', hp: 1.8, dmg: 1.55, spd: 1.15, xp: 1.3, tag: '刀尖跳舞，极限割草' },
];

/* ============================ 敌人类型 ============================ */
const ENEMY_TYPES = {
  slime:    { name: '史莱姆',  hp: 11,   spd: 56,  dmg: 8,  xp: 1,  gold: 1,  r: 14, color: '#5ad19a', dark: '#2e8b62', touch: false, elite: false, minT: 0 },
  bat:      { name: '蝙蝠',    hp: 8,    spd: 108, dmg: 7,  xp: 1,  gold: 1,  r: 11, color: '#a78bfa', dark: '#6d4fc4', touch: false, elite: false, minT: 60 },
  skeleton: { name: '骷髅',    hp: 26,   spd: 66,  dmg: 12, xp: 2,  gold: 2,  r: 15, color: '#d7d2c4', dark: '#8f8a78', touch: false, elite: false, minT: 150 },
  ghost:    { name: '幽灵',    hp: 30,   spd: 84,  dmg: 14, xp: 3,  gold: 2,  r: 15, color: '#8bd3ff', dark: '#4a86b8', touch: false, elite: false, minT: 240 },
  brute:    { name: '巨兽',    hp: 120,  spd: 46,  dmg: 24, xp: 6,  gold: 6,  r: 23, color: '#ff8a5c', dark: '#c1502a', touch: false, elite: false, minT: 330 },
  spitter:  { name: '喷吐者',  hp: 42,   spd: 58,  dmg: 10, xp: 5,  gold: 4,  r: 16, color: '#c58cff', dark: '#7b46b8', touch: false, elite: false, ranged: true, minT: 420 },
  swarm:    { name: '虫群',    hp: 6,    spd: 128, dmg: 5,  xp: 1,  gold: 1,  r: 9,  color: '#ffe066', dark: '#c9a52c', touch: false, elite: false, minT: 500 },
  charger:  { name: '冲锋者',  hp: 70,   spd: 62,  dmg: 20, xp: 5,  gold: 5,  r: 18, color: '#ff5d8f', dark: '#b8325e', touch: false, elite: false, charge: true, minT: 600 },
  rune:     { name: '邪符',    hp: 55,   spd: 66,  dmg: 16, xp: 4,  gold: 4,  r: 14, color: '#4be3c9', dark: '#2a9c8a', touch: true, elite: false, minT: 720 },
  armord:   { name: '重甲兵',  hp: 230,  spd: 40,  dmg: 28, xp: 10, gold: 10, r: 24, color: '#9aa7c7', dark: '#5d688a', touch: false, elite: false, armor: 6, minT: 900 },
  healer:   { name: '奶妈',    hp: 90,   spd: 55,  dmg: 12, xp: 8,  gold: 8,  r: 16, color: '#7dffb0', dark: '#3aa769', touch: false, elite: false, heal: true, minT: 1050 },
  mimic:    { name: '宝箱怪',  hp: 320,  spd: 84,  dmg: 30, xp: 22, gold: 70, r: 22, color: '#ffd166', dark: '#c99a20', touch: false, elite: false, minT: 300, rare: true },
  elite:    { name: '精英',    hp: 620,  spd: 66,  dmg: 34, xp: 45, gold: 45, r: 30, color: '#ff4d6d', dark: '#a81f3c', touch: false, elite: true, armor: 4, minT: 420, rare: true },
};
const BOSS_TYPES = {
  gorlin:    { name: '巨魔 · 戈尔林',   hp: 9000,  spd: 52, dmg: 38, xp: 320, gold: 320, r: 64, color: '#c94f7c', dark: '#7c2a4a', boss: true, pattern: 'chase' },
  necrolord: { name: '巫妖 · 奈克罗',   hp: 12000, spd: 58, dmg: 34, xp: 420, gold: 420, r: 58, color: '#6fd3ff', dark: '#2a6f9c', boss: true, pattern: 'summon', minion: 'skeleton' },
  twins:     { name: '双生子 · 影与焰', hp: 16000, spd: 72, dmg: 42, xp: 600, gold: 600, r: 62, color: '#ffb45c', dark: '#a35a1f', boss: true, pattern: 'dash' },
  lich:      { name: '深渊领主 · 卡尔', hp: 30000, spd: 60, dmg: 50, xp: 1500, gold: 1500, r: 76, color: '#b06bff', dark: '#5b2a8c', boss: true, pattern: 'final' },
};
const MINIBOSS_EVERY = 60; // 每 60 秒一个小 Boss

/* ============================ 武器 ============================ */
/* 每项: name/ico/max/desc(lv1)/next(lv2+)/atkBase(升级面板文本)
   fire(p, s) 由武器自身计时器调用；s = 玩家 stat 对象 */
const PROJECTILE_CAP = 620;

const WEAPONS = {
  /* ---- 鞭影：朝面向扇形挥击 ---- */
  whip: {
    name: '鞭影', ico: '🗡️', max: 8, kind: 'melee',
    atkBase: [14, 14, 18, 18, 24, 24, 30, 34],
    desc: '朝面向挥出宽幅鞭击，可穿透敌人。',
    next: ['伤害 +4', '新增向后的一次挥击', '伤害 +6', '挥击宽度 +20%', '新增第三次挥击', '伤害 +6', '挥击击退并暴击率 +10%'],
    init: (p) => ({ t: 0, iv: 1.15, back: false, w: 1, vol: 3 }),
    level: (st, n) => {
      if (n === 1) st.dmg += 4; else if (n === 2) st.back = true;
      else if (n === 3) st.dmg += 4; else if (n === 4) st.dmg += 6, st.w *= 1.2;
      else if (n === 5) st.dmg += 6, st.vol = 4; else if (n === 6) st.dmg += 4;
      else if (n === 7) st.dmg += 6, st.knock += 30, st.critBonus += .1;
      st.iv *= 0.93;
    },
    fire(p, s) {
      const dir = p.aimX >= 0 ? 1 : -1;
      const baseAng = dir > 0 ? 0 : Math.PI;
      const vol = s.vol + (p.stat.area > 1.6 ? 1 : 0);
      for (let i = 0; i < vol; i++) {
        const d = (s.back && i % 2 === 1) ? -dir : dir;
        const ang = (d > 0 ? 0 : Math.PI) + i * 0.45 * dir;
        meleeArc(p, ang, 78 * s.area * p.stat.area, 60 * s.w * p.stat.area,
                 s.dmg * p.stat.might, { src: 'whip', kb: s.knock + 20, critChance: .05 + s.critBonus, arc: 0.75 * s.w });
      }
      AudioFX.shoot();
    },
  },

  /* ---- 飞刀：朝面向连发直线弹 ---- */
  kunai: {
    name: '飞刀', ico: '🔪', max: 8, kind: 'proj',
    atkBase: [9, 9, 9, 12, 12, 15, 15, 18],
    desc: '朝移动方向高速投掷飞刀，射速极快。',
    next: ['弹数 +1', '伤害 +3', '弹数 +1', '穿透 +1', '伤害 +3', '弹速 +25%，射程 +30%', '伤害 +3，弹数 +1'],
    init: (p) => ({ t: 0, iv: 0.5, dmg: 9, count: 1, pierce: 1, spd: 620, life: 1.1, spread: 0.12 }),
    level: (st, n) => {
      if (n === 1) st.count++; else if (n === 2) st.dmg += 3; else if (n === 3) st.count++;
      else if (n === 4) st.dmg += 3, st.pierce++; else if (n === 5) st.dmg += 3;
      else if (n === 6) st.dmg += 3, st.spd *= 1.25, st.life *= 1.3;
      else if (n === 7) st.count++, st.dmg += 3;
      st.iv *= 0.92;
    },
    fire(p, s) {
      const base = p.aimAng;
      for (let i = 0; i < s.count + Math.floor(p.stat.proj); i++) {
        const a = base + rand(-s.spread, s.spread) + (i - (s.count - 1) / 2) * 0.14;
        shoot(p, { ang: a, spd: s.spd * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: s.pierce,
                   life: s.life * p.stat.duration, r: 6, src: 'kunai', kind: 'kunai', kb: 12,
                   critChance: .05 + p.stat.crit });
      }
      AudioFX.shoot();
    },
  },

  /* ---- 火球：抛物飞行 + 命中爆炸 ---- */
  fireball: {
    name: '火球', ico: '🔥', max: 8, kind: 'proj',
    atkBase: [20, 20, 26, 26, 34, 34, 42, 50],
    desc: '缓慢飞向敌人，命中后爆炸并点燃周围。',
    next: ['爆炸半径 +25%', '伤害 +6', '新增 1 发', '伤害 +8，灼烧更强', '新增 1 发', '爆炸半径 +30%', '伤害 +8，附加眩晕'],
    init: (p) => ({ t: 0, iv: 2.0, dmg: 20, count: 1, radius: 62, burn: 4, burnDur: 3 }),
    level: (st, n) => {
      if (n === 1) st.radius *= 1.25; else if (n === 2) st.dmg += 6;
      else if (n === 3) st.count++; else if (n === 4) st.dmg += 8, st.burn += 3;
      else if (n === 5) st.count++; else if (n === 6) st.radius *= 1.3;
      else if (n === 7) st.dmg += 8, st.stun = 0.7;
      st.iv *= 0.9;
    },
    fire(p, s) {
      for (let i = 0; i < s.count; i++) {
        const t = nearestEnemy(p, 700);
        const a = t ? Math.atan2(t.y - p.y, t.x - p.x) + rand(-.25, .25) : p.aimAng + rand(-.5, .5);
        shoot(p, { ang: a, spd: 260 * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: 0,
                   life: 2.2 * p.stat.duration, r: 12, src: 'fireball', kind: 'fireball', kb: 30,
                   explode: s.radius * p.stat.area, burn: s.burn * p.stat.might, burnDur: s.burnDur, stun: s.stun || 0 });
      }
      AudioFX.tone(320, .1, 'triangle', .4, -120);
    },
  },

  /* ---- 罡气：环绕光环，持续击退磨血 ---- */
  garlic: {
    name: '罡气', ico: '🌀', max: 8, kind: 'aura',
    atkBase: [5, 5, 7, 7, 10, 10, 13, 16],
    desc: '周身罡气光环：持续伤害并把敌人推开。',
    next: ['半径 +15%', '伤害 +2', '半径 +15%', '伤害 +2，击退增强', '新增内层反环', '伤害 +3', '半径 +20%，回复 0.2 HP/s'],
    init: (p) => ({ t: 0, iv: 0.45, dmg: 5, radius: 92, knock: 34, layers: 1, healOn: 0 }),
    level: (st, n) => {
      if (n === 1) st.radius *= 1.15; else if (n === 2) st.dmg += 2;
      else if (n === 3) st.radius *= 1.15, st.dmg += 2; else if (n === 4) st.knock += 24;
      else if (n === 5) st.layers = 2, st.dmg += 3; else if (n === 6) st.dmg += 3;
      else if (n === 7) st.radius *= 1.2, st.healOn = 0.2;
    },
    update(p, s, dt) {
      s.t += dt;
      if (s.t < s.iv) return;
      s.t = 0;
      const R = s.radius * p.stat.area;
      const dmg = s.dmg * p.stat.might;
      let hit = 0;
      for (const e of Game.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > R + e.r) continue;
        hurtEnemy(p, e, dmg, { src: 'garlic', kb: s.knock * (e.boss ? 0.05 : 1), noSound: true });
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.x += Math.cos(a) * s.knock * dt * 6; e.y += Math.sin(a) * s.knock * dt * 6;
        hit++;
      }
      if (hit) { AudioFX.tone(220, .08, 'sine', .3); if (s.healOn) p.stat.regen += 0; }
      FX.ring(p.x, p.y, R, 'rgba(120,255,190,0.20)');
    },
  },

  /* ---- 飞斧：高抛抛物线，高伤高暴击 ---- */
  axe: {
    name: '飞斧', ico: '🪓', max: 8, kind: 'proj',
    atkBase: [26, 26, 34, 34, 44, 44, 54, 64],
    desc: '向上抛出重斧，落下时造成巨额伤害与暴击。',
    next: ['伤害 +8', '斧数 +1', '暴击率 +15%', '伤害 +10', '斧数 +1', '穿透 +2', '伤害 +10，落点爆炸'],
    init: (p) => ({ t: 0, iv: 1.9, dmg: 26, count: 1, pierce: 2, crit: .25 }),
    level: (st, n) => {
      if (n === 1) st.dmg += 8; else if (n === 2) st.count++;
      else if (n === 3) st.crit += .15; else if (n === 4) st.dmg += 10;
      else if (n === 5) st.count++; else if (n === 6) st.pierce += 2;
      else if (n === 7) st.dmg += 10, st.boom = 50;
      st.iv *= 0.92;
    },
    fire(p, s) {
      for (let i = 0; i < s.count; i++) {
        shoot(p, { ang: p.aimAng + rand(-0.9, 0.9) - Math.PI * 0.15, spd: rand(300, 420), arc: true,
                   dmg: s.dmg * p.stat.might, pierce: s.pierce + Math.floor(p.stat.pierce), life: 2.2,
                   r: 15, src: 'axe', kind: 'axe', kb: 55, critChance: s.crit + p.stat.crit, spin: true,
                   explode: s.boom ? s.boom * p.stat.area : 0 });
      }
      AudioFX.tone(180, .09, 'square', .35, 60);
    },
  },

  /* ---- 灵弹：自动索敌 ---- */
  bolt: {
    name: '灵弹', ico: '✨', max: 8, kind: 'proj',
    atkBase: [12, 12, 12, 16, 16, 20, 20, 24],
    desc: '自动锁定最近的敌人发射追踪灵弹。',
    next: ['弹数 +1', '伤害 +4', '弹数 +1', '追踪更强', '伤害 +4', '弹数 +1', '有概率发射分裂弹'],
    init: (p) => ({ t: 0, iv: 0.85, dmg: 12, count: 1, homing: 2.2 }),
    level: (st, n) => {
      if (n === 1) st.count++; else if (n === 2) st.dmg += 4;
      else if (n === 3) st.count++; else if (n === 4) st.homing += 2;
      else if (n === 5) st.dmg += 4; else if (n === 6) st.count++;
      else if (n === 7) st.split = true;
      st.iv *= 0.9;
    },
    fire(p, s) {
      const list = nearestEnemies(p, 780, s.count + Math.floor(p.stat.proj));
      for (let i = 0; i < s.count + Math.floor(p.stat.proj); i++) {
        const t = list[i % Math.max(1, list.length)];
        const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.aimAng + rand(-1, 1);
        shoot(p, { ang: a, spd: 420 * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: 1,
                   life: 2.4, r: 8, src: 'bolt', kind: 'bolt', kb: 16, homing: s.homing, split: s.split });
      }
      AudioFX.tone(760, .07, 'sine', .35, -200);
    },
  },

  /* ---- 雷链：命中后连锁跳跃 ---- */
  chain: {
    name: '雷链', ico: '⚡', max: 8, kind: 'instant',
    atkBase: [16, 16, 22, 22, 28, 28, 36, 44],
    desc: '随机降雷劈击附近敌人，电弧向邻近目标连锁。',
    next: ['连锁 +2 段', '伤害 +6', '目标 +1', '连锁 +2 段', '伤害 +8', '麻痹 0.5 秒', '落雷数 +2，伤害 +8'],
    init: (p) => ({ t: 0, iv: 2.4, dmg: 16, targets: 2, jumps: 3, stun: 0 }),
    level: (st, n) => {
      if (n === 1) st.jumps += 2; else if (n === 2) st.dmg += 6;
      else if (n === 3) st.targets++; else if (n === 4) st.jumps += 2;
      else if (n === 5) st.dmg += 6; else if (n === 6) st.dmg += 6, st.stun = 0.5;
      else if (n === 7) st.targets += 2, st.dmg += 8;
      st.iv *= 0.91;
    },
    fire(p, s) {
      const firsts = nearestEnemies(p, 420 * p.stat.area, s.targets);
      if (!firsts.length) return;
      const dmg = s.dmg * p.stat.might;
      for (const f of firsts) {
        let cur = f, hitSet = new Set(), pt = [{ x: p.x, y: p.y }];
        for (let j = 0; j <= s.jumps && cur; j++) {
          hitSet.add(cur);
          pt.push({ x: cur.x, y: cur.y });
          hurtEnemy(p, cur, dmg * (1 - j * 0.07), { src: 'chain', kb: 8, noSound: true, stun: s.stun });
          FX.spark(cur.x, cur.y);
          let best = null, bd = 1e9;
          for (const e of Game.enemies) {
            if (e.dead || hitSet.has(e)) continue;
            const d = dist2(e.x, e.y, cur.x, cur.y);
            if (d < bd && d < 200 * 200) { bd = d; best = e; }
          }
          cur = best;
        }
        FX.lightning(pt);
        // 落雷柱
        FX.bolt(p.x + rand(-160, 160), p.y + rand(-160, 160));
      }
      AudioFX.boom();
    },
  },

  /* ---- 回旋镖：飞出后折返 ---- */
  boomerang: {
    name: '回旋镖', ico: '🪃', max: 8, kind: 'proj',
    atkBase: [18, 18, 18, 24, 24, 30, 30, 38],
    desc: '掷出回旋镖，飞出后折返，去程与回程都能命中。',
    next: ['弹数 +1', '伤害 +6', '回程伤害翻倍', '伤害 +6', '弹数 +1', '射程 +40%', '伤害 +8，永不落地'],
    init: (p) => ({ t: 0, iv: 1.7, dmg: 18, count: 1, reach: 260 }),
    level: (st, n) => {
      if (n === 1) st.count++; else if (n === 2) st.dmg += 6;
      else if (n === 3) st.backDmg = 2; else if (n === 4) st.dmg += 6;
      else if (n === 5) st.count++; else if (n === 6) st.reach *= 1.4;
      else if (n === 7) st.dmg += 8, st.pierceAll = true;
      st.iv *= 0.92;
    },
    fire(p, s) {
      for (let i = 0; i < s.count; i++) {
        shoot(p, { ang: p.aimAng + (i - (s.count - 1) / 2) * 0.5 + rand(-.2, .2), spd: 400 * p.stat.projspeed,
                   dmg: s.dmg * p.stat.might, pierce: 999, life: 2.6 * p.stat.duration, r: 12,
                   src: 'boomerang', kind: 'boomerang', kb: 30, boomerang: true, reach: s.reach * p.stat.area,
                   backDmg: s.backDmg || 1, pierceAll: s.pierceAll });
      }
      AudioFX.tone(430, .1, 'triangle', .35, 260);
    },
  },

  /* ---- 圣典：环绕经书 ---- */
  bible: {
    name: '圣典', ico: '📖', max: 8, kind: 'orbit',
    atkBase: [11, 11, 11, 14, 14, 17, 17, 21],
    desc: '两册圣典绕身旋转，撞上的敌人受伤。',
    next: ['环绕数 +1', '伤害 +3', '环绕半径 +25%', '环绕数 +1', '伤害 +3', '转速 +35%', '环绕数 +1，附加灼烧'],
    init: (p) => ({ t: 0, iv: 99, count: 2, dmg: 11, radius: 108, spin: 1.6, burn: 0 }),
    level: (st, n) => {
      if (n === 1) st.count++; else if (n === 2) st.dmg += 3;
      else if (n === 3) st.radius *= 1.25; else if (n === 4) st.count++;
      else if (n === 5) st.dmg += 3; else if (n === 6) st.spin *= 1.35;
      else if (n === 7) st.count++, st.burn = 5;
    },
    update(p, s, dt) {
      s.t += dt;
      const base = s.t * s.spin;
      const R = s.radius * p.stat.area;
      for (let i = 0; i < s.count; i++) {
        const a = base + (i / s.count) * TAU;
        FX.orbitMark(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, a);
      }
      if (s.t < 0.12) return;
      s.t = 0;
      for (let i = 0; i < s.count; i++) {
        const a = base + (i / s.count) * TAU;
        const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
        for (const e of Game.enemies) {
          if (e.dead) continue;
          if (dist2(e.x, e.y, ox, oy) < (e.r + 16) ** 2) {
            hurtEnemy(p, e, s.dmg * p.stat.might, { src: 'bible', kb: 22, noSound: true, burn: s.burn });
          }
        }
      }
      AudioFX.tone(880, .04, 'sine', .12, -100);
    },
  },

  /* ---- 冰爆：冻结后碎裂 AoE ---- */
  frost: {
    name: '冰爆', ico: '❄️', max: 8, kind: 'instant',
    atkBase: [14, 14, 14, 19, 19, 24, 24, 30],
    desc: '冻结半径内所有敌人 0.8 秒；碎裂时对冻住的敌人造成双倍伤害。',
    next: ['半径 +20%', '伤害 +5', '冻结时间 +0.4s', '碎裂额外伤害 +30%', '伤害 +5', '冰爆后减速残留敌人', '半径 +30%，伤害 +6'],
    init: (p) => ({ t: 0, iv: 4.2, dmg: 14, radius: 210, freeze: 0.8, shatter: 1 }),
    level: (st, n) => {
      if (n === 1) st.radius *= 1.2; else if (n === 2) st.dmg += 5;
      else if (n === 3) st.freeze += .4; else if (n === 4) st.shatter += .3;
      else if (n === 5) st.dmg += 5; else if (n === 6) st.slowAura = true;
      else if (n === 7) st.radius *= 1.3, st.dmg += 6;
      st.iv *= 0.9;
    },
    fire(p, s) {
      const R = s.radius * p.stat.area;
      const dmg = s.dmg * p.stat.might;
      let any = false;
      for (const e of Game.enemies) {
        if (e.dead || e.boss && Game.t < 600) continue;
        if (dist2(e.x, e.y, p.x, p.y) < (R + e.r) ** 2) {
          hurtEnemy(p, e, dmg * (e.frozen > 0 ? 2 * s.shatter : 1), { src: 'frost', noSound: true });
          e.frozen = Math.max(e.frozen, s.freeze);
          any = true;
        }
      }
      FX.nova(p.x, p.y, R, 'rgba(140,220,255,0.35)', 'rgba(140,220,255,0)');
      if (any) AudioFX.tone(1200, .18, 'sine', .35, -700);
      if (s.slowAura) for (const e of Game.enemies) if (!e.dead) e.slowed = 1.6;
    },
  },

  /* ---- 炮轰：随机落点轰炸 ---- */
  cannon: {
    name: '炮轰', ico: '💣', max: 8, kind: 'delayed',
    atkBase: [30, 30, 30, 30, 40, 40, 40, 54],
    desc: '在随机敌人脚下标记，半秒后炮弹落下造成范围伤害。',
    next: ['落点数 +1', '爆炸半径 +30%', '伤害 +10', '落点数 +1', '眩晕 0.6 秒', '伤害 +10', '落点数 +1，半径 +25%'],
    init: (p) => ({ t: 0, iv: 3.0, dmg: 30, bombs: 2, radius: 78, stun: 0 }),
    level: (st, n) => {
      if (n === 1) st.bombs++; else if (n === 2) st.radius *= 1.3;
      else if (n === 3) st.dmg += 10; else if (n === 4) st.bombs++;
      else if (n === 5) st.dmg += 10, st.stun = 0.6; else if (n === 6) st.dmg += 10;
      else if (n === 7) st.bombs++, st.radius *= 1.25;
      st.iv *= 0.9;
    },
    fire(p, s) {
      for (let i = 0; i < s.bombs; i++) {
        const t = Math.random() < 0.75 ? nearestEnemy(p, 600) : null;
        const x = t ? t.x : p.x + rand(-300, 300), y = t ? t.y : p.y + rand(-300, 300);
        Game.delayed.push({ x, y, t: 0.55, dmg: s.dmg * p.stat.might, radius: s.radius * p.stat.area,
                            src: 'cannon', stun: s.stun });
        FX.marker(x, y);
      }
      AudioFX.tone(240, .08, 'square', .3, -140);
    },
  },

  /* ---- 锯齿轮：地面滚动轮 ---- */
  saw: {
    name: '锯齿轮', ico: '⚙️', max: 8, kind: 'projectile',
    atkBase: [16, 16, 16, 20, 20, 20, 26, 32],
    desc: '沿地面滚动的锯轮，无限穿透并持续加速。',
    next: ['轮数 +1', '伤害 +4', '体积 +25%', '轮数 +1', '伤害 +6', '反弹墙面敌人', '体积 +30%，伤害 +6'],
    init: (p) => ({ t: 0, iv: 2.2, dmg: 16, count: 1, r: 18 }),
    level: (st, n) => {
      if (n === 1) st.count++; else if (n === 2) st.dmg += 4;
      else if (n === 3) st.r *= 1.25; else if (n === 4) st.count++;
      else if (n === 5) st.dmg += 6; else if (n === 6) st.bounce = true;
      else if (n === 7) st.r *= 1.3, st.dmg += 6;
      st.iv *= 0.88;
    },
    fire(p, s) {
      for (let i = 0; i < s.count; i++) {
        const a = rand(0, TAU);
        shoot(p, { ang: a, spd: 230, dmg: s.dmg * p.stat.might, pierce: 999, life: 4.2 * p.stat.duration,
                   r: s.r * p.stat.area, src: 'saw', kind: 'saw', kb: 26, spin: true, accel: 60, bounce: s.bounce });
      }
      AudioFX.tone(140, .12, 'sawtooth', .3, 90);
    },
  },

  /* ---- 追踪弹：齐发并追踪 ---- */
  rocket: {
    name: '追踪弹', ico: '🚀', max: 8, kind: 'proj',
    atkBase: [22, 22, 22, 28, 28, 28, 36, 44],
    desc: '齐发射出追踪小火箭，命中后小范围爆炸。',
    next: ['弹数 +1', '爆炸半径 +25%', '伤害 +6', '弹数 +1', '伤害 +6', '命中后分裂 2 枚小弹', '弹数 +1，伤害 +8'],
    init: (p) => ({ t: 0, iv: 2.6, dmg: 22, count: 3, radius: 48 }),
    level: (st, n) => {
      if (n === 1) st.count += 1; else if (n === 2) st.radius *= 1.25;
      else if (n === 3) st.dmg += 6; else if (n === 4) st.count += 1;
      else if (n === 5) st.dmg += 6; else if (n === 6) st.split = 2;
      else if (n === 7) st.count += 1, st.dmg += 8;
      st.iv *= 0.91;
    },
    fire(p, s) {
      for (let i = 0; i < s.count; i++) {
        const t = nearestEnemies(p, 800, i + 1)[i] || null;
        const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : rand(0, TAU);
        shoot(p, { ang: a + rand(-.3, .3), spd: 330, dmg: s.dmg * p.stat.might, pierce: 0, life: 3,
                   r: 9, src: 'rocket', kind: 'rocket', kb: 22, homing: 3.4,
                   explode: s.radius * p.stat.area, split: s.split ? 2 : 0 });
      }
      AudioFX.tone(500, .09, 'square', .3, -240);
    },
  },
};

/* ============================ 被动 ============================ */
const PASSIVES = {
  might:    { name: '力量', ico: '💪', max: 5, desc: '所有伤害 +10%', each: (st) => st.might += 0.10 },
  hpup:     { name: '体魄', ico: '❤️', max: 5, desc: '生命上限 +20 并立刻回血', each: (st, p) => { st.maxHpFlat += 20; if (p) { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } } },
  armor:    { name: '铁甲', ico: '🛡️', max: 5, desc: '受到的伤害 -1', each: (st) => st.armor += 1 },
  speed:    { name: '疾行', ico: '👟', max: 5, desc: '移动速度 +8%', each: (st) => st.speed += 0.08 },
  cooldown: { name: '急速', ico: '⏱️', max: 5, desc: '武器冷却 -8%', each: (st) => st.cooldown += 0.08 },
  area:     { name: '疆域', ico: '🧭', max: 5, desc: '作用范围 +10%', each: (st) => st.area += 0.10 },
  magnet:   { name: '贪婪', ico: '🧲', max: 5, desc: '拾取半径 +25%', each: (st) => st.magnet += 0.25 },
  dur:      { name: '持久', ico: '⌛', max: 5, desc: '效果持续时间 +10%', each: (st) => st.duration += 0.10 },
  proj:     { name: '增幅', ico: '➕', max: 5, desc: '弹射物数量 +1', each: (st) => st.proj += 1 },
  projspeed:{ name: '迅捷', ico: '💨', max: 5, desc: '弹射物速度 +15%', each: (st) => st.projspeed += 0.15 },
  crit:     { name: '致命', ico: '🎯', max: 5, desc: '暴击率 +8%，暴击伤害 +15%', each: (st) => { st.crit += 0.08; st.critdmg += 0.15; } },
  regen:    { name: '生机', ico: '🌿', max: 5, desc: '每秒回复 0.4 点生命', each: (st) => st.regen += 0.4 },
  revive:   { name: '不灭', ico: '♻️', max: 2, desc: '死亡时原地复活（保留 50% 生命）', each: (st) => st.revive += 1 },
  greed:    { name: '点金', ico: '💰', max: 3, desc: '金币获取 +35%', each: (st) => st.greed += 0.35 },
  xpup:     { name: '智慧', ico: '📚', max: 3, desc: '经验获取 +15%', each: (st) => st.xpGain += 0.15 },
  pierce:   { name: '破甲', ico: '🏹', max: 3, desc: '弹射物穿透 +1', each: (st) => st.pierce += 1 },
};

/* ============================ 玩家 ============================ */
function makePlayer(charDef) {
  const st = {
    might: charDef.might, speed: 1 + (charDef.spd - 1), cooldown: 0, area: charDef.area, duration: 1,
    proj: charDef.proj, projspeed: 0, magnet: charDef.magnet, armor: charDef.armor, crit: 0.05, critdmg: 0.6,
    regen: charDef.regen, revive: charDef.rev, greed: 0, xpGain: charDef.xp, maxHpFlat: 0, pierce: 0,
  };
  return {
    char: charDef, x: 0, y: 0, vx: 0, vy: 0, r: 16, dir: 1, aimAng: 0, aimX: 1,
    maxHp: charDef.hp, hp: charDef.hp, invul: 0, iframe: 0, hitFlash: 0, walk: 0, dead: false,
    level: 1, xp: 0, xpNeed: 5, gold: 0, kills: 0, dmgDealt: 0, dmgTaken: 0, weaponKills: {},
    stat: st, weapons: [], passives: {}, pendingLevels: 0,
  };
}

function addWeaponSlot(p, id) {
  if (p.weapons.some((w) => w.id === id)) return false;
  if (p.weapons.length >= 6) return false;
  const def = WEAPONS[id];
  const st = def.init(p);
  p.weapons.push({ id, lv: 1, st });
  def.level && def.level(st, 0);
  return true;
}

function computeStats(p) {
  // 角色基础 + 被动重算
  const s = p.stat;
  const base = p.char;
  s.might = base.might; s.area = base.area; s.proj = base.proj; s.magnet = base.magnet;
  s.speed = 1 + (base.spd - 1); s.armor = base.armor; s.regen = base.regen; s.revive = base.rev;
  s.cooldown = 0; s.duration = 1; s.projspeed = 0; s.crit = 0.05; s.critdmg = 0.6;
  s.greed = 0; s.xpGain = base.xp; s.pierce = 0; s.maxHpFlat = 0;
  for (const id in p.passives) {
    const def = PASSIVES[id];
    for (let i = 0; i < p.passives[id]; i++) def.each(s, p);
  }
  s.cooldown = clamp(s.cooldown, 0, 0.7);
  p.maxHp = base.hp + s.maxHpFlat;
  p.hp = Math.min(p.hp, p.maxHp);
}

/* ============================ 伤害与命中 ============================ */
function nearestEnemy(p, maxD) {
  let best = null, bd = maxD * maxD;
  for (const e of Game.enemies) {
    if (e.dead) continue;
    const d = dist2(e.x, e.y, p.x, p.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function nearestEnemies(p, maxD, n) {
  const arr = [];
  const md = maxD * maxD;
  for (const e of Game.enemies) {
    if (e.dead) continue;
    const d = dist2(e.x, e.y, p.x, p.y);
    if (d < md) arr.push({ e, d });
  }
  arr.sort((a, b) => a.d - b.d);
  return arr.slice(0, n).map((o) => o.e);
}

function hurtEnemy(p, e, dmg, opt = {}) {
  if (e.dead || !isFinite(dmg)) return;
  let d = dmg;
  if (e.armor && opt.src !== 'garlic') d = Math.max(1, d - e.armor);
  const critChance = (opt.critChance !== undefined ? opt.critChance : p.stat.crit);
  const crit = Math.random() < critChance;
  if (crit) d *= 1 + p.stat.critdmg;
  d = Math.max(1, Math.round(d));
  e.hp -= d;
  e.flash = 0.09;
  p.dmgDealt += d;
  if (opt.src) p.weaponKills[opt.src] = (p.weaponKills[opt.src] || 0);
  FX.floatText(e.x, e.y - e.r, d, crit ? '#ffd166' : '#fff', crit ? 18 : 13);
  if (opt.kb && !e.boss) {
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    e.kx += Math.cos(a) * opt.kb; e.ky += Math.sin(a) * opt.kb;
  } else if (opt.kb && e.boss) {
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    e.kx += Math.cos(a) * opt.kb * 0.08; e.ky += Math.sin(a) * opt.kb * 0.08;
  }
  if (opt.burn) { e.burn = { dps: opt.burn, t: opt.burnDur || 3, tick: 0 }; }
  if (opt.stun) e.stun = Math.max(e.stun || 0, opt.stun);
  if (!opt.noSound && Math.random() < 0.35) AudioFX.hit();
  if (e.hp <= 0) killEnemy(p, e, opt.src);
}

function killEnemy(p, e, src) {
  if (e.dead) return;
  e.dead = true;
  p.kills++;
  if (src) p.weaponKills[src] = (p.weaponKills[src] || 0) + 1;
  const diff = Game.diff;
  spawnGem(e.x, e.y, Math.round(e.xp * p.stat.xpGain * diff.xp), Math.round(e.gold * (1 + p.stat.greed)));
  FX.burst(e.x, e.y, e.def.color, e.boss ? 40 : 10, e.boss ? 5 : 2.4);
  if (e.boss) { AudioFX.boom(); Game.shake(14, 0.5); toast(`👑 击杀 ${e.def.name}！`); dropChest(e.x, e.y); }
  else if (e.elite) { AudioFX.kill(); dropChest(e.x, e.y, true); }
  else AudioFX.kill();
  Game.stats.totalKills++;
}

function spawnGem(x, y, xp, gold) {
  if (Game.gems.length > 900) { Game.gems.shift(); }
  Game.gems.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), xp, gold: gold || 0, t: 0, vx: rand(-40, 40), vy: rand(-40, 40), magnet: false, r: 5 });
}

function dropChest(x, y, mini) {
  Game.chests.push({ x, y, r: mini ? 16 : 22, t: 0, mini: !!mini, open: false });
}

/* 近战扇形判定 */
function meleeArc(p, ang, reach, width, dmg, opt = {}) {
  const half = (opt.arc || 0.7) / 2;
  const cx = p.x + Math.cos(ang) * reach * 0.55;
  const cy = p.y + Math.sin(ang) * reach * 0.55;
  for (const e of Game.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + e.r) continue;
    let a = Math.atan2(dy, dx) - ang;
    while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU;
    if (Math.abs(a) > half + e.r / Math.max(40, d)) continue;
    hurtEnemy(p, e, dmg, opt);
  }
  FX.arc(p.x, p.y, ang, reach, width, opt.color || 'rgba(255,240,200,0.55)');
}

/* 发射弹射物 */
function shoot(p, cfg) {
  if (Game.projectiles.length > PROJECTILE_CAP) return;
  const proj = {
    x: p.x, y: p.y, px: p.x, py: p.y,
    vx: Math.cos(cfg.ang) * cfg.spd, vy: Math.sin(cfg.ang) * cfg.spd,
    ang: cfg.ang, dmg: cfg.dmg, pierce: cfg.pierce || 0, life: cfg.life || 2, r: cfg.r || 6,
    kind: cfg.kind || 'kunai', src: cfg.src || '?', kb: cfg.kb || 0,
    critChance: cfg.critChance, explode: cfg.explode || 0, burn: cfg.burn || 0, burnDur: cfg.burnDur || 3,
    stun: cfg.stun || 0, homing: cfg.homing || 0, spin: !!cfg.spin, arc: !!cfg.arc, t: 0,
    boomerang: !!cfg.boomerang, reach: cfg.reach || 0, backDmg: cfg.backDmg || 1,
    accel: cfg.accel || 0, bounce: !!cfg.bounce, split: cfg.split || 0, hit: new Set(),
    ox: p.x, oy: p.y, grav: cfg.arc ? 620 : 0,
  };
  Game.projectiles.push(proj);
  AudioFX && (proj.kind === 'kunai' || proj.kind === 'bolt') ? null : null;
  return proj;
}

/* ============================ 特效 ============================ */
const FX = {
  floatText(x, y, v, color, size) {
    if (Game.texts.length > 120) return;
    Game.texts.push({ x: x + rand(-8, 8), y, v: String(v), color, size, t: 0, life: 0.75, vy: -46 });
  },
  burst(x, y, color, n = 8, spd = 2.4) {
    for (let i = 0; i < n; i++) {
      if (Game.particles.length > MAX_PARTICLES) break;
      const a = rand(0, TAU), s = rand(30, 90) * spd;
      Game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(.25, .6),
                            r: rand(1.5, 4), color });
    }
  },
  spark(x, y) { this.burst(x, y, '#fff2a8', 5, 1.4); },
  ring(x, y, r, color) { Game.particles.push({ x, y, vx: 0, vy: 0, t: 0, life: .16, r, color, ring: true }); },
  arc(x, y, ang, reach, width, color) { Game.arcs.push({ x, y, ang, reach, width, color, t: 0, life: .22 }); },
  swing(x, y, dir, scale) { Game.arcs.push({ x, y, ang: dir > 0 ? 0 : Math.PI, reach: 78 * scale, width: 60, color: 'rgba(255,240,200,.5)', t: 0, life: .2 }); },
  nova(x, y, r, c0, c1) { Game.novas.push({ x, y, r, c0, c1, t: 0, life: .45 }); },
  lightning(pts) { Game.zaps.push({ pts, t: 0, life: .18 }); },
  bolt(x, y) { Game.zaps.push({ pts: [{ x, y: y - 420 }, { x: x + 8, y: y - 260 }, { x: x - 6, y: y - 120 }, { x, y }], t: 0, life: .16, thin: true }); },
  marker(x, y) { Game.markers.push({ x, y, t: 0, life: .55 }); },
  orbitMark(x, y, a) { Game.orbits.push({ x, y, a, t: 0, life: .14 }); },
};

/* ============================ 主游戏 ============================ */
const Game = {
  canvas: null, ctx: null, dpr: 1,
  state: 'menu',           // menu | playing | levelup | paused | over | win
  t: 0, dt: 0, last: 0, raf: 0,
  player: null, enemies: [], projectiles: [], gems: [], chests: [], particles: [],
  texts: [], arcs: [], novas: [], zaps: [], markers: [], orbits: [], delayed: [], summons: [],
  spawnAcc: {}, nextMini: MINIBOSS_EVERY, waveDone: {},
  cam: { x: 0, y: 0, sx: 0, sy: 0, shake: 0, shakeT: 0 },
  diff: DIFFICULTIES[1], charDef: CHARACTERS[0],
  pendingCards: [], rerolls: 3,
  stats: { totalKills: 0, survived: 0, goldEarned: 0, level: 1 },
  best: null,
  ui: {},

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.resize();
    addEventListener('resize', () => this.resize());
    Input.init(this.canvas);
    try { this.best = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { this.best = null; }
    this.buildMenu();
    this.bindUI();
    this.last = performance.now();
    this.loop(this.last);
  },

  resize() {
    const pad = 16;
    const availW = innerWidth - pad, availH = innerHeight - pad;
    const scale = Math.min(availW / VIEW.w, availH / VIEW.h, 1.6);
    const w = Math.max(320, Math.floor(VIEW.w * scale)), h = Math.max(180, Math.floor(VIEW.h * scale));
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.canvas.width = Math.floor(w * this.dpr); this.canvas.height = Math.floor(h * this.dpr);
    this.scale = w / VIEW.w;
  },

  /* ---------- UI ---------- */
  bindUI() {
    const $ = (id) => (this.ui[id] = document.getElementById(id));
    ['menu', 'hud', 'levelup', 'gameover', 'cards', 'toast', 'paused', 'warning', 'loadout',
      'hpFill', 'hpText', 'xpFill', 'xpText', 'timeText', 'killText', 'goldText', 'rerollLeft',
      'goTitle', 'goStats', 'goTip', 'charInfo'].forEach($);
    $('btnStart').onclick = () => this.start();
    $('btnRetry').onclick = () => this.start();
    $('btnMenu').onclick = () => this.toMenu();
    $('btnSkip').onclick = () => { this.pendingLevels--; this.gainGold(10); this.closeLevelUp(); };
    $('btnReroll').onclick = () => {
      if (this.rerolls <= 0) return;
      this.rerolls--; this.rollCards(); this.renderCards();
    };
    $('btnMute').onclick = () => this.toggleMute();
    $('selChar').onchange = () => this.refreshCharInfo();
    $('selDiff').onchange = () => this.refreshCharInfo();
  },
  toggleMute() {
    AudioFX.init(); AudioFX.muted = !AudioFX.muted;
    this.ui.btnMute.textContent = AudioFX.muted ? '🔇' : '🔊';
    toast(AudioFX.muted ? '已静音' : '已开启音效');
  },
  onKey(k, e) {
    if (k === 'm') this.toggleMute();
    if (this.state === 'playing' && k === 'p') {
      this.pause(); return;
    }
    if (this.state === 'paused') {
      if ((k === 'enter' || k === 'escape') && !this.escHold) {
        this.resume(); this.escHold = 1; return;
      }
      if (k === 'escape') this.escHold = 0;
      return;
    }
    if (this.state === 'levelup' && k >= '1' && k <= '3') {
      const i = +k - 1; if (this.ui.cards.children[i]) this.ui.cards.children[i].click();
    } else if (this.state === 'menu' && k === 'enter') { this.start(); }
    if (k === 'escape') this.escHold = 0;
  },

  buildMenu() {
    const sc = this.ui.selChar, sd = this.ui.selDiff;
    sc.innerHTML = CHARACTERS.map((c, i) => `<option value="${i}">${c.ico} ${c.name}</option>`).join('');
    sd.innerHTML = DIFFICULTIES.map((d, i) => `<option value="${i}">${d.name} — ${d.tag}</option>`).join('');
    sd.value = '1';
    this.refreshCharInfo();
  },
  refreshCharInfo() {
    const c = CHARACTERS[+this.ui.selChar.value], d = DIFFICULTIES[+this.ui.selDiff.value];
    const w = WEAPONS[c.weapon];
    const b = this.best;
    this.ui.charInfo.innerHTML =
      `<b>${c.ico} ${c.name}</b> · 初始武器：<b>${w.ico} ${w.name}</b> — ${w.desc}<br>` +
      `HP ${c.hp} · 移速 ${(c.spd * 100) | 0}% · 伤害 ${Math.round(c.might * 100)}% · 范围 ${Math.round(c.area * 100)}% · 拾取 ${Math.round(c.magnet * 100)}% · 难度：<b>${d.name}</b>` +
      (b ? `<br><span style="color:#9a92c0">最佳记录：${c.id} · ${fmtTime(b.time)} · Lv.${b.level} · ${b.kills} 杀</span>` : '');
  },

  toMenu() {
    this.state = 'menu';
    this.ui.menu.classList.remove('hidden');
    this.ui.hud.classList.add('hidden');
    this.ui.gameover.classList.add('hidden');
    this.ui.levelup.classList.add('hidden');
    this.refreshCharInfo();
  },

  /* ---------- 开局 ---------- */
  start() {
    AudioFX.init(); AudioFX.resume();
    this.charDef = CHARACTERS[+this.ui.selChar.value];
    this.diff = DIFFICULTIES[+this.ui.selDiff.value];
    this.player = makePlayer(this.charDef);
    addWeaponSlot(this.player, this.charDef.weapon);
    computeStats(this.player);

    Object.assign(this, {
      t: 0, enemies: [], projectiles: [], gems: [], chests: [], particles: [], texts: [],
      arcs: [], novas: [], zaps: [], markers: [], orbits: [], delayed: [], summons: [],
      spawnAcc: {}, nextMini: MINIBOSS_EVERY, waveDone: {}, rerolls: 3, pendingLevels: 0,
      nextElite: 480, nextMimic: 360, finalSpawned: false, won: false, _spawnFrac: 0,
      stats: { totalKills: 0, survived: 0, goldEarned: 0, level: 1 },
    });
    this.cam.x = this.cam.y = 0; this.cam.shake = 0;
    this.ui.menu.classList.add('hidden');
    this.ui.gameover.classList.add('hidden');
    this.ui.levelup.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
    this.state = 'playing';
    this.syncLoadout();
    toast(`难度：${this.diff.name} · 存活 30 分钟可击败深渊领主`);
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.paused.classList.remove('hidden');
  },
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.paused.classList.add('hidden');
    this.last = performance.now();
  },

  /* ---------- 关卡曲线 ---------- */
  difficultyAt() {
    const m = this.t / 60;
    return {
      hp: 1 + m * 0.42 + Math.max(0, m - 15) * 0.35,
      dmg: 1 + m * 0.16,
      rate: 1 + m * 0.20 + Math.max(0, m - 18) * 0.5,
    };
  },

  spawnBudget() {
    // 每秒期望生成数
    const m = this.t / 60;
    const per = 2.0 + m * 0.85 + (m > 15 ? (m - 15) * 1.1 : 0);
    return per;
  },

  availableTypes() {
    const out = [];
    for (const id in ENEMY_TYPES) {
      const d = ENEMY_TYPES[id];
      if (d.minT <= this.t && !d.rare) out.push(id);
    }
    return out;
  },

  updateSpawns(dt) {
    if (this.enemies.length >= MAX_ENEMIES) return;
    const curve = this.difficultyAt();
    const per = this.spawnBudget() * this.diff.hp;
    for (const id of this.availableTypes()) {
      this.spawnAcc[id] = (this.spawnAcc[id] || 0);
    }
    // 按权重轮盘选择
    const list = this.availableTypes();
    if (!list.length) return;
    let n = per * dt;
    this._spawnFrac = (this._spawnFrac || 0) + n;
    while (this._spawnFrac >= 1) {
      this._spawnFrac -= 1;
      // 稀有怪独立轮盘：宝箱怪 (mimic)、精英 (elite)
      if ((this.t > 300 && Math.random() < 0.02)) {
        // 宝箱怪
        this.spawnEnemy('mimic'); continue;
      } else if ((this.t > 480 && Math.random() < 0.015)) {
        // 精英怪
        this.spawnEnemy('elite'); continue;
      }
      const id = list[randi(0, list.length - 1)];
      this.spawnEnemy(id);
      // 虫群成串
      if (id === 'swarm' && Math.random() < 0.5) for (let i = 0; i < 4; i++) this.spawnEnemy('swarm');
    }
    // 每 90 秒一波包围圈
    const waveIdx = Math.floor(this.t / 90);
    if (!this.waveDone[waveIdx] && this.t % 90 < dt + 0.001 && waveIdx > 0) {
      this.waveDone[waveIdx] = 1;
      this.spawnRing(waveIdx);
      toast('⭕ 敌潮包围！');
    }
    // 小 Boss
    if (this.t >= this.nextMini) {
      this.nextMini += MINIBOSS_EVERY;
      this.spawnMiniBoss();
    }
    // 30 分钟终局 Boss
    if (this.t >= RUN_DURATION && !this.finalSpawned) {
      this.finalSpawned = true;
      this.spawnBoss('lich', true);
    }
  },

  spawnPoint() {
    const d = 640 + rand(0, 180);
    const a = rand(0, TAU);
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  },

  spawnEnemy(id, at, scale = 1) {
    if (this.enemies.length >= MAX_ENEMIES) return;
    const def = ENEMY_TYPES[id];
    const pos = at || this.spawnPoint();
    const curve = this.difficultyAt();
    const e = {
      id, def, x: pos.x, y: pos.y, r: def.r * scale, hp: 0, maxHp: 0, kx: 0, ky: 0,
      spd: def.spd * this.diff.spd * (0.9 + curve.rate * 0.02), dmg: def.dmg, flash: 0, dead: false,
      xp: def.xp, gold: def.gold, elite: def.elite, boss: false, touchCd: 0,
      armor: (def.armor || 0) + Math.floor(this.t / 480),
      frozen: 0, stun: 0, slowed: 0, burn: null, chargeState: 0, chargeT: 0, aim: null, shootCd: rand(1, 3),
      anim: rand(0, TAU),
    };
    e.maxHp = e.hp = Math.round(def.hp * curve.hp * this.diff.hp * scale);
    this.enemies.push(e);
    return e;
  },

  spawnRing(idx) {
    const n = clamp(20 + idx * 6, 20, 70);
    const R = 560;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.spawnEnemy(Math.random() < .4 ? 'skeleton' : 'slime',
        { x: this.player.x + Math.cos(a) * R, y: this.player.y + Math.sin(a) * R });
    }
  },

  spawnMiniBoss() {
    const ids = Object.keys(BOSS_TYPES).filter((k) => k !== 'lich');
    const key = ids[randi(0, ids.length - 1)];
    this.spawnBoss(key, false);
  },

  spawnBoss(key, final) {
    const def = BOSS_TYPES[key];
    const curve = this.difficultyAt();
    const pos = this.spawnPoint();
    const hpMul = (final ? 1 : clamp(0.35 + this.t / 1500, 0.35, 1.1)) * curve.hp * this.diff.hp;
    const e = {
      id: key, def: { ...def, touch: false }, x: pos.x, y: pos.y, r: def.r,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul, kx: 0, ky: 0,
      spd: def.spd * this.diff.spd, dmg: def.dmg * curve.dmg * this.diff.dmg,
      flash: 0, dead: false, xp: def.xp, gold: def.gold, boss: true, elite: true,
      armor: 8 + Math.floor(this.t / 300), frozen: 0, stun: 0, slowed: 0, burn: null,
      pattern: def.pattern, pT: 0, pState: 0, minionCd: 2, anim: 0, final: !!final,
    };
    this.enemies.push(e);
    AudioFX.boss();
    toast(`👹 ${def.name} 出现了！${final ? '击败它即可通关' : ''}`);
    this.shake(10, .6);
    return e;
  },

  /* ---------- 敌人 AI ---------- */
  updateEnemies(dt) {
    const p = this.player;
    const curve = this.difficultyAt();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }
      e.flash = Math.max(0, e.flash - dt);
      e.anim += dt * 6;
      // 击退衰减
      e.x += e.kx * dt * 3; e.y += e.ky * dt * 3;
      e.kx *= Math.pow(0.0025, dt); e.ky *= Math.pow(0.0025, dt);
      // 灼烧
      if (e.burn) {
        e.burn.tick += dt;
        if (e.burn.tick >= 0.5) {
          e.burn.tick = 0;
          e.hp -= e.burn.dps;
          FX.floatText(e.x, e.y - e.r, Math.round(e.burn.dps), '#ff9e64', 12);
          if (e.hp <= 0) { killEnemy(p, e, 'burn'); continue; }
        }
        e.burn.t -= dt;
        if (e.burn.t <= 0) e.burn = null;
      }
      if (e.frozen > 0) { e.frozen -= dt; }
      if (e.stun > 0) { e.stun -= dt; }
      if (e.slowed > 0) { e.slowed -= dt; }

      const frozenish = e.frozen > 0 || e.stun > 0;
      let spd = e.spd * (e.slowed > 0 ? 0.55 : 1);
      if (frozenish) spd = 0;

      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;

      if (e.boss) this.bossAI(e, dt, ux, uy, d, spd);
      else if (e.def.ranged) {
        // 喷吐者：保持距离开火
        const want = 260;
        const dir = d > want ? 1 : d < want - 60 ? -1 : 0;
        e.x += ux * spd * dir * dt; e.y += uy * spd * dir * dt;
        e.shootCd -= dt;
        if (e.shootCd <= 0 && d < 480 && !frozenish) {
          e.shootCd = rand(2.2, 3.4);
          Game.summons.push({ x: e.x, y: e.y, vx: ux * 250, vy: uy * 250, r: 7, dmg: e.dmg * curve.dmg * this.diff.dmg, life: 3.2, hostile: true, kind: 'spit', color: '#c58cff' });
        }
      } else if (e.def.charge) {
        // 冲锋者：蓄力 → 高速直线冲锋
        if (e.chargeState === 0) {
          e.x += ux * spd * dt; e.y += uy * spd * dt;
          if (d < 300) { e.chargeState = 1; e.chargeT = 0.65; e.aim = { x: ux, y: uy }; }
        } else if (e.chargeState === 1) {
          e.chargeT -= dt;
          if (e.chargeT <= 0) { e.chargeState = 2; e.chargeT = 0.8; }
        } else {
          e.x += e.aim.x * 520 * dt; e.y += e.aim.y * 520 * dt;
          e.chargeT -= dt;
          if (e.chargeT <= 0) e.chargeState = 0;
        }
      } else if (e.def.heal) {
        // 奶妈：治疗周围
        e.x += ux * spd * 0.85 * dt; e.y += uy * spd * 0.85 * dt;
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          e.shootCd = 2.4;
          for (const o of this.enemies) {
            if (o === e || o.dead || o.hp >= o.maxHp) continue;
            if (dist2(o.x, o.y, e.x, e.y) < 180 * 180) {
              o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.12);
              FX.floatText(o.x, o.y - o.r, '+', '#7dffb0', 13);
            }
          }
          FX.nova(e.x, e.y, 170, 'rgba(125,255,176,.28)', 'rgba(125,255,176,0)');
        }
      } else if (e.def.touch) {
        // 邪符：自爆
        e.x += ux * spd * dt; e.y += uy * spd * dt;
        if (d < e.r + p.r + 6) {
          const dmg = e.dmg * 2.4 * curve.dmg * this.diff.dmg;
          this.damagePlayer(dmg, e);
          FX.nova(e.x, e.y, 90, 'rgba(75,227,201,.45)', 'rgba(75,227,201,0)');
          AudioFX.boom();
          killEnemy(p, e, 'selfboom');
          continue;
        }
      } else {
        e.x += ux * spd * dt; e.y += uy * spd * dt;
      }

      // 敌人间轻度分离（避免完全重叠，性能：仅对近邻抽样）
      if ((i & 3) === 0) {
        for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
          const o = this.enemies[j];
          if (o.dead || o.boss || e.boss) continue;
          const ox = o.x - e.x, oy = o.y - e.y;
          const dd = ox * ox + oy * oy, mr = (e.r + o.r) * 0.72;
          if (dd < mr * mr && dd > 0.01) {
            const dl = Math.sqrt(dd), push = (mr - dl) * 0.35;
            const nx = ox / dl, ny = oy / dl;
            e.x -= nx * push; e.y -= ny * push; o.x += nx * push; o.y += ny * push;
          }
        }
      }

      // 碰撞伤害
      if (!e.boss && !e.def.touch && d < e.r + p.r) {
        this.damagePlayer(e.dmg * curve.dmg * this.diff.dmg, e);
      } else if (e.boss && d < e.r + p.r + 4) {
        this.damagePlayer(e.dmg * 1.1, e);
      }

      // 掉出太远
      if (d > 1600) { const sp = this.spawnPoint(); e.x = sp.x; e.y = sp.y; }
    }
  },

  bossAI(e, dt, ux, uy, d, spd) {
    const p = this.player;
    e.pT += dt;
    if (e.pattern === 'chase') {
      e.x += ux * spd * dt; e.y += uy * spd * dt;
      if (e.pT > 6) { e.pT = 0; this.enemyVolley(e, 12, 240); }
    } else if (e.pattern === 'summon') {
      e.x += ux * spd * (d > 200 ? 1 : 0) * dt; e.y += uy * spd * (d > 200 ? 1 : 0) * dt;
      e.minionCd -= dt;
      if (e.minionCd <= 0) {
        e.minionCd = 4.5;
        for (let i = 0; i < 4; i++) {
          const a = rand(0, TAU);
          this.spawnEnemy(e.def.minion || 'skeleton', { x: e.x + Math.cos(a) * (e.r + 30), y: e.y + Math.sin(a) * (e.r + 30) }, 1.2);
        }
        FX.nova(e.x, e.y, e.r * 2, 'rgba(111,211,255,.35)', 'rgba(111,211,255,0)');
      }
      if (e.pT > 7) { e.pT = 0; this.enemyVolley(e, 16, 200); }
    } else if (e.pattern === 'dash') {
      if (e.pState === 0) {
        e.x += ux * spd * dt; e.y += uy * spd * dt;
        if (e.pT > 4 && d > 120) { e.pState = 1; e.pT = 0; e.aim = { x: ux, y: uy }; }
      } else if (e.pState === 1) {
        if (e.pT > 0.5) { e.pState = 2; e.pT = 0; }
      } else {
        e.x += e.aim.x * 720 * dt; e.y += e.aim.y * 720 * dt;
        FX.burst(e.x, e.y, e.def.color, 2, 1);
        if (e.pT > 0.9) { e.pState = 0; e.pT = 0; }
      }
      if (e.pT > 3.4 && e.pState === 0) { e.pT = 0; this.enemyVolley(e, 10, 260); }
    } else if (e.pattern === 'final') {
      e.x += ux * spd * (d > 170 ? 1 : -0.4) * dt; e.y += uy * spd * (d > 170 ? 1 : -0.4) * dt;
      e.minionCd -= dt;
      if (e.minionCd <= 0) {
        e.minionCd = 5;
        for (let i = 0; i < 6; i++) {
          const a = rand(0, TAU);
          this.spawnEnemy(pick(['brute', 'elite' , 'skeleton', 'ghost']), { x: e.x + Math.cos(a) * (e.r + 40), y: e.y + Math.sin(a) * (e.r + 40) }, 1.3);
        }
      }
      if (e.pT > 3.0) { e.pT = 0; this.enemyVolley(e, 20, 230, true); }
      if (e.pState === 0 && e.pT === 0 && Math.random() < 0.3) e.pState = 1;
    }
    // 首领靠近伤害在 updateEnemies 已处理
  },

  enemyVolley(e, n, spd, spiral) {
    const base = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    for (let i = 0; i < n; i++) {
      const a = spiral ? base + (i / n) * TAU : base + (i - n / 2) * 0.12;
      Game.summons.push({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 9,
                          dmg: e.dmg * 0.55, life: 4, hostile: true, kind: 'orb', color: e.def.color });
    }
    AudioFX.tone(120, .2, 'sawtooth', .35, 40);
  },

  damagePlayer(dmg, src) {
    const p = this.player;
    if (p.invul > 0 || p.dead || this.state !== 'playing') return;
    const s = p.stat;
    let d = Math.max(1, Math.round(dmg - s.armor));
    p.hp -= d;
    p.dmgTaken += d;
    p.iframe = 0.42;
    p.hitFlash = 0.25;
    FX.floatText(p.x, p.y - 22, d, '#ff8fa3', 16);
    AudioFX.hurt();
    this.shake(6, .22);
    if (p.hp <= 0) {
      if (s.revive > 0) {
        s.revive--;
        p.hp = p.maxHp * 0.5;
        p.invul = 2.5;
        FX.nova(p.x, p.y, 260, 'rgba(255,209,102,.5)', 'rgba(255,209,102,0)');
        toast('♻️ 不灭：原地复活！');
        AudioFX.levelup();
      } else {
        this.gameOver(false);
      }
    }
  },

  /* ---------- 弹射物 / 延迟伤害 ---------- */
  updateProjectiles(dt) {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      q.t += dt; q.life -= dt;
      q.px = q.x; q.py = q.y;
      if (q.homing) {
        const t = nearestEnemy(p, 520);
        if (t) {
          const want = Math.atan2(t.y - q.y, t.x - q.x);
          const cur = Math.atan2(q.vy, q.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
          const na = cur + clamp(diff, -q.homing * dt, q.homing * dt);
          const sp = Math.hypot(q.vx, q.vy);
          q.vx = Math.cos(na) * sp; q.vy = Math.sin(na) * sp;
        }
      }
      if (q.arc) { q.vy += q.grav * dt; }
      if (q.accel) { q.vx *= 1 + q.accel * dt * 0.001; q.vy *= 1 + q.accel * dt * 0.001; }
      if (q.boomerang) {
        const dd = Math.hypot(q.x - q.ox, q.y - q.oy);
        if (dd > q.reach && !q.back) { q.back = true; }
        if (q.back) {
          const a = Math.atan2(q.oy - q.y, q.ox - q.x);
          const sp = Math.hypot(q.vx, q.vy);
          q.vx = lerp(q.vx, Math.cos(a) * sp, 0.08); q.vy = lerp(q.vy, Math.sin(a) * sp, 0.08);
        }
      }
      q.x += q.vx * dt; q.y += q.vy * dt;

      // 命中判定
      for (const e of this.enemies) {
        if (e.dead || q.hit.has(e)) continue;
        const rr = e.r + q.r;
        if (dist2(e.x, e.y, q.x, q.y) < rr * rr) {
          q.hit.add(e);
          const mult = (q.back && q.backDmg) ? q.backDmg : 1;
          hurtEnemy(p, e, q.dmg * mult, { src: q.src, kb: q.kb, critChance: q.critChance, noSound: q.kind === 'saw' });
          if (q.explode) { this.explode(q.x, q.y, q.explode, q.dmg * 0.6, q); }
          if (q.split) {
            for (let k = 0; k < q.split; k++) {
              const a = rand(0, TAU);
              shoot(p, { ang: a, spd: 300, dmg: q.dmg * 0.5, pierce: 0, life: 1.2, r: 6, src: q.src, kind: q.kind, homing: 2 });
            }
          }
          if (q.pierce <= 0) { q.life = 0; break; }
          q.pierce--;
        }
      }

      if (q.life <= 0) {
        // 火球类不重复引爆（已在 hit 时处理）
        if (q.kind !== 'fireball' && q.explode) this.explode(q.x, q.y, q.explode, q.dmg * 0.6, q);
        this.projectiles.splice(i, 1);
      } else if (Math.hypot(q.x - p.x, q.y - p.y) > 1300) {
        this.projectiles.splice(i, 1);
      }
    }

    // 敌方弹
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const s = this.summons[i];
      s.life -= dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const p2 = this.player;
      if (dist2(s.x, s.y, p2.x, p2.y) < (s.r + p2.r) ** 2) {
        this.damagePlayer(s.dmg, null);
        this.summons.splice(i, 1); continue;
      }
      if (s.life <= 0) this.summons.splice(i, 1);
    }

    // 延迟落弹（炮轰）
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.explode(d.x, d.y, d.radius, d.dmg, d, d.stun);
        this.delayed.splice(i, 1);
      }
    }
  },

  explode(x, y, radius, dmg, src, stun) {
    const p = this.player;
    FX.nova(x, y, radius, 'rgba(255,180,92,.42)', 'rgba(255,120,60,0)');
    FX.burst(x, y, '#ffb45c', 14, 3);
    AudioFX.boom();
    this.shake(5, .18);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = radius + e.r;
      if (dist2(e.x, e.y, x, y) < rr * rr) {
        hurtEnemy(p, e, dmg * (e.boss ? 0.75 : 1), { src: src?.src || 'explode', kb: 40, noSound: true, stun });
      }
    }
  },

  /* ---------- 拾取 ---------- */
  updateGems(dt) {
    const p = this.player;
    const mag = 90 * p.stat.magnet + p.r;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.t += dt;
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= Math.pow(0.02, dt); g.vy *= Math.pow(0.02, dt);
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (g.magnet) {
        const a = Math.atan2(p.y - g.y, p.x - g.x);
        g.x += Math.cos(a) * 620 * dt; g.y += Math.sin(a) * 620 * dt;
      } else if (d2 < mag * mag) {
        g.magnet = true;
      }
      if (d2 < (p.r + 8) ** 2) {
        p.xp += g.xp;
        if (g.gold) this.gainGold(g.gold);
        AudioFX.pickup();
        this.gems.splice(i, 1);
        while (p.xp >= p.xpNeed) { p.xp -= p.xpNeed; p.level++; p.xpNeed = this.xpFor(p.level); p.pendingLevels++; }
        continue;
      }
      if (g.t > 26) this.gems.splice(i, 1);
    }
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      c.t += dt;
      if (dist2(c.x, c.y, p.x, p.y) < (p.r + c.r + 30) ** 2) {
        this.openChest(c);
        this.chests.splice(i, 1);
      }
    }
  },
  gainGold(n) {
    this.player.gold += n;
    this.stats.goldEarned += n;
  },
  openChest(c) {
    const gold = Math.round((c.mini ? rand(20, 45) : rand(60, 160)) * (1 + this.t / 600));
    this.gainGold(gold);
    FX.nova(c.x, c.y, 120, 'rgba(255,209,102,.5)', 'rgba(255,209,102,0)');
    AudioFX.levelup();
    if (c.mini) { toast(`🎁 小宝箱：+${gold} 金币`); return; }
    // 大宝箱：立刻升级 或 掉落磁铁/十诫类道具
    const roll = Math.random();
    if (roll < 0.55) { this.player.pendingLevels++; toast('🎁 宝箱：获得一次立即升级！'); }
    else if (roll < 0.8) { this.magnetAll(); toast('🧲 宝箱：全屏吸取！'); }
    else { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40); toast('💖 宝箱：回复 40 生命'); }
  },
  magnetAll() {
    for (const g of this.gems) g.magnet = true;
    this.gainGold(Math.round(rand(30, 80)));
  },
  xpFor(lv) {
    return Math.round(5 + lv * 6 + Math.pow(lv, 1.55) * 1.6);
  },

  /* ---------- 升级卡 ---------- */
  rollCards() {
    const p = this.player;
    const pool = [];
    // 新武器
    for (const id in WEAPONS) {
      if (p.weapons.some((w) => w.id === id)) continue;
      if (p.weapons.length >= 6) break;
      pool.push({ type: 'w', id, w: 1.15 });
    }
    // 武器升级
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (w.lv >= def.max) continue;
      pool.push({ type: 'wu', id: w.id, lv: w.lv + 1, w: 1.0 });
    }
    // 被动
    for (const id in PASSIVES) {
      const have = p.passives[id] || 0;
      if (have >= PASSIVES[id].max) continue;
      pool.push({ type: 'p', id, lv: have + 1, w: 0.95 });
    }
    // 兜底：金币
    pool.push({ type: 'gold', id: 'gold', w: 0.35 });

    const cards = [];
    const used = new Set();
    const tries = 40;
    for (let k = 0; k < tries && cards.length < 3; k++) {
      let total = 0;
      for (const o of pool) if (!used.has(o.id)) total += o.w;
      if (total <= 0) break;
      let r = Math.random() * total;
      for (const o of pool) {
        if (used.has(o.id)) continue;
        r -= o.w;
        if (r <= 0) { cards.push(o); used.add(o.id); break; }
      }
    }
    if (cards.length === 0) cards.push({ type: 'gold', id: 'gold', w: 1 });
    while (cards.length < 3) cards.push({ type: 'gold', id: 'gold' + cards.length, w: 1 });
    this.pendingCards = cards;
  },

  cardView(o) {
    const p = this.player;
    if (o.type === 'w') {
      const d = WEAPONS[o.id];
      return { ico: d.ico, nm: d.name, ty: `新武器 · ${d.kind.toUpperCase()}`, ds: d.desc, lv: 0, max: d.max, isNew: true };
    }
    if (o.type === 'wu') {
      const d = WEAPONS[o.id];
      const cur = p.weapons.find((w) => w.id === o.id);
      const note = d.next[clamp((cur ? cur.lv : 1) - 1, 0, d.next.length - 1)] || '强化';
      return { ico: d.ico, nm: d.name, ty: `武器 · Lv.${o.lv}`, ds: `升级：${note}`, lv: o.lv - 1, max: d.max, isNew: false };
    }
    if (o.type === 'p') {
      const d = PASSIVES[o.id];
      return { ico: d.ico, nm: d.name, ty: `被动 · Lv.${o.lv}/${d.max}`, ds: d.desc + '（叠加生效）', lv: o.lv - 1, max: d.max, isNew: (p.passives[o.id] || 0) === 0 };
    }
    return { ico: '💰', nm: '战利品', ty: '补给', ds: '获得 60 金币，用于日后商店（暂未开放，先收下吧）。', lv: 0, max: 0, isNew: false };
  },

  renderCards() {
    const wrap = this.ui.cards;
    wrap.innerHTML = '';
    this.pendingCards.forEach((o, idx) => {
      const v = this.cardView(o);
      const el = document.createElement('div');
      el.className = 'card' + (v.isNew ? ' new' : '') + (o.type === 'gold' ? ' rdy' : '');
      let pips = '';
      if (v.max > 1) {
        pips = `<div class="lvbar">${Array.from({ length: v.max }, (_, i) =>
          `<div class="pip${i < v.lv ? ' on' : ''}"></div>`).join('')}</div>`;
      }
      el.innerHTML = `<div class="ico">${v.ico}</div><div class="nm">${v.nm}</div>
        <div class="ty">${v.ty}</div><div class="ds">${v.ds}</div>${pips}
        <div class="ty" style="margin-top:8px">按 <kbd>${idx + 1}</kbd> 选择</div>`;
      el.onclick = () => this.applyCard(o);
      wrap.appendChild(el);
    });
    this.ui.rerollLeft.textContent = this.rerolls;
    this.ui.btnReroll.style.opacity = this.rerolls > 0 ? 1 : .4;
  },

  applyCard(o) {
    const p = this.player;
    if (o.type === 'w') {
      addWeaponSlot(p, o.id);
    } else if (o.type === 'wu') {
      const w = p.weapons.find((x) => x.id === o.id);
      if (w && w.lv < WEAPONS[o.id].max) { w.lv++; WEAPONS[o.id].level(w.st, w.lv - 1); }
    } else if (o.type === 'p') {
      p.passives[o.id] = (p.passives[o.id] || 0) + 1;
    } else {
      this.gainGold(60);
    }
    computeStats(p);
    this.syncLoadout();
    this.pendingLevels--;
    AudioFX.tone(660, .12, 'square', .5, 220);
    this.closeLevelUp();
  },

  closeLevelUp() {
    if (this.pendingLevels > 0) {
      this.rerolls = Math.min(this.rerolls + 0, 3);
      this.rollCards(); this.renderCards();
      this.state = 'levelup';
      this.ui.levelup.classList.remove('hidden');
      AudioFX.levelup();
      return;
    }
    this.state = 'playing';
    this.ui.levelup.classList.add('hidden');
    this.last = performance.now();
  },

  openLevelUp() {
    if (this.pendingLevels <= 0) return;
    this.state = 'levelup';
    this.rerolls = Math.max(this.rerolls, 3);
    this.rollCards(); this.renderCards();
    this.ui.levelup.classList.remove('hidden');
    AudioFX.levelup();
  },

  syncLoadout() {
    const p = this.player;
    const html = p.weapons.map((w) =>
      `<div class="slot lv" data-lv="${w.lv}" title="${WEAPONS[w.id].name} Lv.${w.lv}">${WEAPONS[w.id].ico}</div>`).join('') +
      Object.entries(p.passives).map(([id, lv]) =>
        `<div class="slot passive lv" data-lv="${lv}" title="${PASSIVES[id].name} Lv.${lv}">${PASSIVES[id].ico}</div>`).join('');
    this.ui.loadout.innerHTML = html;
  },

  /* ---------- 玩家更新 ---------- */
  updatePlayer(dt) {
    const p = this.player;
    const s = p.stat;
    const v = Input.vec();
    const baseSpd = 165 * s.speed * (1 + Math.min(this.t, 1800) / 1800 * 0.12);
    p.vx = lerp(p.vx, v.x * baseSpd, 1 - Math.pow(0.0001, dt));
    p.vy = lerp(p.vy, v.y * baseSpd, 1 - Math.pow(0.0001, dt));
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.abs(v.x) > 0.05) p.aimX = v.x > 0 ? 1 : -1;
    const mv = Math.hypot(p.vx, p.vy);
    if (mv > 12) { p.aimAng = Math.atan2(p.vy, p.vx); p.walk += dt * 9; }
    else if (p.enemies0) { p.aimAng = Math.atan2(p.enemies0.y - p.y, p.enemies0.x - p.x); }

    p.iframe = Math.max(0, p.iframe - dt);
    p.invul = Math.max(0, p.invul - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    if (s.regen > 0) p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);

    // 武器计时
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (def.update) { def.update(p, w.st, dt); continue; }
      w.st.t += dt;
      const iv = w.st.iv / (1 + s.cooldown);
      if (w.st.t >= iv) {
        w.st.t = 0;
        def.fire(p, w.st);
      }
    }
  },

  shake(mag, time) { this.cam.shake = Math.max(this.cam.shake, mag); this.cam.shakeT = Math.max(this.cam.shakeT, time); },

  /* ---------- 主循环 ---------- */
  loop(now) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (this.state === 'playing') {
      this.step(dt);
    } else if (this.state === 'menu') {
      this.menuTick(dt);
    }
    this.render(dt);
    this.updateHUD();
  },

  step(dt) {
    this.t += dt;
    this.stats.survived = this.t;
    this.stats.level = this.player.level;
    this.updatePlayer(dt);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateGems(dt);
    this.updateEffects(dt);
    // 相机
    this.cam.x = lerp(this.cam.x, this.player.x, 1 - Math.pow(0.0008, dt));
    this.cam.y = lerp(this.cam.y, this.player.y, 1 - Math.pow(0.0008, dt));
    if (this.cam.shakeT > 0) {
      this.cam.shakeT -= dt;
      this.cam.sx = rand(-1, 1) * this.cam.shake;
      this.cam.sy = rand(-1, 1) * this.cam.shake;
      this.cam.shake *= Math.pow(0.02, dt);
    } else { this.cam.sx = this.cam.sy = 0; }

    if (this.player.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();
    if (this.t >= RUN_DURATION + 40 && !this.finalSpawned) this.gameOver(true);
    const lich = this.enemies.find((e) => e.final);
    if (!lich && this.finalSpawned && this.t > RUN_DURATION + 2) {
      // 终局 Boss 已被击杀 → 通关
      if (!this.won) this.gameOver(true);
    }
  },

  updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= Math.pow(0.02, dt); q.vy *= Math.pow(0.02, dt);
      if (q.t > q.life) this.particles.splice(i, 1);
    }
    for (const arr of [this.texts, this.arcs, this.novas, this.zaps, this.markers, this.orbits]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].t += dt;
        if (arr[i].t > arr[i].life) arr.splice(i, 1);
      }
    }
    for (const tx of this.texts) tx.y += tx.vy * dt;
  },

  menuTick(dt) {
    // 菜单背景：缓慢飘动的粒子 + 演示敌人
    this.t += dt;
    if (this.enemies.length < 26 && Math.random() < 0.35) {
      const a = rand(0, TAU), r = 500 + rand(0, 300);
      const e = this.spawnEnemy(pick(['slime', 'bat', 'skeleton', 'ghost']), { x: Math.cos(a) * r, y: Math.sin(a) * r });
      if (e) { e.demo = true; }
    }
    for (const e of this.enemies) {
      const a = Math.atan2(-e.y, -e.x);
      e.x += Math.cos(a) * 26 * dt; e.y += Math.sin(a) * 26 * dt;
      e.anim += dt * 5;
      if (Math.hypot(e.x, e.y) < 120) { e.x = rand(-700, 700); e.y = rand(-500, 500); }
    }
    this.cam.x = lerp(this.cam.x, 0, 0.04); this.cam.y = lerp(this.cam.y, 0, 0.04);
    this.updateEffects(dt);
  },

  /* ---------- 结算 ---------- */
  gameOver(won) {
    if (this.state === 'over' || this.state === 'win') return;
    this.state = won ? 'win' : 'over';
    const p = this.player;
    if (won) { AudioFX.win(); } else { AudioFX.lose(); }
    // 记录
    try {
      const key = p.char.id;
      const cur = this.best ? this.best[key] : null;
      const rec = { time: this.t, level: p.level, kills: p.kills, gold: p.gold, char: key };
      if (!cur || cur.time < this.t) {
        this.best = { ...this.best, [key]: rec };
        localStorage.setItem(SAVE_KEY, JSON.stringify(rec));
      }
    } catch (e) {}
    const dps = this.t > 0 ? Math.round(p.dmgDealt / this.t) : 0;
    const killsPerSec = this.t > 0 ? (p.kills / this.t).toFixed(1) : 0;
    this.ui.goTitle.textContent = won ? '🏆 深渊领主陨落！通关！' : '💀 你被淹没了';
    const topWeapon = Object.entries(p.weaponKills).sort((a, b) => b[1] - a[1])[0];
    this.ui.goStats.innerHTML = `
      <div><b>${fmtTime(this.t)}</b>存活时间</div>
      <div><b>Lv.${p.level}</b>等级</div>
      <div><b>${p.kills}</b>总击杀</div>
      <div><b>${killsPerSec}/s</b>清怪效率</div>
      <div><b>${dps}</b>平均 DPS</div>
      <div><b>${p.gold}</b>金币</div>
      <div><b>${topWeapon ? (WEAPONS[topWeapon[0]]?.name || topWeapon[0]) + ' ' + topWeapon[1] : '—'}</b>最佳武器</div>
      <div><b>${p.weapons.length}/6</b>武器</div>
      <div><b>${Object.keys(p.passives).length}</b>被动数</div>`;
    const tips = [
      '把同类武器升到 8 级会比多开新武器更强。',
      '「急速」和「增幅」组合能让飞刀/灵弹变成弹幕地狱。',
      '罡气 + 疆域 + 铁甲 是新手最稳的活法。',
      '暴击流：飞斧 + 致命 + 力量，专治精英与 Boss。',
      '被精英追时绕圈，等雷链或炮轰把它的血磨掉。',
      '宝箱必掉一次升级，优先去捡。',
    ];
    this.ui.goTip.textContent = '💡 ' + pick(tips);
    this.ui.gameover.classList.remove('hidden');
    this.ui.levelup.classList.add('hidden');
  },

  /* ============================ 渲染 ============================ */
  render(dt) {
    const c = this.ctx, S = this.scale * this.dpr;
    c.setTransform(S, 0, 0, S, 0, 0);
    const W = VIEW.w, H = VIEW.h;
    // 背景
    const m = this.t / 60;
    const bg = this.bgFor(m);
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    this.drawGrid(c, W, H);

    const camx = this.cam.x + this.cam.sx, camy = this.cam.y + this.cam.sy;
    c.save();
    c.translate(W / 2 - camx, H / 2 - camy);

    this.drawMarkers(c);
    this.drawGems(c);
    this.drawChests(c);
    this.drawOrbits(c);
    if (this.state !== 'menu') this.drawPlayer(c);
    this.drawEnemies(c);
    this.drawSummons(c);
    this.drawProjectiles(c);
    this.drawEffects(c);
    this.drawTexts(c);

    c.restore();
    // 屏幕空间：小地图与暗角
    if (this.state !== 'menu') { this.drawMinimap(c, W, H); this.drawVignette(c, W, H); }
    else this.drawVignette(c, W, H);
  },

  bgFor(m) {
    // 随时间变化的环境色：草原→废墟→血色→深渊
    const stops = [
      [0, [16, 13, 28], [26, 22, 46]],
      [5, [18, 22, 30], [24, 40, 46]],
      [10, [30, 18, 26], [52, 26, 34]],
      [15, [26, 12, 20], [62, 20, 28]],
      [20, [12, 16, 34], [24, 12, 44]],
      [30, [6, 8, 18], [18, 8, 30]],
    ];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (m >= stops[i][0] && m <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const t = clamp((m - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
    const mix = (i) => Math.round(lerp(a[1][i], b[1][i], t));
    return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
  },

  drawGrid(c, W, H) {
    const G = 120;
    const camx = this.cam.x + this.cam.sx, camy = this.cam.y + this.cam.sy;
    const ox = ((-camx % G) + G) % G, oy = ((-camy % G) + G) % G;
    c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
    c.beginPath();
    for (let x = ox - G; x < W + G; x += G) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = oy - G; y < H + G; y += G) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();
  },

  drawGems(c) {
    for (const g of this.gems) {
      const pulse = 1 + Math.sin(g.t * 8) * 0.12;
      const gold = g.gold > 3;
      c.save(); c.translate(g.x, g.y); c.scale(pulse, pulse);
      c.fillStyle = gold ? '#ffd166' : '#7ee8fa';
      c.shadowColor = c.fillStyle; c.shadowBlur = 8;
      c.beginPath();
      if (gold) { c.arc(0, 0, 4.5, 0, TAU); }
      else { c.moveTo(0, -6); c.lineTo(4, 0); c.lineTo(0, 6); c.lineTo(-4, 0); }
      c.fill(); c.restore();
    }
  },

  drawChests(c) {
    for (const ch of this.chests) {
      c.save(); c.translate(ch.x, ch.y);
      const b = Math.sin(ch.t * 4) * 2;
      c.translate(0, b);
      c.fillStyle = ch.mini ? '#c99a20' : '#f4a259';
      c.shadowColor = '#ffd166'; c.shadowBlur = 22;
      c.fillRect(-ch.r, -ch.r * 0.75, ch.r * 2, ch.r * 1.5);
      c.fillStyle = '#7a4a12'; c.fillRect(-ch.r, -2, ch.r * 2, 4);
      c.fillStyle = '#fff3c4'; c.fillRect(-3, -4, 6, 8);
      c.restore();
    }
  },

  drawMarkers(c) {
    for (const mk of this.markers) {
      const k = mk.t / mk.life;
      c.save(); c.translate(mk.x, mk.y);
      c.strokeStyle = `rgba(255,90,90,${0.9 - k * 0.5})`;
      c.lineWidth = 2; c.setLineDash([6, 4]);
      c.beginPath(); c.arc(0, 0, 40 * (1 - k * 0.25), 0, TAU); c.stroke();
      c.setLineDash([]);
      c.fillStyle = `rgba(255,90,90,${0.7})`;
      c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
      c.restore();
    }
  },

  drawOrbits(c) {
    for (const o of this.orbits) {
      c.save(); c.translate(o.x, o.y); c.rotate(o.a);
      c.fillStyle = `rgba(255,240,200,${1 - o.t / o.life})`;
      c.shadowColor = '#ffd166'; c.shadowBlur = 12;
      c.fillRect(-9, -6, 18, 12);
      c.fillStyle = `rgba(90,60,30,${1 - o.t / o.life})`; c.fillRect(-2, -6, 4, 12);
      c.restore();
    }
  },

  drawPlayer(c) {
    const p = this.player;
    if (!p) return;
    const blink = p.iframe > 0 && (Math.floor(p.iframe * 20) % 2 === 0);
    c.save(); c.translate(p.x, p.y);
    // 影
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(0, p.r * 0.85, p.r * 0.85, p.r * 0.4, 0, 0, TAU); c.fill();
    if (!blink) {
      const bob = Math.sin(p.walk) * 2;
      c.translate(0, bob);
      if (p.invul > 0) { c.shadowColor = '#ffd166'; c.shadowBlur = 24; }
      // 披风
      c.fillStyle = p.char.id === 'witch' ? '#5b2a8c' : p.char.id === 'necro' ? '#2a2a3f' : '#3a2c6b';
      c.beginPath();
      c.moveTo(-p.r * 0.9, -2); c.quadraticCurveTo(0, p.r * 1.9, p.r * 0.9, -2);
      c.closePath(); c.fill();
      // 身体
      c.fillStyle = p.hitFlash > 0 ? '#ff9aa8' : '#e8e3ff';
      c.beginPath(); c.arc(0, 0, p.r, 0, TAU); c.fill();
      // 头 / 兜帽
      c.fillStyle = '#2b2140';
      c.beginPath(); c.arc(0, -p.r * 0.35, p.r * 0.72, Math.PI, TAU); c.fill();
      // 眼睛
      c.fillStyle = '#ffd166';
      const ex = p.aimX > 0 ? 1 : -1;
      c.beginPath(); c.arc(ex * 4, -p.r * 0.15, 2, 0, TAU); c.arc(ex * 9, -p.r * 0.1, 2, 0, TAU); c.fill();
      // 角色图标
      c.font = '15px system-ui'; c.textAlign = 'center';
      c.fillText(p.char.ico, 0, -p.r - 8);
      // 面向武器小标记
      c.strokeStyle = 'rgba(255,209,102,.5)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(Math.cos(p.aimAng) * (p.r + 4), Math.sin(p.aimAng) * (p.r + 4));
      c.lineTo(Math.cos(p.aimAng) * (p.r + 16), Math.sin(p.aimAng) * (p.r + 16)); c.stroke();
    }
    c.restore();
    // 罡气/光环可视化由 update 里的 ring 粒子完成
  },

  drawEnemies(c) {
    for (const e of this.enemies) {
      const bob = Math.sin(e.anim) * (e.boss ? 4 : 2);
      c.save(); c.translate(e.x, e.y + bob);
      if (e.boss) { c.shadowColor = e.def.color; c.shadowBlur = 30; }
      else { c.shadowBlur = 0; }
      // 冻结/眩晕色
      let body = e.def.color;
      if (e.frozen > 0) body = '#bfeaff';
      else if (e.flash > 0) body = '#ffffff';
      else if (e.burn) body = mixHex(e.def.color, '#ff7b3c', 0.5);
      // 阴影
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.beginPath(); c.ellipse(0, e.r * 0.85 - bob, e.r * 0.8, e.r * 0.35, 0, 0, TAU); c.fill();
      // 身体
      c.fillStyle = body;
      if (e.id === 'bat') this.drawBat(c, e);
      else if (e.id === 'skeleton') this.drawSkel(c, e);
      else if (e.id === 'ghost') this.drawGhost(c, e);
      else if (e.id === 'rune') this.drawRune(c, e);
      else if (e.id === 'armord') this.drawArmored(c, e);
      else if (e.boss) this.drawBossBody(c, e);
      else if (e.elite) this.drawElite(c, e);
      else {
        c.beginPath();
        c.moveTo(0, -e.r);
        c.quadraticCurveTo(e.r, -e.r * 0.2, e.r * 0.75, e.r * 0.7);
        c.quadraticCurveTo(0, e.r * 1.05, -e.r * 0.75, e.r * 0.7);
        c.quadraticCurveTo(-e.r, -e.r * 0.2, 0, -e.r);
        c.fill();
      }
      // 眼睛（通用）
      if (!e.boss && !e.elite && e.id !== 'skeleton' && e.id !== 'ghost') {
        c.fillStyle = '#1a1226';
        c.beginPath(); c.arc(-e.r * 0.3, -e.r * 0.1, e.r * 0.13, 0, TAU); c.arc(e.r * 0.3, -e.r * 0.1, e.r * 0.13, 0, TAU); c.fill();
      }
      c.restore();

      // 血条
      if (e.hp < e.maxHp && !e.boss) {
        const w = e.r * 2, hgt = 3;
        c.fillStyle = 'rgba(0,0,0,.55)';
        c.fillRect(e.x - w / 2, e.y - e.r - 9, w, hgt);
        c.fillStyle = e.elite ? '#ff4d6d' : '#06d6a0';
        c.fillRect(e.x - w / 2, e.y - e.r - 9, w * clamp(e.hp / e.maxHp, 0, 1), hgt);
      }
      // 精英/Boss 名牌
      if (e.elite || e.boss) {
        const w = e.boss ? 150 : 66;
        const y = e.y - e.r - (e.boss ? 22 : 16);
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(e.x - w / 2, y, w, 6);
        c.fillStyle = e.boss ? '#ff4d6d' : '#ffb45c';
        c.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 6);
        if (e.boss) {
          c.font = 'bold 12px system-ui'; c.textAlign = 'center'; c.fillStyle = '#ffd166';
          c.fillText(e.def.name, e.x, y - 6);
        }
      }
    }
  },
  drawBat(c, e) {
    const f = Math.sin(e.anim * 2) * 0.5 + 0.5;
    c.fillStyle = e.def.dark;
    c.beginPath();
    c.moveTo(-e.r * 2.2, -e.r * 0.6 - f * e.r); c.quadraticCurveTo(-e.r * 0.6, -e.r * 1.6, 0, 0);
    c.quadraticCurveTo(e.r * 0.6, -e.r * 1.6, e.r * 2.2, -e.r * 0.6 - f * e.r);
    c.quadraticCurveTo(e.r * 0.8, e.r * 0.3, 0, e.r * 0.2);
    c.quadraticCurveTo(-e.r * 0.8, e.r * 0.3, -e.r * 2.2, -e.r * 0.6 - f * e.r);
    c.fill();
    c.fillStyle = e.def.color; c.beginPath(); c.arc(0, 0, e.r * 0.8, 0, TAU); c.fill();
  },
  drawSkel(c, e) {
    c.strokeStyle = e.def.color; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.arc(0, -e.r * 0.5, e.r * 0.5, 0, TAU); c.stroke();
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(0, e.r * 0.8);
    c.moveTo(-e.r * 0.6, e.r * 0.2); c.lineTo(e.r * 0.6, e.r * 0.2);
    c.moveTo(-e.r * 0.4, e.r * 0.9); c.lineTo(e.r * 0.4, e.r * 0.9);
    c.stroke();
    c.fillStyle = '#1a1226';
    c.beginPath(); c.arc(-e.r * 0.18, -e.r * 0.55, 2, 0, TAU); c.arc(e.r * 0.18, -e.r * 0.55, 2, 0, TAU); c.fill();
  },
  drawGhost(c, e) {
    c.fillStyle = e.def.color; c.globalAlpha = 0.85;
    c.beginPath();
    c.arc(0, -e.r * 0.1, e.r * 0.9, Math.PI, 0);
    const w = e.r * 0.45;
    c.lineTo(e.r * 0.9, e.r * 0.8);
    for (let i = 0; i < 3; i++) {
      const x = e.r * 0.9 - w * (i * 2 + 1);
      c.quadraticCurveTo(x, e.r * 0.5, x - w, e.r * 0.8);
    }
    c.lineTo(-e.r * 0.9, e.r * 0.8);
    c.closePath(); c.fill(); c.globalAlpha = 1;
    c.fillStyle = '#0e2233';
    c.beginPath(); c.arc(-e.r * 0.28, -e.r * 0.2, 2.4, 0, TAU); c.arc(e.r * 0.28, -e.r * 0.2, 2.4, 0, TAU); c.fill();
  },
  drawRune(c, e) {
    const k = Math.abs(Math.sin(e.anim * 1.6));
    c.rotate(e.anim * 0.3);
    c.strokeStyle = e.def.color; c.lineWidth = 3;
    c.shadowColor = e.def.color; c.shadowBlur = 12 + k * 16;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      i ? c.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r) : c.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
    }
    c.closePath(); c.stroke();
    c.fillStyle = `rgba(75,227,201,${0.25 + k * 0.5})`; c.fill();
  },
  drawArmored(c, e) {
    c.fillStyle = e.def.dark;
    c.fillRect(-e.r, -e.r * 0.9, e.r * 2, e.r * 1.8);
    c.fillStyle = e.def.color;
    c.fillRect(-e.r * 0.7, -e.r * 0.6, e.r * 1.4, e.r * 0.5);
    c.fillRect(-e.r * 0.7, e.r * 0.1, e.r * 1.4, e.r * 0.5);
    c.fillStyle = '#ff4d6d';
    c.fillRect(-e.r * 0.25, -e.r * 0.35, e.r * 0.5, e.r * 0.2);
  },
  drawElite(c, e) {
    c.fillStyle = e.def.color;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, rr = i % 2 ? e.r * 0.75 : e.r;
      i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
    c.strokeStyle = '#ffd166'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, e.r * 1.25, 0, TAU); c.stroke();
    c.fillStyle = '#1a1226';
    c.beginPath(); c.arc(-e.r * 0.3, -e.r * 0.1, 3, 0, TAU); c.arc(e.r * 0.3, -e.r * 0.1, 3, 0, TAU); c.fill();
  },
  drawBossBody(c, e) {
    c.fillStyle = e.def.dark;
    c.beginPath(); c.arc(0, 0, e.r, 0, TAU); c.fill();
    c.fillStyle = e.def.color;
    c.beginPath(); c.arc(0, -e.r * 0.1, e.r * 0.72, 0, TAU); c.fill();
    // 角
    c.strokeStyle = '#ffd166'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-e.r * 0.5, -e.r * 0.55); c.lineTo(-e.r * 0.85, -e.r * 1.15);
    c.moveTo(e.r * 0.5, -e.r * 0.55); c.lineTo(e.r * 0.85, -e.r * 1.15);
    c.stroke();
    // 眼
    c.fillStyle = e.frozen > 0 ? '#bfeaff' : '#ff2d55';
    c.shadowColor = c.fillStyle; c.shadowBlur = 18;
    c.beginPath(); c.arc(-e.r * 0.26, -e.r * 0.2, e.r * 0.11, 0, TAU); c.arc(e.r * 0.26, -e.r * 0.2, e.r * 0.11, 0, TAU); c.fill();
  },

  drawSummons(c) {
    for (const s of this.summons) {
      c.save(); c.translate(s.x, s.y);
      c.fillStyle = s.color; c.shadowColor = s.color; c.shadowBlur = 12;
      c.beginPath(); c.arc(0, 0, s.r, 0, TAU); c.fill();
      c.restore();
    }
  },

  drawProjectiles(c) {
    for (const q of this.projectiles) {
      c.save(); c.translate(q.x, q.y);
      const a = Math.atan2(q.vy, q.vx);
      if (q.spin) c.rotate(q.t * 16); else c.rotate(a);
      c.shadowBlur = 10;
      switch (q.kind) {
        case 'kunai':
          c.fillStyle = '#dfe6ff'; c.shadowColor = '#9ec1ff';
          c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -3.5); c.lineTo(-6, 3.5); c.closePath(); c.fill();
          break;
        case 'fireball':
          c.fillStyle = '#ff9e4f'; c.shadowColor = '#ff6b3d'; c.shadowBlur = 22;
          c.beginPath(); c.arc(0, 0, q.r, 0, TAU); c.fill();
          c.fillStyle = '#ffe066'; c.beginPath(); c.arc(-2, -2, q.r * 0.45, 0, TAU); c.fill();
          break;
        case 'axe':
          c.fillStyle = '#cfd6e6'; c.shadowColor = '#fff';
          c.fillRect(-3, -12, 6, 24);
          c.fillStyle = '#e5e9f2';
          c.beginPath(); c.arc(4, 0, 11, -1.1, 1.1); c.arc(4, 0, 11, 1.1, -1.1, true); c.fill();
          c.beginPath(); c.moveTo(0, -11); c.quadraticCurveTo(16, 0, 0, 11); c.closePath(); c.fill();
          break;
        case 'bolt':
          c.fillStyle = '#e9d5ff'; c.shadowColor = '#c084fc'; c.shadowBlur = 16;
          c.beginPath(); c.arc(0, 0, q.r, 0, TAU); c.fill();
          break;
        case 'boomerang':
          c.strokeStyle = '#f4a259'; c.shadowColor = '#ffd166'; c.lineWidth = 5; c.lineCap = 'round';
          c.beginPath(); c.moveTo(-10, -8); c.lineTo(6, 0); c.lineTo(-10, 8); c.stroke();
          break;
        case 'saw':
          c.fillStyle = '#b8c4d9'; c.shadowColor = '#e2e8f0'; c.shadowBlur = 8;
          c.beginPath();
          for (let i = 0; i < 10; i++) {
            const aa = (i / 10) * TAU, rr = i % 2 ? q.r : q.r * 0.72;
            i ? c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : c.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
          }
          c.closePath(); c.fill();
          c.fillStyle = '#334155'; c.beginPath(); c.arc(0, 0, q.r * 0.28, 0, TAU); c.fill();
          break;
        case 'rocket':
          c.fillStyle = '#ff8fa3'; c.shadowColor = '#ff4d6d';
          c.beginPath(); c.moveTo(9, 0); c.lineTo(-5, -4); c.lineTo(-5, 4); c.closePath(); c.fill();
          c.fillStyle = '#ffd166'; c.beginPath(); c.arc(-7, 0, 3, 0, TAU); c.fill();
          break;
        default:
          c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, q.r, 0, TAU); c.fill();
      }
      c.restore();
    }
  },

  drawEffects(c) {
    // 挥击弧
    for (const a of this.arcs) {
      const k = a.t / a.life;
      c.save(); c.translate(a.x, a.y); c.rotate(a.ang - a.width / 2);
      const grad = c.createLinearGradient(0, 0, a.reach, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(clamp(0.3 + k, 0, 1), a.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = grad; c.lineWidth = a.width * (1 - k) * 0.4 + 4;
      c.beginPath(); c.arc(0, 0, a.reach * (0.75 + k * 0.25), 0, a.width); c.stroke();
      c.restore();
    }
    // 环
    for (const q of this.particles) {
      const k = q.t / q.life;
      if (q.ring) {
        c.strokeStyle = q.color; c.globalAlpha = 1 - k;
        c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, q.r, 0, TAU); c.stroke();
        c.globalAlpha = 1;
      } else {
        c.fillStyle = q.color; c.globalAlpha = 1 - k;
        c.beginPath(); c.arc(q.x, q.y, q.r * (1 - k * 0.4), 0, TAU); c.fill();
        c.globalAlpha = 1;
      }
    }
    // 冲击环
    for (const n of this.novas) {
      const k = n.t / n.life;
      c.strokeStyle = n.c0; c.globalAlpha = 1 - k; c.lineWidth = 6 * (1 - k) + 1;
      c.beginPath(); c.arc(n.x, n.y, n.r * (0.25 + k * 0.85), 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
    // 闪电
    for (const z of this.zaps) {
      const k = z.t / z.life;
      c.strokeStyle = `rgba(255,240,150,${1 - k})`;
      c.lineWidth = z.thin ? 2.5 : 3.5;
      c.shadowColor = '#ffe066'; c.shadowBlur = 16;
      c.beginPath();
      z.pts.forEach((pt, i) => {
        const jx = pt.x + rand(-6, 6), jy = pt.y + rand(-6, 6);
        i ? c.lineTo(jx, jy) : c.moveTo(jx, jy);
      });
      c.stroke(); c.shadowBlur = 0;
    }
  },

  drawTexts(c) {
    c.textAlign = 'center';
    for (const t of this.texts) {
      const k = t.t / t.life;
      c.globalAlpha = 1 - k * k;
      c.font = `bold ${t.size}px "Segoe UI", system-ui`;
      c.fillStyle = '#000'; c.fillText(t.v, t.x + 1.5, t.y + 1.5);
      c.fillStyle = t.color; c.fillText(t.v, t.x, t.y);
      c.globalAlpha = 1;
    }
  },

  drawMinimap(c, W, H) {
    const size = 108, pad = 12;
    const x0 = W - size - pad, y0 = H - size - pad;
    const R = 900; // 显示半径
    c.save();
    c.globalAlpha = 0.85;
    c.fillStyle = 'rgba(10,8,20,.72)';
    c.fillRect(x0, y0, size, size);
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.strokeRect(x0, y0, size, size);
    c.beginPath(); c.rect(x0, y0, size, size); c.clip();
    const cx = x0 + size / 2, cy = y0 + size / 2, k = (size / 2) / R;
    for (const e of this.enemies) {
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      if (Math.hypot(dx, dy) > R) continue;
      c.fillStyle = e.boss ? '#ff4d6d' : e.elite ? '#ffb45c' : 'rgba(255,120,140,.85)';
      const s = e.boss ? 4 : 2;
      c.fillRect(cx + dx * k - s / 2, cy + dy * k - s / 2, s, s);
    }
    for (const ch of this.chests) {
      const dx = ch.x - this.player.x, dy = ch.y - this.player.y;
      if (Math.hypot(dx, dy) > R) continue;
      c.fillStyle = '#ffd166'; c.fillRect(cx + dx * k - 2, cy + dy * k - 2, 4, 4);
    }
    c.fillStyle = '#7ee8fa';
    c.fillRect(cx - 2, cy - 2, 4, 4);
    c.restore();
  },

  drawVignette(c, W, H) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (this.player && this.player.hitFlash > 0 && this.state !== 'menu') {
      c.fillStyle = `rgba(255,60,90,${this.player.hitFlash * 0.5})`;
      c.fillRect(0, 0, W, H);
    }
  },

  updateHUD() {
    if (!this.player) return;
    const p = this.player;
    this.ui.hpFill.style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
    this.ui.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.maxHp)}`;
    this.ui.xpFill.style.transform = `scaleX(${clamp(p.xp / p.xpNeed, 0, 1)})`;
    this.ui.xpText.textContent = `Lv.${p.level}`;
    this.ui.timeText.textContent = fmtTime(this.t);
    this.ui.killText.textContent = p.kills;
    this.ui.goldText.textContent = p.gold;
    const lich = this.enemies.find((e) => e.final);
    const boss = this.enemies.find((e) => e.boss);
    this.ui.warning.classList.toggle('hidden', !(boss || (this.t > RUN_DURATION - 8 && !this.finalSpawned)));
    if (this.t >= RUN_DURATION && this.finalSpawned && !lich) this.ui.warning.classList.add('hidden');
  },
};

/* ---------- 工具：颜色混合 ---------- */
function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mixHex(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(msg) {
  const el = Game.ui.toast;
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- 启动 ---------- */
window.Game = Game;
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => Game.init());
else Game.init();

})();
