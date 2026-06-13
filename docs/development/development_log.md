<!-- mdformat global-off -->
# OfficeCraft AI 开发进展与演进记录 (Development Log)

本文档用于统一记录 OfficeCraft AI (2D 像素数智化数字孪生办公室) 的模块设计进化、里程碑交付细节以及未来技术规划路径。

## 🚩 当前里程碑：里程碑 18 (Phase 7, Phase 8 & Phase 9：多人同步广播、全屏 CRT 控制台、一体化毛玻璃面板与高维交互式技能星图全面交付)

随着 Phase 7、Phase 8 以及 Phase 9 研发任务的圆满交付，OfficeCraft AI 已经演进为一个将 2D 像素办公室、多智能体流式协作晨会、RAG 语义检索、8-Bit 实时发声引擎、多人联机以及点亮式技能Constellation结合的全新一代沉浸式极客实训平台！

---

## 🛠️ 历史与当前里程碑交付回顾

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
- **多智能体流式站会编排 (`team_orchestrator.py`)**：实现了会议讨论区队列轮转对话。玩家按下 Enter 发起站会，PM Amy 首先发表业务和迭代看法，第一顺位流式推送完成后，后端自动合并 Amy 的发言与玩家记忆，作为上下文塞入高凌 Prompt，高凌接着发表流式技术规范 and 今日任务指派，整个过程在前端晨会终端中无缝顺畅。
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

### 5. RPG 角色走动转向与像素行走动画 (Phase 6 RPG Walk Cycle & Direction-Facing Animations - 已完成)
- **Zustand 转向与行走状态维护**：在全局状态机 `spaceStore.ts` 中引入 `facingDirection` ('down' | 'up' | 'left' | 'right') 以及 `isWalking` (boolean) 状态，并在玩家位移时 optimistic 计算，动作结束后 120ms 自动复位，确保走动与站立状态自如。
- **DOM 属性平滑驱动**：在 `<div className="pixel-char-sprite">` 元素上绑定 `data-direction` 与 `data-walking` 自定义属性，直接用现代 CSS 属性选择器关联不同姿态，不影响渲染性能。
- **精心调校的 CSS 复古动画**：
  - **走动身体起伏 (`pixel-char-bounce`)**：在走动时，身体部分发生微小像素高度起伏，表现呼吸与踏步弹性。
  - **双腿剪刀步摆动 (`pixel-legs-swing`)**：通过动态修改双脚 `box-shadow` 的水平偏移，合成 8-bit 经典像素双腿交替迈步、腾空、落地的视觉动效。
  - **四方向转向响应**：
    - 面向左/右方时，眼睛与红润脸颊、头发微小向对应侧倾斜偏移。
    - 面向上方（背对屏幕）时，应用后脑勺发色覆盖皮肤脸部，并自动隐藏前胸领口/领带，完全展现背面视角。

### 6. 多人 WebSocket 状态复用 (Phase 7 Multi-Player WebSockets Sync - 已完成)
- **实时多人连接管理**：在 FastAPI 后端搭建 `ConnectionManager` 机制，管理全局活动玩家状态。当多标签页或局域网内其他玩家加入、移动、打字时，通过 WebSockets 实时广播事件数据包。
- **2D 角色像素虚拟化广播**：
  - 前端 `SpaceBoard.tsx` 通过 `remotePlayers` 数据集进行同步绘制。通过对 `player_id` 哈希值进行 `hue-rotate` 滤镜渲染，动态计算唯一的像素服饰、头发及配饰色调，避免小人颜色单调重复。
  - 实现多人联机打字泡泡提示，若其他人在文本交互中，头像上方会自动跳出 `Guest typing...` 动态省略号气泡，增强多人虚拟协同感。

### 7. 全屏 2D 虚拟办公室控制台与一体化模态系统 (Phase 8 Viewport Cockpit Panel & Overlays - 已完成)
- **Viewport 全屏视口锁定 (`page.tsx`)**：
  - 重构前端总入口，移除常规滚动布局，通过 `100vw` & `100vh` 结合 `overflow-hidden` 硬锁定，使整个游戏控制台彻底变成无缝衔接的一体化 2D 像素大屏幕（Single-Page Cockpit）。
- **微颤 CRT 物理显像管滤镜**：
  - 设计了复古 `.crt-scanline-overlay` 及 `.crt-flicker` 柔和微闪动画，将 8-bit 显示器的暗边、颗粒感和栅格扫描线高度拟真，提供极具沉浸感的控制舱环境。
- **一体化高保真毛玻璃抽屉式面板 (Unified Glassmorphic Overlays)**：
  - 注册了包括 **路线前台 (Lobby)**、**任务展板 (Quests)**、**成就里程碑勋章墙 (Portfolio)**、**社区共建工单 (Community)**、以及 **代码实训沙盒 (Sandbox)** 的全套磨砂玻璃抽屉弹窗。
  - **同步编译屏幕抖动 (Screen Shake)**：点击 Sandbox `运行测试` 编译时，触发 `.console-screen-shake` 模拟机器高速计算抖动；若运行成功，触发 **Celebrate Gold（金色庆典）** 主题灯光及琶音风铃声；若失败，触发 **Alert Red（警报深红）** 主题灯光和笛音警报。

### 8. 交互式能力星图终端与静谧幽蓝 contemplation 机制 (Phase 9 Skill Constellation & Matrix - 已完成)
- **量子核心技能星图终端 (`pixel-server-rack`)**：
  - 在 Archive Room 机房坐标 `(18, 15)` 设计了精美的像素风主机柜，采用 CSS 水平渐变线条展现机械插槽、拉手，配以交替循环闪烁的青色/绿色微型指示灯，使机房不再单调冷冰。
- **物理障碍阻挡**：
  - 扩展 `spaceStore.ts` 的碰撞索引，阻止角色直接穿透或踩在主机柜上（碰撞坐标 `(18, 15)`），必须站在其四周（1格内）物理靠近进行量子通信。
- **Contemplation (深思) 氛围大灯平滑换色**：
  - 按下 `Space` / `Enter` 量子通信或点击右侧 HUD 快捷跳转打开 **技能星图 (Skill Tree)** 面板时，会触发扫频音效，并将环境灯一键切换为 **Quiet Blue (静谧幽蓝)**，提供低调深邃、更利于集中注意力的极客研究环境。关闭面板时，柔和还原默认正常光照。
- **技能树动态同步组件**：
  - 挂载高品质 `CareerSkillTree`，实时将点亮的技能星树信息呈现出来，并在左侧 HUD 自适应渲染 `当前已点亮能力: {unlocked} / {total} 个节点` 进度。

---

## 🚀 未来迭代推进展望 (Next Steps & Future Roadmap)

随着重构项目核心的 2D 物理网格、大模型多智能体站会、RAG 书架、Promp-to-Light、Web Audio 8-bit 合成、多人联机以及全新交互式技能星图系统的全部落定交付，未来的系统可探索与拓展包括：

1. **AI 动作雪碧图 (Sprite Sheets) 扩展 (Phase 10 - 规划中)**：
   - 增加小人在不同方向行走时的精细像素腿部摆动微动效、手部提拿工具包细节，以及与家具（沙发、前台）碰触时的简易坐姿/翻书等交互动效，进一步精细化 2D RPG 的代入表现。
2. **多玩家局域网协同深度联机 (Multiplayer Depth Co-Op - 规划中)**：
   - 允许同一局域网内的多个角色在同一个办公室中合作攻克代码沙盒、共同参与多智能体晨会、共享 RAG 文档库搜索加成，或者组队进行书页收集挑战。
3. **更广博的技能图谱与实训沙盒 (Constellation & Sandbox Depth - 规划中)**：
   - 将后端代码编译器扩展到更复杂的算法多文件重构测试、Docker 容器沙箱运行时隔离、以及高级 SQL 优化等深度业务实训场景。
