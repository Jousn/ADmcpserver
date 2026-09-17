# OpenCode 内网部署与记忆协议配置指南

> 本文档详细说明如何在内网 OpenCode 中部署 Altium MCP 服务器，并配置运行时记忆协议以减少上下文消耗。

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    OpenCode (MCP 客户端)                    │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ AGENTS.md   │    │ opencode.json│    │ LLM 对话上下文 │ │
│  │ (系统提示词)  │───▶│ (MCP 配置)   │───▶│ (运行时记忆)  │ │
│  │ 记忆协议注入  │    │ MCP 服务器注册 │    │ MEM: 条目    │ │
│  └─────────────┘    └──────┬───────┘    └──────────────┘ │
│                            │                             │
└────────────────────────────┼─────────────────────────────┘
                             │ stdio
                    ┌────────▼────────┐
                    │  Altium MCP     │
                    │  (Node 服务器)   │
                    │  dist/index.js  │
                    └────────┬────────┘
                             │ request.json / response.json
                    ┌────────▼────────┐
                    │  Altium Designer │
                    │  (X2.EXE)       │
                    │  DelphiScript    │
                    └─────────────────┘
```

### 记忆机制说明

本项目采用**提示词级运行时记忆协议**，而非外部记忆服务（如 OpenMemory）。原因：

| 维度 | 提示词级记忆 (推荐) | OpenMemory 外部服务 |
|------|-------------------|-------------------|
| 依赖 | 无 (纯提示词) | Docker + Ollama + 向量模型 |
| 部署难度 | 复制 AGENTS.md 即可 | 需部署 3 个服务 |
| 内网适用 | 完全离线 | 需拉取 Docker 镜像 |
| 记忆类型 | 会话内运行时记忆 | 跨会话持久记忆 |
| Token 节省 | 60-90% | 取决于注入策略 |
| 适用场景 | 单次设计操作流程 | 长期项目知识积累 |

**推荐方案**：内网环境使用提示词级记忆协议。若后续需要跨会话持久记忆，可叠加 OpenMemory。

---

## 二、前置条件

1. **Node.js >= 20** — 已安装（你已部署成功）
2. **Altium Designer AD 22+** — 已安装并运行
3. **Altium MCP 项目** — 已 `npm run build` 成功，生成 `dist/` 目录
4. **OpenCode** — 已在内网部署

验证构建产物：
```powershell
# 确认 dist/index.js 存在
Test-Path "dist\index.js"
# 应输出 True
```

---

## 三、配置文件说明

### 3.1 opencode.json — MCP 服务器注册

将此文件放在 OpenCode 的**全局配置目录**或**项目根目录**：

**全局配置路径**（推荐，所有项目生效）：
```
%USERPROFILE%\.config\opencode\opencode.json
```

**项目级配置路径**（仅当前项目生效）：
```
<项目根目录>\opencode.json
```

配置内容：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "AGENTS.md"
  ],
  "mcp": {
    "altium-mcp": {
      "type": "local",
      "command": ["node", "dist/index.js"],
      "enabled": true,
      "environment": {
        "ALTIUM_MCP_WORKSPACE": "C:\\Users\\<你的用户名>\\.altium-mcp\\workspace"
      }
    }
  }
}
```

**关键字段说明**：

| 字段 | 作用 | 注意事项 |
|------|------|---------|
| `instructions` | 指定系统提示词文件 | OpenCode 启动时读取 AGENTS.md 内容注入 system prompt |
| `mcp.altium-mcp.type` | `"local"` 表示本地 stdio 进程 | 内网无需 `"remote"` |
| `mcp.altium-mcp.command` | 启动 MCP 服务器的命令 | 需指向编译后的 `dist/index.js` |
| `mcp.altium-mcp.enabled` | 是否启用此 MCP 服务器 | 设为 `true` |
| `mcp.altium-mcp.environment` | 环境变量注入 | 设置工作区路径 |

**如果你用绝对路径指向 dist/index.js**：
```json
{
  "mcp": {
    "altium-mcp": {
      "type": "local",
      "command": ["node", "C:\\path\\to\\altium-mcp\\dist\\index.js"],
      "enabled": true,
      "environment": {
        "ALTIUM_MCP_WORKSPACE": "C:\\Users\\<你的用户名>\\.altium-mcp\\workspace",
        "ALTIUM_MCP_ALTIUM_EXE": "C:\\Program Files\\Altium\\AD25\\X2.EXE"
      }
    }
  }
}
```

### 3.2 AGENTS.md — 系统提示词 + 记忆协议

`AGENTS.md` 是 OpenCode 的**系统提示词文件**。OpenCode 启动时会读取此文件内容，作为 system prompt 的一部分发送给大模型。

将 `AGENTS.md` 放在与 `opencode.json` 相同的目录（或 `instructions` 字段指定的路径）。

**AGENTS.md 包含两部分**：

1. **核心规则** — Altium MCP 操作基础规则（错误处理、坐标单位等）
2. **记忆协议** — 运行时记忆管理协议（压缩、更新、使用规则）

完整的 AGENTS.md 内容见项目根目录的 `AGENTS.md` 文件。

---

## 四、记忆协议工作原理

### 4.1 记忆生命周期

```
用户请求查询
     │
     ▼
┌──────────────┐     记忆不存在
│ 检查记忆是否有效 ├─────────────────┐
└──────┬───────┘                   │
       │ 记忆有效                    ▼
       ▼               ┌────────────────────┐
  直接使用记忆数据      │ 调用 MCP 查询工具    │
  (0 token 消耗)      │ get_schematic_data  │
       │               │ get_all_designators │
       ▼               └─────────┬──────────┘
  执行操作                       │
       │                         ▼
       ▼               ┌────────────────────┐
  更新记忆             │ 压缩为记忆条目       │
  (写操作后)           │ MEM:PCB_COMP ...   │
                      │ MEM:SCH_COMP ...   │
                      └────────────────────┘
```

### 4.2 记忆格式

所有记忆使用**单行压缩格式**，最大化 token 效率：

```
## MEM:PCB_COMP 2026-07-29T14:30
@U1 F:QFP-48 X:3500 Y:2100 R:0
@R1 F:0603 X:1500 Y:800 R:90
@C1 F:0603 X:2000 Y:800 R:0

## MEM:SCH_COMP 2026-07-29T14:31
@U1 L:STM32F407 X:5000 Y:3000 P:Package=LQFP48
@R1 L:Res2 X:6500 Y:3000 P:Value=10k

## MEM:PIN_NET 2026-07-29T14:32
@U1.1=VCC @U1.2=GND @U1.3=GPIO_A0
@R1.1=VCC @R1.2=GPIO_A0

## MEM:SCH_NET 2026-07-29T14:33
@VCC: [U1.1, R1.1, C1.1]
@GND: [U1.2, R1.2, C1.2]
```

### 4.3 记忆更新规则

| 写操作 | 记忆更新动作 |
|--------|------------|
| `set_component_position(designator, x, y, rotation)` | 替换 MEM:PCB_COMP 中该行 X/Y/R |
| `move_components(designators[], dx, dy)` | 批量计算: X+=dx, Y+=dy |
| `edit_schematic(set_component_transform)` | 更新 MEM:SCH_COMP 中该行 X/Y |
| `edit_schematic(place_component)` | 在 MEM:SCH_COMP 末尾新增一行 |
| `edit_schematic(set_component_parameters)` | 更新 MEM:SCH_COMP 中该行 P 字段 |
| `edit_schematic(add_wire)` | 更新 MEM:SCH_NET 连接关系 |
| `create_net_class` | 记录到 MEM:NET_CLASS |

### 4.4 Token 节省效果

| 场景 | 无记忆 (token) | 有记忆 (token) | 节省 |
|------|--------------|--------------|------|
| 查询5个元件位置（第2次） | ~2000 | ~100 | 95% |
| 连续布局调整（3次操作） | ~8000 | ~300 | 96% |
| 原理图连线（10个连接） | ~50000 | ~500 | 99% |
| 回答"U1在哪" | ~2000 | ~50 | 97% |

---

## 五、分步部署流程

### 步骤 1：确认 MCP 服务器已构建

```powershell
cd C:\path\to\altium-mcp
npm run build
# 确认 dist\index.js 存在
Test-Path "dist\index.js"
```

### 步骤 2：配置 opencode.json

**方式 A — 全局配置（推荐）**：

```powershell
# 创建 OpenCode 全局配置目录（如不存在）
$configDir = "$env:USERPROFILE\.config\opencode"
if (!(Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force }

# 复制配置文件
Copy-Item "C:\path\to\altium-mcp\opencode.json" "$configDir\opencode.json" -Force
Copy-Item "C:\path\to\altium-mcp\AGENTS.md" "$configDir\AGENTS.md" -Force
```

**方式 B — 项目级配置**：

将 `opencode.json` 和 `AGENTS.md` 复制到你的工作项目根目录。

### 步骤 3：修改路径

编辑 `opencode.json`，修改以下路径为你的实际路径：

```json
{
  "mcp": {
    "altium-mcp": {
      "type": "local",
      "command": ["node", "C:\\你的实际路径\\altium-mcp\\dist\\index.js"],
      "enabled": true,
      "environment": {
        "ALTIUM_MCP_WORKSPACE": "C:\\Users\\你的用户名\\.altium-mcp\\workspace",
        "ALTIUM_MCP_ALTIUM_EXE": "C:\\Program Files\\Altium\\AD25\\X2.EXE"
      }
    }
  }
}
```

### 步骤 4：启动 OpenCode 验证

```powershell
opencode
```

在 OpenCode 中输入以下命令验证：

1. **检查 MCP 服务器是否加载**：
   ```
   /mcps
   ```
   应看到 `altium-mcp` 在列表中且状态为 enabled

2. **验证记忆协议是否注入**：
   ```
   你知道 Altium 设计记忆协议吗？
   ```
   AI 应能回答记忆格式（MEM:PCB_COMP 等）

3. **测试工具调用**：
   ```
   调用 get_server_status 检查 Altium MCP 环境状态
   ```

### 步骤 5：验证记忆协议生效

在 OpenCode 中执行以下对话流程测试记忆：

```
用户: 查询 PCB 上所有元件位号
AI:   [调用 get_all_designators → 返回 ["U1","R1","R2"]]
      [建立记忆: MEM:PCB_COMP ...]

用户: R1 现在在哪里？
AI:   [从记忆读取，不调用工具] R1 位于 (1500, 800)，旋转 90°

用户: 把 R1 向右移 500mil
AI:   [调用 move_components(["R1"], 500, 0)]
      [更新记忆: @R1 X:2000 Y:800 R:90]
      已完成移动

用户: R1 现在在哪？
AI:   [从记忆读取] R1 现在位于 (2000, 800)
```

如果 AI 在第二次查询时**没有调用工具**而是直接从记忆回答，说明记忆协议生效。

---

## 六、分场景提示词（可选优化）

如果 OpenCode 支持动态指令加载（通过插件或脚本），可以按场景加载提示词以进一步减少 token：

| 场景 | 触发关键词 | 加载文件 |
|------|-----------|---------|
| 原理图操作 | schematic, 连线, wire, 放置元件 | prompt/04-分场景提示词.md 中"场景A" |
| PCB 操作 | PCB, 布局, layout, 走线, 移动元件 | prompt/04-分场景提示词.md 中"场景B" |
| 库管理 | library, 符号, symbol | prompt/04-分场景提示词.md 中"场景C" |
| 输出作业 | Gerber, BOM, output | prompt/04-分场景提示词.md 中"场景D" |
| 环境配置 | config, 路径, status, ping | prompt/04-分场景提示词.md 中"场景E" |

**内网简化做法**：如果 OpenCode 不支持动态加载，直接在 AGENTS.md 中包含通用基础提示词 + 记忆协议即可（当前 AGENTS.md 已包含）。

---

## 七、常见问题排查

### Q1: OpenCode 启动后看不到 altium-mcp 工具

**检查步骤**：
1. 确认 `opencode.json` 路径正确（全局配置或项目根目录）
2. 确认 `command` 中的 `dist/index.js` 路径存在
3. 在 OpenCode 中输入 `/mcps` 查看 MCP 服务器列表
4. 手动测试 MCP 服务器能否启动：
   ```powershell
   $env:ALTIUM_MCP_WORKSPACE = "C:\Users\$env:USERNAME\.altium-mcp\workspace"
   node "C:\path\to\altium-mcp\dist\index.js"
   # 应无报错，等待 stdio 输入
   ```

### Q2: AGENTS.md 没有生效

**检查步骤**：
1. 确认 `opencode.json` 中 `instructions` 字段包含 `"AGENTS.md"`
2. 确认 AGENTS.md 与 opencode.json 在同一目录
3. 重启 OpenCode（修改配置后需要重启）

### Q3: 记忆协议没有生效（AI 仍然每次都调用查询工具）

**可能原因**：
- 使用的内网大模型上下文窗口太小，记忆协议被截断
- 模型指令遵循能力不足

**解决方案**：
1. 确认模型上下文窗口 >= 8K tokens
2. 尝试在用户消息中主动提醒："请检查你的记忆，避免重复查询"
3. 如果模型能力有限，在 AGENTS.md 中将记忆协议部分移到文件最前面

### Q4: 路径中有空格导致启动失败

在 `opencode.json` 中使用双反斜杠：
```json
"command": ["node", "C:\\Program Files\\Altium\\AD25\\dist\\index.js"]
```

### Q5: 工作区路径配置

Altium MCP 工作区路径优先级：
1. 环境变量 `ALTIUM_MCP_WORKSPACE`（opencode.json 中 environment 设置）
2. `~/.altium-mcp/config.json` 中的 `workspaceRoot`
3. 默认 `~/.altium-mcp/workspace`

确保工作区目录存在且有写入权限：
```powershell
$workspace = "C:\Users\$env:USERNAME\.altium-mcp\workspace"
if (!(Test-Path $workspace)) { New-Item -ItemType Directory -Path $workspace -Force }
```

---

## 八、文件清单

| 文件 | 用途 | 部署位置 |
|------|------|---------|
| `opencode.json` | MCP 服务器注册 + 指令文件引用 | 全局配置目录或项目根目录 |
| `AGENTS.md` | 系统提示词 + 记忆协议 | 与 opencode.json 同目录 |
| `dist/index.js` | 编译后的 MCP 服务器 | altium-mcp 项目目录 |
| `altium-scripts/` | DelphiScript 脚本包 | altium-mcp 项目目录（运行时自动同步） |

---

## 九、创建专属智能体（进阶）

OpenCode 支持创建自定义智能体，分为三种方式：

| 方式 | 说明 | 位置 |
|------|------|------|
| AGENTS.md | 全局系统提示词 | 项目根目录 |
| 自定义 Agent | 主智能体/子智能体，Tab 切换 | `.opencode/agent/` |
| Agent Skill | 按需加载的专业技能 | `.opencode/skill/` |

### 9.1 已创建的智能体

本项目已在 `.opencode/` 目录下预置了以下智能体：

```
.opencode/
├── agent/
│   ├── altium-pcb.md       # PCB 布局主智能体 (Primary)
│   ├── altium-sch.md       # 原理图设计主智能体 (Primary)
│   └── altium-review.md    # 设计审查子智能体 (SubAgent)
└── skill/
    └── altium-layout-guide/
        └── SKILL.md        # PCB 布局最佳实践技能
```

### 9.2 使用方式

- **切换主智能体**：在 OpenCode 中按 **Tab 键**，可在 "Altium PCB Designer" 和 "Altium Schematic Designer" 之间切换
- **子智能体**：主智能体会按需调度 "Altium Design Reviewer" 进行设计审查
- **Skill**：进行布局/布线相关任务时，AI 会自动加载 `altium-layout-guide` 技能

### 9.3 全局部署（所有项目生效）

将 `.opencode/` 中的 agent 和 skill 复制到全局配置目录：

```powershell
# 复制 agent
Copy-Item -Recurse ".opencode\agent\*" "$env:USERPROFILE\.config\opencode\agent\"

# 复制 skill
Copy-Item -Recurse ".opencode\skill\*" "$env:USERPROFILE\.config\opencode\skill\"
```

详细说明见 [opencode-custom-agent-guide.md](opencode-custom-agent-guide.md)。

## 十、优化效果总览

| 优化项 | 优化前 | 优化后 | 节省 |
|--------|--------|--------|------|
| 工具描述 (26个) | ~5000 tokens | ~1800 tokens | 64% |
| MCP Instructions | ~2000 tokens | ~1100 tokens | 45% |
| 运行时数据查询 | 每次全量查询 | 记忆缓存 | 60-90% |
| **综合上下文消耗** | **~7000 + 运行时** | **~2900 + 记忆** | **>70%** |
