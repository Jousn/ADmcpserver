# 原理图设计（schematic-design）知识库分类

> 本分类回答"怎么把原理图画得优雅"——布局规划、几何规则、连线组织、标注规范、电源模块模式、AD 平台特性、审查清单。
> **核心纪律：先规划后绘制。任何元件落盘之前，必须先完成布局与走线方案（见 modules/01）。**

## 模块索引

| 模块 | 内容 | 何时检索 |
|------|------|---------|
| [01-pre-draw-layout-planning](modules/01-pre-draw-layout-planning.md) | 绘制前规划流程：网表→分块→流向→轨道→间距预算→走线草案→自检 | **每次绘图前必检**（STAGE 0） |
| [02-layout-geometry-rules](modules/02-layout-geometry-rules.md) | 几何级布局规则：轨道、间距数值表、朝向纪律、标签空间预算、禁入区 | 规划布局时 / 放置元件前 |
| [03-routing-and-organization](modules/03-routing-and-organization.md) | 连线组织：正交走线、结点、T 优于 X、网络标签策略、反馈路径、总线 | 布线规划与执行时 |
| [04-annotation-and-naming](modules/04-annotation-and-naming.md) | 标注与命名：位号、网络名、电源名、极性、参数标注 | 选型定稿 / 标注阶段 |
| [05-power-module-layout-patterns](modules/05-power-module-layout-patterns.md) | 电源模块布局模式：输入级双轨、分压链、反馈分压、去耦摆放（公司主业） | 画电源类模块前 |
| [06-ad-platform-quirks](modules/06-ad-platform-quirks.md) | AD 平台实测特性：偏心原点旋转、锚点放置、热点定义、包围盒不可信 | 使用 place_component / 排查位置异常时 |
| [07-review-checklist](modules/07-review-checklist.md) | 常见错误清单 + 交付前审查清单 | 绘制完成后、宣称完成前 |

## 来源

- 内部《优秀原理图设计方法论》（schematic-design-guide.md，整合 Schemalyzer 30 Rules / LCSC / PCBWay / Sierra Circuits）
- Altium 官方《Easy Schematics Creation for Elegance and Readability》(Mark Harris)
- Electronics StackExchange 经典帖《Rules and guidelines for drawing good schematics》
- AD22 + altium-mcp 实机验证结论（2026-09：锚点放置、轨道对齐、标签净空、禁入区凸包）
