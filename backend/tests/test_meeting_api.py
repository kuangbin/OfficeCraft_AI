"""Unit and integration tests for the OfficeCraft AI Meeting and Arbitration APIs."""

import unittest
import json
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import base, get_db
from app.main import app
from app.models import orm as models

TEST_PLAYER_ID = "00000000-0000-4000-8000-000000000001"


def _make_in_memory_session_factory():
  """Creates a static, shared in-memory SQLite database for testing."""
  engine = create_engine(
      "sqlite:///:memory:",
      connect_args={"check_same_thread": False},
      poolclass=StaticPool,
  )
  base.metadata.create_all(bind=engine)
  return sessionmaker(autocommit=False, autoflush=False, bind=engine)


class TestMeetingApi(unittest.TestCase):
  """Integration testing suite for meeting SSE stream and conflict arbitration."""

  def setUp(self):
    super().setUp()
    self.session_factory = _make_in_memory_session_factory()
    self.db_session = self.session_factory()

    def _override_get_db():
      db = self.session_factory()
      try:
        yield db
      finally:
        db.close()

    app.dependency_overrides[get_db] = _override_get_db
    self.client = TestClient(app)

  def tearDown(self):
    self.db_session.close()
    app.dependency_overrides.clear()
    super().tearDown()

  def test_get_space_state_returns_unresolved_conflict(self):
    """Ensures space state correctly queries and returns active conflicts."""
    # Write user and active conflict to db
    self.db_session.add(models.User(id=TEST_PLAYER_ID, coord_x=5, coord_y=5))
    self.db_session.add(models.TeamMeetingLog(
        id="conflict_123",
        user_id=TEST_PLAYER_ID,
        mission_id="mission_pandas_1",
        dialogue_history_json=json.dumps([]),
        status="active"
    ))
    self.db_session.commit()

    headers = {"X-Player-Id": TEST_PLAYER_ID}
    res = self.client.get("/api/v1/space/state", headers=headers)
    self.assertEqual(res.status_code, 200)
    
    body = res.json()
    self.assertIsNotNone(body["unresolved_conflict"])
    self.assertEqual(body["unresolved_conflict"]["conflict_id"], "conflict_123")
    self.assertIn("pm_amy", body["unresolved_conflict"]["trigger_npc_ids"])
    self.assertIn("mentor_ling", body["unresolved_conflict"]["trigger_npc_ids"])
    self.assertIn("冲突", body["unresolved_conflict"]["description"])

  @patch("app.services.team_orchestrator.stream_standup_dialogue")
  def test_stream_meeting_endpoint(self, mock_stream):
    """Ensures SSE meeting stream endpoint runs and forwards client streams."""
    async def mock_generator(user_id):
      yield "data: {\"speaker\": \"pm_amy\", \"chunk\": \"A\"}\n\n"
      yield "data: {\"speaker\": \"mentor_ling\", \"chunk\": \"L\"}\n\n"
      yield "data: {\"status\": \"finished\"}\n\n"

    mock_stream.side_effect = mock_generator

    headers = {"X-Player-Id": TEST_PLAYER_ID}
    res = self.client.get("/api/v1/space/meeting/stream", headers=headers)
    self.assertEqual(res.status_code, 200)
    self.assertTrue(res.headers["content-type"].startswith("text/event-stream"))
    
    lines = res.text.split("\n\n")
    self.assertIn("data: {\"speaker\": \"pm_amy\", \"chunk\": \"A\"}", lines)
    self.assertIn("data: {\"speaker\": \"mentor_ling\", \"chunk\": \"L\"}", lines)
    self.assertIn("data: {\"status\": \"finished\"}", lines)

  def test_arbitrate_conflict_success_speed(self):
    """Ensures speed choice arbitrates successfully, awards 40 XP, and completes conflict."""
    self.db_session.add(models.User(id=TEST_PLAYER_ID, coord_x=5, coord_y=5, total_xp=100))
    self.db_session.add(models.TeamMeetingLog(
        id="conflict_abc",
        user_id=TEST_PLAYER_ID,
        mission_id="mission_pandas_1",
        dialogue_history_json=json.dumps([{"speaker": "pm_amy", "text": "Hurry up!"}]),
        status="active"
    ))
    self.db_session.commit()

    headers = {"X-Player-Id": TEST_PLAYER_ID}
    payload = {"conflict_id": "conflict_abc", "choice": "speed"}
    res = self.client.post("/api/v1/space/meeting/arbitrate", json=payload, headers=headers)
    self.assertEqual(res.status_code, 200)

    body = res.json()
    self.assertEqual(body["status"], "success")
    self.assertEqual(body["xp_gained"], 40)
    self.assertIn("速度优先", body["feedback"])
    
    # Check dialogue updates
    dialogue = body["dialogue_history"]
    self.assertEqual(len(dialogue), 4) # initial + player choice + amy reaction + ling reaction
    self.assertEqual(dialogue[1]["speaker"], "player")
    self.assertIn("速度优先", dialogue[1]["text"])

    # Double check DB is updated
    user = self.db_session.query(models.User).filter_by(id=TEST_PLAYER_ID).first()
    self.assertEqual(user.total_xp, 140)

    conflict = self.db_session.query(models.TeamMeetingLog).filter_by(id="conflict_abc").first()
    self.assertEqual(conflict.status, "completed")


if __name__ == "__main__":
  unittest.main()
