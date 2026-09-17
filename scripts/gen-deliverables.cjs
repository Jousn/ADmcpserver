const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, LevelFormat,
  TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'docs', '交付物');

const FONT = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' };
const BLACK = '000000';
const GRAY = '666666';
const LIGHT_GRAY = 'EEEEEE';

const border = { style: BorderStyle.SINGLE, size: 1, color: BLACK };
const borders = { top: border, bottom: border, left: border, right: border };

const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before || 0, after: opts.after || 120 },
    alignment: opts.align || AlignmentType.LEFT,
    indent: opts.indent,
    children: [new TextRun({
      text,
      font: FONT,
      size: opts.size || 22,
      bold: opts.bold || false,
      color: opts.color || BLACK,
    })]
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: BLACK })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: BLACK })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: BLACK })]
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: FONT, size: 22, color: BLACK })]
  });
}

function numItem(text, ref = 'numbers') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: FONT, size: 22, color: BLACK })]
  });
}

function makeCell(text, opts = {}) {
  return new TableCell({
    borders,
    width: { size: opts.width || 2340, type: WidthType.DXA },
    shading: opts.shade ? { fill: LIGHT_GRAY, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text: String(text),
        font: FONT,
        size: opts.size || 20,
        bold: opts.bold || false,
        color: BLACK,
      })]
    })]
  });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    cantSplit: true,
    children: headers.map((h, i) => makeCell(h, {
      width: colWidths[i],
      shade: true,
      bold: true,
      align: AlignmentType.CENTER,
      size: 20,
    }))
  });
  const dataRows = rows.map(row => new TableRow({
    cantSplit: true,
    children: row.map((cell, i) => makeCell(cell, {
      width: colWidths[i],
      size: 20,
      align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
    }))
  }));
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

const docStyles = {
  default: {
    document: {
      run: { font: FONT, size: 22, color: BLACK }
    }
  },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 32, bold: true, font: FONT, color: BLACK },
      paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0, keepNext: false, keepLines: false } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 28, bold: true, font: FONT, color: BLACK },
      paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1, keepNext: false, keepLines: false } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 24, bold: true, font: FONT, color: BLACK },
      paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2, keepNext: false, keepLines: false } },
  ]
};

const numbering = {
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
  ]
};

function pageProps() {
  return {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
    }
  };
}

function makeHeader(title) {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: title, font: FONT, size: 18, color: GRAY })]
    })]
  });
}

function makeFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Page ', font: FONT, size: 18, color: GRAY }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: GRAY }),
        new TextRun({ text: ' / ', font: FONT, size: 18, color: GRAY }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: GRAY }),
      ]
    })]
  });
}

// =================== JULY SUMMARY ===================
function buildJulySummary() {
  const children = [];

  // Cover
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 3600, after: 400 },
    children: [new TextRun({ text: '7月开发总结', font: FONT, size: 48, bold: true, color: BLACK })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text: 'Altium Designer AI 插件项目', font: FONT, size: 32, color: BLACK })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 100 },
    children: [new TextRun({ text: '项目名称：altium-mcp', font: FONT, size: 24, color: GRAY })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [new TextRun({ text: '报告周期：2026年7月14日 - 2026年8月9日', font: FONT, size: 24, color: GRAY })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [new TextRun({ text: '提交日期：2026年8月9日', font: FONT, size: 24, color: GRAY })]
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // TOC placeholder
  children.push(h1('目录'));
  children.push(p('一、项目概述', { size: 22 }));
  children.push(p('二、开发任务概览', { size: 22 }));
  children.push(p('三、AI 应用开发（70%）— 核心模块', { size: 22 }));
  children.push(p('四、opencode 开发（20%）— 配套能力', { size: 22 }));
  children.push(p('五、项目里程碑', { size: 22 }));
  children.push(p('六、关键指标统计', { size: 22 }));
  children.push(p('七、问题与风险', { size: 22 }));
  children.push(p('八、总结', { size: 22 }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 1. Project Overview
  children.push(h1('一、项目概述'));
  children.push(p('本项目旨在开发一款 Altium Designer AI 插件，通过 MCP（Model Context Protocol）协议将 Altium Designer 的原理图设计、PCB 布局布线、器件选型等能力暴露给 AI 大模型，实现 AI 辅助电子设计自动化。'));
  children.push(p('项目采用 TypeScript + DelphiScript 双层架构：TypeScript 层负责 MCP 协议通信和工具注册，DelphiScript 层通过 Altium 的脚本引擎直接操作设计文件。两层通过文件系统桥接进行异步通信。'));
  children.push(p('本月开发周期覆盖 2026年7月14日至8月4日，共4个开发周，完成从基础架构搭建到技能生态扩展的完整开发链路。', { after: 200 }));

  // 2. Task Overview
  children.push(h1('二、开发任务概览'));
  children.push(p('本月开发任务分为两大板块，权重分配如下：', { after: 120 }));
  children.push(makeTable(
    ['板块', '权重', '主要内容', '状态'],
    [
      ['AI 应用开发', '70%', 'MCP 服务器、原理图/PCB 操作、Altium 插件', '已完成阶段目标'],
      ['opencode 开发', '20%', '提示词、知识库、Skills、开发文档', '已完成阶段目标'],
      ['全程贯穿', '10%', '测试验证、Bug 修复、文档维护', '持续推进'],
    ],
    [2000, 1000, 5000, 2000]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));

  // 3. AI Application Development
  children.push(h1('三、AI 应用开发（70%）— 核心模块'));

  children.push(h2('3.1 MCP 服务器架构'));
  children.push(p('搭建了完整的 MCP 服务器架构，包含以下核心组件：'));
  children.push(bullet('TypeScript 前端：工具注册、参数校验（Zod schema）、MCP 协议通信'));
  children.push(bullet('DelphiScript 后端：Altium API 调用、设计文件操作、JSON 数据交换'));
  children.push(bullet('文件系统桥接：通过 request.json / response.json 实现异步通信'));
  children.push(bullet('AltiumBridge 类：管理脚本执行、超时控制、错误处理'));

  children.push(h2('3.2 原理图设计 / 电路图设计'));
  children.push(p('实现了原理图读取和编辑的完整工具链：'));
  children.push(makeTable(
    ['工具', '功能', '周次'],
    [
      ['get_schematic_data', '读取原理图元件、引脚、网络', 'Week 2'],
      ['edit_schematic', '编辑原理图（14种操作）', 'Week 3'],
      ['get_library_symbol_reference', '查询库符号引用', 'Week 2'],
      ['search_library_symbol', '搜索库中的符号', 'Week 2'],
      ['import_library_components', '导入库元件到内存目录', 'Week 3'],
    ],
    [3000, 4500, 1500]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(p('edit_schematic 工具支持的操作包括：set_component_transform, set_component_parameters, add_text, add_net_label, add_wire, add_bus, add_bus_entry, place_power_port, place_gnd, place_vcc, add_port, add_junction, add_line, add_rectangle, get_component_info。'));

  children.push(h2('3.3 PCB 布局 / 自动布线优化'));
  children.push(p('实现了 PCB 读取和编辑的完整工具链：'));
  children.push(makeTable(
    ['工具', '功能', '周次'],
    [
      ['get_all_designators', '获取所有元件位号', 'Week 2'],
      ['get_all_nets', '获取所有网络', 'Week 2'],
      ['get_component_pins', '获取元件引脚详情', 'Week 2'],
      ['get_pcb_layers', '获取 PCB 层信息', 'Week 2'],
      ['get_pcb_layer_stackup', '获取层叠结构', 'Week 2'],
      ['get_pcb_rules', '获取设计规则', 'Week 2'],
      ['pcb_board_info', '获取板框信息', 'Week 2'],
      ['set_component_position', '设置元件位置', 'Week 3'],
      ['move_components', '批量移动元件', 'Week 3'],
      ['pcb_edit', 'PCB 基础编辑（8种操作）', 'Week 3'],
      ['create_net_class', '创建网络类', 'Week 3'],
      ['set_pcb_layer_visibility', '设置层可见性', 'Week 3'],
    ],
    [3000, 4500, 1500]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(p('pcb_edit 工具支持的操作包括：add_track, add_pad, add_via, add_fill, add_arc, add_text, delete_objects, select_objects。'));

  children.push(h2('3.4 器件选型 / 器件布局 / 物料清单'));
  children.push(bullet('器件选型：通过 knowledge-base/component-selection 提供运放、电容、MOSFET、连接器选型指南'));
  children.push(bullet('器件布局：通过 layout_duplicator 实现模块化布局复制，支持 PCB 模块级复用'));
  children.push(bullet('物料清单：通过 generate_report 工具生成 BOM 报告（WorkspaceManager:GenerateReport Index=5）'));

  children.push(h2('3.5 Altium Designer AI 插件开发'));
  children.push(p('插件采用 MCP 架构，无需在 Altium 内部运行 AI 模型，而是通过外部 MCP 服务器与 Altium 通信。核心优势：'));
  children.push(bullet('AI 模型可替换：支持任何兼容 MCP 协议的 AI 客户端（Claude Desktop, TRAE, OpenCode）'));
  children.push(bullet('非侵入式：不修改 Altium 安装文件，通过脚本引擎交互'));
  children.push(bullet('安全可控：写入操作需要用户确认，读取操作自动执行'));
  children.push(bullet('跨平台：TypeScript 层可运行在任何支持 Node.js 的环境'));

  children.push(h2('3.6 MCP 服务器优化'));
  children.push(p('本月完成的主要优化：'));
  children.push(numItem('工具描述精简：从冗长描述优化为结构化参数说明，减少 token 消耗'));
  children.push(numItem('MCP 指令优化：精简 system prompt，聚焦核心调用规则'));
  children.push(numItem('运行时记忆协议：实现 short-term / long-term 记忆管理，支持跨会话状态保持'));
  children.push(numItem('Zod schema 完善：确保所有工具参数有完整类型定义和描述'));
  children.push(numItem('MCP 缓存同步：工具描述缓存 JSON 文件与 TypeScript 定义保持一致'));

  // 4. opencode Development
  children.push(h1('四、opencode 开发（20%）— 配套能力'));

  children.push(h2('4.1 电路设计提示词 / 知识库'));
  children.push(p('建立了分场景、分阶段的提示词体系：'));
  children.push(makeTable(
    ['文件', '内容', '周次'],
    [
      ['00-优化方案总览', '提示词优化整体方案', 'Week 3'],
      ['01-精简工具描述', '工具描述精简策略', 'Week 3'],
      ['02-精简MCP指令', 'System prompt 精简', 'Week 3'],
      ['03-运行时记忆协议', '记忆管理规则', 'Week 3'],
      ['04-分场景提示词', '工具导向场景提示词', 'Week 4'],
      ['05-设计阶段提示词', '设计阶段场景提示词（F-J阶段）', 'Week 4'],
    ],
    [3000, 4500, 1500]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(p('知识库建设涵盖电源设计（29个文件），为电路设计提供参考依据。'));

  children.push(h2('4.2 Skills 开发'));
  children.push(p('本月开发了10个初始 Skill，覆盖电路设计各环节：'));
  children.push(makeTable(
    ['Skill', '功能', '周次'],
    [
      ['bom-analyzer', 'BOM 分析与优化', 'Week 4'],
      ['circuit-topology-advisor', '电路拓扑设计建议', 'Week 4'],
      ['decoupling-strategy', '去耦电容策略', 'Week 4'],
      ['design-doc-generator', '设计文档生成', 'Week 4'],
      ['design-review-advisor', '设计审查建议', 'Week 4'],
      ['design-rule-deriver', '设计规则推导', 'Week 4'],
      ['grounding-strategy', '接地策略', 'Week 4'],
      ['layout-strategy-advisor', '布局策略建议', 'Week 4'],
      ['power-supply-designer', '电源设计', 'Week 4'],
      ['thermal-design-advisor', '热设计建议', 'Week 4'],
    ],
    [3500, 4000, 1500]
  ));

  children.push(h2('4.3 开发日志与文档'));
  children.push(p('完成了完整的开发文档体系：'));
  children.push(bullet('开发日志：4个周报（week1-week4），记录每日开发内容和问题解决'));
  children.push(bullet('API 文档：altium-api-reference-scripts.md, ts-pas-command-comparison.md'));
  children.push(bullet('架构文档：code-structure.md, MCP与AD插件架构规划.md'));
  children.push(bullet('使用指南：opencode-custom-agent-guide.md, opencode-deployment-guide.md'));
  children.push(bullet('开发指南：altium-plugin-development-guide.md, memory-persistence-guide.md'));
  children.push(bullet('项目说明书：3个阶段文档（全局架构、模块依赖、业务流程）'));

  // 5. Milestones
  children.push(h1('五、项目里程碑'));
  children.push(makeTable(
    ['日期', '里程碑', '工具数', '主要成果'],
    [
      ['7/14-7/18', '基础架构搭建', '8', 'MCP 服务器框架、桥接通信、基础工具'],
      ['7/20-7/25', '读取工具完善', '15', '原理图/PCB 读取、库查询、元件信息'],
      ['7/28-7/31', '写入功能开发', '22', '原理图编辑、PCB 编辑、元件操作'],
      ['8/3-8/4', '技能生态扩展', '32', '10个 Skill、知识库框架、文档体系'],
    ],
    [1800, 2500, 1200, 3500]
  ));

  // 6. Key Metrics
  children.push(h1('六、关键指标统计'));
  children.push(makeTable(
    ['指标', '数值', '说明'],
    [
      ['MCP 工具总数', '32', '覆盖读取、写入、库管理、报告生成'],
      ['DelphiScript 文件', '7', 'Altium_API, pcb_utils, schematic_edit 等'],
      ['TypeScript 文件', '15+', 'index.ts, toolDefinitions.ts, tools/*'],
      ['Skill 数量', '10', '覆盖电路设计全流程'],
      ['知识库文件', '29', '电源设计模块'],
      ['开发日志', '4 篇', '周报形式，记录每日开发'],
      ['文档总数', '15+', 'API文档、使用指南、架构说明'],
      ['代码行数', '~15,000', 'TypeScript + DelphiScript'],
      ['Bug 修复', '0', '本阶段未发现严重 Bug'],
    ],
    [2500, 1500, 5000]
  ));

  // 7. Issues and Risks
  children.push(h1('七、问题与风险'));
  children.push(h3('已识别问题'));
  children.push(numItem('DelphiScript COM 接口的属性访问需要先赋值给 String 变量，否则会触发 EVariantTypeCastError'));
  children.push(numItem('中文 Windows 区域设置中小数分隔符为逗号，影响浮点解析'));
  children.push(numItem('MCP 工具描述缓存 JSON 文件需要手动同步，不能自动更新'));
  children.push(numItem('ShowMessage 模态对话框会阻塞 MCP 桥接执行'));
  children.push(h3('风险项'));
  children.push(bullet('DelphiScript 安全沙箱限制：部分 VCL 方法不可用（如 TStringList.SaveToFile）'));
  children.push(bullet('Altium 版本兼容性：不同版本的 API 接口可能存在差异'));
  children.push(bullet('脚本崩溃后状态污染：ScriptingSystem.DLL 可能保留损坏状态'));

  // 8. Summary
  children.push(h1('八、总结'));
  children.push(p('本月完成了 Altium Designer AI 插件的核心开发，从零搭建了完整的 MCP 服务器架构，实现了 32 个工具覆盖原理图和 PCB 的读取与编辑操作。同时建立了 10 个 Skill 的技能生态和配套文档体系。'));
  children.push(p('项目已具备 AI 辅助电子设计的基本能力，可进入测试验证和功能增强阶段。下月将重点关注工具测试、Bug 修复、知识库扩展和实际设计流程验证。'));

  return children;
}

// =================== AUGUST PLAN ===================
function buildAugustPlan() {
  const children = [];

  // Cover
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 3600, after: 400 },
    children: [new TextRun({ text: '8月开发规划', font: FONT, size: 48, bold: true, color: BLACK })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text: 'Altium Designer AI 插件项目', font: FONT, size: 32, color: BLACK })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 100 },
    children: [new TextRun({ text: '项目名称：altium-mcp', font: FONT, size: 24, color: GRAY })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [new TextRun({ text: '规划周期：2026年8月10日 - 2026年8月25日', font: FONT, size: 24, color: GRAY })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [new TextRun({ text: '提交日期：2026年8月25日', font: FONT, size: 24, color: GRAY })]
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // TOC
  children.push(h1('目录'));
  children.push(p('一、当前项目状态', { size: 22 }));
  children.push(p('二、开发目标与任务分配', { size: 22 }));
  children.push(p('三、AI 应用开发（70%）— 核心模块', { size: 22 }));
  children.push(p('四、opencode 开发（20%）— 配套能力', { size: 22 }));
  children.push(p('五、开发时间线', { size: 22 }));
  children.push(p('六、交付物清单', { size: 22 }));
  children.push(p('七、风险评估与应对', { size: 22 }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 1. Current Status
  children.push(h1('一、当前项目状态'));
  children.push(p('截至 2026年8月9日，项目状态如下：'));
  children.push(makeTable(
    ['指标', '7月底状态', '8月目标', '当前进度'],
    [
      ['MCP 工具总数', '32', '42+', '42（已完成）'],
      ['Skill 数量', '10', '12', '12（已完成）'],
      ['知识库文件', '29', '60+', '60（已完成）'],
      ['Bug 修复', '0', '全部修复', '已修复 20+'],
      ['测试覆盖', '0%', '100%', '约 60%'],
      ['文档数', '15', '20+', '20+（已完成）'],
    ],
    [2000, 1800, 1800, 3400]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(p('7月完成的基础工作为8月的优化和测试奠定了基础。8月重点转向功能增强、测试验证和知识库建设。'));

  // 2. Task Allocation
  children.push(h1('二、开发目标与任务分配'));
  children.push(p('8月开发任务延续7月的板块划分，权重保持一致：'));
  children.push(makeTable(
    ['板块', '权重', '8月重点', '截止日期'],
    [
      ['AI 应用开发', '70%', '工具增强、Bug 修复、测试验证', '8月25日'],
      ['opencode 开发', '20%', '知识库扩展、Skill 优化、工作流协议', '8月25日'],
      ['全程贯穿', '10%', '文档更新、开发日志、交付物整理', '8月25日'],
    ],
    [2000, 1000, 5000, 2000]
  ));

  // 3. AI Application Development
  children.push(h1('三、AI 应用开发（70%）— 核心模块'));

  children.push(h2('3.1 原理图设计 / 电路图设计'));
  children.push(h3('已完成的增强'));
  children.push(makeTable(
    ['功能', '状态', '说明'],
    [
      ['get_component_info', '已完成', '查询元件完整信息（位号、注释、描述、参数、引脚）'],
      ['add_rectangle', '已修复', '修复 LineWidth 类型错误（枚举值替代坐标值）'],
      ['place_component', '已修复', '移除空壳创建，返回明确错误提示'],
      ['SchEdit 变量声明', '已修复', '修复 EVariantTypeCastError（COM 属性需先赋值给 String 变量）'],
    ],
    [3000, 1500, 4800]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(h3('待完成项'));
  children.push(bullet('原理图网络号编辑：给已有导线分配网络、修改网络标签文本'));
  children.push(bullet('原理图元件批量操作：批量修改参数、批量移动'));

  children.push(h2('3.2 PCB 布局 / 自动布线优化'));
  children.push(h3('已完成的增强'));
  children.push(makeTable(
    ['功能', '状态', '说明'],
    [
      ['add_region', '已完成', '创建铜区域，支持自定义轮廓点、层、网络'],
      ['add_polygon_pour', '已完成', '创建多边形覆铜，支持网格、线宽、填充样式'],
      ['modify_track', '已修复', '修改走线宽度/层/网络，支持选中对象过滤'],
      ['modify_pad', '已完成', '修改焊盘尺寸/孔径/层'],
      ['modify_via', '已完成', '修改过孔尺寸/孔径/网络'],
      ['modify_text', '已完成', '修改文本内容/高度/层/旋转'],
      ['move_to_layer', '已完成', '将选中对象移动到目标层'],
      ['assign_net', '已完成', '给选中对象分配网络'],
      ['rebuild_polygons', '已完成', '重建所有覆铜'],
      ['get_3d_bodies', '已修复', '查询元件 3D 模型体信息'],
      ['pcb_polygon_info', '已修复', '覆铜详细属性（MinTrack 替代 MinTrackWidth）'],
      ['pcb_board_info', '已修复', '板框信息（IPCB_LayerStack_V7 替代 MasterLayerStack）'],
    ],
    [3000, 1500, 4800]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(h3('待完成项'));
  children.push(bullet('PCB 网络重命名功能'));
  children.push(bullet('assign_net 支持 polygon 和 region 类型'));
  children.push(bullet('自动布线优化（基于设计规则的走线宽度建议）'));

  children.push(h2('3.3 器件选型 / 器件布局 / 物料清单'));
  children.push(p('已实现的功能：'));
  children.push(bullet('器件选型：通过向量知识库（TF-IDF）支持语义搜索，覆盖运放、电容、MOSFET 等'));
  children.push(bullet('器件布局：layout_duplicator 支持模块化布局复制，含 PCB 和原理图模块复用'));
  children.push(bullet('物料清单：generate_report 支持 7 种报告格式（BOM、网络表、元件交叉引用等）'));
  children.push(p('待完成项：'));
  children.push(bullet('BOM 自动分析（价格、交期、替代料）'));
  children.push(bullet('器件布局合规性检查（基于 design-rules 知识库）'));

  children.push(h2('3.4 MCP 服务器优化'));
  children.push(h3('已完成的优化'));
  children.push(numItem('pcb_edit 工具增强：从 8 个操作扩展到 17 个操作', 'numbers'));
  children.push(numItem('pcb_component 工具增强：从 4 个操作扩展到 11 个操作', 'numbers'));
  children.push(numItem('get_component_pins 增强：返回 30+ 焊盘属性（三层尺寸/形状、孔信息、阻焊、测试点等）', 'numbers'));
  children.push(numItem('pcb_drc 增强：返回违规规则名称和类型', 'numbers'));
  children.push(numItem('pcb_board_info 增强：返回 10 种对象计数和轮廓点列表', 'numbers'));
  children.push(numItem('pcb_polygon_info 增强：返回完整覆铜属性和顶点列表', 'numbers'));
  children.push(numItem('pcb_net_info 增强：返回网络对象列表和连接数', 'numbers'));
  children.push(numItem('selected_only 参数：modify_* 操作默认只修改选中对象', 'numbers'));
  children.push(numItem('向量知识库系统：TF-IDF 索引 + 4 维评分搜索', 'numbers'));
  children.push(numItem('MCP 工作流协议：5 个设计阶段的工具调用规则', 'numbers'));

  children.push(h3('Bug 修复清单（8月）'));
  children.push(makeTable(
    ['编号', 'Bug 描述', '严重度', '状态'],
    [
      ['B01', 'set_component_position 单位双重转换', '严重', '已修复'],
      ['B02', 'pcb_edit Zod schema 不完整', '严重', '已修复'],
      ['B03', 'SchEditSetComponentTransform 类型溢出', '严重', '已修复'],
      ['B04', '浮点解析未处理逗号小数点', '中等', '已修复'],
      ['B05', 'set_pcb_layer_visibility 排他显示', '中等', '已修复'],
      ['B06', 'LayerToString 函数名错误', '低', '已修复'],
      ['B07', 'edit_schematic enum 缺少 action', '中等', '已修复'],
      ['B08', 'search_library_symbol 弹出文件对话框', '严重', '已修复'],
      ['B09', 'get_library_symbol_reference 编译错误', '中等', '已修复'],
      ['B10', 'ShowMessage 弹窗阻塞 MCP 桥接', '严重', '已修复'],
      ['B11', 'SchLibIterator_Create 编译错误', '低', '已修复'],
      ['B12', 'add_rectangle LineWidth 类型错误（损坏文件）', '严重', '已修复'],
      ['B13', 'place_component 空壳元件创建', '严重', '已修复'],
      ['B14', 'modify_track selected_only 默认值反转', '严重', '已修复'],
      ['B15', 'get_3d_bodies 不存在的属性调用', '中等', '已修复'],
      ['B16', 'pcb_polygon_info MinTrackWidth 属性名错误', '低', '已修复'],
      ['B17', 'pcb_board_info LayerStack 类型错误', '中等', '已修复'],
      ['B18', 'add_region SetState_Outline 方法不存在', '中等', '已修复'],
      ['B19', 'get_component_info 多个属性访问错误', '严重', '已修复'],
      ['B20', 'get_component_info eComponent 常量名错误', '低', '已修复'],
    ],
    [800, 4500, 1200, 1200]
  ));

  // 4. opencode Development
  children.push(h1('四、opencode 开发（20%）— 配套能力'));

  children.push(h2('4.1 电路设计提示词 / 知识库'));
  children.push(p('已完成的提示词和知识库建设：'));
  children.push(makeTable(
    ['类别', '内容', '状态'],
    [
      ['设计阶段提示词', '5 个阶段（F-J）的场景化提示词', '已完成'],
      ['MCP 工作流协议', '9 章节完整调用规则', '已完成'],
      ['经典电路知识库', '12 模块 + 1 审查清单', '已完成'],
      ['设计规则知识库', '5 模块（去耦、接地、走线、差分、EMC）', '已完成'],
      ['元器件选型知识库', '4 模块（运放、电容、MOSFET、连接器）', '已完成'],
      ['DRC 规则模板库', '4 模块（高速、模拟、电源、混合信号）', '已完成'],
      ['向量检索系统', 'TF-IDF 索引 + 4 维评分搜索', '已完成'],
    ],
    [2500, 5000, 2000]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(p('知识库索引统计：60 个文件，714 个分块，25,821 词汇，索引大小 3 MB。'));

  children.push(h2('4.2 Skills 开发'));
  children.push(p('Skill 体系从 10 个精简优化到 12 个，消除功能重叠：'));
  children.push(makeTable(
    ['Skill', '功能', '变更'],
    [
      ['power-supply-designer', '电源设计（LDO/Buck/Boost）', '新增'],
      ['mcu-minimum-system', 'MCU 最小系统设计', '新增'],
      ['decoupling-strategy', '去耦电容策略', '新增'],
      ['grounding-strategy', '接地策略', '新增'],
      ['thermal-design-advisor', '热设计', '新增'],
      ['circuit-topology-advisor', '电路拓扑设计+选型', '合并（含 component-selector）'],
      ['design-review-advisor', '设计审查（SCH+PCB）', '合并（含 schematic-auditor）'],
      ['design-rule-deriver', '设计规则推导', '合并（含 signal-integrity-advisor）'],
      ['bom-analyzer', 'BOM 分析', '保留'],
      ['design-doc-generator', '设计文档生成', '保留'],
      ['layout-strategy-advisor', '布局策略建议', '保留'],
      ['signal-integrity-advisor', '信号完整性分析', '已合并入 design-rule-deriver'],
    ],
    [3500, 3800, 2200]
  ));

  children.push(h2('4.3 开发日志与文档'));
  children.push(p('8月新增/更新的文档：'));
  children.push(bullet('开发日志：week5、week6、week7（3 篇周报）'));
  children.push(bullet('MCP 可扩展操作列表：5 大类 28 项可扩展功能'));
  children.push(bullet('MCP 工作流协议：完整的工具调用规则和调用矩阵'));
  children.push(bullet('MCP 工具测试提示词：12 大类 108 条测试用例'));
  children.push(bullet('edit-schematic-progress：原理图编辑功能进度'));
  children.push(bullet('7月开发总结 + 8月开发规划：交付物文档'));

  // 5. Timeline
  children.push(h1('五、开发时间线'));
  children.push(makeTable(
    ['时间', '任务', '交付物', '状态'],
    [
      ['8/10-8/17', '参考库验证 + Skill 扩展 + 知识库建设', 'week5 日志、5个新 Skill', '已完成'],
      ['8/19-8/21', 'Skill 验证 + 写入函数重写 + 知识库 + 向量检索', 'week6 日志、向量索引', '已完成'],
      ['8/24', 'MCP 工具增强 + Bug 修复（20个）', 'week7 日志、增强工具', '已完成'],
      ['8/25', '交付物整理 + 开发日志更新', '7月总结、8月规划', '进行中'],
    ],
    [1800, 3500, 2500, 1700]
  ));

  // 6. Deliverables
  children.push(h1('六、交付物清单'));
  children.push(makeTable(
    ['序号', '交付物', '格式', '位置'],
    [
      ['1', '7月开发总结', 'Word', 'docs/交付物/'],
      ['2', '8月开发规划', 'Word', 'docs/交付物/'],
      ['3', '开发日志 week5-week7', 'Markdown', 'docs/devlog/'],
      ['4', 'MCP 工具测试提示词', 'Markdown', 'docs/MCP工具测试提示词.md'],
      ['5', 'MCP 工作流协议', 'Markdown', 'docs/MCP工作流协议.md'],
      ['6', 'MCP 可扩展操作列表', 'Markdown', 'docs/MCP可扩展操作列表.md'],
      ['7', '设计阶段提示词', 'Markdown', 'docs/prompt/05-设计阶段提示词.md'],
      ['8', 'Skill 文件（12个）', 'Markdown', 'docs/prompt/skills/'],
      ['9', '知识库（60个文件）', 'Markdown', 'knowledge-base/'],
      ['10', '向量索引', 'JSON', 'knowledge-base/kb-index.json'],
    ],
    [600, 3500, 1200, 3700]
  ));

  // 7. Risk Assessment
  children.push(h1('七、风险评估与应对'));
  children.push(makeTable(
    ['风险', '影响', '概率', '应对措施'],
    [
      ['DelphiScript API 版本差异', '高', '中', '建立参考库验证机制，所有 API 调用前检查参考库'],
      ['COM 属性类型转换错误', '高', '高', '字符串属性先赋值给 String 变量再使用'],
      ['MCP 缓存不同步', '中', '高', '修改 toolDefinitions.ts 后手动更新缓存 JSON'],
      ['脚本崩溃状态污染', '中', '中', '全局变量入口初始化为 Nil，崩溃后重启 Altium'],
      ['测试覆盖不足', '中', '中', '108 条测试提示词覆盖全部 42 个工具'],
      ['知识库内容质量', '低', '低', '基于权威资料编写，持续审查和扩充'],
    ],
    [2500, 1000, 800, 4700]
  ));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  children.push(p('8月开发已完成主要目标，项目从功能开发阶段进入测试验证和优化阶段。42 个 MCP 工具、12 个 Skill、60 个知识库文件构成了完整的 AI 辅助电子设计系统。'));

  return children;
}

// =================== GENERATE ===================
async function generate() {
  // July Summary
  const julyDoc = new Document({
    styles: docStyles,
    numbering,
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader('7月开发总结') },
      footers: { default: makeFooter() },
      children: buildJulySummary(),
    }]
  });
  const julyBuf = await Packer.toBuffer(julyDoc);
  fs.writeFileSync(path.join(OUT_DIR, '7月开发总结.docx'), julyBuf);
  console.log('Generated: 7月开发总结.docx');

  // August Plan
  const augDoc = new Document({
    styles: docStyles,
    numbering,
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader('8月开发规划') },
      footers: { default: makeFooter() },
      children: buildAugustPlan(),
    }]
  });
  const augBuf = await Packer.toBuffer(augDoc);
  fs.writeFileSync(path.join(OUT_DIR, '8月开发规划.docx'), augBuf);
  console.log('Generated: 8月开发规划.docx');
}

generate().catch(err => { console.error(err); process.exit(1); });
