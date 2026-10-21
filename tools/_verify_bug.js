#!/usr/bin/env node
/* =====================================================================
   验证 leveluptest 的有效性：逐个还原 bug，确认断言能够捕获
   在同一进程内完成（沙箱禁止子进程 spawn）
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const uiPath = path.join(ROOT, 'js', 'ui.js');
const cssPath = path.join(ROOT, 'style.css');
const uiOrig = fs.readFileSync(uiPath, 'utf8');
const cssOrig = fs.readFileSync(cssPath, 'utf8');

/** 捕获 console 输出 */
function capture(fn) {
  const lines = [];
  const origLog = console.log;
  console.log = (...a) => lines.push(a.join(' ').replace(/\x1b\[[0-9;]*m/g, ''));
  try { fn(); } finally { console.log = origLog; }
  return lines;
}

function analyze(lines) {
  const fails = lines.filter((l) => l.includes('✗'));
  return { fails, passed: lines.some((l) => l.includes('升级卡片全部通过')) };
}

const BUGS = [
  {
    label: 'bug#1 openLevelUp 未切换 game.state（每帧重掷卡牌）',
    file: uiPath, orig: uiOrig,
    buggy: uiOrig.replace(
      "      if (g.state === 'levelup' && this.el.levelup && !this.el.levelup.classList.contains('hidden')) return;\n      g.state = 'levelup';\n", ''),
  },
  {
    label: 'bug#2 renderCards 每次重建 DOM（CSS 动画反复重启 → 卡片停在 opacity:0）',
    file: uiPath, orig: uiOrig,
    buggy: uiOrig.replace(
      "      if (this._cardsHtml === html) return;\n      this._cardsHtml = html;\n", ''),
  },
];

console.log('\n\x1b[1m验证测试有效性\x1b[0m\n');
let allOk = true;

try {
  for (const b of BUGS) {
    // 确认替换真的生效
    if (b.buggy === b.orig) { console.log(`  \x1b[31m✗ ${b.label} → 替换失败，跳过\x1b[0m`); allOk = false; continue; }
    fs.writeFileSync(b.file, b.buggy, 'utf8');
    delete require.cache[require.resolve('./leveluptest.js')];
    const mod = require('./leveluptest.js');
    const lines = capture(() => mod.runAssertions());
    fs.writeFileSync(b.file, b.orig, 'utf8');
    const { fails } = analyze(lines);
    if (fails.length) {
      console.log(`  \x1b[32m✓ ${b.label}\x1b[0m`);
      console.log(`      → 捕获 ${fails.length} 项失败:`);
      fails.forEach((l) => console.log('        ' + l.trim()));
    } else {
      console.log(`  \x1b[31m✗ ${b.label} → 未捕获\x1b[0m`);
      allOk = false;
    }
  }

  // CSS bug 属于渲染层，JS 断言无法覆盖，单独做静态检查
  const cssFixed = cssOrig.includes('animation: cardIn .22s ease both;');
  console.log(`  ${cssFixed ? '\x1b[32m✓' : '\x1b[31m✗'} bug#3 CSS fill-mode 已改为 both（JS 测试无法覆盖，需真机确认）\x1b[0m`);
  if (!cssFixed) allOk = false;

  // 恢复后最终确认
  delete require.cache[require.resolve('./leveluptest.js')];
  const mod2 = require('./leveluptest.js');
  const lines2 = capture(() => mod2.runAssertions());
  const r2 = analyze(lines2);
  const okAll = r2.fails.length === 0;
  console.log(`\n\x1b[1m最终确认\x1b[0m`);
  console.log(`  ${okAll ? '\x1b[32m✓ 全部通过\x1b[0m' : '\x1b[31m✗ 仍有 ' + r2.fails.length + ' 项失败\x1b[0m'}`);
  if (!okAll) { allOk = false; r2.fails.forEach((l) => console.log('    ' + l.trim())); }

  console.log('\n' + (allOk
    ? '\x1b[32m\x1b[1m  测试有效性验证通过 ✅\x1b[0m\n'
    : '\x1b[31m\x1b[1m  测试有效性验证未通过 ❌\x1b[0m\n'));
  process.exitCode = allOk ? 0 : 1;
} finally {
  fs.writeFileSync(uiPath, uiOrig, 'utf8');
  fs.writeFileSync(cssPath, cssOrig, 'utf8');
}
