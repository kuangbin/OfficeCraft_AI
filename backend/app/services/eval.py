import json
import logging
import uuid
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.services.agents.base import EvaluationContext
from app.services.orchestrators import EvaluationOrchestrator
from app.services.skill_catalog import allowed_skills_for, infer_career_id
from app.models import orm as models
from app.models.schemas import (
    SubmissionEvaluateRequest,
    SubmissionEvaluateResponse,
)
from app.services.agents.llm_io import call_llm, llm_disabled

logger = logging.getLogger(__name__)


async def evaluate_user_submission(
    request: SubmissionEvaluateRequest,
    db: Session,
    user_id: str,
    orchestrator: EvaluationOrchestrator,
) -> SubmissionEvaluateResponse:
  """Orchestrates AI peer review, updates DB records, and handles Feynman triggers."""
  # Resolve career_id *before* evaluation so the LLM sees the right whitelist.
  user = db.query(models.User).filter_by(id=user_id).first()
  mission = (
      db.query(models.MissionRecord)
      .filter_by(user_id=user_id, mission_id=request.mission_id)
      .first()
  )
  if not mission:
    raise HTTPException(status_code=404, detail="Active mission not found for this user.")
  if mission.status != "active":
    raise HTTPException(status_code=409, detail="Mission is not active.")

  career_id = infer_career_id(
      mission_id=request.mission_id,
      role_id=mission.role_id,
      fallback=mission.career_id or (user.current_career_id if user else None),
  )
  allowed = allowed_skills_for(career_id)
  active_mission = mission
  ctx = EvaluationContext(
      mission_id=request.mission_id,
      user_id=user_id,
      submission_text=request.submission_text,
      career_id=career_id,
      mission_description=active_mission.description,
  )
  payload = await orchestrator.evaluate(
      ctx,
      mock_data_filename=(
          active_mission.mock_data_filename if active_mission else None
      ),
  )

  # Drop any skill keys outside this career's whitelist before the response
  # and DB writes diverge.
  raw_gains = payload.get("experience_gains") or {}
  unknown = sorted(set(raw_gains) - allowed)
  if unknown:
    logger.warning(
        "Dropping experience_gains keys outside %s whitelist: %s",
        career_id, unknown,
    )
  payload["experience_gains"] = {k: v for k, v in raw_gains.items() if k in allowed}

  response = SubmissionEvaluateResponse(**payload)
  validated_gains: dict[str, int] = response.experience_gains.root

  active_mission.submission_text = request.submission_text
  active_mission.feedback = response.feedback
  active_mission.experience_gains_json = json.dumps(validated_gains)

  if response.status == "fail":
    active_mission.status = "failed"
    active_mission.feynman_active = False
  elif response.trigger_feynman_challenge:
    active_mission.feynman_active = True
    active_mission.feynman_question = response.feynman_question
  else:
    active_mission.status = "completed"
    active_mission.feynman_active = False

  if not user:
    user = models.User(id=user_id, current_career_id=career_id, total_xp=0)
    db.add(user)

  for skill_id, amount in validated_gains.items():
    if amount <= 0:
      continue
    user.total_xp += amount
    skill_prog = (
        db.query(models.SkillProgress)
        .filter_by(user_id=user_id, skill_id=skill_id)
        .first()
    )
    if not skill_prog:
      skill_prog = models.SkillProgress(
          user_id=user_id, skill_id=skill_id, level=0, experience=amount,
      )
      db.add(skill_prog)
    else:
      skill_prog.experience += amount

  # Step 4.1: Emotional Memory Serialization
  sentiment_tag = "positive" if response.status == "success" else "negative"
  summary_text = ""
  if llm_disabled():
    if sentiment_tag == "positive":
      summary_text = f"玩家成功完成了任务：{active_mission.title}，展现了优秀的专业技术。"
    else:
      summary_text = f"玩家在任务：{active_mission.title} 提交的内容存在一些技术缺陷或测试用例不全，我曾在评审中督促他进行改正。"
  else:
    prompt = (
        f"请将以下技术/数据评审反馈，提炼为一句简短的、以导师或技术主管第一人称视角的长效记忆文本。\n"
        f"该文本将用于在未来的对话中让导师记住玩家的历史表现。\n"
        f"评审反馈内容：\n"
        f"\"\"\"\n{response.feedback}\n\"\"\"\n\n"
        f"要求：\n"
        f"1. 必须是第一人称，符合导师或技术主管口吻（例如：'玩家曾提交过...' 或 '玩家展示了...'）。\n"
        f"2. 如果有代码缺陷、技术失误（如 SettingWithCopyWarning 或未做空值处理），请具体指出，并提醒自己在后续对话中督促其改正。\n"
        f"3. 限制在150字以内，语言精练，直接输出这段文本，不需要任何多余的前缀或包裹。"
    )
    try:
      raw_summary = await call_llm(prompt=prompt)
      summary_text = raw_summary.strip().strip('"').strip("'")
    except Exception as e:
      logger.warning("Failed to generate memory summary using LLM: %s", e)
      if sentiment_tag == "positive":
        summary_text = f"玩家成功完成了任务：{active_mission.title}，展现了优秀的专业技术。"
      else:
        summary_text = f"玩家在任务：{active_mission.title} 提交的内容存在一些技术缺陷，需要进行指导。"

  # Extract first skill_id to link, if available
  link_skill_id = next(iter(validated_gains.keys())) if validated_gains else None

  memory_record = models.UserEmotionalMemory(
      id=str(uuid.uuid4()),
      user_id=user_id,
      skill_id=link_skill_id,
      sentiment_tag=sentiment_tag,
      summary_text=summary_text,
      created_at=datetime.utcnow()
  )
  db.add(memory_record)
  logger.info("Successfully serialized user emotional memory: %s", memory_record.id)

  # Step 4.4: Failed evaluation activates active conflict state
  if response.status == "fail":
    existing_conflict = (
        db.query(models.TeamMeetingLog)
        .filter_by(user_id=user_id, status="active")
        .first()
    )
    if not existing_conflict:
      initial_dialogue = [
          {
              "speaker": "pm_amy",
              "text": f"高工，听说我们这次关于「{active_mission.title}」的紧急迭代评审不通过！市场部催得这么急，我们到底什么时候能把代码弄好上线？我不管，这周五必须发版！"
          },
          {
              "speaker": "mentor_ling",
              "text": f"Amy，急躁解决不了任何问题！这次评审不通过正是因为代码里面有严重的质量缺陷（或是未做核心异常处理/没有单元测试复现）。如果强行上线，那就是在生产环境上埋雷！我们需要玩家给我们进行斡旋，重构和解决这个困局！"
          }
      ]
      conflict_record = models.TeamMeetingLog(
          id=str(uuid.uuid4()),
          user_id=user_id,
          mission_id=request.mission_id,
          dialogue_history_json=json.dumps(initial_dialogue),
          status="active"
      )
      db.add(conflict_record)
      logger.info("Created active conflict record for failed evaluation: %s", conflict_record.id)

  db.commit()
  return response.model_copy(update={
      "mission_status": active_mission.status,
      "feynman_active": active_mission.feynman_active,
  })

