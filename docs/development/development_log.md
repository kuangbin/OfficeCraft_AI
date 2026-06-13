<!-- mdformat global-off -->
# OfficeCraft AI 开发进展与演进记录 (Development Log)

本文档用于统一记录 OfficeCraft AI (2D 像素数字孪生办公室与空间交互沙盒) 的开发迭代里程碑、核心架构决策与后续待办。

---

## 🚩 当前里程碑：里程碑 14 (Phase 3：2D 像素数字孪生办公室与前端交互层全面落定)

随着 Phase 3 研发任务的圆满交付，OfficeCraft AI 已经全面打通了底层的 **2D 空间物理数据库**、**Chebyshev 运动临近判定**、**Zustand 全局状态引擎**、**硬件加速 Translate3D 网格渲染** 以及 **物理实体书架 RAG 语义检索**！

### 1. 空间底层与自愈迁移 (Phase 2 Database & API Base - 已完成)
- **数据库表结构硬化**：在 `backend/app/models/orm.py` 中扩充 `User` 空间坐标，并新增 `UserEmotionalMemory`（长效情感记忆）与 `TeamMeetingLog`（每日晨会纪要）表。
- **启动无损自愈**：在 `backend/app/main.py` 中重构 `_self_heal_schema()`，确保在本地 SQLite 环境下免脚本自动 ALTER TABLE 添加坐标字段并初始化新表。
- **2D 空间路由接口**：开发 `space.py` 路由，提供 `GET /space/state`（无损空间状态恢复）、`POST /space/move`（带有 50ms 节流锁定的坐标同步）和 `POST /space/rag/search`（特定物理书架绑定的 ChromaDB 过滤检索）。
- **自动化测试矩阵**：在 `backend/tests/test_spatial_api.py` 中通过了 8/8 场景隔离单元测试。

### 2. 前端 2D 像素 RPG 孪生控制台 (Phase 3 Frontend Spatial Engine - 已完成)
- **Zustand 全局空间存储 (`useSpaceStore.ts`)**：维护玩家坐标、碰撞拦截矩阵、当前的活跃任务以及临近互动的 NPC ID。采用**本地乐观位移**机制，保证玩家 WASD 按键反馈毫无卡顿，后台自动同步到 FastAPI。
- **25x25 绝对位移网格渲染 (`SpaceBoard.tsx`)**：
  - 完全摒弃了过重的 Canvas/Phaser 游戏引擎，使用 React DOM 硬件加速 `translate3d(x * 32px, y * 32px, 0)` 渲染大厅 (Lobby)、研发区 (Dev Bay)、会议室 (Meeting Room) 和资料库 (Archive Room) 四大坐标片区。
  - 设定了物理墙体、招待台、开发工位及 NPC 的严格碰撞矩阵。
- **环境光效管道 (Prompt-to-Light)**：实现了遮罩混合层（mix-blend-mode）与发光动画，根据当前的任务状态动态交替 **静谧幽蓝（Quiet-Blue，写代码状态）**、**警报深红（Alert-Red，技术异常）** 以及 **金色庆典（Celebrate-Gold，任务圆满交付）** 呼吸光效。
- **多智能体流式对话 HUD**：当玩家走进 NPC 1 格以内时，自动跳出复古交互气泡；按下 `[Space] / [Enter]` 会打开底部一体化玻璃态对话框，支持 Typewriter 打字机式实时流式问答。
- **实体书架 RAG 边栏检索 Drawer**：点击资料库的书架，滑出精美的毛玻璃检索面板。不仅提供 DataFrame merge、SOLID 原则等快捷高频词，更支持对特定学科（Pandas 数据清洗 vs 软件设计模式）的 ChromaDB 语义向量切片提取，并高亮显示匹配度得分。
- **50ms 强制节流拦截**：在 `src/app/page.tsx` 中嵌入键盘按键时间戳限制，拦截瞬间高频的 WASD 按键 spam 冲击后端数据库。
- **打包全量通过**：运行 `npm run build` 和 `npx tsc --noEmit` 双重验证，全站 100% 静态路由/动态接口编译无差错通过。

---

## 🚀 下一步开发与推进指南 (Next Steps & Phase 4 Guide)

随着 2D 像素空间物理与交互引擎的全量落地，重构项目即将进入 **Phase 4：多角色流式站会编排与情感记忆深度注入 (Multi-Agent Standup & Emotional Memory Integration)**：

### 阶段四：多角色流式站会编排与情感记忆深度注入 (Phase 4)

#### 4.1 情感记忆持久化与系统 Prompt 注入 (Emotional Memory Infusion)
- **设计愿景**：让 AI 导师“记住”玩家在任务中的优缺点，实现“人与空间的深度对话”。
- **研发细期待办**：
  - 在后端评审任务（`POST /api/v1/missions/evaluate`）返回结果时，针对评审中发现的代码质量缺陷、技术失误，自动向 `user_emotional_memories` 数据库中写入一条带有 `sentiment="negative"`、`tag="exception-handling"` 或者是高光时刻 `sentiment="positive"`, `tag="solid-patterns"` 的长效情感记录。
  - 重构后端的 AI 聊天与评审 Prompt 构建机制（`app/services/agents/base.py` 里的 `build_prompt`）。在系统 System Prompt 装配前，前置查询该用户最近的 3-5 条 `UserEmotionalMemory`。
  - 将记忆格式化为：`[情感反馈上下文] 玩家曾在此工位提交过存在 SettingWithCopyWarning 缺陷的代码，你曾在评审中提醒过他，请在后续对话中以严厉但关切的技术主管口吻跟进他是否改正。`

#### 4.2 每日流式晨会编排系统 (Multi-Agent Standup SSE Orchestration)
- **设计愿景**：还原数字孪生办公室中“多智能体唇枪舌战”的沉浸氛围。
- **研发细期待办**：
  - 在 `backend/app/services/team_orchestrator.py` 中实现多智能体发言队列。
  - 当玩家在会议讨论区启动“每日晨会（Daily Standup）”时，触发 SSE（Server-Sent Events）推送。
  - **发言轮询控制**：由 PM Amy 首发流式发言（吐槽业务迭代快、部署压力大），第一顺位流式推送完成后，后端自动捕获 Amy 的发言文本作为上下文，塞入 Tech Lead 高凌的 Prompt，继而流式吐出高凌的发言（就代码规范提出警告并分发今日任务文件 URL）。整个唇枪舌战过程完全自动化串联，流式呈现在前端晨会终端中。

#### 4.3 团队冲突博弈与多角色斡旋 (Conflict Arbitration)
- **设计愿景**：处理多角色团队分歧，增强沙盒博弈乐趣。
- **研发细期待办**：
  - 开发团队冲突斡旋任务：当任务失败或迭代延期时，PM Amy 与 Tech Lead 高凌在会议讨论区工位会爆发出黄色光效冲突（UnresolvedConflict）。
  - 玩家需要在其间走动并作为技术纽带，提供斡旋决策和方案润色，解决团队博弈瓶颈。

### 阶段五：音效合成与端到端沉浸感打磨 (Phase 5 Polish)
- **合成 8-bit 复古音效**：
  - 为玩家移动增加轻快的 `Step` 机械感声效。
  - 为对话框打字机效果、RAG 数据库加载、主题灯效转换（幽蓝/紧急红）配载定制化的合成器 Synthesizer 声效，让玩家在视觉、听觉和交互层面获得最尊贵的沉浸式 WOW 体验。
