#!/usr/bin/env node
/* 校验线上 GitHub Pages 是否包含 v2.3.0 全部特性 */
'use strict';
const base = 'https://xyl554067-gif.github.io/roguelike-survivors/';

(async () => {
  const get = async (f) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`${f || 'index.html'} → HTTP ${r.status}`);
    return r.text();
  };
  const files = ['', 'js/data.js', 'js/save.js', 'js/engine.js', 'js/ui.js', 'js/main.js', 'style.css'];
  for (const f of files) {
    const t = await get(f);
    console.log((f || 'index.html').padEnd(18), '200', String(t.length).padStart(7) + 'b');
  }

  const html = await get('');
  const data = await get('js/data.js');
  const eng = await get('js/engine.js');
  const ui = await get('js/ui.js');
  const save = await get('js/save.js');
  const main = await get('js/main.js');

  const checks = [
    ['版本号 v2.3.0', html.includes('v2.3.0') && main.includes('v2.3.0')],
    ['启动日志 v2.3.0', main.includes('v2.3.0')],
    ['模式选择下拉', html.includes('id="selMode"')],
    ['角色解锁面板', html.includes('id="unlockBox"')],
    ['局内商店面板', html.includes('id="runshop"') && html.includes('id="rsList"')],
    ['虚拟摇杆 DOM', html.includes('id="joyZone"') && html.includes('id="joyKnob"')],
    ['触屏冲刺按钮', html.includes('id="btnTouchDash"')],
    ['横屏提示', html.includes('id="rotateHint"')],
    ['响应式 viewport', /viewport-fit=cover/.test(html)],
    ['数据·难度时长', data.includes('duration:') && data.includes('DIFFICULTIES')],
    ['数据·无尽模式', data.includes('endless: true') && data.includes('endless')],
    ['数据·局内商店表', data.includes('RUN_SHOP')],
    ['数据·等级成长表', data.includes('LEVEL_GROWTH')],
    ['引擎·统一治疗', eng.includes('healPlayer')],
    ['引擎·商店购买', eng.includes('buyRunShop')],
    ['引擎·连杀回血', eng.includes('killStreak') || eng.includes('healEveryKills')],
    ['引擎·摇杆输入', eng.includes('setStick')],
    ['UI·商店缓存 runshop', /'runshop'/.test(ui) || /"runshop"/.test(ui)],
    ['UI·触屏控件开关', ui.includes('applyTouchPad')],
    ['存档·金币扣除接口', save.includes('spendGold')],
    ['UI·金币购买角色', ui.includes('buyChar') && ui.includes('purchasedChars')],
  ];
  let fail = 0;
  console.log('');
  for (const [name, pass] of checks) {
    if (!pass) fail++;
    console.log((pass ? '  ✓ ' : '  ✗ ') + name);
  }
  console.log(`\n线上特性校验：${checks.length - fail}/${checks.length} 通过`);
  if (fail) process.exit(1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
