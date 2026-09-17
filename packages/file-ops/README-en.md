# 文件模式占用空间（可选扩展）

此目录保留用于未来的**离线**路径，无需运行 Altium Designer 即可读写 Altium `.PcbLib` / `.SchLib`。

## 推荐方向

- 评估 [embedded-society/altium-designer-mcp](https://github.com/embedded-society/altium-designer-mcp)（Rust）作为从 TypeScript MCP 服务器调用的**边车二进制文件**。
- 公开精简的 MCP 工具（`read_pcblib`、`write_pcblib` 等），将 JSON 序列化到边车的 stdin/stdout。

## 为什么尚未在树内实现

- 在打包或子模块化 Rust 源代码之前，应明确决定许可和发布节奏。
- 保持默认安装为单个 Node.js 运行时加上 Windows 上的 Altium。

MCP 服务器中的 `file_mode_capabilities` 工具报告此构建是否包含文件模式支持。