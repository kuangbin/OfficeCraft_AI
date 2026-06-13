import json
import uuid
import asyncio
from datetime import datetime
import logging
from app.db.session import session_local
from app.models import orm as models
from app.services.agents.llm_io import call_llm, llm_disabled

logger = logging.getLogger(__name__)

AMY_SYSTEM_PROMPT = (
    "你叫 Amy，是 OfficeCraft 办公室的 Product Manager。性格风风火火、商业驱动、关注上线速度和用户增长，"
    "经常吐槽研发慢、部署压力大。用词时尚（含有一些互联网黑话，如：闭环、赋能、抓手、对齐、打法等）。"
    "发言必须简明扼要，控制在 100 字以内。"
)

LING_SYSTEM_PROMPT = (
    "你叫高凌，是 OfficeCraft 办公室的 Tech Lead。性格冷静严谨、技术控、关注代码规范和架构性能、"
    "崇尚 SOLID 原则和单元测试，对低质量代码深恶痛绝。经常说一些极具技术感的话。"
    "发言必须简明扼要，控制在 100 字以内。"
)

async def stream_standup_dialogue(user_id: str):
  """Generates a sequential morning standup dialogue stream (PM Amy -> Tech Lead Gao Ling)

  capturing player historical memories, and saves the dialogue log to the database.
  """
  db = session_local()
  active_mission = None
  memories = []
  
  try:
    # 1. Fetch active mission & emotional memories to enrich the context
    active_mission = (
        db.query(models.MissionRecord)
        .filter_by(user_id=user_id, status="active")
        .first()
    )
    memories = (
        db.query(models.UserEmotionalMemory)
        .filter_by(user_id=user_id)
        .order_by(models.UserEmotionalMemory.created_at.desc())
        .limit(2)
        .all()
    )
  except Exception as e:
    logger.warning("Failed to query DB context for standup stream: %s", e)
  finally:
    db.close()

  # Formatting memories for the Tech Lead Gao Ling
  memory_context = ""
  if memories:
    memory_lines = [f"- {m.summary_text}" for m in memories]
    memory_context = "\n".join(memory_lines)

  # 2. Part 1: PM Amy Speaks
  amy_speech = ""
  if llm_disabled():
    amy_speech = (
        "大家早上好！我们这周首要的打法是赶紧把「优惠券中心」这个业务闭环掉！"
        "竞品已经上线这个赋能抓手了，留给我们的时间不多了，大家一定要跟时间赛跑，迅速发版！"
    )
  else:
    mission_text = f"（当前任务：{active_mission.title}）" if active_mission else ""
    amy_prompt = (
        f"今天是每日晨会，作为产品经理，请你针对团队目前的交付进度发表看法。\n"
        f"催促团队抓紧时间上线优惠券核心营销功能以赋能业务，用词充满时尚的互联网黑话。{mission_text}\n"
        f"请直接输出你的口头语，不要有任何多余的旁白或包裹，字数在 80 字以内。"
    )
    try:
      amy_speech = await call_llm(prompt=amy_prompt, system=AMY_SYSTEM_PROMPT)
      amy_speech = amy_speech.strip().strip('"').strip("'")
    except Exception as e:
      logger.warning("PM Amy LLM call failed: %s", e)
      amy_speech = "大家早上好！我们这周必须把「优惠券中心」业务闭环掉，跟竞跑时间赛跑，迅速发版！"

  # Yield PM Amy's speech typewriter style
  for char in amy_speech:
    yield f"data: {json.dumps({'speaker': 'pm_amy', 'chunk': char})}\n\n"
    await asyncio.sleep(0.04)
  
  yield f"data: {json.dumps({'speaker': 'pm_amy', 'done': True})}\n\n"
  await asyncio.sleep(0.5)

  # 3. Part 2: Tech Lead Gao Ling Speaks (reacting to PM Amy and remembering user's actions)
  ling_speech = ""
  if llm_disabled():
    ling_speech = (
        "Amy，你太急躁了。发布速度快当然好，但如果基础设施和数据清洗规范没有对齐，上线就是灾难。"
        "玩家之前就犯过相关的代码或空值处理缺陷。我们必须在写好测试并确保 SOLID 规范的情况下才能发版！"
    )
  else:
    ling_prompt = (
        f"在刚刚的晨会上，产品经理 Amy 刚刚催促发言说：“{amy_speech}”\n"
        f"作为技术主管，请你针对她的发言进行严厉的技术质量反驳。强调如果忽略架构规范和代码测试强行上线，"
        f"会给生产环境带来灾难性的隐患。坚持写完单元测试、进行性能调优才是真正的敏捷。\n"
    )
    if memory_context:
      ling_prompt += (
          f"\n另外，你的长效记忆中关于该玩家历史提交和表现的记录如下：\n"
          f"{memory_context}\n"
          f"请在你的发言中顺带提起这些历史表现，督促他、指导他或者肯定他，让他知道你一直在关注他的技术成长。\n"
      )
    ling_prompt += "请直接口头驳斥回复，不需要任何多余旁白，字数在 90 字以内。"
    
    try:
      ling_speech = await call_llm(prompt=ling_prompt, system=LING_SYSTEM_PROMPT)
      ling_speech = ling_speech.strip().strip('"').strip("'")
    except Exception as e:
      logger.warning("Tech Lead Gao Ling LLM call failed: %s", e)
      ling_speech = (
          "Amy，急躁解决不了任何问题。没有充足的代码测试和重构，"
          "产品发布就是灾难。我们必须让玩家写好相应的单元测试才能准予发版上线！"
      )

  # Yield Tech Lead Gao Ling's speech typewriter style
  for char in ling_speech:
    yield f"data: {json.dumps({'speaker': 'mentor_ling', 'chunk': char})}\n\n"
    await asyncio.sleep(0.04)

  yield f"data: {json.dumps({'speaker': 'mentor_ling', 'done': True})}\n\n"
  await asyncio.sleep(0.5)

  # 4. Persistence: save dialogue history under TeamMeetingLog table
  db = session_local()
  try:
    dialogue_history = [
        {"speaker": "pm_amy", "text": amy_speech},
        {"speaker": "mentor_ling", "text": ling_speech}
    ]
    # Check if there is an active mission to associate
    mission_id = active_mission.mission_id if active_mission else "daily_standup"
    meeting_log = models.TeamMeetingLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        mission_id=mission_id,
        dialogue_history_json=json.dumps(dialogue_history),
        status="completed" # Finished standard morning standup
    )
    db.add(meeting_log)
    db.commit()
    logger.info("Saved completed standup dialogue log to database: %s", meeting_log.id)
  except Exception as e:
    logger.error("Failed to persist completed standup log to database: %s", e)
  finally:
    db.close()

  # Final status event
  yield f"data: {json.dumps({'status': 'finished'})}\n\n"


async def arbitrate_conflict_resolution(user_id: str, conflict_id: str, choice: str, db) -> dict:
  """Resolves the team conflict based on player's arbitration choice, generates AI reactions, and rewards XP."""
  conflict = db.query(models.TeamMeetingLog).filter_by(id=conflict_id, user_id=user_id, status="active").first()
  if not conflict:
    raise ValueError("Active conflict not found for this user.")

  xp_gained = 50
  choice_desc = ""
  feedback = ""
  if choice == "speed":
    xp_gained = 40
    choice_desc = "玩家支持：速度优先，即刻发版，技术债后续再偿还。"
    feedback = "你选择了速度优先。产品经理 Amy 对你表示赞赏，认为你具备商业闭环思维；但技术主管高凌对潜在的代码质量缺陷和生产环境稳定性表示了深切的忧虑。"
  elif choice == "quality":
    xp_gained = 60
    choice_desc = "玩家支持：质量优先，必须写完单元测试、完成重构后再发版。"
    feedback = "你选择了质量优先。技术主管高凌对你的严谨和专业态度十分赞赏，认为你守住了研发的底线；但产品经理 Amy 抱怨发版推迟，导致市场宣传计划被迫延期。"
  else:
    xp_gained = 50
    choice_desc = "玩家支持：平衡方案，核心主路径补齐测试，非核心功能逐步重构、分批上线。"
    feedback = "你选择了折中平衡。Amy 同意将非核心功能分批次灰度上线，高凌也妥协对核心主流程进行了核心用例测试，团队达成了完美的高效共识。"

  amy_reaction = ""
  ling_reaction = ""

  if llm_disabled():
    if choice == "speed":
      amy_reaction = "太棒了！这才是真正的敏捷打法，先跑起来、跑出数据最重要！"
      ling_reaction = "唉，这种质量强行上线，后续的技术债一定会让我们付出十倍的代价来偿还。"
    elif choice == "quality":
      amy_reaction = "哎呀，发版又推迟，运营那边的排期全都乱了。真拿你们研发没办法。"
      ling_reaction = "理智的选择。代码是有生命力的，不写测试、不重构，迟早会被垃圾代码淹没。"
    else:
      amy_reaction = "好吧，核心闭环先发，非核心功能逐步迭代，这也是个折中方案。"
      ling_reaction = "同意，核心流程的稳定性得到了保证，这是可以接受的平衡折中。"
  else:
    history = conflict.dialogue_history
    history_str = "\n".join([f"{item['speaker']}: {item['text']}" for item in history])

    amy_prompt = (
        f"在团队关于发版速度与代码质量的激烈冲突中，你（Amy）刚刚听到玩家做出了如下仲裁决断：\n"
        f"「{choice_desc}」\n\n"
        f"此前历史冲突对话：\n{history_str}\n\n"
        f"请以产品经理的身份（时尚互联网黑话、商业速度优先），针对玩家的仲裁决断发表你的口头态度。\n"
        f"请直接输出口头语，不要有任何多余旁白，字数在 80 字以内。"
    )
    ling_prompt = (
        f"在团队冲突中，你（高凌）刚刚听到玩家做出了如下仲裁决断：\n"
        f"「{choice_desc}」\n\n"
        f"此前历史冲突对话：\n{history_str}\n\n"
        f"请以技术主管的身份（冷静严谨、讲究规范质量、对低质量代码深恶痛绝），针对玩家的仲裁决断发表你的口头态度。\n"
        f"请直接输出口头语，不要有任何多余旁白，字数在 90 字以内。"
    )
    try:
      amy_reaction = await call_llm(prompt=amy_prompt, system=AMY_SYSTEM_PROMPT)
      amy_reaction = amy_reaction.strip().strip('"').strip("'")

      ling_reaction = await call_llm(prompt=ling_prompt, system=LING_SYSTEM_PROMPT)
      ling_reaction = ling_reaction.strip().strip('"').strip("'")
    except Exception as e:
      logger.warning("LLM Arbitration generation failed: %s", e)
      if choice == "speed":
        amy_reaction = "太棒了！先跑起来、跑出数据，这就是敏捷闭环！"
        ling_reaction = "唉，这种质量上线，后续的技术债一定会让我们付出极高代价。"
      elif choice == "quality":
        amy_reaction = "好吧，发版推迟，运营那边的排期只能重新对齐了。"
        ling_reaction = "非常理智的选择。不写测试、不重构，迟早会被垃圾代码淹没。"
      else:
        amy_reaction = "行吧，核心闭环先发，非核心功能再迭代，折中对齐。"
        ling_reaction = "核心流程的稳定性得到了保证，这是可以接受的合理妥协。"

  # Update user total XP
  user = db.query(models.User).filter_by(id=user_id).first()
  if user:
    user.total_xp += xp_gained

  # Append player and reactions to dialogue history
  history = conflict.dialogue_history
  history.append({"speaker": "player", "text": choice_desc})
  history.append({"speaker": "pm_amy", "text": amy_reaction})
  history.append({"speaker": "mentor_ling", "text": ling_reaction})

  conflict.dialogue_history_json = json.dumps(history)
  conflict.status = "completed"
  db.add(conflict)
  db.commit()
  db.refresh(conflict)

  return {
      "status": "success",
      "dialogue_history": history,
      "xp_gained": xp_gained,
      "feedback": feedback
  }

