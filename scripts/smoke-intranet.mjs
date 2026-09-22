// smoke-intranet.mjs — 内网部署自检：stdio 握手 + 工具清单 + 桥接 ping
// 用法：node scripts/smoke-intranet.mjs  （在解压后的包根目录执行）
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(root, "dist", "index.js");

const proc = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
let nextId = 1;

proc.stdout.on("data", (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      /* 非 JSON 行忽略 */
    }
  }
});
proc.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

const send = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
const notify = (method, params) =>
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

// 1. initialize 握手
const init = await send("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke-intranet", version: "1.0" },
});
const serverName = init?.result?.serverInfo?.name ?? "?";
const serverVersion = init?.result?.serverInfo?.version ?? "?";
console.log(`initialize: ${serverName} v${serverVersion}`);
notify("notifications/initialized", {});

// 2. 工具清单
const tools = await send("tools/list", {});
const names = (tools?.result?.tools ?? []).map((t) => t.name);
console.log(`tools: ${names.length} 个`);
console.log("  " + names.join(", "));

// 3. 桥接 ping（需要本机 AD 可达；AD 未开会尝试拉起）
const pong = await send("tools/call", { name: "altium_ping", arguments: {} });
const text = pong?.result?.content?.[0]?.text ?? "{}";
const ok = /"success"\s*:\s*true/.test(text);
console.log(`bridge ping: ${ok ? "ok" : "DOWN"}${ok ? "" : " — " + text.slice(0, 120)}`);

proc.kill();
console.log(ok ? "\nSMOKE PASS — 部署就绪" : "\nSMOKE FAIL — 见上方输出");
process.exit(ok ? 0 : 1);
