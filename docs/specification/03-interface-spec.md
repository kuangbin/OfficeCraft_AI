<!-- mdformat global-off -->
# 前后端接口详细规格说明书 (Interface Specification v1.1)

本文档详细规定了 **OfficeCraft AI (2D 像素数字孪生办公室与空间交互沙盒)** 前端与后端之间的全部数据通信接口。提供准确的 HTTP 方法、路由路径、Query/Body 入参说明、状态码及强类型的 JSON 报文结构体示例。

---

## 一、 通信全局约定

### 1. 基础路径 (Base URL)
- **开发环境**：`http://localhost:8000`
- **生产环境 (Docker)**：前端使用宿主机代理或直接配置 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8003`

### 2. 标准状态码语义 (HTTP Status Codes)
| 状态码 | 描述 | 说明 |
| :--- | :--- | :--- |
| `200 OK` | 请求成功 | 所有正常的业务操作返回结果 |
| `400 Bad Request` | 参数错误 | Query 或 Body 参数非法、缺失 |
| `401 Unauthorized` | 身份验证失败 | 缺失或非法的 `X-Player-Id` 请求头 |
| `422 Unprocessable Entity` | 实体校验失败 | 不符合 Pydantic Schema 强类型校验规范 |
| `500 Internal Server Error` | 服务端异常 | 大模型连接超时或后端服务崩溃 |

### 3. 跨域资源共享 (CORS)
- **CORS 策略**：开发环境 API 支持全量跨域（`Access-Control-Allow-Origin: *`），允许运行在 `http://localhost:3000` (Next.js) 的 2D 像素前端发起直接 HTTP 交互与流式对接。

---

## 二、 身份与认证契约 (Identity & Auth Contract)

所有受保护端点（除 `/` 健康检查外）必须遵守此强契约。

### 1. 标识符 (`X-Player-Id`)
- **类型**：HTTP 请求头，值为 UUID v4 字符串（不区分大小写，服务端归一化为小写）。
- **生命周期**：由前端在 `localStorage` 中生成并持久化。
- **验证异常 (401 Unauthorized)** 结构示例：
```json
{
  "detail": {
    "code": "identity.missing_player_id",
    "message": "X-Player-Id header is required."
  }
}
```

---

## 三、 系统与健康检查模块

### 1. 基础健康检查
- **请求方法**：`GET`
- **请求路径**：`/`
- **响应报文 (200 OK)**：
```json
{
  "status": "healthy",
  "service": "OfficeCraft AI Backend"
}
```

---

## 四、 2D 空间物理与状态同步模块 (Spatial APIs)

### 1. 获取当前办公室与空间状态
用于前端在进入大厅、刷新网页时同步无损恢复玩家的所有物理和逻辑状态。

- **请求方法**：`GET`
- **请求路径**：`/api/v1/space/state`
- **请求头**：`X-Player-Id: <UUID>`
- **响应报文 (200 OK)**：
```json
{
  "player_coords": { "x": 12, "y": 15 },
  "ambient_theme": "quiet-blue",
  "map_assets_url": "http://localhost:8003/static/map_tile_v1.png",
  "active_mission": {
    "mission_id": "mvp_mission_software_1",
    "title": "解决 UserService 中的 N+1 查询问题",
    "status": "active"
  },
  "unresolved_conflict": {
    "conflict_id": "conf_01",
    "trigger_npc_ids": ["pm_amy", "mentor_ling"],
    "description": "关于发布周期与架构审查的博弈冲突正在会议室爆发，等待调解。"
  }
}
```

### 2. 同步玩家空间坐标
由前端键盘 WASD 位移后实时调用同步。
> [!NOTE]
> **频率拦截限制**：由于玩家走动速度快，前端必须使用 **50ms 节流 (Throttle)** 机制，避免对后端造成过载冲击。

- **请求方法**：`POST`
- **请求路径**：`/api/v1/space/move`
- **请求头**：`X-Player-Id: <UUID>`
- **Body 入参 (`SpaceMoveRequest`)**：
```json
{
  "x": 13,
  "y": 15
}
```
- **响应报文 (200 OK)**：
```json
{
  "status": "success",
  "coords": { "x": 13, "y": 15 },
  "triggered_npc_id": "mentor_ling"  -- 1格范围内有可互动的 NPC，则返回 NPC ID；无则返回 null
}
```

---

## 五、 物理书架 RAG 检索模块 (Spatial RAG)

### 1. 物理书架 RAG 局部检索
当玩家物理靠近特定的实体书架（如 Pandas 书架、架构设计书架）并点击时触发，向量召回被物理限定在对应书架对应的文档范围。

- **请求方法**：`POST`
- **请求路径**：`/api/v1/space/rag/search`
- **请求头**：`X-Player-Id: <UUID>`
- **Body 入参 (`SpatialRagSearchRequest`)**：
```json
{
  "bookcase_id": "pandas_library",       -- 书架唯一标识：pandas_library | software_design_rules
  "query": "如何高效地合并两个带有 NaN 空缺值的 Dataframe"
}
```
- **响应报文 (200 OK, `SpatialRagSearchResponse`)**：
```json
{
  "bookcase_id": "pandas_library",
  "top_k_chunks": [
    {
      "doc_title": "docs/knowledge_base/data_analyst/pandas_join.md",
      "content_excerpt": "...使用 pd.merge(df1, df2, on='key', how='outer').fillna(0)...",
      "similarity_score": 0.89
    }
  ]
}
```

---

## 六、 任务与成长评估模块

### 1. 动态生成职业任务
当玩家在会议室参加站会（接取关卡）时，后端通过多角色编排后生成并分发任务。

- **请求方法**：`POST`
- **请求路径**：`/api/v1/missions/generate`
- **请求头**：`X-Player-Id: <UUID>`
- **Body 入参 (`MissionGenerateRequest`)**：
```json
{
  "role_id": "mentor_ling",
  "difficulty": "beginner"
}
```
- **响应报文 (200 OK, `MissionGenerateResponse`)**：
```json
{
  "mission_id": "mvp_mission_software_1",
  "title": "优化 UserService 中的高频 SQL N+1 问题",
  "description": "系统监控显示，在获取用户主页时存在大量循环执行 SQL 导致连接池耗尽。请查找 UserService.py 并重构代码，利用 Preload 或 Join 将查询合并为 1 条。",
  "mock_data_url": "http://localhost:8003/static/generated/UserService.py",
  "delivery_requirements": [
    "UserService 代码中严禁在 for 循环中执行 execute()",
    "合并后的数据库往返次数降为 1 次",
    "补充覆盖该查询的单元测试用例"
  ]
}
```

### 2. 提交交付物与成长评估 (含情感记忆写入)
玩家在工位（Dev Bay）的电脑前提交成果。
- 后端评估服务解析大模型反馈。
- 更新 SQLite 的 `users`（总 XP）和 `skill_progress` 进度。
- 自动向 SQLite 的 `user_emotional_memories` 写入本次高光（Positive）或退回（Negative）事件。

- **请求方法**：`POST`
- **请求路径**：`/api/v1/missions/evaluate`
- **请求头**：`X-Player-Id: <UUID>`
- **Body 入参 (`SubmissionEvaluateRequest`)**：
```json
{
  "mission_id": "mvp_mission_software_1",
  "submission_text": "通过在 UserService 中重构 get_users_with_departments 方法，引入 join 预加载部门，消除了 for 循环内部的独立查询，代码如下..."
}
```
- **响应报文 (200 OK, `SubmissionEvaluateResponse`)**：
```json
{
  "status": "success",   -- success / returned (被退回)
  "feedback": "问题拆解十分精准，通过 JOIN 将 N+1 成功降低为 1 次查询。然而在测试用例中仍缺少对于空数据的断言。期待下一步优化！",
  "experience_gains": {
    "skill_database_optimization": 15,
    "skill_code_refactoring": 10
  },
  "trigger_feynman_challenge": true,
  "feynman_question": "干得漂亮！你能用大白话向团队里非技术背景的 PM Amy 解释一下，什么是 N+1 查询，它为什么会让服务器变卡吗？"
}
```

---

## 七、 沉浸对话模块 (SSE Protocol)

### 1. 空间角色扮演对话流 (SSE)
基于 Server-Sent Events (SSE) 协议，实现配合打字机音效和空间环境光效流式交替的对话。

- **请求方法**：`GET`
- **请求路径**：`/api/v1/agent/chat`
- **请求头**：`Accept: text/event-stream`, `X-Player-Id: <UUID>`
- **Query 参数**：
  - `role_id` (String, 必填)：想要对话的 NPC 的 ID（`mentor_ling`、`pm_amy` 等）。
  - `message` (String, 必填)：用户输入的即时文本。
- **数据帧规约 (Event Stream)**：
  > [!IMPORTANT]
  > 后端会持续发送一系列单字符的文本帧。每一帧的文本必须具有 `data: ` 前缀，且每一帧之间必须以双换行符 `\n\n` 截断。
```text
data: 【

data: 高

data: 凌

data: 的

data: 回

data: 复

data: 】

data: 收

data: 到

data: 

...
```
