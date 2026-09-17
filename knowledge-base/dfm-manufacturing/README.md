# 可制造性设计（DFM）知识库 — 总索引

> 本知识库面向 AI Skills 和 Agent 的结构化检索，覆盖 PCB 从设计到制造的完整 DFM/ DFA 链路（叠层设计 → 拼板规则 → 钢网/丝印 → 测试焊盘 → 组装工艺 → 可焊性 → 检测标准），适用于 Altium Designer 环境下面向量产的 PCB 设计场景。

---

## 1. 知识库目录结构

```
knowledge-base/dfm-manufacturing/
│
├── README.md                          ← 本文件（总索引）
│
└── modules/                           ← DFM 设计模块知识库（5 个文件）
    ├── 01-stackup-design.md          ← PCB 叠层设计规范
    ├── 02-panelization-rules.md      ← 拼板与V-Cut/桥连规则
    ├── 03-solder-paste-stencil.md    ← 钢网与锡膏印刷
    ├── 04-test-pads-dfm.md          ← 测试焊盘与可测试性设计
    └── 05-assembly-process.md        ← 组装工艺与可焊性
```

---

## 2. 模块索引

| 编号 | 文件名 | 主题 | 关键技术点 |
|------|--------|------|------------|
| 01 | `01-stackup-design.md` | 叠层设计 | 层数选择/材料/阻抗/对称性/铜厚/介质厚度 |
| 02 | `02-panelization-rules.md` | 拼板规则 | V-Cut/桥连/工艺边/定位孔/Mark点 |
| 03 | `03-solder-paste-stencil.md` | 钢网设计 | 厚度/开孔/台阶钢网/锡膏量 |
| 04 | `04-test-pads-dfm.md` | 测试焊盘 | ICT/FCT/飞针/边界扫描/测试点密度 |
| 05 | `05-assembly-process.md` | 组装工艺 | 回流焊/波峰焊/器件间距/方向/热区 |

---

## 3. 知识库统计

| 类别 | 文件数 | 覆盖主题 |
|------|--------|----------|
| DFM 模块 | 5 | 叠层/拼板/钢网/测试/组装 |
| **合计** | **5** | **量产 DFM 全链路覆盖** |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-09-15 | 初始版本：5 个 DFM 模块 | AI Knowledge Base |
