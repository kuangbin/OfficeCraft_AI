<!-- mdformat global-off -->
# OfficeCraft AI 开发进展与演进记录 (Development Log)

本文档用于统一记录 OfficeCraft AI (2D 像素数智化数字孪生办公室) 的模块设计进化、里程碑交付细节以及未来技术规划路径。

## 🚩 当前里程碑：里程碑 19 (Phase 10, Phase 11 & Phase 12：2D 孪生视口重构、AI 交互姿态动画与多人协同空间实时聊天及 8-Bit 鸣笛全面交付)

随着 Phase 10、Phase 11 以及 Phase 12 研发任务的圆满交付，OfficeCraft AI 进一步升华为集视口自适应缩放、多状态按需姿态推导微动效、RPG 极客头顶 5 秒消散聊天气泡、智能 HUD 面板位置避让和 Web Audio 纯程序发声于一体的高完成度 2D 数字孪生办公室实训空间！

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

---

## 🚀 未来迭代推进展望 (Next Steps & Future Roadmap)

随着重构项目核心的 2D 物理网格、大模型多智能体站会、RAG 书架、Promp-to-Light、Web Audio 8-bit 合成、多人联机以及全新交互式技能星图系统的全部落定交付，未来的系统可探索与拓展包括：

1. **多玩家多人协同深度联机游戏化机制 (Multiplayer Depth Co-Op - 规划中)**：
   - 支持多人在同一个实训关卡中共同调试同一套 Pandas 代码、进行代码审查挑战并分享增益 XP。
2. **更广博的技能图谱与实训沙盒扩展 (Constellation & Sandbox Depth - 规划中)**：
   - 将后端代码编译器扩展到更复杂的算法多文件重构测试、Docker 容器沙箱运行时隔离、以及高级 SQL 优化等深度业务实训场景。
3. **空间虚拟事件与突发技术故障 (Virtual Office Events - 规划中)**：
   - 增加随机的物理空间异常事件（如“数据库 CPU 满载”，伴有服务器机柜红灯爆闪），要求玩家快速组队前往对应工位或服务器，运用 RAG 文档检索知识协同合力编写解决脚本。
