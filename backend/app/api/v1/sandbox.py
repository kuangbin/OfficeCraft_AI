"""FastAPI router for Sandbox compilation and diagnostics endpoints."""

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.models import orm as models, schemas
from app.services.compiler import compile_and_diagnose

router = APIRouter()


@router.post(
    "/compile",
    summary="安全编译、运行及 AST 诊断玩家代码",
    response_model=schemas.SandboxCompileResponse,
)
async def compile_sandbox_code(
    request: schemas.SandboxCompileRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> schemas.SandboxCompileResponse:
  """Runs AST inspections, complexity analysis, and safe bounded-namespace sandbox code runs."""
  user = db.query(models.User).filter_by(id=user_id).first()
  context = None
  
  if user and user.active_anomaly and user.anomaly_status == "active":
    context = user.active_anomaly

  # Best effort context inference based on mission_id or target patterns
  if not context and request.mission_id:
    mid = request.mission_id.lower()
    if "breaker" in mid or "trip" in mid or "circuit" in mid:
      context = "service_breaker_trip"
    elif "db" in mid or "overload" in mid or "cpu" in mid:
      context = "db_cpu_overload"

  res = compile_and_diagnose(request.code, request.language, context)
  
  return schemas.SandboxCompileResponse(
      status=res["status"],
      feedback=res["feedback"],
      logs=res["logs"],
      diagnostics=res["diagnostics"],
  )
