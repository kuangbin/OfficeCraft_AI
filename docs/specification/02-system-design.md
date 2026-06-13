# 🛠️ OfficeCraft AI 系统设计与技术架构 (System Design & Tech Spec)

本项目通过前后端分离架构，结合轻量级 2D 网格运动、空间冲突控制管道、本地 RAG 检索与长效角色情感记忆存储，构建了一个闭环的虚拟职场数字孪生系统。

---

## 一、 四大核心子系统设计

我们将 OfficeCraft AI 拆解为：**大脑 (Agent 智能)**、**骨架 (数据与知识)**、**血肉 (2D 空间)**、**灵魂 (感官光效反馈)**。

```text
+-----------------------+              +------------------------+
|   Next.js (React)     |   API/SSE    |    FastAPI (Python)    |
|  (2D 像素风硬件加速)    | <==========> |   (异步 Agent 中枢)     |
|                       |              |                        |
|  +-----------------+  |              |  +------------------+  |
|  | useSpaceStore   |  |              |  |TeamOrchestrator  |  |
|  | (位置/光效/状态) |  |              |  +------------------+  |
|  +-----------------+  |              |            |           |
|  +-----------------+  |              |  +------------------+  |
|  | CSS Grid 渲染器  |  |              |  |MemoryRetrieveChain|  |
|  +-----------------+  |              |  +------------------+  |
+-----------------------+              +------------------------+
                                                    |
                                       +------------+------------+
                                       |                         |
                             +-------------------+    +---------------------+
                             | SQLite (关系存储)  |    | ChromaDB (向量存储) |
                             | - 空间物理坐标     |    | - RAG 概念切片      |
                             | - 情感与反馈记忆   |    | - 导师对话记忆      |
                             +-------------------+    +---------------------+
```

### 1. 大脑 - 多角色 Agent 协作与长效记忆 (Brain)
- **多智能体晨会编排 (Team Standup)**：用户接取任务时，需操控角色进入会议室。后端 `TeamMeetingOrchestrator` 启动一轮流式站会，PM Amy 与 TL 高凌在发言队列中唇枪舌战，向用户配发数据/代码物料。
- **记忆继承机制 (Memory Inheritance)**：
  - 用户在历史关卡中的高光或卡壳表现（如 N+1 查询被退回、SQL 性能调优出色等），均会以结构化文本形式记录入 SQLite 的 `UserEmotionalMemory` 表中，并打上 `sentiment_tag` (positive / negative)。
  - 当玩家在此靠近导师或发起对话时，后端通过 `MemoryRetrieveChain` 自动检索该用户最近 3 条相关记忆，动态拼装并注入 LLM System Prompt，从而使导师具备长效记忆（例如：高凌会说：“上个任务的 N+1 查询性能问题你改得不错，这次可千万别再犯同样的低级错误了。”）。
- **冲突斡旋算法 (Conflict Resolution)**：陷入特定情境时（如 Amy 强推高危抢购功能，高凌激烈反对），办公室全域触发红色警报。用户作为中间调解人输入协调方案，大模型基于多角色偏好和约束进行综合判定与评分。

### 2. 骨架 - 双引擎存储与物理场景 RAG (Skeleton)
- **关系数据库 (SQLite / PostgreSQL)**：持久化存储玩家当前空间坐标 `(x, y)`、已亮技能树节点、当前所处职业岛屿、任务状态（Active / Completed / Failed）以及导师长效记忆。
- **场景物理化 RAG (ChromaDB + Custom Hashing)**：
  - 区别于传统全局 RAG，OfficeCraft 实现了**物理书架相关的 RAG 局部检索**。
  - 资料库中定义了数个“物理实体书架”（如：`pandas_library`、`software_design_rules`）。
  - 当玩家点击不同书架并输入问题时，后端 ChromaDB 只在当前书架绑定的物理 Markdown 文件分块切片中进行 Top-K 向量相似度与 TF-IDF 词频混合检索（Hybrid Seek），实现空间物理范围与检索上下文的彻底绑定。

### 3. 血肉 - 2D 像素空间渲染与碰撞引擎 (Flesh)
- **绝对定位硬件加速渲染**：摒弃重型 Canvas 引擎，采用 `translate3d` 与 CSS 硬件加速渲染。地图大小为 $25 \times 25$ 网格，每格大小为 `32px`。
  $$X_{px} = x \times 32, \quad Y_{px} = y \times 32$$
  ```tsx
  style={{
    transform: `translate3d(${x * 32}px, ${y * 32}px, 0)`,
    width: '32px',
    height: '32px',
    transition: 'transform 0.1s linear'
  }}
  ```
- **碰撞拦截机制 (Collision Matrix)**：地图初始化时生成一个二进制矩阵 $M_{25\times25}$。
  - $M[y][x] = 1$ 代表墙壁、桌子、NPC、书架等物理障碍。
  - $M[y][x] = 0$ 代表可通行空地。
  - 玩家按下 `W-A-S-D` 键时，位移操作前置拦截判断：如果下一格在矩阵中为 0，则更新坐标并触发组件重新渲染。
- **动态邻近交互**：当玩家坐标与 NPC 或交互物体距离 $\le 1$ 格时，头顶动态悬浮 `[Space] Talk` 提示。

### 4. 灵魂 - 空间环境光效感知体系 (Soul)
利用环境光晕、高斯模糊遮罩层和 8-bit FC 复古电音，将任务状态外化为物理感官：
- **`quiet-blue` (静息研习)**：当玩家阅读 RAG 资料或静默编写代码时，全域泛起静谧蓝呼吸光晕，伴随白噪音。
- **`alert-red` (系统报警)**：当任务失败、编译崩溃或冲突爆发时，办公室警报红光闪烁，高凌工位产生强烈的红色放射状发光阴影，配发紧急报警音。
- **`celebrate-gold` (关卡升级)**：任务通过、技能点亮时，金黄色碎屑在地图上方撒下，配发 8-bit FC 胜利音效。

---

## 二、 核心数据库表设计 (SQLite / PostgreSQL)

在原有 CareerCraft 表结构基础上进行重构与自愈扩展：

### 1. `users` 表 (玩家属性及当前所处空间)
```sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,       -- 对应 X-Player-Id (UUID v4)
    total_xp INTEGER DEFAULT 0,       -- 累计总经验值
    current_career_id VARCHAR(50),    -- 当前所处职业岛屿 (career_data_analyst / career_software_engineer)
    coord_x INTEGER DEFAULT 0,        -- 空间当前横坐标 (0-24)
    coord_y INTEGER DEFAULT 0,        -- 空间当前纵坐标 (0-24)
    created_at TIMESTAMP
);
```

### 2. `user_emotional_memories` 表 (长效情感记忆)
```sql
CREATE TABLE user_emotional_memories (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    skill_id VARCHAR(50),             -- 相关技能 ID
    sentiment_tag VARCHAR(15),        -- positive / negative / neutral
    summary_text TEXT NOT NULL,       -- 记忆简短描述
    created_at TIMESTAMP
);
```

### 3. `team_meeting_logs` 表 (多智能体站会与斡旋记录)
```sql
CREATE TABLE team_meeting_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    mission_id VARCHAR(50) NOT NULL,
    dialogue_history_json TEXT,       -- 站会完整的对话历史 JSON ([{"role":"pm_amy", "text":"..."}, ...])
    status VARCHAR(20) DEFAULT 'active' -- active / completed
);
```

---

## 三、 前端状态引擎层设计 (`useSpaceStore`)

前端全局采用 Zustand (Next.js) 实现，物理空间状态切片如下：

```typescript
type AmbientTheme = 'quiet-blue' | 'alert-red' | 'celebrate-gold' | 'default';

interface SpaceState {
  // 物理坐标
  playerCoord: { x: number; y: number };
  // 环境光效
  ambientTheme: AmbientTheme;
  // 当前临近可互动 NPC 的 ID
  interactiveNpcId: string | null;
  // 碰撞检测矩阵
  collisionMatrix: number[][];
  
  // 行为
  setPlayerCoord: (x: number, y: number) => void;
  setAmbientTheme: (theme: AmbientTheme) => void;
  checkInteraction: () => void;
  movePlayer: (dx: number, dy: number) => void;
}
```

- **状态恢复机制 (State Preservation)**：任何时候刷新网页，`useSpaceStore` 会与后端 `GET /api/v1/space/state` 接口进行状态同步，完全无损恢复玩家的**空间网格位置、未读的晨会会话树以及当前的环境光主题**，防止沉浸感断档。

---
> 下一步了解：
> - 接口报文及空间路由字段，请参见 [接口规格说明书 (03-interface-spec.md)](03-interface-spec.md)。
> - 系统框架层级依赖、目录分布及组件划分，请参见 [系统框架详细设计 (04-architecture-framework.md)](04-architecture-framework.md)。