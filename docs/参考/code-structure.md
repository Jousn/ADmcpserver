# Altium MCP Server 代码结构文档

## 目录

1. [项目架构总览](#1-项目架构总览)
2. [核心文件详解](#2-核心文件详解)
3. [运行流程分析](#3-运行流程分析)
4. [数据流向图](#4-数据流向图)
5. [关键设计机制](#5-关键设计机制)
6. [工具列表及说明](#6-工具列表及说明)
7. [配置说明](#7-配置说明)

---

## 1. 项目架构总览

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MCP Client                                   │
│                          (MCP Client)                              │
└─────────────────────────────┬─────────────────────────────────────┘
                              │ stdio (JSON-RPC)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    altium-mcp (Node.js)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│  │  MCP Server │  │  工具定义    │  │     桥接层              │    │
│  │  index.ts   │  │ toolDefs.ts │  │ altiumBridge.ts         │    │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬───────────────┘    │
│         │                │                       │                  │
│         │                │                       ▼                  │
│         │                │          ┌─────────────────────────┐     │
│         │                │          │  文件锁 + 工作区管理     │     │
│         │                │          │  lock.ts + workspace.ts │     │
│         │                │          └───────────┬───────────────┘     │
│         └────────────────┴───────────────────────┘                  │
└─────────────────────────────┬─────────────────────────────────────┘
                              │ 文件读写 (request.json / response.json)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Altium Designer (DelphiScript)                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │           Altium_API.PrjScr (脚本项目)                      │   │
│  │  Altium_API.pas  │  schematic_edit.pas  │  pcb_utils.pas  │   │
│  │  (入口)          │  (原理图编辑)        │  (PCB工具)      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 目录结构说明

| 目录 | 功能 | 语言 |
|------|------|------|
| `src/` | Node.js 核心代码 | TypeScript |
| `src/bridge/` | 与 Altium 的桥接通信 | TypeScript |
| `src/tools/` | 工具输入验证和辅助函数 | TypeScript |
| `altium-scripts/` | Altium 内部运行的 DelphiScript | Pascal |
| `dist/` | TypeScript 编译产物 | JavaScript |
| `schemas/` | JSON Schema 定义 | JSON |
| `docs/` | 项目文档 | Markdown |

---

## 2. 核心文件详解

### 2.1 src/index.ts - MCP 服务器入口

**功能**：项目启动入口，注册所有 MCP 工具

**关键代码结构**：

```typescript
// 1. 创建 AltiumBridge 实例
const bridge = new AltiumBridge({
  bundledScriptsDir: defaultBundledScriptsDir(),
});

// 2. 创建 MCP 服务器
const server = new McpServer(
  { name: "altium-mcp", version: "0.1.0" },
  { instructions: ALTIUM_MCP_INSTRUCTIONS },
);

// 3. 注册工具
server.registerTool("get_server_status", {...}, async () => {...});
server.registerTool("altium_ping", {...}, async () => {...});
// ... 其他工具

// 4. 启动服务器
async function main() {
  bridge.ensureLayout();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

**工具注册方式**：
- **直接注册**：`server.registerTool()` - 适用于需要额外处理的工具
- **批量注册**：`registerLiveCommand()` - 适用于直接转发到 Altium 的工具

### 2.2 src/bridge/altiumBridge.ts - 桥接层

**功能**：Node.js 与 Altium Designer 之间的通信桥梁

**核心方法**：

| 方法 | 功能 |
|------|------|
| `executeCommand()` | 执行 Altium 命令（核心方法） |
| `resolveAltiumExePath()` | 解析 Altium EXE 路径 |
| `persistAltiumExePath()` | 保存 Altium EXE 路径到配置 |
| `ensureLayout()` | 确保工作区和脚本同步 |
| `getRequestPath()` / `getResponsePath()` | 获取请求/响应文件路径 |

**executeCommand() 执行流程**：

```typescript
async executeCommand(command, params, options) {
  // 1. 获取文件锁
  return withBridgeLock(this.workspaceRoot, async () => {
    // 2. 同步脚本到工作区
    this.ensureLayout();
    
    // 3. 检查 Altium EXE 和脚本项目
    const exe = this.resolveAltiumExePath();
    const scriptPrj = this.getScriptProjectPath();
    
    // 4. 写入 request.json
    const body = { protocolVersion: 1, command, ...params };
    writeFileSync(requestPath, JSON.stringify(body));
    
    // 5. 启动 Altium Designer
    const launched = await launchAltiumRunScript(exe, scriptPrj);
    
    // 6. 轮询等待 response.json
    while (Date.now() < deadline) {
      if (existsSync(responsePath)) {
        return parseResponse(responsePath);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    
    // 7. 超时处理
    return { success: false, error: "TIMEOUT" };
  });
}
```

### 2.3 src/toolDefinitions.ts - 工具定义

**功能**：定义所有 MCP 工具的描述信息

**工具分类**：

| 类型 | 注释 | 工具示例 |
|------|------|----------|
| 只读操作 | `annotationsReadOnlyLive` | `get_pcb_layers`, `get_schematic_data` |
| 配置写入 | `annotationsConfigWrite` | `configure_altium_exe` |
| 原理图编辑 | `annotationsSchematicEdit` | `edit_schematic` |
| Node 本地 | `annotationsNodeOnly` | `file_mode_capabilities` |

### 2.4 src/tools/ - 工具输入验证

**文件说明**：

| 文件 | 功能 |
|------|------|
| `editSchematic.ts` | 原理图编辑参数的 Zod Schema |
| `getSchematicData.ts` | 原理图数据查询参数的 Zod Schema |
| `designators.ts` | 元件位号解析工具 |
| `helpers.ts` | 辅助函数（jsonResult, errResult） |

**editSchematic.ts 中的 action 类型**：

```typescript
const editSchematicActionEnum = z.enum([
  "set_component_transform",  // 移动/旋转元件
  "set_component_parameters", // 设置元件参数
  "place_component",          // 放置元件
  "add_text",                 // 添加文本
  "add_net_label",            // 添加网络标签
  "add_wire",                 // 添加导线
  "add_bus",                  // 添加总线
  "add_bus_entry",            // 添加总线入口
  "place_power_port",         // 放置电源端口
  "place_gnd",                // 放置地
  "place_vcc",                // 放置电源
]);
```

### 2.5 src/config.ts - 配置管理

**配置来源优先级**（从高到低）：

1. **环境变量**：`ALTIUM_MCP_ALTIUM_EXE`, `ALTIUM_MCP_WORKSPACE`
2. **用户配置文件**：`~/.altium-mcp/config.json`
3. **默认值**：自动发现 Altium EXE，默认工作区 `~/.altium-mcp/workspace`

### 2.6 src/workspaceLayout.ts - 工作区布局

**功能**：管理工作区目录和脚本同步

**脚本同步机制**：
- 使用**内容指纹**检测脚本是否需要更新
- 只同步变化的文件，保持 Altium 项目路径稳定
- 指纹文件：`AltiumScript/.altium_bundle_fingerprint`

### 2.7 altium-scripts/ - DelphiScript 脚本

**文件说明**：

| 文件 | 功能 |
|------|------|
| `Altium_API.PrjScr` | Altium 脚本项目定义 |
| `Altium_API.pas` | 主入口，解析 request.json 并执行命令 |
| `schematic_edit.pas` | 原理图编辑命令处理 |
| `schematic_utils.pas` | 原理图数据导出 |
| `pcb_utils.pas` | PCB 数据查询 |
| `json_utils.pas` | JSON 读写工具 |
| `other_utils.pas` | 其他辅助函数 |

**Altium_API.pas Run 过程流程**：

```pascal
procedure Run;
var
  Request, Response: TJSONObject;
  Command: string;
begin
  // 1. 读取 request.json
  Request := ReadJSON('request.json');
  
  // 2. 解析 command
  Command := Request.Get('command');
  
  // 3. 根据 command 调用处理函数
  case Command of
    'ping': Response := HandlePing;
    'get_pcb_layers': Response := HandleGetPCBLayers;
    'get_schematic_data': Response := HandleGetSchematicData;
    'schematic_edit': Response := HandleSchematicEdit;
    // ... 其他命令
  end;
  
  // 4. 写入 response.json
  WriteJSON('response.json', Response);
end;
```

---

## 3. 运行流程分析

### 以 get_pcb_layers 为例

```
步骤 1: OpenCode 发送请求
┌──────────────────────────────────────────────────────────────────────┐
│ Request: {"method":"get_pcb_layers", "params":{}}                    │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 2: index.ts 接收请求
┌──────────────────────────────────────────────────────────────────────┐
│ registerLiveCommand("get_pcb_layers", ...)                          │
│ → bridge.executeCommand("get_pcb_layers", {})                       │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 3: altiumBridge.ts 执行命令
┌──────────────────────────────────────────────────────────────────────┐
│ 1. 获取文件锁 (.bridge.lock)                                         │
│ 2. 同步脚本到工作区                                                   │
│ 3. 写入 request.json: {"command":"get_pcb_layers"}                   │
│ 4. 启动 X2.EXE: "X2.EXE -RScriptingSystem:RunScript(...)"           │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 4: Altium Designer 执行脚本
┌──────────────────────────────────────────────────────────────────────┐
│ Altium_API.pas Run():                                               │
│ 1. 读取 request.json                                                │
│ 2. 解析 command = "get_pcb_layers"                                  │
│ 3. 调用 pcb_utils.pas 获取层信息                                     │
│ 4. 写入 response.json: {"success":true, "result":[...]}             │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 5: altiumBridge.ts 读取响应
┌──────────────────────────────────────────────────────────────────────┐
│ 1. 轮询检测 response.json                                           │
│ 2. 读取并解析响应                                                    │
│ 3. 返回结果给 MCP 服务器                                             │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 6: OpenCode 接收响应
┌──────────────────────────────────────────────────────────────────────┐
│ Response: {"result":{"success":true, "result":[...]}}               │
└──────────────────────────────────────────────────────────────────────┘
```

### 以 edit_schematic 为例

```
步骤 1: OpenCode 发送编辑请求
┌──────────────────────────────────────────────────────────────────────┐
│ Request: {                                                           │
│   "method":"edit_schematic",                                         │
│   "params": {                                                        │
│     "action": "place_component",                                     │
│     "schematic_full_path": "...",                                    │
│     "lib_reference": "RES",                                          │
│     "designator": "R1",                                              │
│     "x_mils": 1000,                                                  │
│     "y_mils": 2000                                                   │
│   }                                                                  │
│ }                                                                    │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 2: editSchematic.ts 验证参数
┌──────────────────────────────────────────────────────────────────────┐
│ Zod Schema 验证:                                                     │
│ - action 必须是有效枚举值                                             │
│ - schematic_full_path 或 schematic_sheet_file_name 必须提供          │
│ - lib_reference, designator, x_mils, y_mils 必须提供                 │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 3: altiumBridge.ts 执行命令
┌──────────────────────────────────────────────────────────────────────┐
│ 执行 schematic_edit 命令，超时 240 秒（比其他工具更长）                │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
步骤 4: schematic_edit.pas 处理编辑
┌──────────────────────────────────────────────────────────────────────┐
│ SchematicEditMain():                                                │
│ 1. 根据 action 分发到对应的处理函数                                   │
│ 2. 调用 Altium API 放置元件                                          │
│ 3. 返回操作结果                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. 数据流向图

### 请求响应流程

```
┌────────────┐     ┌─────────────┐     ┌────────────────┐
│ OpenCode   │────▶│  Node.js    │────▶│ request.json   │
│ (客户端)   │     │ (MCP服务器) │     │ (工作区)       │
└────────────┘     └─────────────┘     └───────┬────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────┐
│         Altium Designer                       │
│  读取 request.json → 执行命令 → 写入 response.json │
└───────────────────────────────────────────────┘
                                                │
                                                ▲
┌────────────┐     ┌─────────────┐     ┌────────────────┐
│ OpenCode   │◀────│  Node.js    │◀────│ response.json  │
│ (客户端)   │     │ (MCP服务器) │     │ (工作区)       │
└────────────┘     └─────────────┘     └────────────────┘
```

### 文件交互流程

```
工作区目录: %USERPROFILE%\.altium-mcp\workspace\
├── request.json          ← Node.js 写入，Altium 读取
├── response.json         ← Altium 写入，Node.js 读取
├── .bridge.lock          ← 文件锁（防止并发）
├── bridge_last_error.txt ← Altium 写入的错误日志
├── bridge_user_reported_error.txt ← 用户粘贴的编译错误
└── AltiumScript/         ← 同步的 DelphiScript 脚本
    ├── Altium_API.PrjScr
    ├── Altium_API.pas
    ├── schematic_edit.pas
    ├── pcb_utils.pas
    └── ...
```

---

## 5. 关键设计机制

### 5.1 文件锁机制

**目的**：防止并发调用时数据冲突

**实现**：

```typescript
// src/bridge/lock.ts
async function withBridgeLock(workspaceRoot, callback) {
  const lockPath = join(workspaceRoot, ".bridge.lock");
  
  // 等待锁释放（最多等待 60 秒）
  while (existsSync(lockPath)) {
    // 检查锁是否过期（进程是否存在）
    // 如果锁已过期，删除它
    await new Promise(r => setTimeout(r, 100));
  }
  
  // 创建锁文件
  writeFileSync(lockPath, process.pid.toString());
  
  try {
    return await callback();
  } finally {
    // 删除锁文件
    unlinkSync(lockPath);
  }
}
```

### 5.2 脚本同步机制

**目的**：保持工作区中的脚本与源码同步

**实现**：

1. **计算内容指纹**：遍历 `altium-scripts/` 目录，计算所有文件的 SHA256 哈希
2. **比较指纹**：检查工作区中的指纹文件是否匹配
3. **增量同步**：只同步变化的文件，删除多余文件

### 5.3 超时处理

**策略**：

| 工具类型 | 超时时间 | 说明 |
|----------|----------|------|
| 普通查询 | 120 秒 | 如 `get_pcb_layers`, `altium_ping` |
| 原理图编辑 | 240 秒 | `edit_schematic`，操作更复杂 |

**超时原因**：
- Altium 启动较慢（首次启动尤其明显）
- DelphiScript 执行需要时间
- 用户可能在 Altium 中设置了断点

### 5.4 错误处理

**错误分类**：

| 错误类型 | 来源 | 处理方式 |
|----------|------|----------|
| Node.js 错误 | 路径配置、文件操作 | 返回 `AD_NOT_FOUND`, `SCRIPT_PROJECT_NOT_FOUND` |
| 桥接错误 | Altium 执行失败 | 写入 `bridge_last_error.txt`，MCP 返回合并后的错误 |
| 编译错误 | DelphiScript 编译失败 | 用户手动粘贴到 `bridge_user_reported_error.txt` |

**错误信息传递**：

```typescript
// augmentBridgeFailure() 函数
function augmentBridgeFailure(workspaceRoot, res) {
  if (res.success) return res;
  
  // 读取 bridge_last_error.txt
  const extra = readWorkspaceTextSnippet(workspaceRoot, "bridge_last_error.txt", 12000);
  
  if (extra) {
    // 合并错误信息
    return { ...res, error: `${res.error}\n--- bridge_last_error.txt ---\n${extra}` };
  }
  
  return res;
}
```

---

## 6. 工具列表及说明

### 6.1 工具分类

| 类别 | 工具 | 说明 |
|------|------|------|
| **系统工具** | `get_server_status` | 检查服务器状态和配置 |
| | `configure_altium_exe` | 配置 Altium EXE 路径 |
| | `altium_ping` | 测试 Altium 桥接连通性 |
| **项目工具** | `get_workspace_projects` | 获取打开的项目列表 |
| **原理图工具** | `get_schematic_data` | 导出原理图数据 |
| | `edit_schematic` | 编辑原理图 |
| **PCB 工具** | `get_pcb_layers` | 获取 PCB 层信息 |
| | `get_pcb_rules` | 获取 PCB 设计规则 |
| | `get_all_nets` | 获取所有网络名称 |
| | `get_pcb_layer_stackup` | 获取层叠结构 |
| **元件工具** | `get_all_designators` | 获取所有元件位号 |
| | `get_component_pins` | 获取元件引脚信息 |
| **文件模式** | `file_mode_capabilities` | 检查文件模式功能 |

### 6.2 工具详细说明

#### get_server_status

**用途**：检查服务器状态和环境配置

**返回值**：
```json
{
  "platform": "win32",
  "workspaceRoot": "C:\\Users\\xxx\\.altium-mcp\\workspace",
  "altiumExePath": "C:\\Program Files\\Altium\\AD25\\X2.EXE",
  "altiumExeFound": true,
  "scriptProjectFound": true,
  "bridgeLastError": null,
  "env": {
    "ALTIUM_MCP_ALTIUM_EXE": null,
    "ALTIUM_MCP_WORKSPACE": null
  }
}
```

#### configure_altium_exe

**用途**：配置 Altium EXE 路径

**参数**：
```json
{
  "path": "C:\\Program Files\\Altium\\AD25\\X2.EXE"
}
```

#### altium_ping

**用途**：测试 Altium 桥接连通性

**返回值**：
```json
{
  "success": true,
  "result": {
    "protocolVersion": 1,
    "pong": true
  }
}
```

#### get_workspace_projects

**用途**：获取打开的项目列表

**返回值**：
```json
{
  "projectCount": 1,
  "focusedProjectFullPath": "C:\\...\\project.PrjPcb",
  "projects": [
    {
      "index": 0,
      "projectFullPath": "C:\\...\\project.PrjPcb",
      "documents": [
        { "kind": "SCH", "fullPath": "...Sheet1.SchDoc" },
        { "kind": "PCB", "fullPath": "...board.PcbDoc" }
      ]
    }
  ]
}
```

#### get_schematic_data

**用途**：导出原理图数据（支持过滤）

**参数**：
```json
{
  "schematic_full_path": "C:\\...\\Sheet1.SchDoc",
  "include_queries": ["components", "wires", "net_labels"]
}
```

**返回值**：
```json
{
  "schematic_data_mode": "filtered",
  "include_queries": ["components", "wires"],
  "components": [...],
  "wires": [...]
}
```

#### edit_schematic

**用途**：编辑原理图（多种操作模式）

**参数示例 - 放置元件**：
```json
{
  "action": "place_component",
  "schematic_full_path": "C:\\...\\Sheet1.SchDoc",
  "lib_reference": "RES",
  "designator": "R1",
  "x_mils": 1000,
  "y_mils": 2000,
  "rotation_deg": 0,
  "sch_library_path": "C:\\...\\library.SchLib"
}
```

**参数示例 - 添加导线**：
```json
{
  "action": "add_wire",
  "schematic_full_path": "C:\\...\\Sheet1.SchDoc",
  "wire_points_csv": "1000,2000,2000,2000,2000,3000"
}
```

#### get_pcb_layers

**用途**：获取 PCB 层信息

**返回值**：
```json
{
  "success": true,
  "result": [
    { "name": "Top Layer", "kind": "signal" },
    { "name": "Bottom Layer", "kind": "signal" },
    { "name": "GND", "kind": "internal" }
  ]
}
```

#### get_all_designators

**用途**：获取所有元件位号

**返回值**：
```json
{
  "success": true,
  "result": ["U1", "U2", "R1", "R2", "C1"]
}
```

#### get_component_pins

**用途**：获取指定元件的引脚信息

**参数**：
```json
{
  "designators": ["U1", "U2"]
}
```

**返回值**：
```json
{
  "success": true,
  "result": {
    "U1": [
      { "pinNumber": "1", "netName": "VCC", "x": 1000, "y": 2000 },
      { "pinNumber": "2", "netName": "GND", "x": 1000, "y": 2200 }
    ]
  }
}
```

---

## 7. 配置说明

### 7.1 配置文件

**路径**：`%USERPROFILE%\.altium-mcp\config.json`

**格式**：
```json
{
  "altiumExePath": "C:\\Program Files\\Altium\\AD25\\X2.EXE",
  "workspaceRoot": "C:\\Users\\xxx\\.altium-mcp\\workspace"
}
```

### 7.2 环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `ALTIUM_MCP_ALTIUM_EXE` | Altium EXE 路径 | `C:\Program Files\Altium\AD25\X2.EXE` |
| `ALTIUM_MCP_WORKSPACE` | 工作区路径 | `C:\Users\xxx\.altium-mcp\workspace` |
| `ALTIUM_MCP_FORCE_BUNDLE_SYNC` | 强制同步脚本 | `1` 或 `true` |

### 7.3 OpenCode 配置

**路径**：`%USERPROFILE%\.config\opencode\opencode.jsonc`

**格式**：
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "altium-mcp": {
      "type": "local",
      "command": ["node", "dist/index.js"],
      "cwd": "C:\\path\\to\\altium-mcp",
      "env": {
        "ALTIUM_MCP_ALTIUM_EXE": "C:\\Program Files\\Altium\\AD25\\X2.EXE",
        "ALTIUM_MCP_WORKSPACE": "C:\\Users\\xxx\\.altium-mcp\\workspace"
      },
      "enabled": true
    }
  }
}
```

---

## 8. 开发指南

### 8.1 添加新工具

**步骤**：

1. 在 `src/toolDefinitions.ts` 中添加工具描述
2. 在 `src/index.ts` 中注册工具
3. 在 `altium-scripts/` 中添加 DelphiScript 实现
4. 更新 `src/mcpInstructions.ts` 和 `skills/SKILL.md`

**示例**：

```typescript
// src/index.ts
server.registerTool(
  "my_new_tool",
  {
    title: "My New Tool",
    description: DESCRIPTION_MY_NEW_TOOL,
    annotations: annotationsReadOnlyLive,
    inputSchema: z.object({
      param1: z.string(),
    }),
  },
  async ({ param1 }) => {
    const r = await bridge.executeCommand("my_new_command", { param1 });
    return jsonResult(r);
  },
);
```

### 8.2 修改原理图编辑功能

**步骤**：

1. 在 `src/tools/editSchematic.ts` 中添加新的 action 类型
2. 在 `src/toolDefinitions.ts` 中更新 `DESCRIPTION_EDIT_SCHEMATIC`
3. 在 `altium-scripts/schematic_edit.pas` 中添加处理函数

### 8.3 构建和测试

**命令**：

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run build` | 编译 TypeScript |
| `npm test` | 运行测试 |
| `npm run lint` | 类型检查 |
| `npm start` | 启动 MCP 服务器 |

---

## 9. 故障排除

### 9.1 常见错误

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `AD_NOT_FOUND` | Altium EXE 路径错误 | 使用 `configure_altium_exe` 或设置环境变量 |
| `TIMEOUT` | Altium 未运行或脚本阻塞 | 启动 Altium，检查断点 |
| `SCRIPT_PROJECT_NOT_FOUND` | 脚本项目未同步 | 删除工作区 `AltiumScript` 文件夹并重启 |
| `INVALID_BRIDGE_RESPONSE` | 响应格式错误 | 检查 Altium 脚本输出 |
| `RESPONSE_READ_FAILED` | 响应文件读取失败 | 检查工作区权限 |

### 9.2 调试技巧

1. **查看工作区日志**：
   - `request.json` - 发送给 Altium 的请求
   - `response.json` - Altium 返回的响应
   - `bridge_last_error.txt` - 桥接错误日志

2. **手动启动服务器**：
   ```bash
   node dist/index.js
   ```

3. **删除锁定文件**：
   ```bash
   del %USERPROFILE%\.altium-mcp\workspace\.bridge.lock
   ```

4. **检查 Altium 脚本编译错误**：
   - 将 Altium 消息面板内容粘贴到 `bridge_user_reported_error.txt`
   - 调用 `get_server_status` 查看错误

---

## 10. 版本信息

| 项目 | 版本 |
|------|------|
| altium-mcp | 0.1.0 |
| Node.js | >= 20 |
| TypeScript | 5.8.x |
| @modelcontextprotocol/sdk | 1.29.x |
| Zod | 3.24.x |
| Altium Designer | >= 22 |