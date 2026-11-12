// gen-word-docs.cjs — 生成 docs/项目文档-Word/ 系列 8 篇 docx
// 用法：node scripts/gen-word-docs.cjs
// 依赖：docx@9.7.1；内容数据在 word-docs-content.cjs；02 篇由 docs/devlog/ 周报 md 自动转换。
'use strict';

const fs = require('fs');
const path = require('path');
const { Paragraph, TextRun, PageBreak, AlignmentType } = require('docx');
const {
  p, h1, h2, h4, quote, makeDoc, writeDoc, mdToBlocks, inlineRuns,
} = require('./word-docs-lib.cjs');
const content = require('./word-docs-content.cjs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', '项目文档-Word');
const DEVLOG_DIR = path.join(ROOT, 'docs', 'devlog');

// week 周报清单（时间正序；主题取自 devlog/README.md 周期一览）
const WEEKS = [
  { file: 'week1-2026-07-14_to_2026-07-18.md', label: 'week1（2026-07-14 ~ 07-18）基础架构搭建' },
  { file: 'week2-2026-07-20_to_2026-07-25.md', label: 'week2（2026-07-20 ~ 07-25）读取工具完善' },
  { file: 'week3-2026-07-28_to_2026-07-31.md', label: 'week3（2026-07-28 ~ 07-31）写入功能开发' },
  { file: 'week4-2026-08-03_to_2026-08-04.md', label: 'week4（2026-08-03 ~ 08-04）技能生态扩展' },
  { file: 'week5-2026-08-10_to_2026-08-17.md', label: 'week5（2026-08-10 ~ 08-17）参考库验证 + 技能扩展' },
  { file: 'week6-2026-08-19_to_2026-08-21.md', label: 'week6（2026-08-19 ~ 08-21）知识库 + 工作流 + 向量检索' },
  { file: 'week7-2026-08-24.md', label: 'week7（2026-08-24）工具增强 + Bug 修复 + 交付物' },
  { file: 'week8-2026-08-25_to_2026-09-01.md', label: 'week8（2026-08-25 ~ 09-01）原理图绘制落地 + 机器审计' },
  { file: 'week8a-2026-09-02_to_2026-09-11.md', label: 'week8a（2026-09-02 ~ 09-11，补录）路由/优化算法原型验证' },
  { file: 'week9-2026-09-12_to_2026-09-14.md', label: 'week9（2026-09-12 ~ 09-14）三阶段流水线 + 库枚举修复' },
  { file: 'week10-2026-09-15_to_2026-09-22.md', label: 'week10（2026-09-15 ~ 09-22）从"能画"到"画得优雅"再到"可部署"' },
  { file: 'week11-2026-10-08_emc-audit-l1.md', label: 'week11（2026-10-08）EMC×AI 方案 L1：emc_audit 规则引擎' },
  { file: 'week12-2026-11-02_night-batch.md', label: 'week12（2026-11-02 ~ 11-03）夜间批次：审查驱动加固与性能修复' },
];

function weekHeaderParagraph(label) {
  return new Paragraph({
    heading: undefined,
    spacing: { before: 120, after: 60 },
    pageBreakBefore: true,
    children: [new TextRun({ text: label, font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' }, size: 30, bold: true, color: '000000' })],
  });
}

async function build02() {
  const children = [];

  // 周期一览表
  children.push(h1('周期一览'));
  const rows = WEEKS.map((w) => {
    const m = w.label.match(/^(week\S*)（([^）]+)）(.*)$/);
    return [m[1], m[2], m[3].trim() || '—'];
  });
  children.push(require('./word-docs-lib.cjs').makeTable(
    ['周期', '日期', '主题'], rows,
  ));
  children.push(p('附录含 2026-11-02 夜间批次计划（T1-T11 接力协议与运行记录）。日常流水另见仓库根目录 DEVLOG.md；本文档为 docs/devlog/ 周报的 Word 全量汇编。', { size: 18, color: '666666' }));

  for (const w of WEEKS) {
    const mdPath = path.join(DEVLOG_DIR, w.file);
    const md = fs.readFileSync(mdPath, 'utf-8');
    children.push(weekHeaderParagraph(w.label));
    children.push(quote(`源文件：docs/devlog/${w.file}`));
    children.push(...mdToBlocks(md, {
      mapH1: () => null, // 周 md 的一级标题（"Altium Designer MCP 服务器开发日志"）由 week 标题行替代
    }));
  }

  // 附录：夜间批次计划
  const planPath = path.join(DEVLOG_DIR, 'overnight-20261102-plan.md');
  if (fs.existsSync(planPath)) {
    const md = fs.readFileSync(planPath, 'utf-8');
    children.push(weekHeaderParagraph('附录：夜间批次计划（2026-11-02，T1-T11 接力协议）'));
    children.push(quote('源文件：docs/devlog/overnight-20261102-plan.md'));
    children.push(...mdToBlocks(md, { mapH1: () => null }));
  }

  return {
    title: 'altium-mcp 开发日志汇编',
    subtitle: '2026-07-14 ~ 2026-11-03 · week1 ~ week12 全量周报汇编',
    metas: [['日期', content.DOC_DATE], ['来源', 'docs/devlog/ 周报 md（md 为源，本篇为 Word 汇编）'], ['系列', 'docs/项目文档-Word 系列 02']],
    children,
    header: 'altium-mcp 开发日志汇编 02',
  };
}

async function main() {
  const only = process.argv[2]; // 可选：只生成某一篇，如 `node gen-word-docs.cjs 02`
  const jobs = [
    ['01', () => Promise.resolve(content.build01())],
    ['02', build02],
    ['03', () => Promise.resolve(content.build03())],
    ['04', () => Promise.resolve(content.build04())],
    ['05', () => Promise.resolve(content.build05())],
    ['06', () => Promise.resolve(content.build06())],
    ['07', () => Promise.resolve(content.build07())],
    ['08', () => Promise.resolve(content.build08())],
  ];

  const selected = only ? jobs.filter(([id]) => id === only) : jobs;
  for (const [id, build] of selected) {
    const spec = await build();
    const doc = makeDoc({
      title: spec.title,
      subtitle: spec.subtitle,
      metas: spec.metas,
      header: spec.header,
      children: spec.children,
    });
    const out = path.join(OUT_DIR, `${id}-${spec.title.replace(/^altium-mcp /, '')}.docx`);
    await writeDoc(doc, out);
    console.log(`OK ${path.relative(ROOT, out)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
