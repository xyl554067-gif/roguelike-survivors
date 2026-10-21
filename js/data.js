/* =====================================================================
   夜刃求生 v2 · 数据层
   ===================================================================== */
const TAU = Math.PI * 2;

const CHARACTERS = [
  { id: 'blade', name: '剑士 · 艾伦', ico: '🗡️', hp: 100, spd: 1.00, might: 1.00, area: 1.00, proj: 0, magnet: 1.00, xp: 1.00, armor: 0, rev: 0, regen: 0,
    weapon: 'whip', tag: '均衡', unlock: null,
    desc: '近门入门。<b>鞭影</b>朝面向宽幅挥击，穿透成排敌人。' },
  { id: 'gunner', name: '枪手 · 薇拉', ico: '🔫', hp: 90, spd: 1.02, might: 0.96, area: 1.00, proj: 1, magnet: 1.10, xp: 1.00, armor: 0, rev: 0, regen: 0,
    weapon: 'kunai', tag: '射速', unlock: null,
    desc: '高射速远程。<b>飞刀</b>连发，初始多 1 枚弹体，但身板偏脆。' },
  { id: 'witch', name: '咒师 · 墨铃', ico: '🔮', hp: 82, spd: 0.98, might: 1.05, area: 1.16, proj: 0, magnet: 1.30, xp: 1.18, armor: 0, rev: 0, regen: 0,
    weapon: 'fireball', tag: 'AOE', unlock: null,
    desc: '范围法师。<b>火球</b>爆炸并点燃，作用范围 +16%，经验 +18%。' },
  { id: 'monk', name: '武僧 · 迦南', ico: '🌀', hp: 112, spd: 1.05, might: 1.00, area: 1.00, proj: 0, magnet: 1.00, xp: 1.00, armor: 1, rev: 0, regen: 0.3,
    weapon: 'garlic', tag: '肉盾', unlock: null,
    desc: '贴身缠斗。<b>罡气</b>光环持续击退磨血，自带 1 点护甲与回血。' },
  { id: 'ranger', name: '游侠 · 洛恩', ico: '🏹', hp: 94, spd: 1.04, might: 1.00, area: 1.05, proj: 0, magnet: 1.00, xp: 1.00, armor: 0, rev: 0, regen: 0,
    weapon: 'axe', tag: '暴击', unlock: null,
    desc: '暴击专精。<b>飞斧</b>高抛落地，基础暴击率 25%。' },
  { id: 'necro', name: '亡术 · 瑟莉卡', ico: '💀', hp: 86, spd: 1.00, might: 1.00, area: 1.00, proj: 0, magnet: 1.15, xp: 1.05, armor: 0, rev: 1, regen: 0,
    weapon: 'bolt', tag: '复活', unlock: 'ach_kills_500',
    desc: '自动索敌。<b>灵弹</b>追踪最近敌人，开局自带 1 次复活。' },
  { id: 'warden', name: '守誓者 · 塞恩', ico: '🛡️', hp: 128, spd: 0.95, might: 0.95, area: 1.05, proj: 0, magnet: 1.00, xp: 1.00, armor: 2, rev: 0, regen: 0.1,
    weapon: 'bible', tag: '防御', unlock: 'ach_survive_10',
    desc: '铁壁。<b>圣典</b>绕身旋转，开局 2 点护甲，血量最高。' },
  { id: 'alchemist', name: '炼金 · 芙蕾雅', ico: '⚗️', hp: 88, spd: 1.02, might: 0.98, area: 1.10, magnet: 1.35, xp: 1.08, armor: 0, rev: 0.1,
    weapon: 'poison', tag: '持续', unlock: 'ach_gold_3000',
    desc: '毒云大师。<b>毒瓶</b>砸出持续毒池，拾取半径 +18%。' },
  { id: 'blademaster', name: '剑圣 · 无名', ico: '⚔️', hp: 96, spd: 1.06, might: 1.08, area: 1.00, proj: 0, magnet: 1.10, xp: 1.00, armor: 1, rev: 0, regen: 0,
    weapon: 'spear', tag: '贯穿', unlock: 'ach_win',
    desc: '化身利刃。<b>光矛</b>直线贯穿，伤害与移速俱佳。' },
  { id: 'fatty', name: '大肥鱼', ico: '🐟', hp: 140, spd: 0.90, might: 0.80, area: 1.20, magnet: 1.50, xp: 1.20, armor: 0, regen: 0.2,
    desc: '胖 fisherman。体型巨大，移动速度慢，但拥有极高的生命值和拾取半径。解锁条件：击杀 1000 条鱼。' },
];

/* ============================ 难度 ============================ */
const DIFFICULTIES = [
  { id: 'easy', name: '易度', hp: 0.80, dmg: 0.85, spd: 0.95, xp: 0.95, gold: 0.90, spawn: 0.85 },
  { id: 'normal', name: '标准', hp: 1.00, dmg: 1.00, spd: 1.00, xp: 1.00, gold: 1.00, spawn: 1.00 },
  { id: 'hard', name: '硬核', hp: 1.35, dmg: 1.25, spd: 1.08, xp: 1.15, gold: 1.20, spawn: 1.15 },
  { id: 'nightmare', name: '噩梦', hp: 1.80, dmg: 1.55, spd: 1.15, xp: 1.30, gold: 1.45, spawn: 1.35 },
];

/* ============================ 武器 ============================ */
const WEAPONS = {
  whip: { name: '鞭影', ico: '🗡️', max: 8, kind: '近战', color: '#ffe9b8',
    desc: '朝面向挥出宽幅鞭击，穿透所有命中敌人。',
    evolutionOf: 'whip', next: [], init: () => ({ t: 0, iv: 1.05, dmg: 14, w: 1, vol: 2, knock: 18 }),
    level: (s, lv) => { if (lv === 2) s.dmg += 4; else if (lv === 3) { s.back = true; s.vol = 3; } else if (lv === 4) s.dmg += 4; else if (lv === 5) s.w *= 1.2; else if (lv === 6) s.vol = 4; else if (lv === 7) s.dmg += 6; else if (lv === 8) { s.knock += 30; s.critBonus += 0.1; } },
    fire(g, p, s) {
      const target = G.nearestEnemy(p, 220);
      let baseAng = p.aimAng;
      if (target) baseAng = Math.atan2(target.y - p.y, target.x - p.x);
      else if (p.aimX >= 0) baseAng = 0;
      else baseAng = Math.PI;
      const vol = s.vol;
      for (let i = 0; i < vol; i++) {
        const spread = vol > 1 ? (i - (vol - 1) / 2) * 0.62 : 0;
        g.meleeArc(p, baseAng + spread, 150 * s.w * p.stat.area, s.dmg * p.stat.might,
          { src: 'whip', kb: s.knock, critChance: 0.05 + s.critBonus, arc: 2.0 * s.w, color: s.color });
        if (s.back) {
          g.meleeArc(p, baseAng + Math.PI, 150 * s.w * p.stat.area, s.dmg * p.stat.might * 0.8,
            { src: 'whip', kb: s.knock, critChance: 0.05 + s.critBonus, arc: 1.6, color: s.color });
        }
      }
      g.sfx('swing');
    },
  },
  gun: {
    name: '飞刀', ico: '🔪', max: 8, kind: '投射', color: '#dfe6ff',
    desc: '朝移动方向高速投掷飞刀，射速极快。',
    evolutionOf: 'kunai', next: [], init: () => ({ t: 0, iv: 0.34, dmg: 26, count: 12 }),
    level: () => {},
    fire(g, p, s) {
      const n = s.count + Math.floor(p.stat.proj);
      for (let i = 0; i < n; i++) {
        const a = p.aimAng + (i - (n - 1) / 2) * 0.13 + g.rand(-0.22, 0.22);
        g.shoot(p, { ang: a, spd: s.spd * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: s.pierce + p.stat.pierce,
          life: s.life * p.stat.duration, r: 6, src: 'kunai', kind: 'kunai', kb: 12, critChance: 0.05 + p.stat.crit });
      }
      sb.DSAudio.play('shoot');
    },
  },
  fireball: {
    name: '火球', ico: '🔥', max: 8, kind: '投射', color: '#ff9e4f',
    desc: '飞向敌人，命中后爆炸并点燃周围敌人。',
    evolutionOf: 'fireball', next: [], init: () => ({ t: 0, iv: 1.5, dmg: 70, count: 3, radius: 130 }),
    level: () => {},
    fire(g, p, s) {
      const t = G.nearestEnemy(p, 760);
      const x = t ? t.x : p.x + g.rand(-320, 320);
      const y = t ? t.y : p.y + g.rand(-240, 240);
      g.spawnDelayed(x, y, 0.7, s.dmg * p.stat.might, s.radius * p.stat.area, 'meteor', 0, 'meteor');
      g.fx.marker(x, y);
    },
  },
  // ... 其他武器保持不变
};