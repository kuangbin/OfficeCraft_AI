"""Tests for ``LocalArtifactStorage`` using standard library unittest."""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from app.services.storage.artifact_store import (
    LocalArtifactStorage,
    MissionArtifact,
)


class TestLocalArtifactStorage(unittest.TestCase):

  def setUp(self):
    self.test_dir = tempfile.mkdtemp()
    self.tmp_path = Path(self.test_dir)
    self.storage = LocalArtifactStorage(
        base_dir=self.tmp_path,
        public_base="http://test.local/mock_data",
    )

  def tearDown(self):
    shutil.rmtree(self.test_dir)

  def test_persist_writes_file_and_returns_namespaced_name(self) -> None:
    artifact = MissionArtifact(
        filename="user_activities.csv",
        mime_type="text/csv",
        content="a,b\n1,2\n",
    )
    stored = self.storage.persist("mvp_mission_data_1", artifact)

    self.assertTrue(stored.startswith("mvp_mission_data_1__"))
    self.assertTrue(stored.endswith(".csv"))
    self.assertEqual((self.tmp_path / stored).read_text(encoding="utf-8"), "a,b\n1,2\n")

  def test_persist_strips_path_separators_and_unsafe_chars(self) -> None:
    artifact = MissionArtifact(
        filename="../../../etc/passwd evil name.csv",
        mime_type="text/csv",
        content="x,y\n",
    )
    stored = self.storage.persist("mvp_mission_data_1", artifact)
    # No path separators leak into the stored name.
    self.assertNotIn("/", stored)
    self.assertNotIn("\\", stored)
    self.assertNotIn("..", stored)
    self.assertTrue((self.tmp_path / stored).is_file())

  def test_persist_forces_extension_to_match_mime(self) -> None:
    artifact = MissionArtifact(
        filename="weird_name.txt",
        mime_type="text/csv",
        content="ok\n",
    )
    stored = self.storage.persist("mvp_mission_data_1", artifact)
    self.assertTrue(stored.endswith(".csv"))

  def test_persist_rejects_unsupported_mime(self) -> None:
    artifact = MissionArtifact(
        filename="x.bin",
        mime_type="application/octet-stream",
        content="ignored",
    )
    with self.assertRaises(ValueError):
      self.storage.persist("mvp_mission_data_1", artifact)

  def test_copy_sample_copies_with_namespaced_name(self) -> None:
    src = self.tmp_path / "source.csv"
    src.write_text("h\n1\n", encoding="utf-8")
    stored = self.storage.copy_sample("mvp_mission_data_1", src)
    self.assertTrue(stored.startswith("mvp_mission_data_1__"))
    self.assertTrue(stored.endswith(".csv"))
    # Source must not be the same file as target.
    self.assertEqual((self.tmp_path / stored).read_text(encoding="utf-8"), "h\n1\n")

  def test_copy_sample_missing_source_raises(self) -> None:
    with self.assertRaises(FileNotFoundError):
      self.storage.copy_sample("m1", self.tmp_path / "missing.csv")

  def test_read_text_returns_truncated_content(self) -> None:
    artifact = MissionArtifact(
        filename="big.csv",
        mime_type="text/csv",
        content="x" * 5000,
    )
    stored = self.storage.persist("m1", artifact)
    excerpt = self.storage.read_text(stored, max_bytes=100)
    self.assertEqual(len(excerpt), 100)
    self.assertEqual(excerpt, "x" * 100)

  def test_read_text_missing_file_raises(self) -> None:
    with self.assertRaises(FileNotFoundError):
      self.storage.read_text("does_not_exist.csv")

  def test_build_url_uses_public_base(self) -> None:
    self.assertEqual(self.storage.build_url("foo.csv"), "http://test.local/mock_data/foo.csv")

  def test_persist_idempotent_overwrites_same_name(self) -> None:
    a1 = MissionArtifact(filename="d.csv", mime_type="text/csv", content="v1\n")
    a2 = MissionArtifact(filename="d.csv", mime_type="text/csv", content="v2\n")
    s1 = self.storage.persist("m1", a1)
    s2 = self.storage.persist("m1", a2)
    self.assertEqual(s1, s2)
    self.assertEqual((self.tmp_path / s2).read_text(encoding="utf-8"), "v2\n")


if __name__ == "__main__":
  unittest.main()
