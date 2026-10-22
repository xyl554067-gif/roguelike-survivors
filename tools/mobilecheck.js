/* 移动端真实浏览器仿真验证：触屏控件 / 横竖屏 / 游戏流程 / 局内商店 / 角色解锁 / 无尽模式
   依赖 playwright-core（不下载浏览器，复用系统 Edge/Chrome）：
     npm i playwright-core
   若 Edge 不在默认路径，请修改下方 EDGE；Chrome 可改为
     'C:/Program Files/Google/Chrome/Application/chrome.exe'
   运行：node tools/mobilecheck.js   （或 npm run test:mobile）
   截图输出到 .tmp-livecheck/（已在 .gitignore 中忽略）
*/
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = 'file:///' + path.resolve(__dirname, '../../roguelike-survivors/index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '../../roguelike-survivors/.tmp-livecheck');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  [' + extra + ']' : ''));
};

(async () => {
  const browser = await chromium.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--disable-gpu', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },      // iPhone 竖屏
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });

  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  /* ---------- 1. 竖屏：横屏提示 ---------- */
  console.log('\n[1] 竖屏 390x844');
  await page.waitForTimeout(400);
  const rotVisiblePortrait = await page.isVisible('#rotateHint');
  ok('竖屏时显示「请横屏游玩」提示', rotVisiblePortrait);
  await page.screenshot({ path: OUT + '/m_portrait.png' });

  /* ---------- 2. 横屏 ---------- */
  console.log('\n[2] 横屏 844x390');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  const rotHiddenLandscape = await page.isHidden('#rotateHint');
  ok('横屏后横屏提示自动隐藏', rotHiddenLandscape);
  const padVisible = await page.isVisible('#touchPad');
  ok('触屏设备显示虚拟摇杆与按钮', padVisible);

  // 画布铺满且不溢出视口
  const canvasFit = await page.evaluate(() => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight,
             overflowX: r.right <= innerWidth + 1, overflowY: r.bottom <= innerHeight + 1 };
  });
  ok('画布完整落在视口内', canvasFit.overflowX && canvasFit.overflowY,
     `${canvasFit.w}x${canvasFit.h} @ ${canvasFit.vw}x${canvasFit.vh}`);
  await page.screenshot({ path: OUT + '/m_menu_landscape.png' });

  /* ---------- 3. 开始一局（简单难度，便于观察） ---------- */
  console.log('\n[3] 开始游戏');
  await page.selectOption('#selDiff', 'easy');
  await page.selectOption('#selMode', 'campaign');
  await page.click('#btnStart');
  await page.waitForTimeout(900);
  const hudVisible = await page.isVisible('#hud');
  ok('HUD 显示（进入游戏）', hudVisible);
  const padInGame = await page.isVisible('#touchPad');
  ok('游戏中虚拟摇杆仍可见', padInGame);
  const goalText = await page.textContent('#goalList');
  ok('目标列表含局内商店说明', /局内商店/.test(goalText || ''));

  /* ---------- 4. 摇杆驱动移动 ---------- */
  console.log('\n[4] 虚拟摇杆移动');
  const before = await page.evaluate(() => {
    const g = window.DSGame;
    return g && g.player ? { x: g.player.x, y: g.player.y } : null;
  });
  const zone = await page.$('#joyZone');
  const box = await zone.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy, { steps: 4 });     // 向右推满
  await page.waitForTimeout(700);
  const stickVec = await page.evaluate(() => window.DSInput ? window.DSInput.stick : null);
  ok('摇杆输入向量 ≈ (1, 0)', stickVec && Math.abs(stickVec.x - 1) < 0.15 && Math.abs(stickVec.y) < 0.15,
     stickVec ? `(${stickVec.x.toFixed(2)}, ${stickVec.y.toFixed(2)})` : 'null');
  const after = await page.evaluate(() => {
    const g = window.DSGame;
    return g && g.player ? { x: g.player.x, y: g.player.y } : null;
  });
  const moved = before && after ? Math.hypot(after.x - before.x, after.y - before.y) : 0;
  ok('角色随摇杆向右移动', moved > 10, `位移 ${moved.toFixed(0)}px`);
  await page.screenshot({ path: OUT + '/m_game_joy.png' });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const stickOff = await page.evaluate(() => window.DSInput ? window.DSInput.stick : null);
  ok('松开摇杆后输入归零', stickOff && stickOff.x === 0 && stickOff.y === 0 && stickOff.active === false,
     stickOff ? `active=${stickOff.active}` : 'null');

  /* ---------- 5. 冲刺按钮 ---------- */
  console.log('\n[5] 冲刺按钮');
  const dashBefore = await page.evaluate(() => {
    const g = window.DSGame;
    return { cd: g.player.dashCd, t: g.player.dashT };
  });
  await page.tap('#btnTouchDash');
  await page.waitForTimeout(150);
  const dashAfter = await page.evaluate(() => {
    const g = window.DSGame;
    return { cd: g.player.dashCd, t: g.player.dashT, vx: g.player.vx, vy: g.player.vy };
  });
  const dashed = (dashAfter.t > 0) || (dashAfter.cd > 0) || Math.hypot(dashAfter.vx || 0, dashAfter.vy || 0) > 100;
  ok('点击冲刺按钮触发冲刺', dashed,
     `dashT=${dashAfter.t} dashCd=${dashAfter.cd.toFixed ? dashAfter.cd.toFixed(2) : dashAfter.cd}`);

  /* ---------- 6. 暂停 → 局内商店 ---------- */
  console.log('\n[6] 局内商店');
  await page.tap('#btnTouchPause');
  await page.waitForTimeout(400);
  const pauseVisible = await page.isVisible('#pause');
  ok('触屏暂停按钮打开暂停菜单', pauseVisible);
  await page.click('#btnRunShop');
  await page.waitForTimeout(400);
  const shopVisible = await page.isVisible('#runshop');
  ok('局内商店面板打开', shopVisible);
  const shopInfo = await page.evaluate(() => {
    const items = document.querySelectorAll('#rsList [data-buy]');
    return { count: items.length, gold: document.getElementById('rsGold').textContent };
  });
  ok('商店商品已渲染', shopInfo.count >= 8, `${shopInfo.count} 件商品，金币 ${shopInfo.gold}`);

  // 给足金币买一件，验证真实链路
  await page.evaluate(() => { window.DSGame.player.gold = 9999; window.DSGame.renderRunShop && window.DSGame.renderRunShop(); });
  await page.waitForTimeout(200);
  const buyRes = await page.evaluate(() => {
    const g = window.DSGame;
    const beforeHp = g.player.hp, beforeGold = g.player.gold;
    g.player.hp = 10;                       // 制造可治疗空间
    const r = g.buyRunShop('heal');
    return { ok: r.ok, reason: r.reason, beforeHp, afterHp: g.player.hp, goldSpent: beforeGold - g.player.gold };
  });
  ok('局内购买治疗生效', buyRes.ok && buyRes.afterHp > 10 && buyRes.goldSpent > 0,
     `HP 10 → ${buyRes.afterHp}，花 ${buyRes.goldSpent} 金`);
  await page.screenshot({ path: OUT + '/m_runshop.png' });
  await page.click('#btnRsClose');
  await page.click('#btnResume');
  await page.waitForTimeout(400);
  ok('返回游戏后 HUD 恢复', await page.isVisible('#hud'));

  /* ---------- 6.5 角色解锁：说明 + 金币购买 ---------- */
  console.log('\n[6.5] 角色解锁途径');
  await page.evaluate(() => window.DSUI.toMenu());
  await page.waitForTimeout(300);
  await page.selectOption('#selChar', 'necro');
  await page.waitForTimeout(300);
  const unlockBox = await page.evaluate(() => {
    const b = document.getElementById('unlockBox');
    return { visible: !b.classList.contains('hidden'), text: b.textContent, hasBtn: !!b.querySelector('[data-buy]') };
  });
  ok('锁定角色显示解锁途径说明', unlockBox.visible && /解锁/.test(unlockBox.text),
     unlockBox.text.slice(0, 40).replace(/\s+/g, ' '));
  ok('提供金币购买按钮（默认金币不足时禁用）', unlockBox.hasBtn);
  await page.screenshot({ path: OUT + '/m_unlock.png' });

  const charBuy = await page.evaluate(async () => {
    const Save = window.DSSave;
    Save.data.gold = 5000; Save.save();
    window.DSUI.renderCharInfo();                       // 重新渲染，按钮变为可点
    const btn = document.querySelector('#unlockBox [data-buy]');
    const clickable = !!btn && !btn.disabled;
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    const c = window.DSData.CHARACTERS.find((x) => x.id === 'necro');
    return { clickable, unlocked: Save.isCharUnlocked(c), gold: Save.gold,
             boxHidden: document.getElementById('unlockBox').classList.contains('hidden') };
  });
  ok('金币足够时按钮可点击', charBuy.clickable);
  ok('购买后角色解锁且扣除金币', charBuy.unlocked && charBuy.gold === 4200,
     `剩余金币 ${charBuy.gold}`);
  ok('解锁后说明面板隐藏', charBuy.boxHidden);
  // 还原干净存档，避免影响后续小节
  await page.evaluate(() => { window.DSSave.data.gold = 0; window.DSSave.data.purchasedChars = {}; window.DSSave.save(); window.DSUI.buildSelectors(); window.DSUI.renderCharInfo(); });

  /* ---------- 7. 小屏极窄适配 ---------- */
  console.log('\n[7] 极窄小屏 320x480');
  await page.setViewportSize({ width: 320, height: 480 });
  await page.waitForTimeout(400);
  const narrow = await page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { overflowX: document.body.scrollWidth <= innerWidth + 1, canvasRight: r.right <= innerWidth + 1 };
  });
  ok('320px 宽度无横向溢出', narrow.overflowX && narrow.canvasRight);
  await page.screenshot({ path: OUT + '/m_narrow.png' });

  /* ---------- 8. 无尽模式：HUD 时长显示 ∞ ---------- */
  console.log('\n[8] 无尽模式');
  await page.setViewportSize({ width: 844, height: 390 });   // 回到横屏，避开竖屏提示遮挡
  await page.waitForTimeout(300);
  await page.evaluate(() => window.DSUI.toMenu());
  await page.waitForTimeout(300);
  await page.selectOption('#selMode', 'endless');
  await page.selectOption('#selDiff', 'easy');
  await page.waitForTimeout(200);
  await page.click('#btnStart');
  await page.waitForTimeout(900);
  const endlessInfo = await page.evaluate(() => {
    const g = window.DSGame;
    return { endless: !!g.endless, duration: g.duration, time: document.getElementById('timeText').textContent };
  });
  ok('无尽模式：无时限且 HUD 显示 ∞', endlessInfo.endless && endlessInfo.duration === Infinity && /∞/.test(endlessInfo.time),
     `duration=${endlessInfo.duration} HUD="${endlessInfo.time}"`);
  await page.screenshot({ path: OUT + '/m_endless.png' });
  await page.evaluate(() => window.DSUI.toMenu());
  await page.selectOption('#selMode', 'campaign');

  /* ---------- 9. 横屏：三张升级卡同屏 + 图标瘦身 ---------- */
  console.log('\n[9] 横屏升级卡与图标尺寸');
  await page.click('#btnStart');
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.DSGame.player.pendingLevels = 1;   // 触发一次升级三选一
  });
  await page.waitForTimeout(700);
  const cardsInfo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#cards .card')];
    const lvl = document.getElementById('levelup');
    return {
      count: cards.length,
      visible: cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= innerHeight + 1 && r.width > 0;
      }).length,
      rows: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size,
      overlayOpen: !lvl.classList.contains('hidden'),
    };
  });
  ok('升级面板弹出且渲染 3 张卡', cardsInfo.overlayOpen && cardsInfo.count === 3, `共 ${cardsInfo.count} 张`);
  ok('横屏下 3 张卡同屏完整可见', cardsInfo.visible === 3 && cardsInfo.rows === 1,
     `可见 ${cardsInfo.visible} 张，占 ${cardsInfo.rows} 行`);
  await page.screenshot({ path: OUT + '/m_levelup_landscape.png' });
  await page.evaluate(() => window.DSUI.pickCard(0));   // 选一张继续
  await page.waitForTimeout(400);

  const sizes = await page.evaluate(() => {
    const q = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return Math.round(r.width); };
    return { dash: q('#btnTouchDash'), pause: q('#btnTouchPause'), joy: q('#joyBase'), fs: q('#btnFullscreen') };
  });
  ok('横屏下触控图标已瘦身（冲刺 ≤ 62px）', sizes.dash <= 62, `冲刺 ${sizes.dash}px / 暂停 ${sizes.pause}px / 摇杆 ${sizes.joy}px`);
  ok('摇杆直径不超屏高 25%', sizes.joy <= 844 * 0 + 390 * 0.25, `摇杆 ${sizes.joy}px @ 390px 高`);

  /* ---------- 10. 全屏按钮：iOS 回退路径 ---------- */
  console.log('\n[10] 全屏按钮（iOS 回退）');
  const fsRes = await page.evaluate(() => {
    // 模拟 iOS Safari：遮蔽文档级全屏能力（方法在原型链上，必须用实例属性覆盖）
    const el = document.documentElement;
    const saved = { req: el.requestFullscreen, webkit: el.webkitRequestFullscreen, en: document.fullscreenEnabled };
    el.requestFullscreen = undefined;
    el.webkitRequestFullscreen = undefined;
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    let err = null;
    const before = document.body.classList.contains('chrome-hidden');
    try { window.DSUI.toggleFullscreen(); } catch (e) { err = e.message; }
    const after = document.body.classList.contains('chrome-hidden');
    const toast = document.getElementById('toast').textContent;
    const cornerHidden = getComputedStyle(document.getElementById('btnMute')).opacity;
    window.DSUI.toggleFullscreen();
    const restored = !document.body.classList.contains('chrome-hidden');
    // 还原浏览器能力，避免影响其他用例
    el.requestFullscreen = saved.req; el.webkitRequestFullscreen = saved.webkit;
    Object.defineProperty(document, 'fullscreenEnabled', { value: saved.en, configurable: true });
    return { before, after, restored, toast, cornerHidden, err };
  });
  ok('iOS 回退：不支持全屏时进入 chrome-hidden 并给出提示',
     !fsRes.err && fsRes.before === false && fsRes.after === true && /主屏幕|恢复/.test(fsRes.toast),
     fsRes.err ? `异常: ${fsRes.err}` : `toast="${fsRes.toast.slice(0, 26)}…"`);
  ok('回退模式下静音按钮隐藏、全屏按钮保留可退出', fsRes.cornerHidden === '0');
  ok('再次点击可还原', fsRes.restored);

  /* ---------- 11. 新角色与新武器实战 ---------- */
  console.log('\n[11] 新角色与新武器');
  await page.evaluate(() => window.DSUI.toMenu());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const Save = window.DSSave;
    Save.data.purchasedChars = { gale: 1, shade: 1 };
    Save.save();
    window.DSUI.buildSelectors();
  });
  await page.waitForTimeout(300);

  // 青岚：把旋风内部计时推到临界，下一帧即召出旋风
  await page.selectOption('#selChar', 'gale');
  await page.click('#btnStart');
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.DSGame.player.weapons[0].st.t = 2.55; });
  await page.waitForTimeout(500);
  const galeInfo = await page.evaluate(() => ({
    tornados: window.DSGame.tornados.length,
    weapon: window.DSGame.player.weapons[0].id,
  }));
  ok('青岚·旋风：场上出现旋风实体', galeInfo.tornados > 0 && galeInfo.weapon === 'tornado',
     `旋风 ${galeInfo.tornados} 道`);
  await page.screenshot({ path: OUT + '/m_new_tornado.png' });

  // 绯夜：推到分身临界 + 手动放一只敌触发影刺
  await page.evaluate(() => { window.DSGame.endRun(false); });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.DSUI.toMenu());
  await page.waitForTimeout(400);
  await page.selectOption('#selChar', 'shade');
  await page.click('#btnStart');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const g = window.DSGame;
    g.player.weapons[0].st.t = 13.9;                       // 逼近 14s 分身周期
    g.spawnEnemy('slime', { x: g.player.x + 120, y: g.player.y }, 1, true);
  });
  await page.waitForTimeout(900);
  const shadeInfo = await page.evaluate(() => {
    const g = window.DSGame;
    return { cloneT: g.player.cloneT, weapon: g.player.weapons[0].id,
             shadowProj: g.projectiles.filter((q) => q.kind === 'shadow').length };
  });
  ok('绯夜·影刃：分身激活', shadeInfo.cloneT > 0 && shadeInfo.weapon === 'mirror',
     `cloneT=${shadeInfo.cloneT.toFixed(1)}s`);
  ok('绯夜·影刃：影刺已射出', shadeInfo.shadowProj > 0, `影刺 ${shadeInfo.shadowProj} 发`);
  await page.screenshot({ path: OUT + '/m_new_mirror.png' });
  // 还原干净存档
  await page.evaluate(() => {
    window.DSSave.data.purchasedChars = {}; window.DSSave.save();
  });

  await browser.close();

  const fail = results.filter((r) => !r.pass);
  console.log(`\n════════ 移动端仿真验证：${results.length - fail.length}/${results.length} 通过 ════════`);
  if (fail.length) { console.log('失败项：'); fail.forEach((f) => console.log('  ✗ ' + f.name)); process.exit(1); }
})().catch((e) => { console.error('脚本异常：', e); process.exit(1); });
