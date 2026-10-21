/* =====================================================================
   夜刃求生 v2 · 数据层
   角色 / 武器 / 进化 / 被动 / 敌人 / 首领 / 道具 / 成就 / 商店
   ===================================================================== */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;

  /* ============================ 角色 ============================ */
  const CHARACTERS = [
    { id: 'blade', name: '剑士 · 艾伦', ico: '🗡️', hp: 100, spd: 1.00, might: 1.00, area: 1.00, proj: 0, magnet: 1.00, xp: 1.00, armor: 0, rev: 0, regen: 0,
      weapon: 'whip', tag: '均衡', unlock: null,
      desc: '近战入门。<b>鞭影</b>朝面向宽幅挥击，穿透成排敌人。' },
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
    { id: 'warden', name: '守誓者 · 塞恩', ico: '🛡️', hp: 128, spd: 0.95, might: 0.95, area: 1.05, proj: 0, magnet: 1.00, xp: 1.00, armor: 2, rev: 0, regen: 0.15,
      weapon: 'bible', tag: '防御', unlock: 'ach_survive_10',
      desc: '铁壁。<b>圣典</b>绕身旋转，开局 2 点护甲，血量最高。' },
    { id: 'alchemist', name: '炼金 · 芙蕾雅', ico: '⚗️', hp: 88, spd: 1.02, might: 0.98, area: 1.10, proj: 0, magnet: 1.35, xp: 1.08, armor: 0, rev: 0, regen: 0.1,
      weapon: 'poison', tag: '持续', unlock: 'ach_gold_3000',
      desc: '毒云大师。<b>毒瓶</b>砸出持续毒池，拾取半径 +35%。' },
    { id: 'blademaster', name: '剑圣 · 无名', ico: '⚔️', hp: 96, spd: 1.06, might: 1.08, area: 1.00, proj: 0, magnet: 1.10, xp: 1.00, armor: 1, rev: 0, regen: 0,
      weapon: 'spear', tag: '贯穿', unlock: 'ach_win',
      desc: '化身利刃。<b>光矛</b>直线贯穿，伤害与移速俱佳。' },
  ];

  /* ============================ 难度 ============================ */
  const DIFFICULTIES = [
    { id: 'easy', name: '休闲', hp: 0.80, dmg: 0.85, spd: 0.95, xp: 0.95, gold: 0.90, spawn: 0.85, tag: '怪更少更软，适合练手感' },
    { id: 'normal', name: '标准', hp: 1.00, dmg: 1.00, spd: 1.00, xp: 1.00, gold: 1.00, spawn: 1.00, tag: '推荐的平衡曲线' },
    { id: 'hard', name: '硬核', hp: 1.35, dmg: 1.25, spd: 1.08, xp: 1.15, gold: 1.20, spawn: 1.15, tag: '怪硬且凶，收益更高' },
    { id: 'nightmare', name: '噩梦', hp: 1.80, dmg: 1.55, spd: 1.15, xp: 1.30, gold: 1.45, spawn: 1.35, tag: '刀尖跳舞，极限割草' },
  ];

  /* ============================ 武器 ============================ */
  /* fire(g,p,s) / update(g,p,s,dt)，g 为 Game 实例 */
  const WEAPONS = {
    /* ---------- 鞭影 ---------- */
    whip: {
      name: '鞭影', ico: '🗡️', max: 8, kind: '近战', color: '#ffe9b8',
      desc: '朝面向挥出宽幅鞭击，穿透所有命中敌人。',
      next: ['伤害 +4', '背后也挥一鞭', '伤害 +4', '挥击宽度 +20%', '第三段挥击', '伤害 +6', '击退增强，暴击 +10%'],
      init: () => ({ t: 0, iv: 1.05, dmg: 14, back: false, w: 1, vol: 2, knock: 18, critBonus: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.dmg += 4; else if (lv === 3) { s.back = true; s.vol = 3; }
        else if (lv === 4) s.dmg += 4; else if (lv === 5) s.w *= 1.2;
        else if (lv === 6) s.vol = 4; else if (lv === 7) s.dmg += 6;
        else if (lv === 8) { s.knock += 30; s.critBonus += 0.1; }
        s.iv *= 0.94;
      },
      fire(g, p, s) {
        // 朝向：优先最近敌人；没有则朝移动方向
        const target = g.nearestEnemy(p, 400);
        let baseAng = p.aimAng;
        if (target) baseAng = Math.atan2(target.y - p.y, target.x - p.x);
        else if (p.aimX >= 0) baseAng = 0;
        else baseAng = Math.PI;

        const vol = s.vol;
        const reach = 150 * s.w * p.stat.area;
        for (let i = 0; i < vol; i++) {
          const spread = vol > 1 ? (i - (vol - 1) / 2) * 0.62 : 0;
          g.meleeArc(p, baseAng + spread, reach, s.dmg * p.stat.might,
            { src: 'whip', kb: s.knock, critChance: 0.05 + s.critBonus, arc: 2.0 * s.w, color: s.color });
        }
        // 背后补一鞭（3 级起）
        if (s.back) {
          g.meleeArc(p, baseAng + Math.PI, reach * 0.85, s.dmg * p.stat.might * 0.8,
            { src: 'whip', kb: s.knock, critChance: 0.05 + s.critBonus, arc: 1.6, color: s.color });
        }
        g.sfx('swing');
      },
    },

    /* ---------- 飞刀 ---------- */
    kunai: {
      name: '飞刀', ico: '🔪', max: 8, kind: '投射', color: '#dfe6ff',
      desc: '朝移动方向高速投掷飞刀，射速极快。',
      next: ['弹数 +1', '伤害 +3', '弹数 +1', '穿透 +1', '伤害 +3', '弹速 +25%，射程 +30%', '弹数 +1，伤害 +3'],
      init: () => ({ t: 0, iv: 0.52, dmg: 9, count: 1, pierce: 1, spd: 620, life: 1.1, spread: 0.12 }),
      level: (s, lv) => {
        if (lv === 2) s.count++; else if (lv === 3) s.dmg += 3;
        else if (lv === 4) s.count++; else if (lv === 5) { s.dmg += 3; s.pierce++; }
        else if (lv === 6) s.dmg += 3; else if (lv === 7) { s.spd *= 1.25; s.life *= 1.3; }
        else if (lv === 8) { s.count++; s.dmg += 3; }
        s.iv *= 0.93;
      },
      fire(g, p, s) {
        const n = s.count + Math.floor(p.stat.proj);
        for (let i = 0; i < n; i++) {
          const a = p.aimAng + (i - (n - 1) / 2) * 0.13 + g.rand(-s.spread, s.spread);
          g.shoot(p, { ang: a, spd: s.spd * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: s.pierce + p.stat.pierce,
            life: s.life * p.stat.duration, r: 6, src: 'kunai', kind: 'kunai', kb: 12, critChance: 0.05 + p.stat.crit });
        }
        g.sfx('shoot');
      },
    },

    /* ---------- 火球 ---------- */
    fireball: {
      name: '火球', ico: '🔥', max: 8, kind: '投射', color: '#ff9e4f',
      desc: '飞向敌人，命中后爆炸并点燃周围敌人。',
      next: ['爆炸半径 +25%', '伤害 +6', '弹数 +1', '灼烧 +3/秒', '弹数 +1', '爆炸半径 +30%', '伤害 +8，附加眩晕'],
      init: () => ({ t: 0, iv: 2.0, dmg: 20, count: 1, radius: 62, burn: 4, burnDur: 3, stun: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.radius *= 1.25; else if (lv === 3) s.dmg += 6;
        else if (lv === 4) s.count++; else if (lv === 5) s.burn += 3;
        else if (lv === 6) s.count++; else if (lv === 7) s.radius *= 1.3;
        else if (lv === 8) { s.dmg += 8; s.stun = 0.7; }
        s.iv *= 0.91;
      },
      fire(g, p, s) {
        for (let i = 0; i < s.count + Math.floor(p.stat.proj / 2); i++) {
          const t = g.nearestEnemy(p, 760);
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) + g.rand(-0.22, 0.22) : p.aimAng + g.rand(-0.5, 0.5);
          g.shoot(p, { ang: a, spd: 270 * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: 0,
            life: 2.2 * p.stat.duration, r: 12, src: 'fireball', kind: 'fireball', kb: 30,
            explode: s.radius * p.stat.area, burn: s.burn * p.stat.might, burnDur: s.burnDur, stun: s.stun });
        }
        g.sfx('cast');
      },
    },

    /* ---------- 罡气 ---------- */
    garlic: {
      name: '罡气', ico: '🌀', max: 8, kind: '光环', color: '#78ffbe',
      desc: '周身罡气：持续伤害并推开靠近的敌人。',
      next: ['半径 +15%', '伤害 +2', '半径 +15%', '击退增强', '双层反环', '伤害 +3', '半径 +20%，回血 +0.2/s'],
      init: () => ({ t: 0, iv: 0.45, dmg: 5, radius: 92, knock: 30, heal: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.radius *= 1.15; else if (lv === 3) s.dmg += 2;
        else if (lv === 4) { s.radius *= 1.15; s.dmg += 2; } else if (lv === 5) s.knock += 24;
        else if (lv === 6) { s.dmg += 3; s.iv *= 0.85; } else if (lv === 7) s.dmg += 3;
        else if (lv === 8) { s.radius *= 1.2; s.heal = 0.25; }
      },
      update(g, p, s, dt) {
        s.t += dt;
        if (s.heal) p.hp = Math.min(p.maxHp, p.hp + s.heal * dt);
        if (s.t < s.iv) return;
        s.t = 0;
        const R = s.radius * p.stat.area;
        let hit = 0;
        for (const e of g.enemies) {
          if (e.dead) continue;
          if (g.dist2(e.x, e.y, p.x, p.y) > (R + e.r) ** 2) continue;
          g.damageEnemy(p, e, s.dmg * p.stat.might, { src: 'garlic', kb: s.knock * (e.boss ? 0.06 : 1), quiet: true });
          hit++;
        }
        g.fx.ring(p.x, p.y, R, 'rgba(120,255,190,0.22)');
        if (hit) g.sfx('aura');
      },
    },

    /* ---------- 飞斧 ---------- */
    axe: {
      name: '飞斧', ico: '🪓', max: 8, kind: '投射', color: '#cfd6e6',
      desc: '高抛重斧，落地造成巨额伤害与暴击。',
      next: ['伤害 +8', '斧数 +1', '暴击 +15%', '伤害 +10', '斧数 +1', '穿透 +2', '落点爆炸'],
      init: () => ({ t: 0, iv: 1.9, dmg: 26, count: 1, pierce: 2, crit: 0.25, boom: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.dmg += 8; else if (lv === 3) s.count++;
        else if (lv === 4) s.crit += 0.15; else if (lv === 5) s.dmg += 10;
        else if (lv === 6) s.count++; else if (lv === 7) s.pierce += 2;
        else if (lv === 8) { s.dmg += 10; s.boom = 52; }
        s.iv *= 0.93;
      },
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.shoot(p, { ang: p.aimAng + g.rand(-0.55, 0.55) - 0.25, spd: g.rand(320, 430), arc: true,
            dmg: s.dmg * p.stat.might, pierce: s.pierce + p.stat.pierce, life: 2.4, r: 15, src: 'axe', kind: 'axe',
            kb: 55, critChance: s.crit + p.stat.crit, spin: true, explode: s.boom * p.stat.area });
        }
        g.sfx('heavy');
      },
    },

    /* ---------- 灵弹 ---------- */
    bolt: {
      name: '灵弹', ico: '✨', max: 8, kind: '投射', color: '#e9d5ff',
      desc: '自动锁定最近敌人，发射追踪灵弹。',
      next: ['弹数 +1', '伤害 +4', '弹数 +1', '追踪更强', '伤害 +4', '弹数 +1', '命中分裂'],
      init: () => ({ t: 0, iv: 0.86, dmg: 12, count: 1, homing: 2.2, split: false }),
      level: (s, lv) => {
        if (lv === 2) s.count++; else if (lv === 3) s.dmg += 4;
        else if (lv === 4) s.count++; else if (lv === 5) s.homing += 2;
        else if (lv === 6) s.dmg += 4; else if (lv === 7) s.count++;
        else if (lv === 8) s.split = true;
        s.iv *= 0.92;
      },
      fire(g, p, s) {
        const n = s.count + Math.floor(p.stat.proj);
        const list = g.nearestEnemies(p, 800, n);
        for (let i = 0; i < n; i++) {
          const t = list[i % Math.max(1, list.length)];
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.aimAng + g.rand(-1, 1);
          g.shoot(p, { ang: a, spd: 430 * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: 1,
            life: 2.4 * p.stat.duration, r: 8, src: 'bolt', kind: 'bolt', kb: 16, homing: s.homing, split: s.split ? 2 : 0 });
        }
        g.sfx('cast');
      },
    },

    /* ---------- 雷链 ---------- */
    chain: {
      name: '雷链', ico: '⚡', max: 8, kind: '瞬发', color: '#ffe066',
      desc: '降雷劈击附近敌人，电弧向邻近目标连锁。',
      next: ['连锁 +2 段', '伤害 +6', '目标 +1', '连锁 +2 段', '伤害 +8', '麻痹 0.5s', '落雷 +2，伤害 +8'],
      init: () => ({ t: 0, iv: 2.4, dmg: 16, targets: 2, jumps: 3, stun: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.jumps += 2; else if (lv === 3) s.dmg += 6;
        else if (lv === 4) s.targets++; else if (lv === 5) s.jumps += 2;
        else if (lv === 6) s.dmg += 6; else if (lv === 7) { s.dmg += 6; s.stun = 0.5; }
        else if (lv === 8) { s.targets += 2; s.dmg += 8; }
        s.iv *= 0.92;
      },
      fire(g, p, s) {
        const firsts = g.nearestEnemies(p, 430 * p.stat.area, s.targets);
        if (!firsts.length) return;
        const dmg = s.dmg * p.stat.might;
        for (const f of firsts) {
          const hit = new Set();
          let cur = f;
          const pts = [{ x: p.x, y: p.y }];
          for (let j = 0; j <= s.jumps && cur; j++) {
            hit.add(cur);
            pts.push({ x: cur.x, y: cur.y });
            g.damageEnemy(p, cur, dmg * (1 - j * 0.07), { src: 'chain', kb: 8, quiet: true, stun: s.stun });
            g.fx.spark(cur.x, cur.y);
            let best = null, bd = 200 * 200;
            for (const e of g.enemies) {
              if (e.dead || hit.has(e)) continue;
              const d = g.dist2(e.x, e.y, cur.x, cur.y);
              if (d < bd) { bd = d; best = e; }
            }
            cur = best;
          }
          g.fx.lightning(pts);
          g.fx.bolt(p.x + g.rand(-170, 170), p.y + g.rand(-140, 140));
        }
        g.sfx('thunder');
      },
    },

    /* ---------- 回旋镖 ---------- */
    boomerang: {
      name: '回旋镖', ico: '🪃', max: 8, kind: '投射', color: '#f4a259',
      desc: '飞出后折返，去程与回程都能命中。',
      next: ['弹数 +1', '伤害 +6', '回程伤害翻倍', '伤害 +6', '弹数 +1', '射程 +40%', '伤害 +8，永不落地'],
      init: () => ({ t: 0, iv: 1.7, dmg: 18, count: 1, reach: 260, backDmg: 1, pierceAll: false }),
      level: (s, lv) => {
        if (lv === 2) s.count++; else if (lv === 3) s.dmg += 6;
        else if (lv === 4) s.backDmg = 2; else if (lv === 5) s.dmg += 6;
        else if (lv === 6) s.count++; else if (lv === 7) s.reach *= 1.4;
        else if (lv === 8) { s.dmg += 8; s.pierceAll = true; }
        s.iv *= 0.93;
      },
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.shoot(p, { ang: p.aimAng + (i - (s.count - 1) / 2) * 0.5 + g.rand(-0.2, 0.2),
            spd: 400 * p.stat.projspeed, dmg: s.dmg * p.stat.might, pierce: s.pierceAll ? 999 : 12,
            life: 2.8 * p.stat.duration, r: 12, src: 'boomerang', kind: 'boomerang', kb: 30,
            boomerang: true, reach: s.reach * p.stat.area, backDmg: s.backDmg });
        }
        g.sfx('swing');
      },
    },

    /* ---------- 圣典 ---------- */
    bible: {
      name: '圣典', ico: '📖', max: 8, kind: '环绕', color: '#fff0c8',
      desc: '圣典绕身旋转，撞到的敌人受伤并被灼烧。',
      next: ['环绕数 +1', '伤害 +3', '半径 +25%', '环绕数 +1', '伤害 +3', '转速 +35%', '环绕数 +1，附加灼烧'],
      init: () => ({ t: 0, iv: 99, dmg: 11, count: 2, radius: 108, spin: 1.6, burn: 0, tick: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.count++; else if (lv === 3) s.dmg += 3;
        else if (lv === 4) s.radius *= 1.25; else if (lv === 5) s.count++;
        else if (lv === 6) s.dmg += 3; else if (lv === 7) s.spin *= 1.35;
        else if (lv === 8) { s.count++; s.burn = 5; }
      },
      update(g, p, s, dt) {
        s.t += dt;
        const base = s.t * s.spin;
        const R = s.radius * p.stat.area;
        for (let i = 0; i < s.count; i++) {
          const a = base + (i / s.count) * TAU;
          g.fx.orbit(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, a);
        }
        s.tick += dt;
        if (s.tick < 0.12) return;
        s.tick = 0;
        for (let i = 0; i < s.count; i++) {
          const a = base + (i / s.count) * TAU;
          const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
          for (const e of g.enemies) {
            if (e.dead) continue;
            if (g.dist2(e.x, e.y, ox, oy) < (e.r + 17) ** 2) {
              g.damageEnemy(p, e, s.dmg * p.stat.might, { src: 'bible', kb: 22, quiet: true, burn: s.burn, burnDur: 2.5 });
            }
          }
        }
      },
    },

    /* ---------- 冰爆 ---------- */
    frost: {
      name: '冰爆', ico: '❄️', max: 8, kind: '瞬发', color: '#8cdcff',
      desc: '冻结半径内敌人；对已冻结目标造成双倍伤害。',
      next: ['半径 +20%', '伤害 +5', '冻结 +0.4s', '碎冰伤害 +30%', '伤害 +5', '残留减速领域', '半径 +30%，伤害 +6'],
      init: () => ({ t: 0, iv: 4.2, dmg: 14, radius: 210, freeze: 0.8, shatter: 1, slowAura: false }),
      level: (s, lv) => {
        if (lv === 2) s.radius *= 1.2; else if (lv === 3) s.dmg += 5;
        else if (lv === 4) s.freeze += 0.4; else if (lv === 5) s.shatter += 0.3;
        else if (lv === 6) s.dmg += 5; else if (lv === 7) s.slowAura = true;
        else if (lv === 8) { s.radius *= 1.3; s.dmg += 6; }
        s.iv *= 0.91;
      },
      fire(g, p, s) {
        const R = s.radius * p.stat.area;
        const dmg = s.dmg * p.stat.might;
        let any = false;
        for (const e of g.enemies) {
          if (e.dead) continue;
          if (g.dist2(e.x, e.y, p.x, p.y) > (R + e.r) ** 2) continue;
          const frozen = e.frozen > 0;
          g.damageEnemy(p, e, dmg * (frozen ? 1 + s.shatter : 1), { src: 'frost', quiet: true });
          e.frozen = Math.max(e.frozen, s.freeze);
          any = true;
        }
        g.fx.nova(p.x, p.y, R, 'rgba(140,220,255,0.35)');
        if (s.slowAura) for (const e of g.enemies) if (!e.dead) e.slowed = Math.max(e.slowed, 1.6);
        if (any) g.sfx('ice');
      },
    },

    /* ---------- 炮轰 ---------- */
    cannon: {
      name: '炮轰', ico: '💣', max: 8, kind: '延时', color: '#ffb45c',
      desc: '在敌人脚下标记，半秒后炮弹落下范围爆炸。',
      next: ['落点 +1', '半径 +30%', '伤害 +10', '落点 +1', '眩晕 0.6s', '伤害 +10', '落点 +1，半径 +25%'],
      init: () => ({ t: 0, iv: 3.0, dmg: 30, bombs: 2, radius: 78, stun: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.bombs++; else if (lv === 3) s.radius *= 1.3;
        else if (lv === 4) s.dmg += 10; else if (lv === 5) s.bombs++;
        else if (lv === 6) { s.dmg += 10; s.stun = 0.6; } else if (lv === 7) s.dmg += 10;
        else if (lv === 8) { s.bombs++; s.radius *= 1.25; }
        s.iv *= 0.91;
      },
      fire(g, p, s) {
        for (let i = 0; i < s.bombs; i++) {
          const t = g.random() < 0.75 ? g.nearestEnemy(p, 620) : null;
          const x = t ? t.x : p.x + g.rand(-300, 300);
          const y = t ? t.y : p.y + g.rand(-240, 240);
          g.spawnDelayed(x, y, 0.55, s.dmg * p.stat.might, s.radius * p.stat.area, 'cannon', s.stun);
          g.fx.marker(x, y);
        }
        g.sfx('heavy');
      },
    },

    /* ---------- 锯齿轮 ---------- */
    saw: {
      name: '锯齿轮', ico: '⚙️', max: 8, kind: '投射', color: '#b8c4d9',
      desc: '地面滚动的锯轮，无限穿透并不断加速。',
      next: ['轮数 +1', '伤害 +4', '体积 +25%', '轮数 +1', '伤害 +6', '命中反弹', '体积 +30%，伤害 +6'],
      init: () => ({ t: 0, iv: 2.2, dmg: 16, count: 1, r: 18, bounce: false }),
      level: (s, lv) => {
        if (lv === 2) s.count++; else if (lv === 3) s.dmg += 4;
        else if (lv === 4) s.r *= 1.25; else if (lv === 5) s.count++;
        else if (lv === 6) s.dmg += 6; else if (lv === 7) s.bounce = true;
        else if (lv === 8) { s.r *= 1.3; s.dmg += 6; }
        s.iv *= 0.9;
      },
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.shoot(p, { ang: g.rand(0, TAU), spd: 230, dmg: s.dmg * p.stat.might, pierce: 999,
            life: 4.4 * p.stat.duration, r: s.r * p.stat.area, src: 'saw', kind: 'saw', kb: 26,
            spin: true, accel: 70, bounce: s.bounce });
        }
        g.sfx('saw');
      },
    },

    /* ---------- 追踪弹 ---------- */
    rocket: {
      name: '追踪弹', ico: '🚀', max: 8, kind: '投射', color: '#ff8fa3',
      desc: '齐发射出追踪火箭，命中后小范围爆炸。',
      next: ['弹数 +1', '爆炸半径 +25%', '伤害 +6', '弹数 +1', '伤害 +6', '命中分裂 2 枚', '弹数 +1，伤害 +8'],
      init: () => ({ t: 0, iv: 2.6, dmg: 22, count: 3, radius: 48, split: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.count++; else if (lv === 3) s.radius *= 1.25;
        else if (lv === 4) s.dmg += 6; else if (lv === 5) s.count++;
        else if (lv === 6) s.dmg += 6; else if (lv === 7) s.split = 2;
        else if (lv === 8) { s.count++; s.dmg += 8; }
        s.iv *= 0.92;
      },
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const t = g.nearestEnemies(p, 820, i + 1).pop() || null;
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.rand(0, TAU);
          g.shoot(p, { ang: a + g.rand(-0.3, 0.3), spd: 340, dmg: s.dmg * p.stat.might, pierce: 0,
            life: 3, r: 9, src: 'rocket', kind: 'rocket', kb: 22, homing: 3.4,
            explode: s.radius * p.stat.area, split: s.split });
        }
        g.sfx('shoot');
      },
    },

    /* ---------- 毒瓶 ---------- */
    poison: {
      name: '毒瓶', ico: '⚗️', max: 8, kind: '区域', color: '#a3e635',
      desc: '砸出毒池，站在其中的敌人持续中毒。',
      next: ['毒池半径 +20%', '毒伤 +4/s', '弹数 +1', '毒池持续 +1.5s', '毒伤 +5/s', '弹数 +1', '毒池减速敌人'],
      init: () => ({ t: 0, iv: 2.3, dmg: 8, count: 1, radius: 78, life: 3.5, slow: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.radius *= 1.2; else if (lv === 3) s.dmg += 4;
        else if (lv === 4) s.count++; else if (lv === 5) s.life += 1.5;
        else if (lv === 6) s.dmg += 5; else if (lv === 7) s.count++;
        else if (lv === 8) s.slow = 0.6;
        s.iv *= 0.92;
      },
      fire(g, p, s) {
        for (let i = 0; i < s.count + Math.floor(p.stat.proj / 2); i++) {
          const t = g.nearestEnemy(p, 640);
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) + g.rand(-0.3, 0.3) : p.aimAng + g.rand(-0.6, 0.6);
          g.shoot(p, { ang: a, spd: 300, dmg: 0, pierce: 0, life: 0.9, r: 10, src: 'poison', kind: 'potion',
            zone: { radius: s.radius * p.stat.area, dps: s.dmg * p.stat.might, life: s.life * p.stat.duration, slow: s.slow } });
        }
        g.sfx('throw');
      },
    },

    /* ---------- 光矛 ---------- */
    spear: {
      name: '光矛', ico: '🔱', max: 8, kind: '瞬发', color: '#9ef0ff',
      desc: '向面向射出贯穿光束，穿透一条直线上的所有敌人。',
      next: ['伤害 +10', '光束宽度 +30%', '伤害 +12', '长度 +25%', '暴击 +12%', '伤害 +14', '额外发射反向光束'],
      init: () => ({ t: 0, iv: 1.5, dmg: 30, width: 26, len: 560, crit: 0.1, back: false }),
      level: (s, lv) => {
        if (lv === 2) s.dmg += 10; else if (lv === 3) s.width *= 1.3;
        else if (lv === 4) s.dmg += 12; else if (lv === 5) s.len *= 1.25;
        else if (lv === 6) s.crit += 0.12; else if (lv === 7) s.dmg += 14;
        else if (lv === 8) s.back = true;
        s.iv *= 0.94;
      },
      fire(g, p, s) {
        const dirs = [p.aimAng];
        if (s.back) dirs.push(p.aimAng + Math.PI);
        for (const a of dirs) {
          g.beam(p, a, s.len * p.stat.area, s.width * p.stat.area, s.dmg * p.stat.might,
            { src: 'spear', critChance: s.crit + p.stat.crit, kb: 24, color: s.color });
        }
        g.sfx('beam');
      },
    },

    /* ---------- 骨刺 ---------- */
    spike: {
      name: '骨刺', ico: '🦴', max: 8, kind: '瞬发', color: '#e5e0cf',
      desc: '从地面刺出尖刺，把范围内的敌人顶起并重创。',
      next: ['刺数 +2', '伤害 +8', '范围 +20%', '刺数 +2', '眩晕 0.5s', '伤害 +10', '范围 +25%，刺数 +2'],
      init: () => ({ t: 0, iv: 2.5, dmg: 26, count: 3, radius: 66, stun: 0 }),
      level: (s, lv) => {
        if (lv === 2) s.count += 2; else if (lv === 3) s.dmg += 8;
        else if (lv === 4) s.radius *= 1.2; else if (lv === 5) s.count += 2;
        else if (lv === 6) s.stun = 0.5; else if (lv === 7) s.dmg += 10;
        else if (lv === 8) { s.radius *= 1.25; s.count += 2; }
        s.iv *= 0.92;
      },
      fire(g, p, s) {
        const targets = g.nearestEnemies(p, 520, s.count);
        for (let i = 0; i < s.count; i++) {
          const t = targets[i];
          const x = t ? t.x : p.x + g.rand(-260, 260);
          const y = t ? t.y : p.y + g.rand(-200, 200);
          g.spawnDelayed(x, y, 0.28, s.dmg * p.stat.might, s.radius * p.stat.area, 'spike', s.stun, 'spike');
        }
        g.sfx('spike');
      },
    },

    /* ===================== 进化武器 ===================== */
    bloodwhip: {
      name: '血月鞭', ico: '🩸', max: 8, kind: '进化', color: '#ff5d7a', evolved: true,
      desc: '【进化】鞭影 + 力量满级。巨大血色鞭影，命中回复生命。',
      evolutionOf: 'whip', next: [], init: () => ({ t: 0, iv: 0.78, dmg: 44, w: 1.6, vol: 4, knock: 40 }),
      level: () => {},
      fire(g, p, s) {
        const dir = p.aimX >= 0 ? 1 : -1;
        let healed = 0;
        for (let i = 0; i < s.vol; i++) {
          const back = i % 2 === 1;
          const ang = (back ? Math.PI : 0) * (dir > 0 ? 1 : -1) + i * 0.3 * dir;
          healed += g.meleeArc(p, ang, 130 * s.w * p.stat.area, s.dmg * p.stat.might,
            { src: 'bloodwhip', kb: s.knock, critChance: 0.2 + p.stat.crit, arc: 1.0, color: s.color, heal: 0.6 });
        }
        if (healed > 0) p.hp = Math.min(p.maxHp, p.hp + Math.min(6, healed * 0.6));
        g.sfx('swing');
      },
    },
    thousandblades: {
      name: '千刃风暴', ico: '🌪️', max: 8, kind: '进化', color: '#cfe3ff', evolved: true,
      desc: '【进化】飞刀 + 增幅满级。每次向四周倾泻 12 把利刃。',
      evolutionOf: 'kunai', next: [], init: () => ({ t: 0, iv: 0.34, dmg: 26, count: 12 }),
      level: () => {},
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = (i / s.count) * TAU + p.aimAng;
          g.shoot(p, { ang: a, spd: 660, dmg: s.dmg * p.stat.might, pierce: 3, life: 1.2, r: 6,
            src: 'thousandblades', kind: 'kunai', kb: 14, critChance: 0.15 + p.stat.crit });
        }
        g.sfx('shoot');
      },
    },
    meteor: {
      name: '陨星', ico: '☄️', max: 8, kind: '进化', color: '#ff7043', evolved: true,
      desc: '【进化】火球 + 疆域满级。天降陨石，大范围爆炸并留下火海。',
      evolutionOf: 'fireball', next: [], init: () => ({ t: 0, iv: 1.5, dmg: 70, count: 3, radius: 130 }),
      level: () => {},
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const t = g.nearestEnemies(p, 760, i + 1).pop();
          const x = t ? t.x : p.x + g.rand(-320, 320);
          const y = t ? t.y : p.y + g.rand(-240, 240);
          g.spawnDelayed(x, y, 0.7, s.dmg * p.stat.might, s.radius * p.stat.area, 'meteor', 0, 'meteor');
          g.fx.marker(x, y);
        }
        g.sfx('thunder');
      },
    },
    sanctuary: {
      name: '圣域', ico: '⛩️', max: 8, kind: '进化', color: '#ffe066', evolved: true,
      desc: '【进化】罡气 + 铁甲满级。巨型圣域持续灼烧并快速回复生命。',
      evolutionOf: 'garlic', next: [], init: () => ({ t: 0, iv: 0.3, dmg: 24, radius: 190 }),
      level: () => {},
      update(g, p, s, dt) {
        s.t += dt;
        p.hp = Math.min(p.maxHp, p.hp + 1.6 * dt);
        if (s.t < s.iv) return;
        s.t = 0;
        const R = s.radius * p.stat.area;
        for (const e of g.enemies) {
          if (e.dead) continue;
          if (g.dist2(e.x, e.y, p.x, p.y) > (R + e.r) ** 2) continue;
          g.damageEnemy(p, e, s.dmg * p.stat.might, { src: 'sanctuary', kb: 46 * (e.boss ? 0.06 : 1), quiet: true, burn: 8, burnDur: 2 });
        }
        g.fx.ring(p.x, p.y, R, 'rgba(255,224,102,0.26)');
      },
    },
    guillotine: {
      name: '断头台', ico: '⚔️', max: 8, kind: '进化', color: '#ff8fa3', evolved: true,
      desc: '【进化】飞斧 + 致命满级。必定暴击的巨斧，落地引发血爆。',
      evolutionOf: 'axe', next: [], init: () => ({ t: 0, iv: 1.3, dmg: 96, count: 3 }),
      level: () => {},
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.shoot(p, { ang: p.aimAng + g.rand(-0.7, 0.7), spd: g.rand(340, 460), arc: true,
            dmg: s.dmg * p.stat.might, pierce: 6, life: 2.6, r: 20, src: 'guillotine', kind: 'axe',
            kb: 80, critChance: 1, critDmgBonus: 0.8, spin: true, explode: 88, explodeColor: '#ff5d7a' });
        }
        g.sfx('heavy');
      },
    },
    starrail: {
      name: '星轨', ico: '🌟', max: 8, kind: '进化', color: '#a5f3fc', evolved: true,
      desc: '【进化】灵弹 + 迅捷满级。高速星弹贯穿追击，命中炸裂成星屑。',
      evolutionOf: 'bolt', next: [], init: () => ({ t: 0, iv: 0.42, dmg: 38, count: 4 }),
      level: () => {},
      fire(g, p, s) {
        const list = g.nearestEnemies(p, 900, s.count);
        for (let i = 0; i < s.count; i++) {
          const t = list[i % Math.max(1, list.length)];
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.aimAng + g.rand(-1, 1);
          g.shoot(p, { ang: a, spd: 720, dmg: s.dmg * p.stat.might, pierce: 5, life: 2.6, r: 9,
            src: 'starrail', kind: 'bolt', kb: 20, homing: 5.5, split: 3, explode: 40 });
        }
        g.sfx('cast');
      },
    },
    judgment: {
      name: '天罚', ico: '🌩️', max: 8, kind: '进化', color: '#fff59d', evolved: true,
      desc: '【进化】雷链 + 急速满级。连环落雷覆盖战场，命中麻痹。',
      evolutionOf: 'chain', next: [], init: () => ({ t: 0, iv: 1.1, dmg: 60, targets: 5, jumps: 8 }),
      level: () => {},
      fire(g, p, s) {
        const firsts = g.nearestEnemies(p, 620, s.targets);
        if (!firsts.length) return;
        for (const f of firsts) {
          const hit = new Set();
          let cur = f;
          const pts = [{ x: p.x, y: p.y }];
          for (let j = 0; j <= s.jumps && cur; j++) {
            hit.add(cur);
            pts.push({ x: cur.x, y: cur.y });
            g.damageEnemy(p, cur, s.dmg * p.stat.might * (1 - j * 0.05), { src: 'judgment', kb: 12, quiet: true, stun: 0.45 });
            let best = null, bd = 260 * 260;
            for (const e of g.enemies) {
              if (e.dead || hit.has(e)) continue;
              const d = g.dist2(e.x, e.y, cur.x, cur.y);
              if (d < bd) { bd = d; best = e; }
            }
            cur = best;
          }
          g.fx.lightning(pts, '#fff59d');
          g.fx.bolt(p.x + g.rand(-200, 200), p.y + g.rand(-160, 160));
        }
        g.sfx('thunder');
      },
    },
    eternal: {
      name: '永旋', ico: '♾️', max: 8, kind: '进化', color: '#ffd166', evolved: true,
      desc: '【进化】回旋镖 + 持久满级。无限穿透、永不落地的四枚金轮。',
      evolutionOf: 'boomerang', next: [], init: () => ({ t: 0, iv: 1.1, dmg: 44, count: 4 }),
      level: () => {},
      fire(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.shoot(p, { ang: (i / s.count) * TAU + g.rand(-0.2, 0.2), spd: 430, dmg: s.dmg * p.stat.might,
            pierce: 999, life: 8, r: 14, src: 'eternal', kind: 'boomerang', kb: 40,
            boomerang: true, reach: 460, backDmg: 2 });
        }
        g.sfx('swing');
      },
    },
    absolutezero: {
      name: '绝对零度', ico: '🧊', max: 8, kind: '进化', color: '#bae6fd', evolved: true,
      desc: '【进化】冰爆 + 持久满级。超大范围冻结，碎冰造成三倍伤害。',
      evolutionOf: 'frost', next: [], init: () => ({ t: 0, iv: 2.4, dmg: 48, radius: 430 }),
      level: () => {},
      fire(g, p, s) {
        const R = s.radius * p.stat.area;
        for (const e of g.enemies) {
          if (e.dead) continue;
          if (g.dist2(e.x, e.y, p.x, p.y) > (R + e.r) ** 2) continue;
          const frozen = e.frozen > 0;
          g.damageEnemy(p, e, s.dmg * p.stat.might * (frozen ? 3 : 1), { src: 'absolutezero', quiet: true });
          e.frozen = Math.max(e.frozen, 1.6);
          e.slowed = Math.max(e.slowed, 2.4);
        }
        g.fx.nova(p.x, p.y, R, 'rgba(186,230,253,0.4)');
        g.sfx('ice');
      },
    },
    apocalypse: {
      name: '天启', ico: '🕮', max: 8, kind: '进化', color: '#ffe066', evolved: true,
      desc: '【进化】圣典 + 疆域满级。八册圣典环绕，所触之处烈焰焚身。',
      evolutionOf: 'bible', next: [], init: () => ({ t: 0, iv: 99, dmg: 34, count: 8, radius: 150, spin: 2.4, burn: 14, tick: 0 }),
      level: () => {},
      update(g, p, s, dt) {
        s.t += dt;
        const base = s.t * s.spin;
        const R = s.radius * p.stat.area;
        for (let i = 0; i < s.count; i++) {
          const a = base + (i / s.count) * TAU;
          g.fx.orbit(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, a, '#ffe066');
        }
        s.tick += dt;
        if (s.tick < 0.1) return;
        s.tick = 0;
        for (let i = 0; i < s.count; i++) {
          const a = base + (i / s.count) * TAU;
          const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
          for (const e of g.enemies) {
            if (e.dead) continue;
            if (g.dist2(e.x, e.y, ox, oy) < (e.r + 22) ** 2) {
              g.damageEnemy(p, e, s.dmg * p.stat.might, { src: 'apocalypse', kb: 30, quiet: true, burn: s.burn, burnDur: 3 });
            }
          }
        }
      },
    },
  };

  /* 进化配方：武器满级 + 被动满级 */
  const EVOLUTIONS = [
    { from: 'whip', passive: 'might', to: 'bloodwhip' },
    { from: 'kunai', passive: 'proj', to: 'thousandblades' },
    { from: 'fireball', passive: 'area', to: 'meteor' },
    { from: 'garlic', passive: 'armor', to: 'sanctuary' },
    { from: 'axe', passive: 'crit', to: 'guillotine' },
    { from: 'bolt', passive: 'projspeed', to: 'starrail' },
    { from: 'chain', passive: 'cooldown', to: 'judgment' },
    { from: 'boomerang', passive: 'duration', to: 'eternal' },
    { from: 'frost', passive: 'duration', to: 'absolutezero' },
    { from: 'bible', passive: 'area', to: 'apocalypse' },
  ];

  /* ============================ 被动 ============================ */
  const PASSIVES = {
    might:    { name: '力量', ico: '💪', max: 5, desc: '所有伤害 +10%', each: (s) => { s.might += 0.10; } },
    hpup:     { name: '体魄', ico: '❤️', max: 5, desc: '生命上限 +20，并立刻回复 20', each: (s, p) => { s.maxHpFlat += 20; if (p) { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } } },
    armor:    { name: '铁甲', ico: '🛡️', max: 5, desc: '受到伤害 -1', each: (s) => { s.armor += 1; } },
    speed:    { name: '疾行', ico: '👟', max: 5, desc: '移动速度 +8%', each: (s) => { s.speed += 0.08; } },
    cooldown: { name: '急速', ico: '⏱️', max: 5, desc: '武器冷却 -8%', each: (s) => { s.cooldown += 0.08; } },
    area:     { name: '疆域', ico: '🧭', max: 5, desc: '作用范围 +10%', each: (s) => { s.area += 0.10; } },
    magnet:   { name: '贪婪', ico: '🧲', max: 5, desc: '拾取半径 +25%', each: (s) => { s.magnet += 0.25; } },
    duration: { name: '持久', ico: '⌛', max: 5, desc: '效果持续 +10%', each: (s) => { s.duration += 0.10; } },
    proj:     { name: '增幅', ico: '➕', max: 5, desc: '弹射物数量 +1', each: (s) => { s.proj += 1; } },
    projspeed:{ name: '迅捷', ico: '💨', max: 5, desc: '弹射物速度 +15%', each: (s) => { s.projspeed += 0.15; } },
    crit:     { name: '致命', ico: '🎯', max: 5, desc: '暴击率 +8%，暴伤 +15%', each: (s) => { s.crit += 0.08; s.critdmg += 0.15; } },
    regen:    { name: '生机', ico: '🌿', max: 5, desc: '每秒回复 0.4 生命', each: (s) => { s.regen += 0.4; } },
    revive:   { name: '不灭', ico: '♻️', max: 2, desc: '死亡时原地复活（50% 生命）', each: (s) => { s.revive += 1; } },
    greed:    { name: '点金', ico: '💰', max: 3, desc: '金币获取 +35%', each: (s) => { s.greed += 0.35; } },
    xpup:     { name: '智慧', ico: '📚', max: 3, desc: '经验获取 +15%', each: (s) => { s.xpGain += 0.15; } },
    pierce:   { name: '破甲', ico: '🏹', max: 3, desc: '弹射物穿透 +1', each: (s) => { s.pierce += 1; } },
    luck:     { name: '幸运', ico: '🍀', max: 3, desc: '宝箱与道具掉落率 +20%', each: (s) => { s.luck += 0.2; } },
    thorns:   { name: '荆棘', ico: '🌵', max: 3, desc: '受击时反弹 12 点伤害', each: (s) => { s.thorns += 12; } },
  };

  /* ============================ 敌人 ============================ */
  const ENEMY_TYPES = {
    slime:    { name: '史莱姆', hp: 11, spd: 56, dmg: 8, xp: 1, gold: 1, r: 14, color: '#5ad19a', dark: '#2e8b62', shape: 'blob', minT: 0 },
    bat:      { name: '蝙蝠', hp: 8, spd: 110, dmg: 7, xp: 1, gold: 1, r: 11, color: '#a78bfa', dark: '#6d4fc4', shape: 'bat', minT: 50 },
    skeleton: { name: '骷髅', hp: 26, spd: 66, dmg: 12, xp: 2, gold: 2, r: 15, color: '#d7d2c4', dark: '#8f8a78', shape: 'skel', minT: 130 },
    spider:   { name: '蛛魔', hp: 20, spd: 96, dmg: 10, xp: 2, gold: 2, r: 12, color: '#c084fc', dark: '#7e22ce', shape: 'spider', minT: 200, slowOnHit: 1.2 },
    ghost:    { name: '幽灵', hp: 32, spd: 84, dmg: 14, xp: 3, gold: 2, r: 15, color: '#8bd3ff', dark: '#4a86b8', shape: 'ghost', minT: 260, phase: true },
    brute:    { name: '巨兽', hp: 130, spd: 46, dmg: 24, xp: 6, gold: 6, r: 23, color: '#ff8a5c', dark: '#c1502a', shape: 'brute', minT: 320 },
    spitter:  { name: '喷吐者', hp: 44, spd: 58, dmg: 10, xp: 5, gold: 4, r: 16, color: '#c58cff', dark: '#7b46b8', shape: 'blob', ranged: true, minT: 380 },
    swarm:    { name: '虫群', hp: 6, spd: 130, dmg: 5, xp: 1, gold: 1, r: 9, color: '#ffe066', dark: '#c9a52c', shape: 'blob', minT: 440 },
    bomber:   { name: '自爆虫', hp: 30, spd: 104, dmg: 6, xp: 4, gold: 4, r: 14, color: '#fb7185', dark: '#9f1239', shape: 'blob', boomOnDeath: 78, minT: 500 },
    charger:  { name: '冲锋者', hp: 74, spd: 62, dmg: 20, xp: 5, gold: 5, r: 18, color: '#ff5d8f', dark: '#b8325e', shape: 'brute', charge: true, minT: 560 },
    gargoyle: { name: '石像鬼', hp: 150, spd: 70, dmg: 22, xp: 8, gold: 8, r: 19, color: '#94a3b8', dark: '#475569', shape: 'gargoyle', armor: 5, minT: 620 },
    rune:     { name: '邪符', hp: 58, spd: 66, dmg: 16, xp: 4, gold: 4, r: 14, color: '#4be3c9', dark: '#2a9c8a', shape: 'rune', selfDestruct: true, minT: 700 },
    wraith:   { name: '怨灵', hp: 96, spd: 92, dmg: 18, xp: 7, gold: 7, r: 17, color: '#818cf8', dark: '#3730a3', shape: 'ghost', phase: true, minT: 780 },
    armord:   { name: '重甲兵', hp: 250, spd: 40, dmg: 28, xp: 10, gold: 10, r: 24, color: '#9aa7c7', dark: '#5d688a', shape: 'armor', armor: 8, minT: 850 },
    healer:   { name: '奶妈', hp: 95, spd: 55, dmg: 12, xp: 8, gold: 8, r: 16, color: '#7dffb0', dark: '#3aa769', shape: 'blob', heal: true, minT: 960 },
    mimic:    { name: '宝箱怪', hp: 340, spd: 86, dmg: 30, xp: 22, gold: 70, r: 22, color: '#ffd166', dark: '#c99a20', shape: 'chest', rare: true, minT: 300 },
    elite:    { name: '精英', hp: 640, spd: 66, dmg: 34, xp: 45, gold: 45, r: 30, color: '#ff4d6d', dark: '#a81f3c', shape: 'elite', elite: true, armor: 4, rare: true, minT: 420 },
  };

  const BOSS_TYPES = {
    gorlin:  { name: '巨魔 · 戈尔林', hp: 9000, spd: 52, dmg: 38, xp: 320, gold: 320, r: 64, color: '#c94f7c', dark: '#7c2a4a', shape: 'boss', pattern: 'chase' },
    necrolord: { name: '巫妖 · 奈克罗', hp: 12000, spd: 58, dmg: 34, xp: 420, gold: 420, r: 58, color: '#6fd3ff', dark: '#2a6f9c', shape: 'boss', pattern: 'summon', minion: 'skeleton' },
    twins:   { name: '双生子 · 影与焰', hp: 16000, spd: 72, dmg: 42, xp: 600, gold: 600, r: 62, color: '#ffb45c', dark: '#a35a1f', shape: 'boss', pattern: 'dash' },
    colossus:{ name: '巨像 · 塔尔', hp: 22000, spd: 44, dmg: 46, xp: 800, gold: 800, r: 72, color: '#a3a3a3', dark: '#525252', shape: 'boss', pattern: 'chase', armor: 12 },
    lich:    { name: '深渊领主 · 卡尔', hp: 34000, spd: 60, dmg: 50, xp: 1500, gold: 1500, r: 76, color: '#b06bff', dark: '#5b2a8c', shape: 'boss', pattern: 'final' },
  };

  /* ============================ 道具 ============================ */
  const ITEMS = {
    heal:   { name: '治疗药水', ico: '💖', color: '#ff6b9d' },
    magnet: { name: '磁石', ico: '🧲', color: '#7ee8fa' },
    bomb:   { name: '炸弹', ico: '💥', color: '#ffb45c' },
    gold:   { name: '钱袋', ico: '💰', color: '#ffd166' },
  };

  /* ============================ 成就 ============================ */
  const ACHIEVEMENTS = [
    { id: 'ach_kills_100', name: '初尝血腥', ico: '🩸', desc: '累计击杀 100 名敌人', reward: 100,
      check: (s) => s.stats.kills >= 100 },
    { id: 'ach_kills_500', name: '割草新手', ico: '🌾', desc: '累计击杀 500 名敌人', reward: 200, unlock: 'necro',
      check: (s) => s.stats.kills >= 500 },
    { id: 'ach_kills_5000', name: '尸山血海', ico: '💀', desc: '累计击杀 5000 名敌人', reward: 800,
      check: (s) => s.stats.kills >= 5000 },
    { id: 'ach_survive_5', name: '站稳脚跟', ico: '⏱️', desc: '单局存活 5 分钟', reward: 120,
      check: (s) => s.stats.bestTime >= 300 },
    { id: 'ach_survive_10', name: '老练猎人', ico: '🏹', desc: '单局存活 10 分钟', reward: 220, unlock: 'warden',
      check: (s) => s.stats.bestTime >= 600 },
    { id: 'ach_survive_20', name: '永夜行者', ico: '🌙', desc: '单局存活 20 分钟', reward: 450,
      check: (s) => s.stats.bestTime >= 1200 },
    { id: 'ach_survive_30', name: '三十分钟的传说', ico: '🕰️', desc: '单局存活 30 分钟', reward: 900,
      check: (s) => s.stats.bestTime >= 1800 },
    { id: 'ach_level_20', name: '小有所成', ico: '⬆️', desc: '单局达到 20 级', reward: 180,
      check: (s) => s.stats.bestLevel >= 20 },
    { id: 'ach_level_40', name: '登峰造极', ico: '🔝', desc: '单局达到 40 级', reward: 600,
      check: (s) => s.stats.bestLevel >= 40 },
    { id: 'ach_evolve', name: '脱胎换骨', ico: '🧬', desc: '首次进化一件武器', reward: 350,
      check: (s) => s.stats.evolutions >= 1 },
    { id: 'ach_six_weapons', name: '全副武装', ico: '🎒', desc: '单局集齐 6 件武器', reward: 250,
      check: (s) => s.stats.maxWeapons >= 6 },
    { id: 'ach_gold_3000', name: '富甲一方', ico: '🏦', desc: '累计获得 3000 金币', reward: 300, unlock: 'alchemist',
      check: (s) => s.stats.goldEarned >= 3000 },
    { id: 'ach_elite_50', name: '精英屠夫', ico: '🗡️', desc: '累计击杀 50 名精英', reward: 400,
      check: (s) => s.stats.elites >= 50 },
    { id: 'ach_boss_10', name: '首领克星', ico: '👹', desc: '累计击杀 10 名首领', reward: 500,
      check: (s) => s.stats.bosses >= 10 },
    { id: 'ach_win', name: '深渊终结', ico: '🏆', desc: '击败深渊领主通关', reward: 1200, unlock: 'blademaster',
      check: (s) => s.stats.wins >= 1 },
    { id: 'ach_win_hard', name: '硬核征服者', ico: '🔥', desc: '以硬核或噩梦难度通关', reward: 2000,
      check: (s) => (s.stats.winDiff || []).some((d) => d === 'hard' || d === 'nightmare') },
    { id: 'ach_no_hit_5', name: '毫发无伤', ico: '🛡️', desc: '5 分钟内不受伤', reward: 600,
      check: (s) => s.stats.noHit5 },
    { id: 'ach_dash_200', name: '鬼影步', ico: '💨', desc: '累计冲刺 200 次', reward: 300,
      check: (s) => s.stats.dashes >= 200 },
    { id: 'ach_chars_5', name: '百般武艺', ico: '🎭', desc: '用 5 个不同角色完成一局', reward: 700,
      check: (s) => (s.stats.charsPlayed || []).length >= 5 },
    { id: 'ach_all_weapons', name: '兵器谱', ico: '📜', desc: '使用过全部 16 种基础武器', reward: 900,
      check: (s) => (s.stats.weaponsUsed || []).length >= 16 },
  ];

  /* ============================ 商店 ============================ */
  const SHOP = [
    { id: 'vitality', name: '强健体魄', ico: '❤️', max: 5, desc: '起始生命上限 +12', cost: (lv) => Math.round(120 * Math.pow(1.7, lv)),
      apply: (s) => { s.maxHpFlat += 12; } },
    { id: 'power', name: '锋锐武器', ico: '💪', max: 5, desc: '起始伤害 +5%', cost: (lv) => Math.round(150 * Math.pow(1.7, lv)),
      apply: (s) => { s.shopMight += 0.05; } },
    { id: 'swift', name: '轻步', ico: '👟', max: 5, desc: '起始移速 +3%', cost: (lv) => Math.round(110 * Math.pow(1.65, lv)),
      apply: (s) => { s.shopSpeed += 0.03; } },
    { id: 'fortune', name: '讨价还价', ico: '💰', max: 5, desc: '金币获取 +10%', cost: (lv) => Math.round(140 * Math.pow(1.7, lv)),
      apply: (s) => { s.shopGreed += 0.10; } },
    { id: 'wisdom', name: '博学', ico: '📚', max: 5, desc: '经验获取 +7%', cost: (lv) => Math.round(160 * Math.pow(1.7, lv)),
      apply: (s) => { s.shopXp += 0.07; } },
    { id: 'magnet', name: '磁力手套', ico: '🧲', max: 3, desc: '拾取半径 +18%', cost: (lv) => Math.round(130 * Math.pow(1.8, lv)),
      apply: (s) => { s.magnet += 0.18; } },
    { id: 'armor', name: '护甲片', ico: '🛡️', max: 3, desc: '起始护甲 +1', cost: (lv) => Math.round(200 * Math.pow(1.9, lv)),
      apply: (s) => { s.armor += 1; } },
    { id: 'revive', name: '替身符', ico: '♻️', max: 2, desc: '开局多 1 次复活', cost: (lv) => Math.round(500 * Math.pow(2.1, lv)),
      apply: (s) => { s.revive += 1; } },
    { id: 'luck', name: '幸运币', ico: '🍀', max: 4, desc: '宝箱 / 道具掉率 +10%', cost: (lv) => Math.round(170 * Math.pow(1.75, lv)),
      apply: (s) => { s.luck += 0.10; } },
    { id: 'dashcd', name: '风之靴', ico: '💨', max: 3, desc: '冲刺冷却 -12%', cost: (lv) => Math.round(180 * Math.pow(1.8, lv)),
      apply: (s) => { s.dashCdMul -= 0.12; } },
    { id: 'reroll', name: '命运骰', ico: '🎲', max: 2, desc: '每局重掷次数 +1', cost: (lv) => Math.round(260 * Math.pow(2.0, lv)),
      apply: (s) => { s.bonusRerolls += 1; } },
  ];

  /* ============================ 挑战规则 ============================ */
  /* 每日/随机挑战使用的修正器；positive 表示对玩家有利 */
  const MODIFIERS = [
    { id: 'swarm_tide', name: '虫潮', ico: '🐛', desc: '敌人数量 +50%，但经验 +20%', good: false,
      apply: (m) => { m.spawnMul *= 1.5; m.xpMul *= 1.2; } },
    { id: 'glass', name: '玻璃大炮', ico: '💥', desc: '伤害 +60%，受到伤害 +50%', good: false,
      apply: (m) => { m.mightMul *= 1.6; m.dmgTakenMul *= 1.5; } },
    { id: 'ironman', name: '铁人', ico: '🛡️', desc: '生命 +50%，但移速 -15%', good: true,
      apply: (m) => { m.hpMul *= 1.5; m.speedMul *= 0.85; } },
    { id: 'frenzy', name: '狂暴', ico: '🔥', desc: '攻速 +35%，敌人也更快', good: true,
      apply: (m) => { m.cdMul *= 0.65; m.enemySpeedMul *= 1.18; } },
    { id: 'bounty', name: '赏金', ico: '💰', desc: '金币 +100%，敌人血量 +30%', good: true,
      apply: (m) => { m.goldMul *= 2; m.enemyHpMul *= 1.3; } },
    { id: 'darkness', name: '黑雾', ico: '🌫️', desc: '视野缩小，但掉落率 +80%', good: false,
      apply: (m) => { m.visionMul *= 0.78; m.luckBonus += 0.8; } },
    { id: 'haste', name: '疾风', ico: '💨', desc: '移速 +25%，冲刺冷却 -50%', good: true,
      apply: (m) => { m.speedMul *= 1.25; m.dashCdMul *= 0.5; } },
    { id: 'famine', name: '荒芜', ico: '🍂', desc: '治疗与回复 -60%，经验 +40%', good: false,
      apply: (m) => { m.healMul *= 0.4; m.xpMul *= 1.4; } },
    { id: 'elite_rush', name: '精英潮', ico: '👑', desc: '精英出现更早更多，金币 +50%', good: false,
      apply: (m) => { m.eliteMul *= 2.2; m.goldMul *= 1.5; } },
    { id: 'last_stand', name: '背水一战', ico: '⚔️', desc: '无法复活，但全属性 +20%', good: true,
      apply: (m) => { m.noRevive = true; m.mightMul *= 1.2; m.hpMul *= 1.2; } },
    { id: 'slow_world', name: '迟滞', ico: '🐌', desc: '敌人移速 -25%，你的攻速 -15%', good: true,
      apply: (m) => { m.enemySpeedMul *= 0.75; m.cdMul *= 1.15; } },
    { id: 'treasure', name: '寻宝', ico: '🎁', desc: '宝箱翻倍，敌人血量 +25%', good: true,
      apply: (m) => { m.chestMul *= 2; m.enemyHpMul *= 1.25; } },
  ];

  global.DSData = {
    TAU, CHARACTERS, DIFFICULTIES, WEAPONS, EVOLUTIONS, PASSIVES,
    ENEMY_TYPES, BOSS_TYPES, ITEMS, ACHIEVEMENTS, SHOP, MODIFIERS,
    RUN_DURATION: 30 * 60,
    MAX_ENEMIES: 380,
    MAX_PROJECTILES: 700,
    MAX_PARTICLES: 700,
  };
})(window);
