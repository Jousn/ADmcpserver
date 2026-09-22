# altium-mcp 内网部署指南

> MCP 服务器（stdio 协议）：让 MCP 客户端（Claude Desktop / 任意 MCP 客户端 / 内网 AI 网关）通过 DelphiScript 桥接操控 Altium Designer，实现原理图自动绘制与机器审计。
> 本包**完全离线运行**——无任何外网依赖。

---

## 1. 环境要求

| 项 | 要求 |
|----|------|
| 操作系统 | Windows 10/11 |
| Altium Designer | AD22（其他版本未实测；脚本走标准 API，AD19+ 大概率兼容） |
| Node.js | ≥ 18（仅此一项需要安装；内网可离线安装 node） |
| 外网 | **不需要** |

## 2. 安装步骤

1. 解压本包到任意目录，例如 `D:\tools\altium-mcp`（路径不要含中文/空格更稳）。
2. 安装 Node.js ≥ 18（如内网无 node，用离线安装包）。
3. 创建配置文件 `C:\Users\<你>\.altium-mcp\config.json`：

```json
{
  "altiumExePath": "D:\\app\\AD22\\X2.EXE",
  "workspaceRoot": "C:\\Users\\<你>\\.altium-mcp\\workspace"
}
```

- `altiumExePath`：本机 Altium 主程序完整路径（AD 没在运行时服务器会拉起它）
- `workspaceRoot`：桥接工作目录（默认就是 `~/.altium-mcp/workspace`，可不填）
- 路径里的反斜杠必须写成 `\\`

4. 验证安装（可选但推荐）：

```
cd /d D:\tools\altium-mcp
node scripts\smoke-intranet.mjs
```

预期输出 `ping: ok` 与工具清单数量。

## 3. MCP 客户端接入（stdio）

客户端配置中添加服务器，`command` 用 node 的完整路径，`args` 指向包内入口：

```json
{
  "mcpServers": {
    "altium": {
      "command": "node",
      "args": ["D:\\tools\\altium-mcp\\dist\\index.js"]
    }
  }
}
```

Claude Desktop 配置文件位置：`%APPDATA%\Claude\claude_desktop_config.json`。其他 MCP 客户端同理（任何支持 stdio transport 的都行，包括自研内网网关）。

## 4. 使用前的工程准备（重要）

桥接对 AD 工程有两条硬要求：

1. **目标工程必须处于打开状态**（或在 config 指定后由工具拉起 AD）。Free Documents 里游离的图纸编译结果为空，`check_connectivity` 等权威验证不可用。
2. **符号库（.SchLib）必须加入工程**（不是只放在工程目录）：库枚举/引脚表/模板预检只认工程文档列表成员。在 AD 里右键工程 → Add Existing Document，或调用桥接命令 `add_document_to_project`。标准库位置：`C:\Users\Public\Documents\Altium\AD22\Library\`。

首次对某工程使用时，建议让 AI 先跑 `pin_table` 验证符号可见。

## 5. 核心使用范式

对 AI 的绘图请求，服务器内置了纪律（详细见服务器 instructions）：

1. **STAGE 0**：`search_knowledge_base`（schematic-design 分类是画图方法论）→ 产出布局方案（轨道/朝向/间距）
2. **STAGE 1**：`pin_table` 查真实引脚 → 建网表 → `validate_netlist`（严格引脚覆盖：漏网直接报错）
3. `design_ledger` 存/取设计状态（长会话防约束丢失）
4. **STAGE 2**：`place_component`（锚点引脚语义：`anchor_pin` 让指定引脚精确落点，免疫 AD 偏心原点旋转）；成套模块用 `instantiate_module`
5. **STAGE 3**：逐网 `wire_pins`（自动路由/避障/结点/验证）→ 电源端口/标签 → `check_connectivity`（编译器级审计，分区比对）
6. 全部修改**不会自动保存**——确认后由使用者在 AD 里 Ctrl+S

## 6. 常见问题

| 现象 | 原因与处置 |
|------|-----------|
| ping 超时 | AD 未运行且拉起失败（检查 config 的 altiumExePath）；或 AD 弹了脚本错误框（截图看报错行号，一般是脚本损坏——重新解压 altium-scripts） |
| 库枚举 0 / 模板预检失败 | SchLib 没加进工程（见 §4.2） |
| SCHEMATIC_NOT_IN_OPEN_PROJECTS | 图纸不在打开的工程里（在 Free Documents）——用 `open_document` 打开 .PrjPcb |
| 保存的图丢了 | 工具不自动保存；在 AD 里 Ctrl+S |
| 每次调用弹错误框 | 脚本工程编译失败——ping 也会超时；重新同步或检查 workspace\AltiumScript |

## 7. 包内容

```
altium-mcp/
├── dist/               编译产物（入口 dist/index.js）
├── node_modules/       运行依赖（仅 @modelcontextprotocol/sdk + zod 及其依赖）
├── altium-scripts/     DelphiScript 桥接脚本（首次调用自动同步到 workspace）
├── knowledge-base/     设计知识库（含检索索引 kb-index.json）
├── templates/          模块模板（buck-input-stage 等）
├── schemas/            接口 schema 文档
├── scripts/            smoke-intranet.mjs 自检脚本
├── docs/               开发日志与本文档
├── package.json
└── README.md
```
