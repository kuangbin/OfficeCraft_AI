"""API endpoints for spatial state sync, movement, and bookcase RAG search."""

import logging
from fastapi import APIRouter, Body, Depends, HTTPException, WebSocket, WebSocketDisconnect
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
  # - If active mission exists: default to "quiet-blue" (study/development focus)
  # - Else: "default"
  ambient_theme = "quiet-blue" if active_mission else "default"

  # Static map assets URL
  map_assets_url = "http://localhost:8000/static/map_tile_v1.png"

  return schemas.SpaceStateResponse(
      player_coords=schemas.SpaceCoords(x=user.coord_x, y=user.coord_y),
      ambient_theme=ambient_theme,
      map_assets_url=map_assets_url,
      active_mission=active_mission,
      unresolved_conflict=unresolved_conflict,
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

