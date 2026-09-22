// stage-prod-deps.cjs — 计算生产依赖闭包并拷贝到 staging（离线、无 npm 依赖）
// 用法: node scripts/stage-prod-deps.cjs <srcRepo> <stagingDir>
const { readFileSync, existsSync, mkdirSync, cpSync, writeFileSync } = require("node:fs");
const { join, dirname } = require("node:path");

const [, , srcRepo, stagingDir] = process.argv;
if (!srcRepo || !stagingDir) {
  console.error("usage: node stage-prod-deps.cjs <srcRepo> <stagingDir>");
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(join(srcRepo, "package.json"), "utf8"));
const rootDeps = Object.keys(pkg.dependencies ?? {});
console.log("production root deps:", rootDeps.join(", "));

// BFS 依赖闭包（dependencies + optionalDependencies；peerDeps 由宿主提供也拷以防万一）
const seen = new Set();
const queue = [...rootDeps];
const hoisted = new Map(); // name -> version range actually installed（取 node_modules 顶层解析）
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  const depDir = join(srcRepo, "node_modules", ...name.split("/"));
  const pj = join(depDir, "package.json");
  if (!existsSync(pj)) {
    console.warn(`  ! ${name} not found in node_modules (skip)`);
    continue;
  }
  const meta = JSON.parse(readFileSync(pj, "utf8"));
  for (const key of ["dependencies", "optionalDependencies"]) {
    for (const d of Object.keys(meta[key] ?? {})) queue.push(d);
  }
}

const destRoot = join(stagingDir, "node_modules");
mkdirSync(destRoot, { recursive: true });
for (const name of seen) {
  const from = join(srcRepo, "node_modules", ...name.split("/"));
  if (!existsSync(from)) continue;
  const to = join(destRoot, ...name.split("/"));
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`  + ${name}`);
}
writeFileSync(join(destRoot, ".package-lock.json"), JSON.stringify({ note: "staged production closure", packages: {} }), "utf8");
console.log(`staged ${seen.size} packages -> ${destRoot}`);
