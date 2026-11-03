# Altium Designer MCP 服务器开发日志

> 项目：altium-mcp
> 开发周期：2026-11-02 晚 ~ 11-03 早（夜间自动批次，截止 09:00）
> 主题：审查驱动的正确性加固与性能修复——6 个 P1 落地 5 个半、静态门禁上线、Token 瘦身、批量引脚热点实机验证

---

## 背景与推进方式

2026-11-02 全项目审查产出 42 条发现（TS 服务层 21 + Pascal 桥接层 21，对照官方脚本参考库核实；6 个 P1 由主实例逐一亲自验证）。当晚 23:00 经用户授权启动**夜间自动批次**（截止 11-03 09:00）：git bundle 备份（verify okay）→ 计划文件落盘（T1-T11 接力协议）→ 每 40 分钟 Cron 守护续做。任务按序执行，单任务卡 30 分钟即标 BLOCKED 跳过，全程无人值守完成 9 个任务 + T5 半修复，测试 176→204。

## 交付清单（commit 链）

| 任务 | 内容 | commit |
|------|------|--------|
| T1 | lock.ts 业务异常不再被当锁竞争重放（写命令重复执行风险） | 487b593 |
| T2 | 桥接 P2 簇：errResult 加 isError / 轮询未就绪重试防半写假失败 / 陈锁仅 ESRCH / launch 退出码检测修死路径 | 311bd00 |
| T3 | 六工具 schema 收紧 z.enum（21/14/8/6/5/2 值全部从 Pascal 分发链核实）+ pcb_net_info 注解修正 | f37c9d9 |
| T4 | requestId 协议（TS 311bd00 + Pascal 1cd57d7）——**实机验证**：请求带 1 → 响应回带 1 | 1cd57d7 |
| T5 | 编码：请求方向 UTF-16LE+BOM 落地（94daf20，零 .pas 改动实机 PASS）；响应方向 BLOCKED | 94daf20 |
| T6 | add_via/add_text 坐标被布尔载体覆盖修复（过孔此前永远落 (1,1)） | 00cbc4c |
| T7 | RunOutputJobs nil 判空 + DisableDialog | 598110d |
| T8 | 批量引脚热点 get_all_pin_hotspots——**实机验证**：1738ms 全表 vs 旧路径单元件 1372ms | f9e718a |
| T9 | pascal-gate.cjs 四规则静态门禁，基线 14 违例与审查交叉验证一致 | d7f17be |
| T10 | instructions 29,434→7,932 字符（-73%）+ 库查询限流 | e4c71a3 |
| T11 | 收尾：全量 204/204 + 构建 + gate + CHANGELOG + 版本 0.2.1 + 重打包 | 本 commit |

## 实机验证亮点

1. **requestId 回带**：TS 发 1 → Pascal 解析 → response.json 回带 `"requestId": 1`——响应串台（审查 P1#2）从机制上封死。
2. **批量热点对比**（Sheet2，4 元件 8 引脚）：批量 1 次往返 1738ms 全表 vs 旧路径单元件 1372ms，引脚坐标/名称/隐藏位完全一致——审查 P1#6（大图分钟到小时级）解决。
3. **UTF-16LE 请求**：Pascal TStringList 自动识别 BOM，smoke PASS——活引擎实证，中文参数"进"方向打通。

## 事故与教训（本次实录）

1. **TEncoding.UTF8 编译不接受**（T5）：改 .pas 后 ping 触发 Error 对话框→全部命令排队超时（B29 同款机制）。ADODB.Stream 方案同样触发——疑似脚本引擎对 COM 实例化的安全弹框，无人值守只能看到无文本对话框。**处置流程已实战沉淀**：WM_CLOSE 关 "Error" 窗口即可解堵；彻底楔死杀 X2.EXE 冷启动。
2. **smoke 跑旧 dist**（T4 首验假失败）：改 src 后凡实机验证必须先 `tsc` 构建——`--noEmit` 只查类型不出产物。
3. **门禁测试样例污染**（T9）：样例注释含 "then"/"try" 关键词会命中行级检查；R1 正则初版漏了事故原句的 `<> nil`。两次在红测试下 amend 提交——全量必须放在 amend 前。
4. **磁盘 PrjPcb 实锤缺成员**：8-31 旧文件只含 Sheet2+PCB2，9 月会话加入的 Sheet1/3 从未保存工程文件——冷启动 DM 层枚举 0 的根因，已列入待用户决策（打开工程 Ctrl+S 一次）。

## 待用户决策（夜间一律跳过，全部记录在计划文件）

1. **T5 响应方向**：需实机读一次 Error 对话框/Messages 面板文案（候选：TEncoding 不支持 / COM 安全弹框 / CreateObject 受限）
2. **PrjPcb 保存**：AD 打开工程后 Ctrl+S 持久化 Sheet1/3 成员
3. GitHub push（dev 分支夜间提交约 15 个待推）
4. emc_audit 实机实测（需真实产品图纸）
5. 编排层接入方式、MCP SDK v2 迁移时机

## 版本

0.2.1（serverInfo 自动跟随）。部署包 `altium-mcp-intranet-20261103.zip`（staging 独立自检 PASS 后产出）。
