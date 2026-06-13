<!-- mdformat global-off -->
# OfficeCraft AI 开发进展与演进记录 (Development Log)

本文档用于统一记录 OfficeCraft AI (2D 像素数智化数字孪生办公室) 的模块设计进化、里程碑交付细节以及未来技术规划路径。

## 🚩 当前里程碑：里程碑 21 (Phase 14：多人协同实训任务、同业代码评审与共享实时战役全面交付)

随着 Phase 14 研发任务的圆满交付，OfficeCraft AI 迎来了革命性的多人协作升级，正式支持中心协作白板感应、多端同业代码提审（Sandbox Submit）、分屏双窗审查工作流、双色 Web Audio 和弦合成反馈，以及智能 AI 导师单人备用自动回评与 XP 联机分发机制！

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
  - **机械踩踏脚步声 (`Step`)**：本地 optimistic位移时瞬间触发低频 triangle-wave thump 声，保证了极高响应度的操作反馈。
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

### 9. 2D 孪生视口极简重构与精细对齐 (Phase 10 Viewport Scales & Realignment - 已完成)
- **视口动态等比缩放**：
  - 重构前端外围，消除了地图在不同分辨率下的错切与拉伸。2D 孪生主视图支持在 `scale-[0.85]` 至 `scale-[1.15]` 之间平滑适配缩放，将整屏利用率优化到最大。
- **侧边状态栏折叠极简设计**：
  - 将左侧状态面板 (`🛠️ 主控面板状态栏`) 重构为 `isLeftPanelOpen` 状态锁控，可滑入滑出 (`transition-all duration-300`) 隐藏至屏幕外。在折叠时顶角呈现极简的 `🛠️ 空间主控` 悬浮气泡，一键唤醒，极大延展了办公室物理视野。
- **霓虹飞渡导航 FAB 重构**：
  - 彻底移除了臃肿死板的右侧大板块，代之以右下角 `fixed bottom-6 right-6` 的发光 `🚀 飞渡导航` FAB。点击可一键展开磨砂玻璃 travel dock 环状卡片组（Lobby、Quests、Portfolio、Whiteboard、Sandbox、Skill Tree），均具备荧光描边和精美悬浮动画。
- **动态雷达感应 HUD**：
  - 底部中央的 `📡 空间雷达传感器` 设定为常态隐藏。只有当玩家走到大厅接待台、工位、机房服务器、会议圆桌相邻 1 格范围时，它才会以霓虹描边气泡形式从底部缓缓升起，提供即时操作引导（如按 `Space/Enter` 开启对应面板）。
- **探探照灯物理混合蒙版**：
  - 引入 `mix-blend-multiply` 物理混合图层，在玩家足底渲染具有当前氛围主题色（Quiet Blue 浅蓝、Alert Red 猩红、Celebrate Gold 暖金、Default 暖白）的径向渐变探照灯晕。配以人物底部椭圆半透明落脚阴影，打造好莱坞探险级极客大厅。
- **双格错位与不对齐完美自愈**：
  - 纠正了 translate3d 转换导致整体垂直位移偏差 2 格的 bug，对所有网格绝对元素（玩家、NPC、服务器、书架、隔断木墙等）强力应用 `top-0 left-0`，并调整像素网格覆盖尺寸 `.bg-pixel-grid` 至标准的 `32px 32px`，实现严丝合缝的物理行走。
- **开发工位 B (Row 17) 错位物理修复**：
  - 查出并排除了 `globals.css` 中 `.pixel-dev-desk` 被不当声明的 `position: relative` 样式（该样式干扰了 absolute natural flow），使工位 B 视觉位置完全退回至 Row 17 物理碰撞位置，达成 100% 视触觉一致。

### 10. 交互手势骨骼、动作姿态与家具联动 (Phase 11 Action Stances & Handheld Items - 已完成)
- **肢体骨骼手臂与复古公文包**：
  - 为玩家装配了独立的左/右胳膊元素 (`.pixel-char-arm-l` 与 `.pixel-char-arm-r`)。行走时手臂左右交替挥舞，左侧更是提拿一个程序员复古小皮包 `.pixel-char-bag`，在足侧高频上下振动，赋予其无与伦比的像素活力。
- **无状态按需动作姿态推导 (Stateless Stances)**：
  - **沙发入座姿态 (Sitting)**：当走进大厅沙发或休息区沙发时，人物高度微沉 4px，双腿曲折内缩，双手扣拢在前胸，底层落脚阴影瞬间隐去，皮包靠在沙发旁，进入逼真的惬意入座姿态。
  - **实体书架查阅 (Reading)**：查阅 RAG 书架区时，双臂内扣，手心浮现一本正在高频轻颤、带有左右页码翻转闪烁动效的蓝色教科书 `.pixel-char-book`。
  - **工位沙盒编程 (Typing/Working)**：在工位桌旁点击开启代码沙盒时，人物捧出一台超薄便携本电脑（带有真实的浅蓝色发光 screen panel 倒影），双小臂交替进行 furious typing 超高速代码编写击键动效。
  - **晨会发表演讲 (Talking/Gesturing)**：在圆桌站会或 NPC 对话中，左手臂会在身前进行缓慢、周而复始的圆形演说交谈比划手势，右手臂平垂。
- **multiplayer 同等联机同步率**：
  - 此姿势计算直接与 Socket 的 `p.isTyping` 状态及地图坐标状态结合。多标签页和局域网下 remote guest 玩家能完美渲染出上述姿态微动效，极大地提升了 co-op 虚拟办公代入感。

### 11. 空间实时聊天、Q弹消散泡泡与 8-Bit 和弦鸣笛 (Phase 12 Real-Time Spatial Chat - 已完成)
- **多端 WebSocket 实时聊天广播**：
  - 在 FastAPI `space.py` 中新增对 `"CHAT"` 报文的处理，实现全局快速消息分发。通过 `exclude_player_id` 在广播时直接剔除了发送源玩家，确保前端消息无冗余延迟与网络回环。
- **Q 弹缩放式 5s 自动消散聊天气泡**：
  - 在大厅主控角色（"You" 徽章标定）与来访客（"Guest" 标定）头顶绘制了精美的 RPG 聊天气泡。采用 `@keyframes speechBubbleAnimation` 实现优雅的弹性缩放登场、高亮停留、并在第 5 秒结束时滑行向后淡出抹除的生命周期。
  - 运用 React 中的 `timestamp` 状态做 `key` 绑定重构，当玩家在 5 秒内连续发言时，气泡会无损销毁并重新初始化时间轴。气泡框线与文字色彩通过发送人哈希自适应计算（You 为高亮青色，Guest 为专属变套色）。
- **一体化折叠聊天 HUD 与智能避让**：
  - 在主视图左下角构造了磨砂毛玻璃材质的极简 `💬 SPATIAL CHAT` 控制面板。配备有聊天记录自动置底滚动条（`scrollIntoView`）和 collapse 折叠/展开控制开关。
  - **首创左侧主控避让系统**：当左侧状态面板展开时，聊天 HUD 滑移至 `left-[315px]` 避让；折叠时，归位回 `left-6`，完美统筹了屏幕空间利用率。
- **控制快捷键拦截**：
  - 设定了极速键盘交互：按下快捷键 **`T`** 或在空旷无交互点按 **`Enter`** 键即可瞬间唤醒并将光标焦点锁死在空间聊天框中；按 **`Escape`** 瞬间离焦输入，光标退回到 WASD 游戏运动层。
- **纯程序 8-Bit 鸣笛**：
  - 当收到其他玩家的空间发言广播时，前端合成器无延迟实时合成一个清脆温润的双音色琶音和弦 chime (A5 + E6 arpeggio: `880Hz` -> `1318.51Hz`)，无需载入外部音频包，实现纯算力音频渲染。

### 12. 虚拟办公室技术事故、服务器离线抢修与应急指挥（Phase 13: Virtual Office Events, Server Outages, and Incident Command Room - 已完成）
- **自愈式数据库表结构升级 & 兼容机制**：
  - 在 SQLite `User` 表中追加了 `active_anomaly` (boolean)、`anomaly_cpu` (integer) 以及 `anomaly_status` (string) 三个全新的高可靠度异常跟踪字段。
  - 在后端 `app/main.py` 的自愈启动拦截管道中，完美扩充了 `_self_heal_schema()` 执行链路。检测到字段缺失时自动在本地非生产环境执行 `ALTER TABLE` 升级，做到 100% 数据库零脚本零冲突自愈平滑升级。
- **自定义故障注入与自愈诊断 API**：
  - 设计了异常动作 schema `SpaceAnomaly` 以及全新的两组技术故障生命周期端点：
    - `POST /space/anomaly/trigger`：人工/随机注入异常故障，自动将当前 CPU 利用率拉升至 `100%`，并将状态标记为 `overload`，同时利用 Python 异步套接字瞬时将异常状态全局广播（`ANOMALY_TRIGGER`）。
    - `POST /space/anomaly/resolve`：获取玩家输入的重构脚本，在预置沙箱编译器中对代码进行语法分析与语义匹配。检测到玩家针对性编写了合法的 `CREATE INDEX` SQL 性能优化脚本、或符合高可用规范的 `try-except` 与 `rollback()` Python 故障回滚重试机制，则判定重构通过：将系统 CPU 利用率优雅归位至健康态 `12%`，更新状态为 `resolved`，向玩家发放 `+50 XP` 的丰厚实训经验值，并全局广播自愈消息（`ANOMALY_RESOLVED`）。
- **Zustand 全局故障生命周期订阅与 WebSockets 广播响应**：
  - 扩展前端 `spaceStore.ts` 注册了 `activeAnomaly` 核心故障状态机、以及 `triggerAnomaly`、`resolveAnomaly` 等网络业务原子动作。
  - 升级 WebSocket 事件解包分发管道。在收到服务端推送的 `"ANOMALY_TRIGGER"` 时，无延迟启动纯程序红闪报警笛音，进入猩红紧急响应模式；收到 `"ANOMALY_RESOLVED"` 时，立即切换到金色庆典重大琶音和弦音效，全站复原正常状态。
- **2D 孪生高拟真服务器应急机柜 & 雷达红闪警示**：
  - 在 Archive Room (18, 15) 的核心机房主机柜上外挂了精细的像素粒子红色故障闪烁 Beacon 指示灯，并伴有规律的高频红白机红色故障发光。
  - 只有当玩家走到机柜相邻 of 1 格以内时，底部的常态隐藏空间雷达会徐徐升起霓虹描边气泡，高亮显示 `⚠️ [Space] 故障抢修！` 操作引导，提示玩家物理靠近并与其进行量子连接。
- **Web Audio API 8-Bit 实时扫频笛音与喜庆和弦 chimes**：
  - 通过纯客户端 Web Audio 震荡器 (OscillatorNode) 构建了极富复古代入感的程序音效：
    - **紧急事故扫频笛音 (`playAlarmSiren`)**：通过在 300ms 周期内利用指数频率扫描将锯齿波在 `330Hz` 与 `660Hz` 之间交替往复，仿真红白机硬件极速升降频报警声。
    - **抢修成功大琶音 (`playCelebrateGold`)**：基于方波无延时发声，实时合成一个充满极客胜利质感的 C Major Triad 琶音序列。
- **复古 CRT 绿幕终端抢修控制台 overlay**：
  - 双离焦按键屏蔽：在玩家开启故障应急面板后，WASD 等地图位移输入被完美拦截，并为终端文本域聚焦，保证输入体验流畅，离焦或关闭时优雅归还物理运动控制权。
  - **动态 CPU Sparkline 动效**：基于 SVG `<polyline>` 骨架和周期性随机 jitter 计算，在绿幕终端顶部实时绘制高精度的 CPU 10s 运行折线走势图。
  - **打字机打码交互 & 拟真诊断编译管道**：为故障诊断配备了逐字渲染输出、并辅以高频 Sine 波敲击嘀嗒声的编译器日志。编译失败时触发全视图 `.console-screen-shake` 颤抖动效，编译成功则重置状态、加成 XP 并在全大厅降下金色庆典灯光。

### 13. 多人协同实训任务、同业代码评审与共享实时战役 (Phase 14 Multiplayer Co-Op & Peer-to-Peer Review - 已完成)
- **中心协作数码白板 (Co-Op Digital Whiteboard) 与雷达感应**：
  - 在 Meeting Room 中心坐标 `(15, 5)` 设计了精美的紫色发光感应中心。当玩家走进其 1 格以内时，底部的 `📡 空间雷达传感器` 会徐徐升起紫色霓虹描边气泡，高亮显示 `👥 [Space] 协作白板！` 操作引导。
  - 按下 `Space` / `Enter` 会开启全屏分屏白板，同时在后台触发 **Quiet Blue (静谧幽蓝)** 的深思环境灯光并拦截 WASD 人物行走控制。
- **多端同业代码提审 (Sandbox Submit) 与内联提审面板**：
  - 升级 Sandbox 编程抽屉面板，在运行测试按钮旁集成亮丽的 **"👥 发起同业代码评审"** 按钮，支持在编程完成后，一键呼出具有极致磨砂玻璃质感的悬浮提审配置卡片。
  - 玩家在此可以为提审的 Python / SQL 脚本起一个响亮的标题，并一键提交至公共待评审队列。
- **全分屏双窗 CRT 绿幕审查终端**：
  - 协作白板主界面采用分屏设计：
    - **左侧控制面板**：采用双标签设计，允许在“活跃的团队协作任务”（展示正在协同调试的 Pandas/高可用任务等）和“同业代码评审”（列出全办公室玩家实时提交的代码提审请求）之间自由切换。
    - **右侧绿色 CRT 终端视口**：配备专业的复古等宽代码高亮显示。非提审人玩家可以直接选中任意未评审请求，阅读对方的代码内容，输入细致的指导意见（Commentary），并一键执行 `Approve` (通过) 或 `Reject` (打回)。
- **完全自审拦截锁 (Self-Review Lock) 与 XP 经验值协同分发**：
  - 代码防刷安全机制：在前端和后端同时校验，如果提审人与当前查看的评审人 ID 相同，则自动禁用右侧的动作按钮，代之以显目的琥珀色“你不能评审自己提交的代码！”安全警示卡，严防刷分。
  - **经验值联发**：当非提审人玩家提交 `Approve` 决定时，后端将自动为作者增加 `+30 XP`，为评审人增加 `+20 XP`，并即时通过 WebSockets 全局广播同步两者的主控经验槽。
- **自动单人 AI 导师异步回评调度器 (NPC Simulated Reviewer Fallback)**：
  - 完美解决单人离线/无联机队友时的测试冷启动问题：在后端数据库和 WebSocket 广播外挂了异步模拟调度器 `simulate_npc_review`。
  - 玩家提审 6 秒内若未被其他人类玩家处理，系统自动指派资深技术导师 (高凌 `npc_ling` 或 郑颖 `npc_ying`) 介入：
    - 对代码量过少的投机代码，直接发出 `Reject` 警告，指导玩家如何规范编写；
    - 对含有合法的 Python `try-except`/`rollback` 异常处理、或 SQL `CREATE INDEX` 高性能优化重构的脚本给予 `Approve` 高分并附带详细的专业技术建议，发放 `+30 XP` 并无缝触发 WebSocket 广播。
- **双色 Web Audio 8-Bit 程序和弦合成反馈**：
  - **提审创建铃声 (`playPeerReviewAlert`)**：收到他人提审的广播时，全办公室即时合成 A4 与 C#5 组成的超轻量 8-bit 双音色数码 chirp 颤音。
  - **评审通过大和弦 (`playPeerReviewApproved`)**：当代码成功通过评审（被人类或 AI 导师 Approve），系统瞬间级联合成由 C5, E5, G5, C6 构成的四音阶上扬 C Major 大三和弦琶音，充盈极客协同仪式感。

---

## 🚀 未来迭代推进展望 (Next Steps & Future Roadmap)

随着重构项目核心的 2D 物理网格、大模型多智能体站会、RAG 书架、Promp-to-Light、Web Audio 8-bit 合成、多人联机、智能机柜抢修以及全新协作白板同业评审系统的全部落定交付，未来的系统可探索与拓展包括：

1. **更广博的技能图谱与实训沙盒扩展 (Constellation & Sandbox Depth - 规划中)**：
   - 将后端代码编译器扩展到更复杂的算法多文件重构测试、Docker 容器沙箱运行时隔离、以及高级 SQL 优化等深度业务实训场景。
2. **多端同步分布式状态存储与本地仿真网络代理 (Advanced Multi-Node Spatial Networking - 规划中)**：
   - 实现更高级的多人多工位同时并发协同抢修，支持高并发锁和团队事件分布式原子操作。
3. **高保真协同团队看板与实时代码热敏监控 (Collaborative Team Board & Telemetry - 规划中)**：
   - 支持多人团队在线追踪技术债务指标、CI/CD 构建健康度，展示全办公室的实时热力图和调试效率排名。
