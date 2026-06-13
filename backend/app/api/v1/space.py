"""API endpoints for spatial state sync, movement, and bookcase RAG search."""

import logging
from fastapi import APIRouter, Body, Depends, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.models import orm as models, schemas
from app.services import rag

logger = logging.getLogger(__name__)
router = APIRouter()

# NPC spawn positions on the 25x25 grid
NPC_COORDINATES = {
    "mentor_ling": {"x": 15, "y": 6},   # Tech Lead Gao Ling (Meeting Room area)
    "mentor_ying": {"x": 20, "y": 20}, # Senior Analyst Zheng Ying (Archive Room area)
    "pm_amy": {"x": 18, "y": 5},       # Product Manager Amy (Meeting Room area)
}


@router.get(
    "/state",
    summary="获取当前办公室与空间状态",
    response_model=schemas.SpaceStateResponse,
)
async def get_space_state(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.SpaceStateResponse:
  """Retrieves or initializes user coordinates and returns spatial, mission, and conflict states."""
  user = db.query(models.User).filter_by(id=user_id).first()
  if not user:
    user = models.User(id=user_id, current_career_id="", total_xp=0, coord_x=0, coord_y=0)
    db.add(user)
    db.commit()
    db.refresh(user)

  # Check for active mission
  active_mission_orm = (
      db.query(models.MissionRecord)
      .filter_by(user_id=user_id, status="active")
      .first()
  )

  active_mission = None
  if active_mission_orm:
    active_mission = schemas.SpaceActiveMission(
        mission_id=active_mission_orm.mission_id,
        title=active_mission_orm.title,
        status=active_mission_orm.status,
    )

  # Check for active team conflict
  active_conflict_orm = (
      db.query(models.TeamMeetingLog)
      .filter_by(user_id=user_id, status="active")
      .first()
  )

  unresolved_conflict = None
  if active_conflict_orm:
    unresolved_conflict = schemas.SpaceConflict(
        conflict_id=active_conflict_orm.id,
        trigger_npc_ids=["pm_amy", "mentor_ling"],
        description="团队在产品交付速度与技术代码质量上产生了严重冲突，急需你作为技术骨干来进行斡旋仲裁！"
    )

  # Determine environmental lighting theme:
  # - If active anomaly is "service_breaker_trip": "alert-orange"
  # - Else if active anomaly exists and is active: "alert-red"
  # - Else if active mission exists: default to "quiet-blue" (study/development focus)
  # - Else: "default"
  ambient_theme = "quiet-blue" if active_mission else "default"
  if user.active_anomaly and user.anomaly_status == "active":
    if user.active_anomaly == "service_breaker_trip":
      ambient_theme = "alert-orange"
    else:
      ambient_theme = "alert-red"

  active_anomaly = None
  if user.active_anomaly and user.anomaly_status == "active":
    if user.active_anomaly == "service_breaker_trip":
      active_anomaly = schemas.SpaceAnomaly(
          anomaly_id=user.active_anomaly,
          title="分布式微服务 B 熔断器异常脱扣",
          description="微服务 B 的底层网关接口响应大幅超时，导致调用队列严重阻塞，触发高可用分布式熔断器异常脱扣，部分依赖服务陷入级联雪崩！",
          cpu_load=user.anomaly_cpu,
          status=user.anomaly_status,
      )
    else:
      active_anomaly = schemas.SpaceAnomaly(
          anomaly_id=user.active_anomaly,
          title="数据库 CPU 100% 满载故障",
          description="数据库进程因大量的 N+1 关联查询及未优化的大表 JOIN 发生死锁。连接池耗尽导致物理服务器 CPU 100% 满载、严重过热！",
          cpu_load=user.anomaly_cpu,
          status=user.anomaly_status,
      )

  # Static map assets URL
  map_assets_url = "http://localhost:8000/static/map_tile_v1.png"

  return schemas.SpaceStateResponse(
      player_coords=schemas.SpaceCoords(x=user.coord_x, y=user.coord_y),
      ambient_theme=ambient_theme,
      map_assets_url=map_assets_url,
      active_mission=active_mission,
      unresolved_conflict=unresolved_conflict,
      active_anomaly=active_anomaly,
  )



@router.post(
    "/move",
    summary="同步玩家空间坐标并进行邻近 NPC 互动判定",
    response_model=schemas.SpaceMoveResponse,
)
async def move_player(
    request: schemas.SpaceMoveRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.SpaceMoveResponse:
  """Saves synchronized 2D coordinates and returns whether the player is adjacent to any NPC."""
  # Validate coordinate bounds (redundant but extra safe)
  if not (0 <= request.x <= 24 and 0 <= request.y <= 24):
    raise HTTPException(status_code=400, detail="Coordinates must be within the 0 to 24 grid bounds.")

  user = db.query(models.User).filter_by(id=user_id).first()
  if not user:
    user = models.User(id=user_id, current_career_id="", total_xp=0, coord_x=request.x, coord_y=request.y)
    db.add(user)
  else:
    user.coord_x = request.x
    user.coord_y = request.y
  db.commit()

  # Check if player is within 1 cell Manhattan/Chebyshev distance to any NPC
  triggered_npc_id = None
  for npc_id, npc_coords in NPC_COORDINATES.items():
    dx = abs(request.x - npc_coords["x"])
    dy = abs(request.y - npc_coords["y"])
    # Chebyshev distance check (horizontal, vertical, or diagonal adjacency)
    if dx <= 1 and dy <= 1:
      triggered_npc_id = npc_id
      break

  return schemas.SpaceMoveResponse(
      status="success",
      coords=schemas.SpaceCoords(x=request.x, y=request.y),
      triggered_npc_id=triggered_npc_id,
  )


@router.post(
    "/rag/search",
    summary="物理书架 RAG 局部检索",
    response_model=schemas.SpatialRagSearchResponse,
)
async def physical_bookcase_rag_search(
    request: schemas.SpatialRagSearchRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.SpatialRagSearchResponse:
  """Executes semantic search against ChromaDB filtered by the bookcase's career domain scope."""
  # Map bookcase ID to career category domains
  if request.bookcase_id == "pandas_library":
    domain = "core_data"
  elif request.bookcase_id == "software_design_rules":
    domain = "core_software"
  else:
    domain = "core_data"

  # Trigger standard ChromaDB search query
  rag_results = await rag.query_knowledge_base(query=request.query, career_category=domain)

  top_k_chunks = []
  subfolder = "data_analyst" if domain == "core_data" else "software_engineer"

  for res in rag_results:
    # Build a descriptive path based on the file source metadata
    source_filename = res.get("source") or "knowledge_base.md"
    doc_title = f"docs/knowledge_base/{subfolder}/{source_filename}"
    
    top_k_chunks.append(
        schemas.SpatialRagChunk(
            doc_title=doc_title,
            content_excerpt=res.get("snippet", ""),
            similarity_score=res.get("relevance_score", 0.0),
        )
    )

  return schemas.SpatialRagSearchResponse(
      bookcase_id=request.bookcase_id,
      top_k_chunks=top_k_chunks,
  )


@router.get(
    "/meeting/stream",
    summary="多智能体每日晨会 SSE 串行对话流",
)
async def stream_meeting_route(
    user_id: str = Depends(get_current_user_id),
):
  """SSE stream initiating daily standup dialogue from PM Amy and TL Gao Ling."""
  from fastapi.responses import StreamingResponse
  from app.services.team_orchestrator import stream_standup_dialogue

  return StreamingResponse(
      stream_standup_dialogue(user_id=user_id),
      media_type="text/event-stream",
      headers={
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
      },
  )


@router.post(
    "/meeting/arbitrate",
    summary="对团队冲突进行决断斡旋/仲裁",
    response_model=schemas.SpaceArbitrateResponse,
)
async def arbitrate_meeting_route(
    request: schemas.SpaceArbitrateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.SpaceArbitrateResponse:
  """Endpoint to arbitrate a conflict between PM Amy and Tech Lead Gao Ling."""
  from app.services.team_orchestrator import arbitrate_conflict_resolution

  try:
    result = await arbitrate_conflict_resolution(
        user_id=user_id,
        conflict_id=request.conflict_id,
        choice=request.choice,
        db=db,
    )
    return schemas.SpaceArbitrateResponse(**result)
  except ValueError as e:
    raise HTTPException(status_code=404, detail=str(e))
  except Exception as e:
    logger.error("Arbitration failed: %s", e)
    raise HTTPException(status_code=500, detail="Arbitration processing failed.")


@router.post(
    "/anomaly/trigger",
    summary="模拟触发突发系统故障",
    response_model=schemas.SpaceAnomaly,
)
async def trigger_anomaly_endpoint(
    request: schemas.SpaceAnomalyTriggerRequest = Body(None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.SpaceAnomaly:
  """Triggers database P0 CPU overload or service breaker trip anomaly and broadcasts alert to other players."""
  user = db.query(models.User).filter_by(id=user_id).first()
  if not user:
    raise HTTPException(status_code=404, detail="User not found.")

  anomaly_id = request.anomaly_id if request else "db_cpu_overload"

  if anomaly_id == "service_breaker_trip":
    user.active_anomaly = "service_breaker_trip"
    user.anomaly_cpu = 88
    user.anomaly_status = "active"
    db.commit()

    # Construct anomaly response
    anomaly = schemas.SpaceAnomaly(
        anomaly_id="service_breaker_trip",
        title="分布式熔断脱扣故障",
        description="微服务 B 由于网络抖动突发心跳超时，导致分布式系统出现级联雪崩！已自动触发脱扣熔断保护，请前往 Archive Room (18, 15) 进行应急抢修。",
        cpu_load=88,
        status="active",
    )
  else:
    user.active_anomaly = "db_cpu_overload"
    user.anomaly_cpu = 100
    user.anomaly_status = "active"
    db.commit()

    # Construct anomaly response
    anomaly = schemas.SpaceAnomaly(
        anomaly_id="db_cpu_overload",
        title="数据库 CPU 100% 满载故障",
        description="数据库进程因大量的 N+1 关联查询及未优化的大表 JOIN 发生死锁。连接池耗尽导致物理服务器 CPU 100% 满载、严重过热！",
        cpu_load=100,
        status="active",
    )

  # Broadcast trigger packet via WebSocket to alert other sessions
  try:
    await manager.broadcast({
        "type": "ANOMALY_TRIGGER",
        "anomaly": {
            "anomaly_id": anomaly.anomaly_id,
            "title": anomaly.title,
            "description": anomaly.description,
            "cpu_load": anomaly.cpu_load,
            "status": anomaly.status
        }
    })
  except Exception as e:
    logger.warning("Failed to broadcast anomaly trigger: %s", e)

  return anomaly


@router.post(
    "/anomaly/resolve",
    summary="提交抢修脚本并诊断恢复服务",
    response_model=schemas.SpaceAnomalyResolveResponse,
)
async def resolve_anomaly_endpoint(
    request: schemas.SpaceAnomalyResolveRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.SpaceAnomalyResolveResponse:
  """Evaluates script keywords for SQL indexes, Python try-except blocks, or circuit breaker decorators, and clears anomaly."""
  user = db.query(models.User).filter_by(id=user_id).first()
  if not user:
    raise HTTPException(status_code=404, detail="User not found.")

  if not user.active_anomaly or user.anomaly_status != "active":
    return schemas.SpaceAnomalyResolveResponse(
        status="fail",
        feedback="当前并无活跃的系统故障，无需抢修！",
        xp_gained=0,
    )

  script = request.script.lower()

  if user.active_anomaly == "service_breaker_trip":
    # Keyword evaluation for distributed circuit breaker
    is_circuit_breaker = "circuitbreaker" in script or "breaker" in script
    is_fallback = "fallback" in script
    is_open = "open" in script
    is_closed = "closed" in script

    is_breaker_resolved = is_circuit_breaker and is_fallback and is_open and is_closed

    if is_breaker_resolved:
      feedback = (
          "✓ 修复成功！已检测到分布式熔断器（CircuitBreaker）及 fallback 回退方法定义，"
          "并正确包含熔断器 open 与 closed 状态逻辑！微服务 B 保护链条重新闭合，系统恢复正常，"
          "CPU 负载降回 8%！"
      )
      status = "success"
      xp_gained = 80
    else:
      feedback = (
          "❌ 诊断失败！未检测到完整的分布式熔断器 (circuitbreaker/breaker)、"
          "回退方法 (fallback) 以及状态转换声明 (open, closed)。故障依然存在！"
      )
      status = "fail"
      xp_gained = 0
  else:
    # Existing db_cpu_overload logic
    is_sql_index = "create index" in script and "on" in script
    is_python_exception = "try" in script and "except" in script

    if is_sql_index:
      feedback = (
          "✓ 优化成功！已检测到 SQL 索引创建语句。成功为高频查询列创建索引，"
          "查询检索复杂度从 O(N) 降至 O(log N)，彻底消除全表扫描，CPU 负载降回 12%！"
      )
      status = "success"
      xp_gained = 50
    elif is_python_exception:
      feedback = (
          "✓ 修复成功！已检测到 Python 异常捕获块。成功捕获连接超时并调用了 "
          "db.rollback() 释放死锁连接，连接池耗尽危机完全解除，CPU 负载降回 15%！"
      )
      status = "success"
      xp_gained = 50
    else:
      feedback = (
          "❌ 诊断失败！未检测到有效的异常捕获块 (try-except) 语法，"
          "或未检测到针对数据大表进行索引创建的优化 (CREATE INDEX ... ON)。故障依然存在！"
      )
      status = "fail"
      xp_gained = 0

  if status == "success":
    user.active_anomaly = None
    user.anomaly_cpu = 0
    user.anomaly_status = "resolved"
    user.total_xp += xp_gained
    db.commit()

    # Broadcast resolved packet to other sessions
    try:
      await manager.broadcast({
          "type": "ANOMALY_RESOLVED",
          "xp_gained": xp_gained
      })
    except Exception as e:
      logger.warning("Failed to broadcast anomaly resolution: %s", e)

  return schemas.SpaceAnomalyResolveResponse(
      status=status,
      feedback=feedback,
      xp_gained=xp_gained,
  )


@router.post(
    "/coop/submit",
    summary="提交代码发起同业评审(Peer Review)",
    response_model=schemas.CoopReviewResponse,
)
async def submit_coop_review(
    background_tasks: BackgroundTasks,
    request: schemas.CoopSubmitRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.CoopReviewResponse:
  """Saves a code review request, broadcasts it to other players, and triggers NPC autopilot if alone."""
  import uuid
  from datetime import datetime
  from app.models.orm import CoopReview

  review_id = str(uuid.uuid4())
  review_row = CoopReview(
      id=review_id,
      user_id=user_id,
      title=request.title,
      code_content=request.code_content,
      language=request.language,
      status="pending",
      created_at=datetime.utcnow(),
  )
  db.add(review_row)
  db.commit()
  db.refresh(review_row)

  # Broadcast to WebSocket
  try:
    await manager.broadcast({
        "type": "COOP_REVIEW_CREATED",
        "review": {
            "id": review_id,
            "user_id": user_id,
            "title": request.title,
            "code_content": request.code_content,
            "language": request.language,
            "status": "pending",
            "created_at": str(review_row.created_at)
        }
    })
  except Exception as e:
    logger.warning("Failed to broadcast coop review trigger: %s", e)

  # NPC Autopilot Fallback: If only this player is online (active connections <= 1), schedule NPC review
  if len(manager.active_connections) <= 1:
    background_tasks.add_task(simulate_npc_review, review_id, user_id)

  return schemas.CoopReviewResponse(
      id=review_row.id,
      user_id=review_row.user_id,
      title=review_row.title,
      code_content=review_row.code_content,
      language=review_row.language,
      status=review_row.status,
      created_at=str(review_row.created_at),
  )


@router.get(
    "/coop/pending",
    summary="获取所有待评审的代码列表",
    response_model=list[schemas.CoopReviewResponse],
)
async def get_pending_coop_reviews(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> list[schemas.CoopReviewResponse]:
  """Retrieves all active pending code review requests."""
  from app.models.orm import CoopReview

  pending = db.query(CoopReview).filter_by(status="pending").order_by(CoopReview.created_at.desc()).all()
  return [
      schemas.CoopReviewResponse(
          id=r.id,
          user_id=r.user_id,
          title=r.title,
          code_content=r.code_content,
          language=r.language,
          status=r.status,
          reviewer_id=r.reviewer_id,
          feedback=r.feedback,
          created_at=str(r.created_at),
      )
      for r in pending
  ]


@router.post(
    "/coop/review",
    summary="对同事提交的请求进行人工同业评审(Approve/Reject)",
    response_model=schemas.CoopActionResponse,
)
async def submit_peer_review(
    request: schemas.CoopReviewRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.CoopActionResponse:
  """Saves approval or rejection status, distributes XP, and broadcasts update."""
  from app.models.orm import CoopReview, User

  review = db.query(CoopReview).filter_by(id=request.review_id).first()
  if not review:
    raise HTTPException(status_code=404, detail="Review request not found.")

  if review.user_id == user_id:
    raise HTTPException(status_code=400, detail="你不能评审自己提交的代码！")

  if review.status != "pending":
    raise HTTPException(status_code=400, detail="该请求已被完成评审，无法重复提交。")

  review.status = request.status
  review.reviewer_id = user_id
  review.feedback = request.feedback

  # Distribute XP on approval
  xp_gained = 0
  if request.status == "approved":
    xp_gained = 30
    author = db.query(User).filter_by(id=review.user_id).first()
    if author:
      author.total_xp += 30  # Author gets 30 XP

    reviewer = db.query(User).filter_by(id=user_id).first()
    if reviewer:
      reviewer.total_xp += 20  # Reviewer gets 20 XP

  db.commit()

  # Broadcast resolution via WebSocket
  try:
    await manager.broadcast({
        "type": "COOP_REVIEW_RESOLVED",
        "review_id": review.id,
        "status": request.status,
        "reviewer_id": user_id,
        "feedback": request.feedback,
        "xp_gained": xp_gained,
        "author_id": review.user_id
    })
  except Exception as e:
    logger.warning("Failed to broadcast review resolution: %s", e)

  return schemas.CoopActionResponse(
      status="success",
      message=f"代码评审完成！已标记为 {request.status}。" + (f" 你获得了 +20 XP，作者获得了 +30 XP！" if request.status == "approved" else ""),
      xp_gained=20 if request.status == "approved" else 0,
  )


async def simulate_npc_review(review_id: str, author_id: str):
  """Asynchronously simulates an AI mentor checking and commenting on the review request."""
  import asyncio
  from app.db.session import session_local
  from app.models.orm import CoopReview, User

  await asyncio.sleep(6)
  db = session_local()
  try:
    review = db.query(CoopReview).filter_by(id=review_id, status="pending").first()
    if not review:
      return

    code_lower = review.code_content.lower()
    if len(code_lower.strip()) < 10:
      status = "rejected"
      feedback = "❌ 警告：提交的代码体量过短。请务必编写完整的方法签名、主体逻辑和相关的错误捕获后再提审！"
      reviewer_id = "npc_ling"
      xp_gained = 0
    elif any(kw in code_lower for kw in ["try", "except", "index", "def ", "import", "with "]):
      status = "approved"
      if review.language == "sql":
        feedback = "✓ Gao Ling (Tech Lead) 评审意见：索引优化策略相当到位。在高并发关联查询场景下避免了 full-table scan，能有效缓解 CPU overload。审核通过！"
      else:
        feedback = "✓ Gao Ling (Tech Lead) 评审意见：Python 代码复用度和异常隔离做得很漂亮。充分考虑了 Connection Timeout 与 Rollback 逻辑，满足线上高可用发布标准！"
      reviewer_id = "npc_ling"
      xp_gained = 30
    else:
      status = "approved"
      feedback = "✓ Zheng Ying (Senior Analyst) 评审意见：数据切片及特征工程逻辑满足分析要求。运行性能优越，代码优雅！审核通过。"
      reviewer_id = "npc_ying"
      xp_gained = 30

    review.status = status
    review.reviewer_id = reviewer_id
    review.feedback = feedback

    if status == "approved":
      author = db.query(User).filter_by(id=author_id).first()
      if author:
        author.total_xp += xp_gained

    db.commit()

    # Broadcast resolution to WebSocket
    try:
      await manager.broadcast({
          "type": "COOP_REVIEW_RESOLVED",
          "review_id": review_id,
          "status": status,
          "reviewer_id": reviewer_id,
          "feedback": feedback,
          "xp_gained": xp_gained if status == "approved" else 0,
          "author_id": author_id
      })
    except Exception as e:
      logger.warning("Failed to broadcast NPC coop review resolution: %s", e)

  except Exception as e:
    logger.error("Error in simulate_npc_review task: %s", e)
  finally:
    db.close()


class ConnectionManager:
  """Manages active WebSockets connections and broadcasts real-time coordinate and typing states."""

  def __init__(self):
    self.active_connections: dict[str, WebSocket] = {}
    self.player_states: dict[str, dict] = {}

  async def connect(self, player_id: str, websocket: WebSocket):
    await websocket.accept()
    self.active_connections[player_id] = websocket
    
    if player_id not in self.player_states:
      self.player_states[player_id] = {
          "x": 0,
          "y": 0,
          "direction": "down",
          "isWalking": False,
          "isTyping": False
      }

    # 1. Send all OTHER players' states to the joining player
    other_players = {
        pid: state for pid, state in self.player_states.items() if pid != player_id
    }
    await websocket.send_json({
        "type": "SYNC",
        "players": other_players
    })

    # 2. Broadcast PLAYER_JOIN to everyone else
    await self.broadcast({
        "type": "PLAYER_JOIN",
        "player_id": player_id,
        "state": self.player_states[player_id]
    }, exclude_player_id=player_id)

  def disconnect(self, player_id: str):
    if player_id in self.active_connections:
      del self.active_connections[player_id]
    if player_id in self.player_states:
      del self.player_states[player_id]

  async def broadcast(self, message: dict, exclude_player_id: str | None = None):
    for player_id, connection in list(self.active_connections.items()):
      if player_id == exclude_player_id:
        continue
      try:
        await connection.send_json(message)
      except Exception:
        self.disconnect(player_id)

  async def update_player_state(self, player_id: str, updates: dict):
    if player_id in self.player_states:
      self.player_states[player_id].update(updates)
      if any(k in updates for k in ["x", "y", "direction", "isWalking"]):
        await self.broadcast({
            "type": "PLAYER_MOVE",
            "player_id": player_id,
            "x": self.player_states[player_id]["x"],
            "y": self.player_states[player_id]["y"],
            "direction": self.player_states[player_id]["direction"],
            "isWalking": self.player_states[player_id]["isWalking"]
        }, exclude_player_id=player_id)
      elif "isTyping" in updates:
        await self.broadcast({
            "type": "PLAYER_TYPING",
            "player_id": player_id,
            "isTyping": self.player_states[player_id]["isTyping"]
        }, exclude_player_id=player_id)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, player_id: str | None = None):
  """WebSocket handler for bidirectional multi-player state exchange."""
  if not player_id:
    await websocket.close(code=1008)
    return

  await manager.connect(player_id, websocket)
  try:
    while True:
      data = await websocket.receive_json()
      msg_type = data.get("type")
      if msg_type == "MOVE":
        await manager.update_player_state(player_id, {
            "x": data.get("x", 0),
            "y": data.get("y", 0),
            "direction": data.get("direction", "down"),
            "isWalking": data.get("isWalking", False)
        })
      elif msg_type == "TYPING":
        await manager.update_player_state(player_id, {
            "isTyping": data.get("isTyping", False)
        })
      elif msg_type == "CHAT":
        await manager.broadcast({
            "type": "PLAYER_CHAT",
            "player_id": player_id,
            "message": data.get("message", "")
        }, exclude_player_id=player_id)
  except WebSocketDisconnect:
    manager.disconnect(player_id)
    await manager.broadcast({
        "type": "PLAYER_LEAVE",
        "player_id": player_id
    })
  except Exception as e:
    logger.error("WebSocket exception for player %s: %s", player_id, e)
    manager.disconnect(player_id)
    await manager.broadcast({
        "type": "PLAYER_LEAVE",
        "player_id": player_id
    })

