#!/usr/bin/env node
// tools/dsh-llm.mjs
// 通过 DSH Model Gateway (http://127.0.0.1:3080/v1) 调用 DSH 中已注册的模型。
// 前置：DSH Model Gateway 插件已安装并运行（端口 3080 在监听）。
// 用法：
//   node tools/dsh-llm.mjs --models           # 列出可用模型
//   node tools/dsh-llm.mjs "你好"              # 默认模型对话
//   node tools/dsh-llm.mjs --model <id> "..."  # 指定模型
// 鉴权：未创建网关密钥前，Authorization 可填任意值或留空。

const GW = process.env.DSH_GW_URL || 'http://127.0.0.1:3080/v1';
const API_KEY = process.env.DSH_GW_KEY || 'sk-dshgw-local';

function parseArgs(argv) {
  const args = {
    model: process.env.DSH_GW_MODEL || 'codebuddy_deepseek-v4.1-flash',
    messages: [],
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') args.list = true;
    else if (a === '--model') args.model = argv[++i];
    else args.messages.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const r = await fetch(`${GW}/models`);
    console.log(await r.text());
    return;
  }

  const prompt = args.messages.join(' ').trim() || '你好';
  const r = await fetch(`${GW}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    console.error(`网关返回 ${r.status}: ${t}`);
    process.exit(1);
  }
  const data = await r.json();
  console.log(data?.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
