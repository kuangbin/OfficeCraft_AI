# 🗺️ OfficeCraft AI - 2D 像素数字孪生办公室项目全景总结

OfficeCraft AI 是一款**面向技术学习者的 2D 像素风虚拟职场数字孪生沙盒系统**。它颠覆了传统职业培训枯燥、单向且孤立的形式，将“职业任务看板”重构为一张**可走动、可探索、有空间记忆的 2D 像素虚拟办公室地图**（采用类似于 Gather.town 和《星露谷物语》的经典 8-Bit 复古美学）。

---

## 🗺️ 系统架构拓扑 (System Architecture)

OfficeCraft AI 采用 light-weight、解耦的前后端分离架构，通过 WebSockets 与 SSE 支撑实时的空间位置、环境光效与多人协作。

```mermaid
graph TD
    classDef main fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4;
    classDef component fill:#313244,stroke:#f5c2e7,stroke-width:1.5px,color:#cdd6f4;
    classDef storage fill:#181825,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4;

    user[WASD / Arrow / Touch D-Pad] -->|50ms 节流输入| input[键盘/触控输入层]
    input -->| optimistic 本地乐观移动| store[Zustand useSpaceStore]
    store -->| 实时位置渲染| render[translate3d 硬件加速像素角色]
    store -->| 物理碰撞检测| matrix[25x25 碰撞矩阵]
    store -->| 触发脚步 & 界面音效| audio[audioManager Web Audio 合成器]
    
    store <-->| WebSocket 双向通信| backend_ws[@router.websocket /ws]
    store -->| API 轮询 / 请求| backend_api[FastAPI 路由群]
    
    subgraph FastAPI 后端中枢
        backend_ws <-->| ConnectionManager| sync[多玩家实时状态同步]
        backend_api -->| lock_manager.py| locks[LockManager 分布式租约锁服务]
        backend_api -->| team_orchestrator.py| standup[晨会与冲突博弈流式编排]
        backend_api -->| compiler.py & eval.py| sandbox_eval[沙箱代码语法 AST 校验与诊断]
        backend_api -->| rag.py| doc_rag[ChromaDB 向量检索库]
    end
    
    subgraph 关系与向量数据持久化
        locks <-->| SQLite 缓存| db_sqlite[(SQLite 数据库)]
        standup <-->| 晨会日志与情感记忆| db_sqlite
        doc_rag <-->| RAG 书架切片| chroma[(ChromaDB 向量存储)]
    end

    class user,input,store,render,matrix,audio,backend_ws,backend_api main;
    class sync,locks,standup,sandbox_eval,doc_rag component;
    class db_sqlite,chroma storage;
```

---

## 📊 开发里程碑与功能对照表

| 研发阶段 (Phases) | 核心涉及文件 | 交付核心功能 |
| :--- | :--- | :--- |
| **Phase 2 & 3**<br>空间底层与像素引擎 | `backend/app/api/v1/space.py`<br>`frontend_new/src/components/SpaceBoard.tsx` | 25x25 物理碰撞、无损状态自愈、`translate3d` 像素画格子、环境光效管道、对话/RAG 边栏。 |
| **Phase 4**<br>流式站会与长效记忆 | `backend/app/services/agents/base.py`<br>`backend/app/services/team_orchestrator.py` | 情感记忆压缩与注入（`UserEmotionalMemory`）、多智能体晨会 SSE 流式对话、圆桌冲突斡旋。 |
| **Phase 5 & 6**<br>复古音效与八方向动画 | `frontend_new/src/utils/audioManager.ts`<br>`frontend_new/src/stores/spaceStore.ts` | 纯客户端 Web Audio 8-bit 合成脚步/笛音/风铃、四方向行走身体起伏与双腿剪刀步摆动。 |
| **Phase 7 & 8**<br>WebSocket 联机与全屏视口 | `backend/app/api/v1/space.py`<br>`frontend_new/src/app/page.tsx` | 局域网/多端 `PLAYER_MOVE`、`CHAT` 报文分发、等比缩放、CRT 物理显像管扫描线。 |
| **Phase 9 & 10**<br>星图机柜与视口极简对齐 | `frontend_new/src/components/CareerSkillTree.tsx`<br>`frontend_new/src/app/globals.css` | 实体量子星图服务器 `(18, 15)`、霓虹飞渡导航 FAB、底部雷达 HUD、探照灯物理混合蒙版。 |
| **Phase 11 & 12**<br>肢体手势与实时空间聊天 | `frontend_new/src/components/SpaceBoard.tsx`<br>`frontend_new/src/stores/spaceStore.ts` | 胳膊与程序员复古小公文包、Q 弹 RPG 聊天气泡（5s 消散）、主控避让系统、和弦鸣笛 chirp。 |
| **Phase 13 & 14**<br>线上事故、机柜抢修与协同 | `backend/app/services/compiler.py`<br>`backend/app/services/eval.py` | CPU 100% 数据库过载、 try-except 沙箱编译诊断、中心紫色协作白板 `(15, 5)`、P2P 代码提审、自审拦截、AI 自动回评。 |
| **Phase 15 & 16**<br>分布式熔断器与移动端手柄 | `frontend_new/src/app/globals.css`<br>`frontend_new/src/utils/audioManager.ts` | 微服务 B 超时熔断（Alert-Orange 氛围）、移动端等比自适应、物理 D-pad 复古按键、60ms 物理连发。 |
| **Phase 18 & 19**<br>分布式状态、弱网与翻页 | `backend/app/services/lock_manager.py`<br>`frontend_new/src/components/SpaceBoard.tsx` | `LockManager` 分布式租约锁（TTL 心跳续租）、弱网丢包仿真（Static Burst 爆音）、遥控 Guest 线性插值（LERP）、高凌 AI 自动驾驶双端分区抢修、团队任务翻页功能。 |

---

## 💎 核心亮点 (Core Highlights)

### 1. 🥇 等比弹性硬件加速渲染视口 (Responsive CSS Engine)
- **零外部重型引擎依赖**：排除 Phaser.js 或 WebGL 等游戏渲染框架，纯粹使用 React DOM、`translate3d` 硬件加速和 Tailwind CSS，实现极低开销的高帧率像素游戏体验。
- **探照灯物理混合蒙版**：在玩家脚下实时渲染径向渐变光圈（利用 `mix-blend-multiply` 混合层），光晕自动跟随玩家位移并根据当前氛围主题平滑变换，营造极客氛围。
- **全端自适应等比缩放**：视口支持在 `scale-[0.85]` 至 `scale-[1.15]` 之间平滑适配，完全消除地图截断或错切，完美兼容桌面超宽屏与狭窄的移动端。

### 2. 🎵 纯算力 Web Audio 8-Bit 复古音效合成 (Zero-Asset Chiptune Synthesizer)
- **100% 算力实时发声**：完全零外部 MP3/WAV 静态音频文件依赖。
- **物理情境拟真声效**：
  - **角色脚步**：每次迈步自动合成低频 triangle-wave thump 机械踩踏脚步声。
  - **流式打字机**：伴随文本流逐字输出，合成高频柔和的 sine-wave 敲击 chirp 声。
  - **异常报警笛 (Siren)**：线上故障触发时，由指数频率扫描在 `330Hz` 与 `660Hz` 之间极速扫描，产生充满红白机警报质感的 8-bit siren 笛音。
  - **胜利和弦**：任务/大事件恢复时，合成由 C Major 大三和弦构成的上扬方波胜利乐章。

### 3. 🚨 空间环境光感知体系 ("Prompt-to-Light")
- 系统将无形的代码状态、线上事故压力与任务成就外化为**空间视觉光影和环境音效的级联响应**：
  - **静息研发/技能阅读**：触发 **静谧幽蓝 (Quiet-Blue)** 氛围呼吸灯，并合成 Major 7 琶音风铃声。
  - **技术异常/大事故**：触发 **警报深红 (Alert-Red)** 或 **闪烁冷青 (Alert-Cyan)**，伴随 Siren 笛音。
  - **任务圆满交付/升级**：触发 **金色庆典 (Celebrate-Gold)** 全屏撒花灯光及 8-bit 欢呼音效。

### 4. 🧠 注入长效情感记忆的 AI 导师团队 (Memory-Aware Multi-Agent)
- **情感记忆中枢 (Memory Inheritance)**：用户提交的每一次重构修复，大模型都会自动捕获其中的代码设计失误（如 N+1、SettingWithCopy 警告）并压缩存储至本地 SQLite 中。在后续任务或交流时，技术主管高凌会**自然地提及玩家历史的开发失误或高光表现**，提供有厚度的陪伴。
- **多智能体流式站会编排**：设计了会议圆桌多角色队列轮转对话（流式 SSE），PM Amy（关注速度）与 TL 高凌（关注质量）各执己见。玩家可通过“冲突斡旋面板”在两方偏好博弈中充当决策法官，达成不同的剧情分支。

### 5. 📶 本地仿真网络传输代理与 LERP 插值 (Network Emulation Proxy)
- **弱网仿真调试器**：内置物理信道调试器挂件，允许实时设定当前空间的**信道时延 (Latency: 0ms ~ 800ms)** 与 **人工丢包率 (Packet Loss: 0% ~ 35%)**。
- **高保真丢包爆音**：当判定丢包时，自动触发短促的带通滤波 8-bit 静电刮擦杂音（Static Noise Burst），拟真物理信号丢失。
- **平滑 LERP 算法**：在大延迟与频繁丢包环境下，应用 `requestAnimationFrame` 位置前向线性插值（Linear Interpolation）算法，使远程 Guest 角色在地图上保持匀速、平滑滑动，完全消除了 Rubber-banding 瞬移。

### 6. 🔐 基于租约的分布式互斥锁 (Lease-Based Mutex)
- **多玩家终端防覆盖锁**：当玩家开启物理服务器机柜、协作白板或研发工位时，后台分布式锁管理服务（LockManager）自动分配具有 `TTL` 的独占锁。
- **心跳续租与安全释放**：锁在打字时自动续租，在关闭或玩家断开连接时安全秒级撤销，避免死锁。
- **毛玻璃只读屏蔽**：锁定状态下，其他多端玩家在物理靠近打开终端会弹出精美磨砂遮罩，锁定代码输入并显示动态 TTL 倒计时 banner。

---

## 🛠️ 已实现的完整功能盘点 (Implemented Features)

### 1. 2D 物理地图探索 (Spatial Matrix)
- 完美渲染四大经典功能分区：前台大厅 (Lobby)、会议室 (Meeting Room)、研发区 (Dev Bay)、资料库 (Archive Room)。
- 网格、玩家、NPC、物理桌椅以及装饰隔断严丝合缝的物理碰撞检测与物理阻挡。

### 2. 物理实体书架 RAG 面板 (Spatial Bookcase RAG)
- 点击资料库的 Pandas、Git、系统设计等实体书架，滑出磨砂玻璃检索面板。
- 绑定特定学科的向量切片提取，支持自然语言检索与 Top-K 向量相似度打分高亮。

### 3. 实时空间聊天与 RPG 弹力气泡 (Spatial Real-time Chat)
- 通过 WebSockets 进行实时、超低延迟的全局聊天广播。
- 发言时，玩家与 Guest 头顶动态生成 5s 自动消散的 Q 弹 RPG 气泡。
- 配备极速快捷键：按 `T` 或 `Enter` 聚焦聊天输入，按 `Escape` 离焦退回。

### 4. 交互手势骨骼与家具联动 (RPG Motion & Furniture Interaction)
- 像素角色装配了独立的挥舞胳膊以及提在手侧、上下振动的程序员复古小公文包。
- **沙发入座姿态 (Sitting)**：在沙发区，小人高度沉降，双腿弯曲，手臂扣拢，放下公文包，隐去影子。
- **查阅姿态 (Reading)**：查阅 RAG 书架时，手捧一本在手中轻颤、带有翻页动效的蓝色书本。
- **工位沙盒编程 (Typing/Working)**：在工位写代码时，小人捧出一台带有蓝色发光反投影的便携本，双手呈 Furious typing 超高速摆动。

### 5. 共享协作白板与同业代码评审 (P2P Review Center)
- 矗立在会议室 `(15, 5)` 的发光白板。打开可进入**分屏审查工作流**：
  - **左窗**：在团队任务（具有精美**两页翻页滚动**及禁用态保护的 retro 控制）和多人提审列表之间切换。
  - **右窗**：全功能 green-screen CRT 显像管终端，提供复古等宽代码高亮展示，以及安全的主权自审拦截。
- **AI 导师协同补位**：提审 6 秒后无人类评审时，资深导师（高凌/郑莹）会进行细致的代码逻辑评审，发出 Reject 指导或 Approve 评分，并广播 resolution、即时联发加成 XP。

### 6. 三大史诗级线上技术事故与自愈编译器 (Emergency Console)
- **事故一：数据库 CPU 100% 过载 (SQL Tuning)**：触发 Alert Red 主题。玩家需在机柜编写有效的 `CREATE INDEX` 以自愈。
- **事故二：微服务 B 熔断器异常脱扣 (Circuit Breaker)**：触发 Alert Orange 主题。玩家需实现 Python 高可用 fallback 中间件重构、还原连接链路并重连 Switch 拨片。
- **事故三：多工位联动分布式网络分区隔离 (Network Partition Anomaly)**：触发 Alert Cyan 主题。
  - 启动 **AI 自动驾驶（Autopilot）** 模式，高凌导师会以平滑 CSS transition 轨迹优雅滑行至工位 B `(11, 17)`，抢占锁并编写 Sub-Node Proxy。
  - 玩家需要在主机柜 `(18, 15)` 并发编写 Gateway 路由，两端锁及路由脚本均成功时网络即刻恢复。

### 7. 极致平滑的移动端虚拟手柄 (Virtual Gamepad Console)
- 移动端自动隐藏臃肿面板，在主视口底部升起精美的像素风 D-Pad 罗盘与 A / B / T 快捷动作圆键。
- 触控长按 D-Pad 触发高频 60ms 物理连发，实现顺滑利落的像素 RPG 漫步。

---

> [!NOTE]
> **数据完整性与编译校验**
>整个项目后端包含完善的 SQLite 物理表、ChromaDB 向量检索与 API 测试套件；前端 React / Next.js 14 代码通过了静态类型 `npx tsc --noEmit` 与生产环境构建 `npm run build`，编译零警告、零错误，逻辑闭环完美。
