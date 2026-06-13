<!-- mdformat global-off -->
# OfficeCraft AI 开发进展与演进记录 (Development Log)

本文档用于统一记录 OfficeCraft AI (2D 像素数字孪生办公室与空间交互沙盒) 的开发迭代里程碑、核心架构决策与后续待办。

---

## 🚩 当前里程碑：里程碑 15 (Phase 4 & Phase 5：流式多角晨会、情感记忆中枢与 8-Bit 音效合成全面落定)

随着 Phase 4 和 Phase 5 研发任务的圆满交付，OfficeCraft AI 已经发展成为一个具备高视听表现力、深度语义交互、长效记忆追踪和多智能体协同能力的数字孪生办公室！

### 1. 空间底层与自愈迁移 (Phase 2 Database & API Base - 已完成)
- **数据库表结构硬化**：在 `backend/app/models/orm.py` 中扩充 `User` 空间坐标，并新增 `UserEmotionalMemory`（长效情感记忆）与 `TeamMeetingLog`（每日晨会纪要）表。
- **启动无损自愈**：在 `backend/app/main.py` 中重构 `_self_heal_schema()`，确保在本地 SQLite 环境下免脚本自动 ALTER TABLE 添加坐标字段并初始化新表。
- **2D 空间路由接口**：开发 `space.py` 路由，提供 `GET /space/state`（无损空间状态恢复）、`POST /space/move`（带有 50ms 节流锁定的坐标同步）和 `POST /space/rag/search`（特定物理书架绑定的 ChromaDB 过滤检索）。
- **自动化测试矩阵**：在 `backend/tests/test_spatial_api.py` 中通过了全量场景隔离单元测试。

### 2. 前端 2D 像素 RPG 孪生控制台 (Phase 3 Frontend Spatial Engine - 已完成)
- **Zustand 全局空间存储 (`useSpaceStore.ts`)**：维护玩家坐标、碰撞拦截矩阵、当前的活跃任务以及临近互动的 NPC ID。采用**本地乐观位移**机制，保证玩家 WASD 按键反馈毫无卡顿，后台自动同步到 FastAPI。
- **25x25 绝对位移网格渲染 (`SpaceBoard.tsx`)**：
  - 完全排除了过重的 Canvas/Phaser 游戏引擎，使用 React DOM 硬件加速 `translate3d(x * 32px, y * 32px, 0)` 渲染大厅 (Lobby)、研发区 (Dev Bay)、会议室 (Meeting Room) 和资料库 (Archive Room) 四大坐标片区。
  - 设定了物理墙体、招待台、开发工位及 NPC 的严格碰撞矩阵。
- **环境光效管道 (Prompt-to-Light)**：实现了遮罩混合层（mix-blend-mode）与发光动画，根据当前的任务状态动态交替 **静谧幽蓝（Quiet-Blue，写代码状态）**、**警报深红（Alert-Red，技术异常）** 以及 **金色庆典（Celebrate-Gold，任务圆满交付）** 呼吸光效。
- **多智能体流式对话 HUD**：当玩家走进 NPC 1 格以内时，自动跳出复古交互气泡；按下 `[Space] / [Enter]` 会打开底部一体化对话框，支持 Typewriter 打字机式实时流式问答。
- **实体书架 RAG 边栏检索 Drawer**：点击资料库的书架，滑出精美的毛玻璃检索面板，支持对特定学科（Pandas 数据清洗 vs 软件设计模式）的 ChromaDB 语义向量切片提取，并高亮显示匹配度得分。

### 3. 多角色流式站会编排与情感记忆深度注入 (Phase 4 Standup & Memory - 已完成)
- **长效情感记忆中枢**：开发了 LLM 驱动的自动记忆提取与压缩机制。当玩家在工位提交开发任务评审时，系统自动将评审中暴露的代码问题（如 N+1 缺陷、 SettingWithCopy 警告）压缩为一条一句话的主观记忆并持久化在 SQLite 中。
- **系统 Prompt 动态注入**：重构 `app/services/agents/base.py`，前置查询该用户最近 3 条 `UserEmotionalMemory`。高凌在后续指派新任务或技术交流时，能主动、自然地提及玩家历史的开发失误或高光表现，打造“有温度”的长效 AI 导师。
- **多智能体流式站会编排 (`team_orchestrator.py`)**：实现了会议讨论区队列轮转对话。玩家按下 Enter 发起站会，PM Amy 首先发表业务和迭代看法，第一顺位流式推送完成后，后端自动合并 Amy 的发言与玩家记忆，作为上下文塞入高凌 Prompt，高凌接着发表流式技术规范和今日任务指派，整个过程在前端晨会终端中无缝顺畅。
- **团队冲突调解与博弈**：当任务发生挫折时，会议圆桌爆发出紧急黄色呼吸光效。玩家走到圆桌处按 Enter 打开斡旋面板，可调解 PM（上线速度优先）与技术主管（代码质量优先）的争吵，大模型根据玩家选择生成独特剧情回馈并增减玩家 XP 经验值。

### 4. 纯客户端 8-Bit 复古音效合成与端到端沉浸感 (Phase 5 Audio Synthesis - 已完成)
- **Web Audio API 8-bit 合成引擎 (`audioManager.ts`)**：构建了完全零外部静态文件依赖、零加载延迟的实时发声合成器：
  - **机械踩踏脚步声 (`Step`)**：本地 optimistic 位移时瞬间触发低频 triangle-wave thump 声，保证了极高响应度的操作反馈。
  - **打字机嘀嗒声 (`Typewriter`)**：为流式 SSE 会议、Feynman 辅导、冲突仲裁的文本逐字输出配载了细致、柔和的高频 sine-wave 敲击 chirp 声。
  - **功能开合气泡声 (`Open` / `Close`)**：极富弹性的三角波频率扫频，用于所有面板、书架和对话模态框。
  - **雷达扫描扫频声 (`RAG Scan`)**：RAG 检索点击“搜索”时自动触发一个连续向上攀升的锯齿波扫频（sawtooth frequency sweep）。
  - **环境主题背景声 chimes**：
    - `quiet-blue`（静谧蓝）：触发优美温润的 C Major 7 琶音风铃声。
    - `alert-red`（警报红）：高低音阶交替扫描、充满红白机警报质感的 8-bit siren 笛音。
    - `celebrate-gold`（金色庆典）：上扬的大三和弦 8-bit 方波胜利乐章。
- **持久化 preferences 与 HUD 控制挂件**：
  - 在大厅主 HUD 头部集成了一个紧凑复古的音量控制面板，包含静音开关（`🔊` / `🔇` 图标）和 VOL 分段拖动条，支持修改自动取消静音。
  - 音量数值和静音状态实时、自动加密同步于浏览器 `localStorage`，重新加载不丢失。
- **完美打包与类型双通过**：通过 `npx tsc --noEmit` 静态类型验证，且 Next.js SSR 服务端渲染 `npm run build` 全站打包 100% 成功。

---

## 🚀 未来迭代推进展望 (Next Steps & Future Roadmap)

随着重构项目核心的 2D 物理网格、大模型多智能体会议、RAG、Promp-to-Light 与 8-bit procedural 声音合成等主干功能全部完工交付，未来的系统可探索与拓展包括：

1. **AI 动作雪碧图 (Sprite Sheets) 扩展**：
   - 增加小人在不同方向行走时的简易像素腿部摆动微动效。
2. **多玩家局域网孪生 (Local Multiplayer Multiplexing)**：
   - 使用 WebSockets 实现同一局域网下的多个学员像素角色在同一个办公室中行走、打字、共同参与同一场晨会冲突仲裁，提升多人协作乐趣。
3. **更广博的书架知识切片库**：
   - 将后端 ChromaDB 的预热 RAG 切片库扩展到全功能微服务、Docker 编排以及 SQL 深度调优，让玩家在点击其他实体家具时能够解锁更多维度的专业知识。
