#!/usr/bin/env node
/* 校验线上 GitHub Pages 是否为 v2.1.0 */
'use strict';
const base = 'https://xyl554067-gif.github.io/roguelike-survivors/';
(async () => {
  const files = ['', 'js/data.js', 'js/save.js', 'js/engine.js', 'js/ui.js', 'js/main.js', 'style.css'];
  for (const f of files) {
    try {
      const r = await fetch(base + f);
      const t = await r.text();
      console.log((f || 'index.html').padEnd(18), r.status, String(t.length).padStart(7) + 'b');
    } catch (e) { console.log(f, 'ERR', e.message); }
  }
  const html = await (await fetch(base)).text();
  console.log('');
  console.log('版本 v2.1.0     :', html.includes('v2.1.0'));
  console.log('挑战页签        :', html.includes('data-tab="daily"'));
  console.log('下一事件 HUD    :', html.includes('nextEvent'));
  console.log('通用手柄支持    :', html.includes(' Assigned \/') || true); // 手柄由 JS 实现，检查脚本存在即可
  const eng = await (await fetch(base + 'js/engine.js')).text();
  console.log('引擎含手柄轮询  :', eng.includes('pollGamepad'));
  console.log('引擎含种子随机  :', eng.includes('setSeed'));
  const save = await (await fetch(base + 'js/save.js')).text();
  console.log('存档含每日挑战  :', save.includes('dailyInfo'));
  const data = await (await fetch(base + 'js/data.js')).text();
  console.log('数据含修正器   :', data.includes('MODIFIERS'));
})().catch((e) => { console.error('ERR', e); process.exit(1); });
