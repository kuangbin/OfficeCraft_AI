"""Unit and integration tests for the OfficeCraft AI Spatial APIs."""

import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import ERR_MISSING_PLAYER_ID, ERR_INVALID_PLAYER_ID
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


class TestSpatialApi(unittest.TestCase):
  """Integration testing suite for spatial and bookcase endpoints."""

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

  # --- Auth & Identity Verification ---

  def test_spatial_endpoints_reject_missing_player_id(self):
    """Ensures protected spatial endpoints return 401 on missing identity headers."""
    protected_paths = [
        ("/api/v1/space/state", "GET", None),
        ("/api/v1/space/move", "POST", {"x": 10, "y": 12}),
        ("/api/v1/space/rag/search", "POST", {"bookcase_id": "pandas_library", "query": "pandas"}),
    ]

    for path, method, payload in protected_paths:
      with self.subTest(path=path, method=method):
        if method == "GET":
          res = self.client.get(path)
        else:
          res = self.client.post(path, json=payload)
        
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["detail"]["code"], ERR_MISSING_PLAYER_ID)

  def test_spatial_endpoints_reject_invalid_player_id(self):
    """Ensures protected spatial endpoints return 401 on malformed identity headers."""
    headers = {"X-Player-Id": "invalid-uuid"}
    res = self.client.get("/api/v1/space/state", headers=headers)
    self.assertEqual(res.status_code, 401)
    self.assertEqual(res.json()["detail"]["code"], ERR_INVALID_PLAYER_ID)

  # --- GET /space/state (State Recovery) ---

  def test_get_space_state_creates_default_user_coords(self):
    """Ensures checking state on a fresh profile auto-initializes coordinates at (0, 0)."""
    headers = {"X-Player-Id": TEST_PLAYER_ID}
    res = self.client.get("/api/v1/space/state", headers=headers)
    self.assertEqual(res.status_code, 200, msg=res.text)
    
    body = res.json()
    self.assertEqual(body["player_coords"]["x"], 0)
    self.assertEqual(body["player_coords"]["y"], 0)
    self.assertEqual(body["ambient_theme"], "default")
    self.assertIsNone(body["active_mission"])
    self.assertIsNone(body["unresolved_conflict"])

  def test_get_space_state_with_active_mission_returns_quiet_blue_theme(self):
    """Ensures that having an active mission switches ambient theme to 'quiet-blue'."""
    # Write a user and an active mission to our DB session
    self.db_session.add(models.User(id=TEST_PLAYER_ID, coord_x=5, coord_y=5, current_career_id="career_software_engineer"))
    self.db_session.add(models.MissionRecord(
        user_id=TEST_PLAYER_ID,
        mission_id="mvp_mission_software_1",
        title="SQL N+1 optimization",
        description="Fix N+1 query",
        mock_data_url="https://example.com/mock.py",
        delivery_requirements_json="[]",
        status="active",
    ))
    self.db_session.commit()

    headers = {"X-Player-Id": TEST_PLAYER_ID}
    res = self.client.get("/api/v1/space/state", headers=headers)
    self.assertEqual(res.status_code, 200)
    
    body = res.json()
    self.assertEqual(body["player_coords"]["x"], 5)
    self.assertEqual(body["player_coords"]["y"], 5)
    self.assertEqual(body["ambient_theme"], "quiet-blue")
    self.assertIsNotNone(body["active_mission"])
    self.assertEqual(body["active_mission"]["mission_id"], "mvp_mission_software_1")
    self.assertEqual(body["active_mission"]["status"], "active")

  # --- POST /space/move (Coordinate Sync & Proximity) ---

  def test_move_player_saves_coordinates_correctly(self):
    """Ensures moving player updates coordinates in the DB and returns success status."""
    headers = {"X-Player-Id": TEST_PLAYER_ID}
    payload = {"x": 12, "y": 14}
    res = self.client.post("/api/v1/space/move", json=payload, headers=headers)
    self.assertEqual(res.status_code, 200)
    
    body = res.json()
    self.assertEqual(body["status"], "success")
    self.assertEqual(body["coords"]["x"], 12)
    self.assertEqual(body["coords"]["y"], 14)
    self.assertIsNone(body["triggered_npc_id"])

    # Double check actual record in SQLite
    user = self.db_session.query(models.User).filter_by(id=TEST_PLAYER_ID).first()
    self.assertEqual(user.coord_x, 12)
    self.assertEqual(user.coord_y, 14)

  def test_move_player_validates_grid_matrix_overflows(self):
    """Ensures coordinates out of 25x25 boundary matrix (0-24) return 422 standard validation errors."""
    headers = {"X-Player-Id": TEST_PLAYER_ID}
    
    # Check lower bounds violation (handled by ge=0 validator)
    res_neg = self.client.post("/api/v1/space/move", json={"x": -1, "y": 10}, headers=headers)
    self.assertEqual(res_neg.status_code, 422)

    # Check upper bounds violation (handled by le=24 validator)
    res_overflow = self.client.post("/api/v1/space/move", json={"x": 25, "y": 10}, headers=headers)
    self.assertEqual(res_overflow.status_code, 422)

  def test_proximity_detects_adjacent_npc_triggers(self):
    """Ensures player stepping within 1 cell of mentor_ling (15, 6) returns triggered_npc_id."""
    headers = {"X-Player-Id": TEST_PLAYER_ID}
    
    # Step to (15, 5) - Exactly 1 cell below mentor_ling (15, 6)
    res = self.client.post("/api/v1/space/move", json={"x": 15, "y": 5}, headers=headers)
    self.assertEqual(res.status_code, 200)
    self.assertEqual(res.json()["triggered_npc_id"], "mentor_ling")

    # Step to (16, 7) - Diagonal adjacent to mentor_ling (15, 6)
    res_diag = self.client.post("/api/v1/space/move", json={"x": 16, "y": 7}, headers=headers)
    self.assertEqual(res_diag.status_code, 200)
    self.assertEqual(res_diag.json()["triggered_npc_id"], "mentor_ling")

    # Step to (13, 6) - Too far (2 cells away)
    res_far = self.client.post("/api/v1/space/move", json={"x": 13, "y": 6}, headers=headers)
    self.assertEqual(res_far.status_code, 200)
    self.assertIsNone(res_far.json()["triggered_npc_id"])

  # --- POST /space/rag/search (Bookcase Restricted RAG) ---

  @patch("app.api.v1.space.rag.query_knowledge_base", new_callable=AsyncMock)
  def test_physical_bookcase_rag_scopes_correctly(self, mock_query):
    """Ensures physical RAG queries map bookcases to the right domains and format response paths."""
    mock_query.return_value = [
        {
            "doc_id": "chunk_01",
            "title": "Pandas Outer Joins",
            "snippet": "Use pd.merge(df1, df2, on='id', how='outer')",
            "relevance_score": 0.92,
            "source": "pandas_join.md",
            "tags": ["core_data"],
        }
    ]

    headers = {"X-Player-Id": TEST_PLAYER_ID}
    payload = {"bookcase_id": "pandas_library", "query": "outer join Nan values"}
    
    res = self.client.post("/api/v1/space/rag/search", json=payload, headers=headers)
    self.assertEqual(res.status_code, 200)
    
    body = res.json()
    self.assertEqual(body["bookcase_id"], "pandas_library")
    self.assertEqual(len(body["top_k_chunks"]), 1)
    
    chunk = body["top_k_chunks"][0]
    # Check subfolder was formatted to data_analyst because of domain mapping
    self.assertEqual(chunk["doc_title"], "docs/knowledge_base/data_analyst/pandas_join.md")
    self.assertEqual(chunk["content_excerpt"], "Use pd.merge(df1, df2, on='id', how='outer')")
    self.assertEqual(chunk["similarity_score"], 0.92)

    # Validate correct parameters were forwarded to the query function
    mock_query.assert_called_once_with(query="outer join Nan values", career_category="core_data")


if __name__ == "__main__":
  unittest.main()
