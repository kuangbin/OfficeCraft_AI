# OfficeCraft AI 贡献指南 (Contributing Guide)

欢迎参与 **OfficeCraft AI (2D 像素数字孪生办公室与空间交互沙盒)** 项目！为了保障团队在开发空间寻路、多角色 Agent 会议以及 Prompt-to-Light 动态光效时的敏捷解耦与代码质量，请遵循以下开发规范。

---

## 一、 开发协作流程

1. **Fork 本仓库**并克隆到您的本地物理目录。
2. **创建专属功能分支**：命名建议采用 `feature/space-movement`、`feature/rag-bookcase`、`bugfix/collision-interceptor` 格式。
3. **提交代码更改**：确保每次提交符合 Git 语义化规范，不混淆功能、不破坏老契约。
4. **运行测试套件**：提交前必须在 `backend` 目录下通过 `python -m unittest discover -s tests` 验证。
5. **开启 Pull Request**：请求合并前需关联相关的 Issue 或 Milestone。

---

## 二、 团队角色与核心职责

OfficeCraft AI 作为一个集成了 **2D 物理空间、大模型编排、向量 RAG、游戏感官音视频** 的数字孪生项目，对开发角色分工进行了如下专业规划：

### 1. 2D 空间与前端渲染工程师 (2D Space & Frontend Engineer)
- **主要职责**：负责 Next.js (React) 项目结构搭建，编写 CSS Grid 地图层，管理 Zustand `useSpaceStore` 状态机。
- **技术要点**：
  - 维护 25×25 碰撞校验矩阵，实现流畅的 WASD 位移检测与 `translate3d` 硬件加速平移。
  - 渲染 `[Space] Talk` 悬浮组件，编写 8-bit FC 复古电音的同步触发。
  - 实现基于 CSS Backdrop-filter 与 CSS variables 的 **Prompt-to-Light 环境光效感知涂层**。

### 2. 叙事设计与产品策划 (Narrative Designer & PM)
- **主要职责**：负责办公室 2D 瓦片网格与物理障碍布局策划，设计高凌、郑莹及 Amy 等 NPC 的独立人格、说话口头禅、动作雪碧图 (Sprite Sheets)。
- **技术要点**：
  - 设定各阶段关卡的物理坐标和 RAG 实体书架存放位置。
  - 编排每日晨会 (Daily Standup) 的话术队列，以及多人冲突博弈的仲裁评分阈值。

### 3. 后端中枢与 AI 架构师 (Backend & AI Architect)
- **主要职责**：负责 FastAPI 异步接口逻辑，编写 `TeamMeetingOrchestrator` 多角色对话编排。
- **技术要点**：
  - 设计 SQLite 空间关系模型，并实现表自愈。
  - 架构 **记忆继承引擎 (Memory Inheritance)**：实现 `UserEmotionalMemory` 存储、最近记忆召回、及拼装注入 LLM 统一 API payload。

### 4. 检索与向量数据库工程师 (RAG & Vector Engineer)
- **主要职责**：负责本地物理书架 RAG 切割和向量化索引。
- **技术要点**：
  - 使用 MD5 确定性 Hashing 离线哈希特征算法在应用启动时预温，防止由于主键易变引起检索冲突。
  - 实现基于物理书架唯一 ID (`bookcase_id`) 的定向 RAG 段落相似度与词频加权 (Hybrid Seek) 混合召回。

---

## 三、 提交与代码规范

- **前端**：采用 React Hook 组织结构，严格控制 `useSpaceStore` 与后端 API 交互频率（WASD 位移强制 50ms 节流），禁止全局盲目 `.trim()` 破坏 SSE 字符空格。
- **后端**：严格遵循 PEP8 编码风格，新增的 ORM、Pydantic 校验和 API 实体需在 `orm.py` 或特定 schema 中集中声明，路由内禁止裸 print，统一使用 Logger。
- **文档维护**：如果您对 API 路由、ADR 方案或系统拓扑进行了重构，请务必同步更新 `docs/specification/` 下对应文档，并在 Pull Request 标题中标记 `[Doc Sync]`。