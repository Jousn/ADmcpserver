# altium-mcp

**Model Context Protocol (MCP) 服务器**，用于连接 MCP 客户端（如 OpenCode 等）与 **Windows** 上的 **Altium Designer**，使助手能够查询 **PCB 和原理图**数据并驱动 DelphiScript 自动化。

这是一个**第三方**项目，不隶属于 Altium。

## 要求

| 项目 | 说明 |
|------|--------|
| 操作系统 | **Windows 10/11**（实时桥接目标为 Windows 上的 Altium） |
| Altium Designer | 推荐 **22+**（`X2.EXE`） |
| Node.js | **20+** |
| MCP 客户端 | 通过 stdio 使用 MCP |

## 快速开始

```bash
npm install
npm run build
```

在 MCP 客户端的配置文件中配置 MCP 服务器（例如 OpenCode 的 opencode.json）。

在 IDE 中的第一步：

1. 调用 MCP 工具 **`get_server_status`** —— 确认工作区路径和 `X2.EXE` 的发现（并将脚本同步到工作区的 `AltiumScript/` 文件夹）。
2. 如果需要，使用 `X2.EXE` 的完整路径调用 **`configure_altium_exe`**。
3. 调用 **`altium_ping`** 确认 DelphiScript 桥接在 Altium 内部响应。
4. 使用 **`get_workspace_projects`** 发现打开的 `.PrjPcb` 路径和原理图页面路径。
5. **PCB**：在 Altium 中**打开并聚焦**目标 `.PcbDoc`，使用 `get_pcb_layers`、`get_all_nets` 等工具。
6. **原理图**：`get_schematic_data` 和 **`edit_schematic`** 不需要活动 PCB；传入 `schematic_full_path` 或 `project_full_path` + `schematic_sheet_file_name`。编辑后，再次在同一页面上调用 `get_schematic_data` 进行验证。

面向代理的详细信息（超时、锁定文件、放置提示）在 MCP 服务器的 `instructions` 和项目文档中。原理图编辑覆盖范围和说明：[docs/edit-schematic-progress.md](docs/edit-schematic-progress.md)。

## 工作原理

- 服务器在工作区下写入 **`request.json`**（默认 `%USERPROFILE%\.altium-mcp\workspace`）。
- 使用 **`-RScriptingSystem:RunScript`** 参数启动 Altium，指向捆绑的 **`Altium_API.PrjScr`** 项目。
- DelphiScript **`Run`** 读取请求，运行 PCB/SCH API 调用，并写入 **`response.json`**。
- 文件锁 **`.bridge.lock`** 序列化并发工具调用（`edit_schematic` 的超时时间更长）。

参见 [docs/architecture.md](docs/architecture.md) 和 [schemas/](schemas/) 中的 JSON 架构。

## MCP 工具（高级）

| 工具 | 用途 |
|------|---------|
| `get_server_status` | 路径、环境变量、`X2.EXE` 和脚本项目是否存在；桥接诊断片段 |
| `configure_altium_exe` | 将 `X2.EXE` 路径保存到 `%USERPROFILE%\.altium-mcp\config.json` |
| `altium_ping` | 通过 DelphiScript 进行健康检查 |
| `get_workspace_projects` | 打开的工作区项目和逻辑文档（SCH/PCB 工具的路径） |
| `get_schematic_data` | 导出原理图页面数据；可选 `include_queries[]` 用于过滤数据桶（导线、网络、元件等） |
| `edit_schematic` | 编辑 `.SchDoc`（移动/旋转、参数、放置元件、导线、总线、网络标签、电源端口等） |
| `get_pcb_layers` / `get_pcb_rules` / `get_all_nets` / `get_pcb_layer_stackup` | 活动**聚焦** PCB 查询 |
| `get_all_designators` | PCB 上的所有元件位号 |
| `get_component_pins` | 给定位号的引脚 |
| `file_mode_capabilities` | 是否连接了离线 `.PcbLib`/`.SchLib` 工具（扩展点） |

## DelphiScript 源代码

`altium-scripts/` 目录是源自 [coffeenmusic/altium-mcp](https://github.com/coffeenmusic/altium-mcp) 的 **MIT 许可**代码，增加了 **`ping`**、**`get_schematic_data` / 原理图导出** 和 **`schematic_edit`** 等功能。参见 [NOTICE](NOTICE)。

## 文件模式（离线库）

默认不捆绑。参见 [docs/file-mode.md](docs/file-mode.md) 和 [packages/file-ops/README.md](packages/file-ops/README.md)。

## 脚本

| 命令 | 描述 |
|---------|-------------|
| `npm run build` | 编译 TypeScript 到 `dist/` |
| `npm start` | 运行 MCP 服务器（stdio） |
| `npm test` | Vitest 测试 |
| `npm run lint` | `tsc --noEmit` |

## 版本发布和标签

本仓库使用 **语义化版本** Git 标签，格式为 `vMAJOR.MINOR.PATCH`（例如 **`v0.1.0`**），在可行时与 `package.json` 对齐。查看 GitHub 上的 [标签页面](https://github.com/flaco-source/altium-mcp/tags)（或 [发布页面](https://github.com/flaco-source/altium-mcp/releases)）跳转到特定版本。

## 贡献

欢迎提交问题和拉取请求。本项目**不隶属于 Altium**；请保持讨论的技术性和尊重性。

### 在提交拉取请求之前

- 使用**聚焦分支**，描述**更改了什么**、**为什么更改**以及**如何验证**（如适用，包括手动 Altium 步骤）。
- 在本地运行 **`npm run build`**、**`npm test`** 和 **`npm run lint`**。CI 在 **Node 22** 上运行相同的命令（参见 [.github/workflows/ci.yml](.github/workflows/ci.yml)）。
- **`altium-scripts/`** 下的更改通常需要在 **Windows 上的 Altium Designer** 中快速检查；尽可能说明你使用的 **AD 主版本**。
- 这里的 DelphiScript **建立在上游工作的基础上** —— 编辑捆绑脚本时，请遵循 [NOTICE](NOTICE) 中的署名和许可说明。

### 范围和质量

- 优先选择**小而易于审查**的 PR。对于大型重构或新子系统，请先打开**问题**以达成方向共识。
- 新的或更改的 **MCP 工具**应与 **`src/toolDefinitions.ts`** 保持一致，当桥接协议更改时更新 [`schemas/`](schemas/) 中的 **JSON 架构**，并在行为可在 Node 中验证的地方添加或扩展 **测试**（Vitest）。

### 许可

通过贡献，你同意你的贡献采用与本仓库相同的许可条款 —— 参见 [LICENSE](LICENSE)（MIT）。

## 许可

MIT —— 参见 [LICENSE](LICENSE)。