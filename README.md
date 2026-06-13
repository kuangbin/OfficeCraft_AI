# 🗺️ OfficeCraft AI - 2D 像素数字孪生办公室与空间交互沙盒

**赛道**：赛道三 - 数字孪生与沉浸交互 (Track Three: Digital Twin & Immersive Interaction)  
**核心模型**：GLM-5，支持云端各厂商模型、OpenAI-compatible 以及 Gemini / Anthropic。  
**项目定位**：面向技术学习者、转行者和极客人群，将传统的“网页任务面板”重构为一张**可操控走动、可物理交互、有空间记忆的 2D 像素虚拟办公室数字孪生沙盒**（星露谷物语 / Gather.town 风格）。

> 这不是一个普通的题库，而是一个带有物理空间实体和环境感知反馈的**“数字孪生职场模拟器”**。
> 用户通过键盘 `W-A-S-D` 操控像素角色穿梭在办公室地图中，去技术主管工位领任务，去物理资料库点击特定书架触发 RAG 语义检索。当任务失败时，技术主管的工位会爆发刺眼的红色警报光效。

---

## 🎬 演示材料与物理坐标图

- 📐 详细设计与技术规格：[docs/specification/](docs/specification/)
- 🐍 异步后端核心代码：[backend/](backend/)
- 💻 前端像素空间源码：[frontend_new/](frontend_new/)

```text
+-------------------------------------------------------------+
|                     OfficeCraft AI 空间视图                 |
|                                                             |
|   [研发区]                [会议室]            [资料库/RAG]   |
|   +-----------+          +-----------+        +-----------+ |
|   | 🧑‍💻 (用户)  |  -WASD-> | 🧑‍💼 PM Amy |        | 📚 概念书架| |
|   |           |          | 👨‍💼 主管高凌|        | 📖 最佳实践| |
|   +-----------+          +-----------+        +-----------+ |
|        |                                                    |
|        +--- 触发任务/协作 ---> 发生“Prompt-to-Light”环境光效 |
+-------------------------------------------------------------+
```

---

## 📸 核心界面展示 (Screenshots)

为了带给玩家最纯粹的 2D 像素风与沉浸式体验，我们精心设计了完整的像素视觉场景。以下为 OfficeCraft AI 的核心产品界面：

### 1. 🗺️ 2D 像素办公室主空间 (`main_page_1.png`)
* **空间探索**：支持键盘 `W-A-S-D` 或方向键物理控制像素角色穿梭。
* **物理交互**：靠近 NPC 或物理书架时，自动弹出 `[Space] Talk` 等互动按键提示。
* **环境光效 (Prompt-to-Light)**：根据业务状态动态切换背景光晕（如深红警报、静谧蓝研发）。

![2D 像素办公室主空间](ui/main_page_1.png)

---

### 2. 🤝 多智能体晨会与冲突斡旋 (`meeting.png`)
* **流式晨会**：物理走到会议桌前，自动拉起多角色 AI 晨会对话，协同跟进项目。
* **冲突调解**：在主管高凌与 PM Amy 就产品和架构方案发生激烈争执时，玩家需在两人中间进行居中调解，系统将综合各方偏好进行评分。

![多智能体晨会与冲突斡旋](ui/meeting.png)

---

### 3. 💻 交互式编码沙盒 (`coding_sandbox.png`)
* **沉浸式研发**：在个人工位点击电脑，打开内置的 Web IDE & 运行沙盒。
* **即时反馈**：在线编写代码并提交，实时反馈单测结果，并在失败时在物理空间触发全屏深红呼吸报警。

![交互式编码沙盒](ui/coding_sandbox.png)

---

### 4. 🌳 职业技能树 (`skill_page.png`)
* **可视化成长**：随着关卡任务的完成和冲突的成功调解，玩家将获得 XP 并解锁个人专属像素技能树（如 Pandas 实战、系统设计、团队协作等）。

![职业技能树](ui/skill_page.png)

---

### 5. 📋 任务看板 (`task_panel.png`)
* **任务追踪**：随时呼出任务详情面板，查看当前任务的职场背景、具体目标要求与物理限制。

![任务看板](ui/task_panel.png)

---

## ✨ 核心特性

1. **2D 像素空间探索与 RPG 交互 (RPG Navigation)**  
   - 支持键盘 `W-A-S-D` / 键盘方向键控制位移。25×25 像素网格地图具有严格碰撞拦截，靠近 NPC / 物理书架 1 格范围内头顶弹出 `[Space] Talk` 提示。
2. **空间环境光效感知体系 ("Prompt-to-Light")**  
   - 将无形的业务状态外化为物理感官。当任务失败/编译崩溃时全域泛起**深红报警呼吸滤镜 (Alert Red)**；研发与静默自习时泛起**静谧蓝微光 (Quiet Blue)**；通关技能点亮时全域洒下**金黄欢庆光晕 (Celebrate Gold)** 并同步播放 8-bit 复古电子音效。
3. **空间 NPC 交互与长效情感记忆 (Interactive NPCs & Memory)**  
   - 技术主管**高凌 (Tech Lead)** 严厉且代码质量至上，数据专家**郑莹 (Senior Analyst)** 循循善诱，产品经理 **Amy** 业务驱动。
   - 导师具备长效记忆。每次对话时前置检索 SQLite 情感记忆表（高光或卡壳记录），并在开场白、任务分发中自然引用前序事件，打造具有情感温度的数字孪生团队。
4. **场景物理化 RAG 资料检索 (Spatial RAG Bookcase)**  
   - 玩家可移步至[资料库]的特定“实体书架”（如 Pandas 书架、软件设计原则书架）。点击书架触发 RAG 语义检索，向量召回被物理限制在当前书架对应的物理 Markdown 文件集，彻底打通空间坐标与知识上下文。
5. **多智能体晨会与冲突斡旋 (Multi-Agent Team Standup)**  
   - 接取任务需物理走到会议室圆桌。后端 `TeamMeetingOrchestrator` 以流式队列形式拉起晨会，PM Amy 与 TL 高凌会就产品上线速度与架构性能展开激烈的唇枪舌战，由用户作为中立方进行斡旋调解评分。
6. **RPG 走动转向与双腿迈步动画 (RPG Walk Cycle & Direction-Facing Animations)**  
   - 玩家角色支持 4 方向（上下左右）物理转向，面向后方时自动遮盖皮肤要素呈现后脑勺、隐藏前胸领带。在走动时触发身体弹性轻微起伏（bouncing）与 8-bit 双腿剪刀步摆动（procedural scissor swing）微动效，行走停止 120ms 后顺滑静止。

---

## 🏗️ 系统架构

```text
Next.js 14 前端 (React)
  -> useSpaceStore (Zustand 物理状态机 & translate3d 硬件加速渲染)
  -> FastAPI API (Python 异步路由)
  -> TeamMeetingOrchestrator (多角色晨会编排 / 空间碰撞拦截 / 情感记忆注入)
  -> GLM-5 / Gemini / Anthropic 或本地离线 fallback 模式
  -> SQLite (空间格点坐标 + 情感记忆日志 + 会议历史记录)
  -> ChromaDB + 实体书架局部 Markdown 知识库 (Spatial RAG)
```

主要技术栈：

| 模块 | 技术 |
|---|---|
| **前端** | Next.js 14 (React), Zustand, Tailwind CSS, TypeScript, Web Audio |
| **后端** | FastAPI, SQLAlchemy, SQLite, Pydantic v2 |
| **向量库 (RAG)** | ChromaDB + 确定性 MD5 Hashing 嵌入 + 词频加权 (Hybrid Seek) |
| **大模型接入** | 统一 LLMClient 抽象，支持 GLM-5 / Gemini / OpenAI-compatible / Anthropic / Ollama |

---

## 📂 仓库结构

```text
officecraft_ai/
├── backend/        # FastAPI + SQLite + ChromaDB，见 backend/README.md
├── frontend_new/   # Next.js 像素空间前端，Docker 默认构建此目录
├── docs/           # 产品与系统规格、角色设定、技能树、知识库 Markdown
│   ├── specification/     # 愿景、设计、API规格、ADR 决策
│   └── knowledge_base/    # 实体书架绑定 RAG 物理文档
├── ui/             # README 截图与展示素材
└── docker-compose.yml
```

---

## 🚀 快速开始

### 🐳 方式一：使用 Docker Compose 启动整套服务
1. 在仓库根目录复制环境变量模板并命名为 `.env`：
   ```bash
   cp .env.example .env
   ```
2. 在仓库根目录运行启动命令：
   ```bash
   docker compose up --build
   ```
3. 启动后浏览器访问：
   - 前端空间：`http://localhost:3000`
   - 后端 API：`http://localhost:8003`

### 💻 方式二：本地开发分别启动

#### 1. 后端服务 (FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  -- Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python3 -m app.main
```

#### 2. 前端服务 (Next.js)
```bash
cd frontend_new
npm install
npm run dev
```

---

## 🧪 测试与验证

在后端激活虚拟环境后，于 `backend/` 目录下运行标准库单元测试：
```bash
./venv/bin/python -m unittest discover -s tests
```

---

## 📜 许可证 (License)

[MIT](LICENSE)
