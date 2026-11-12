// word-docs-lib.cjs — docx 生成辅助库（供 gen-word-docs.cjs 使用）
// 依赖：docx@9.7.1（node_modules）。风格沿用 scripts/gen-deliverables.cjs。
'use strict';

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, LevelFormat,
} = require('docx');
const fs = require('fs');
const path = require('path');

const FONT = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' };
const CODE_FONT = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Microsoft YaHei' };
const BLACK = '000000';
const GRAY = '666666';
const LIGHT_GRAY = 'EEEEEE';
const HEADER_SHADE = 'D9E2F3';

const border = { style: BorderStyle.SINGLE, size: 1, color: '888888' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

// ---------- 内联解析：**bold** / `code` / [text](url) ----------
function inlineRuns(text, opts = {}) {
  const runs = [];
  const size = opts.size || 22;
  const base = { font: FONT, size, color: opts.color || BLACK };
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\([^)]*\))/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    if (m[2] !== undefined) runs.push(new TextRun({ ...base, text: m[2], bold: true }));
    else if (m[4] !== undefined) runs.push(new TextRun({ ...base, text: m[4], font: CODE_FONT, size: size - 2 }));
    else if (m[6] !== undefined) runs.push(new TextRun({ ...base, text: m[6] }));
    last = re.lastIndex;
  }
  if (last < text.length) runs.push(new TextRun({ ...base, text: text.slice(last) }));
  if (runs.length === 0) runs.push(new TextRun({ ...base, text: '' }));
  return runs;
}

// ---------- 基础块 ----------
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before || 0, after: opts.after || 120 },
    alignment: opts.align || AlignmentType.LEFT,
    indent: opts.indent,
    children: inlineRuns(text, opts),
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: BLACK })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: BLACK })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: BLACK })],
  });
}
function h4(text) {
  return new Paragraph({
    spacing: { before: 160, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: '1F3864' })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40 },
    children: inlineRuns(text),
  });
}

function numItem(text, ref = 'numbers') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { before: 40, after: 40 },
    children: inlineRuns(text),
  });
}

function quote(text) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: '4472C4', space: 8 } },
    children: inlineRuns(text, { color: '404040' }),
  });
}

// 代码块：硬折行（visual width，ASCII=1 / CJK=2），每行一个段落，灰底
function visualWidth(s) {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0) > 0x2E7F ? 2 : 1;
  return w;
}
function hardWrap(line, maxWidth) {
  const out = [];
  let cur = '', curW = 0;
  for (const ch of line) {
    const w = ch.codePointAt(0) > 0x2E7F ? 2 : 1;
    if (curW + w > maxWidth) { out.push(cur); cur = ch; curW = w; }
    else { cur += ch; curW += w; }
  }
  out.push(cur);
  return out;
}
function codeBlock(code, opts = {}) {
  const width = opts.wrap || 96;
  const paras = [];
  const lines = code.replace(/\t/g, '  ').split('\n');
  const rendered = [];
  for (const raw of lines) {
    const pieces = hardWrap(raw.replace(/\s+$/, ''), width);
    for (const piece of pieces) {
      rendered.push(piece.length ? piece : ' ');
    }
  }
  rendered.forEach((piece, idx) => {
    paras.push(new Paragraph({
      spacing: { before: 0, after: 0 },
      shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
      indent: { left: 240, right: 240 },
      // keepNext 链：除末行外都与下一段绑定，整块不被分页拦腰截断
      keepNext: idx < rendered.length - 1,
      keepLines: true,
      children: [new TextRun({ text: piece, font: CODE_FONT, size: 18, color: '202020' })],
    }));
  });
  if (paras.length) {
    paras.push(new Paragraph({ spacing: { before: 0, after: 100 }, children: [] }));
  }
  return paras;
}

// 手动编号器：每个编号组新建一个实例，杜绝 Word numbering reference 跨章节续号
function numberer() {
  let n = 0;
  return (text) => new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: 720, hanging: 360 },
    children: inlineRuns(`**${++n}.** ${text}`),
  });
}

// ---------- 表格：列宽按内容 visual width 加权分配 ----------
function makeCell(content, opts = {}) {
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: inlineRuns(String(content), { size: opts.size || 18, bold: opts.bold || false }),
    })],
  });
}

function autoColWidths(headers, rows, totalDxa = 9100) {
  const n = headers.length;
  // 单元 9pt Arial 下：半角字符 ≈100 dxa（1pt=20 dxa，平均字宽≈5pt）
  const UNIT = 100;
  const minW = [];
  const weights = [];
  for (let i = 0; i < n; i++) {
    let w = visualWidth(String(headers[i])) + 2;
    let maxTok = visualWidth(String(headers[i]));
    for (const r of rows) {
      const cellText = String(r[i] ?? '');
      // 只取前 40 字符估宽，避免长文本主导
      w = Math.max(w, Math.min(visualWidth(cellText.slice(0, 40)) + 2, 60));
      // 该列最长的不可断词 token（空格分隔），保证不出现拦腰断词
      for (const tok of cellText.split(/\s+/)) {
        maxTok = Math.max(maxTok, visualWidth(tok));
      }
    }
    weights.push(Math.max(w, 6));
    // token 最小宽：大写/数字比均值宽（EMC-S020 ≈ 45pt），系数 115 + 边距 350 实测校准
    minW.push(Math.min(2900, Math.max(700, maxTok * 115 + 350)));
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  let widths = weights.map((w) => Math.max(600, Math.round((w / sum) * totalDxa)));
  // 强制最小宽：先算缺口，再按比例从宽列 shrink
  const deficit = widths.reduce((acc, wd, i) => acc + Math.max(0, minW[i] - wd), 0);
  if (deficit > 0) {
    const shrinkSum = widths.reduce((acc, wd, i) => acc + (minW[i] - wd > 0 ? 0 : wd), 0);
    if (shrinkSum > deficit) {
      widths = widths.map((wd, i) => {
        const need = Math.max(0, minW[i] - wd);
        if (need > 0) return minW[i];
        return Math.max(minW[i], wd - Math.round((wd / shrinkSum) * deficit));
      });
    } else {
      widths = widths.map((wd, i) => Math.max(wd, minW[i]));
    }
  }
  return widths;
}

function makeTable(headers, rows, colWidths, opts = {}) {
  const widths = colWidths || autoColWidths(headers, rows);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    cantSplit: true,
    tableHeader: true,
    children: headers.map((h, i) => makeCell(h, {
      width: widths[i], shade: HEADER_SHADE, bold: true,
      align: AlignmentType.CENTER, size: 18,
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    cantSplit: opts.cantSplit !== false,
    children: headers.map((_, i) => makeCell(row[i] ?? '', {
      width: widths[i], size: 18,
      align: i === 0 ? AlignmentType.LEFT : AlignmentType.LEFT,
      shade: opts.zebra && ri % 2 === 1 ? 'F7F9FC' : undefined,
    })),
  }));
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}

// ---------- Markdown → docx 块（供周报汇编用） ----------
function mdToBlocks(md, opts = {}) {
  const blocks = [];
  // CRLF 规范化：JS 正则的 . 不匹配 \r、$ 也不在 \r 前断言，
  // 带 \r 的行会让 ^(.*)$ 类模式整体失配（2026-11-12 夜间批次计划文件实测）
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let listRefSeq = 0;

  const flushTable = () => {
    // 收集以当前行开始的表格行
    const tbl = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) {
      tbl.push(lines[i]); i++;
    }
    if (tbl.length < 2) return false;
    const parseRow = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
      .split('|').map((c) => c.trim());
    const headers = parseRow(tbl[0]);
    const sep = tbl[1];
    if (!/^\s*\|[\s:|-]+\|?\s*$/.test(sep)) return false;
    const rows = tbl.slice(2).map(parseRow).map((r) => {
      while (r.length < headers.length) r.push('');
      return r.slice(0, headers.length);
    });
    blocks.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }));
    blocks.push(makeTable(headers, rows));
    blocks.push(new Paragraph({ spacing: { before: 40, after: 80 }, children: [] }));
    return true;
  };

  const flushList = () => {
    // 连续列表行（- / * / 1. / - [ ]）合并
    const items = [];
    while (i < lines.length) {
      const line = lines[i];
      const mUn = line.match(/^(\s*)[-*]\s+(.*)$/);
      const mOl = line.match(/^(\s*)\d+\.\s+(.*)$/);
      const mChk = line.match(/^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/);
      if (mChk) { items.push({ kind: 'check', text: (mChk[2] === ' ' ? '☐ ' : '☑ ') + mChk[3] }); i++; }
      else if (mUn && !/^[-*]{3,}$/.test(mUn[2] || '')) { items.push({ kind: 'un', text: mUn[2], level: Math.floor(mUn[1].length / 2) }); i++; }
      else if (mOl) { items.push({ kind: 'ol', text: mOl[2] }); i++; }
      else break;
    }
    if (!items.length) return false;
    let olSeq = 0;
    for (const it of items) {
      if (it.kind === 'un') blocks.push(bullet(it.text, Math.min(it.level || 0, 1)));
      else if (it.kind === 'check') blocks.push(bullet(it.text, 0));
      else {
        // 手动编号：避免 numbering reference 跨列表续号
        olSeq++;
        blocks.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          indent: { left: 720, hanging: 360 },
          children: inlineRuns(`**${olSeq}.** ${it.text}`),
        }));
      }
    }
    return true;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) { // 代码块
      i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // 跳过结尾 ```
      blocks.push(...codeBlock(code.join('\n')));
      continue;
    }
    if (/^\s*\|/.test(line)) { if (flushTable()) continue; }
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { // 水平线 → 细分隔
      blocks.push(new Paragraph({
        spacing: { before: 120, after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB', space: 4 } },
        children: [],
      }));
      i++; continue;
    }
    const hM = line.match(/^(#{1,4})\s+(.*)$/);
    if (hM) {
      const lv = hM[1].length;
      const text = hM[2].replace(/#+\s*$/, '');
      let mapped;
      if (lv === 1) mapped = opts.mapH1 ? opts.mapH1(text) : h2(text);
      else if (lv === 2) mapped = (opts.mapH2 ? opts.mapH2(text) : h3(text));
      else mapped = h4(text);
      if (mapped) blocks.push(mapped);
      i++; continue;
    }
    const qM = line.match(/^>\s?(.*)$/);
    if (qM) { blocks.push(quote(qM[1])); i++; continue; }
    if (flushList()) continue;
    // 普通段落（合并到空行）
    const para = [line]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^[#>`|]|^(-{3,})/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push(p(para.join(' ')));
  }
  return blocks;
}

// ---------- 文档组装 ----------
const numberingConfig = {
  config: [
    { reference: 'bullets',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
      ] },
    { reference: 'numbers',
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'numbers2',
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'numbers3',
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ],
};

const docStyles = {
  default: { document: { run: { font: FONT, size: 22, color: BLACK } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 32, bold: true, font: FONT, color: BLACK },
      paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 28, bold: true, font: FONT, color: BLACK },
      paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 24, bold: true, font: FONT, color: BLACK },
      paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
  ],
};

function coverBlock({ title, subtitle, metas }) {
  const children = [];
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 3200, after: 300 },
    children: [new TextRun({ text: title, font: FONT, size: 52, bold: true, color: BLACK })],
  }));
  if (subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [new TextRun({ text: subtitle, font: FONT, size: 26, color: GRAY })],
    }));
  }
  for (const [k, v] of metas || []) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${k}：`, font: FONT, size: 22, bold: true, color: GRAY }),
        new TextRun({ text: v, font: FONT, size: 22, color: GRAY }),
      ],
    }));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function makeDoc({ title, subtitle, metas, header, children }) {
  return new Document({
    styles: docStyles,
    numbering: numberingConfig,
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: header || title, font: FONT, size: 18, color: GRAY })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '第 ', font: FONT, size: 18, color: GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: GRAY }),
              new TextRun({ text: ' 页 / 共 ', font: FONT, size: 18, color: GRAY }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: GRAY }),
              new TextRun({ text: ' 页', font: FONT, size: 18, color: GRAY }),
            ],
          })],
        }),
      },
      children: [
        ...coverBlock({ title, subtitle, metas }),
        ...children,
      ],
    }],
  });
}

async function writeDoc(doc, outPath) {
  const buf = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return outPath;
}

module.exports = {
  FONT, CODE_FONT, BLACK, GRAY,
  inlineRuns, p, h1, h2, h3, h4, bullet, numItem, quote, codeBlock, numberer,
  makeTable, makeDoc, writeDoc, mdToBlocks, coverBlock,
  AlignmentType,
};
