import unittest
from unittest.mock import patch
from app.services.lock_manager import LockManager

class TestLockManager(unittest.TestCase):
    def setUp(self):
        self.lm = LockManager()

    def test_lock_initialization(self):
        """Verify that the lock manager initializes with empty lock dictionary."""
        self.assertEqual(self.lm.locks, {})

    @patch("time.time")
    def test_acquire_lock_nominal(self, mock_time):
        """Test basic successful lock acquisition and denial of other players."""
        mock_time.return_value = 1000.0
        
        # Acquire lock on station_1 for player_1
        success = self.lm.acquire_lock("station_1", "player_1", ttl=30.0)
        self.assertTrue(success)
        
        status = self.lm.get_lock_status("station_1")
        self.assertIsNotNone(status)
        self.assertEqual(status["station_id"], "station_1")
        self.assertEqual(status["holder_id"], "player_1")
        self.assertEqual(status["remaining_ttl"], 30.0)

        # Player_2 attempts to acquire lock on station_1 while valid
        success_2 = self.lm.acquire_lock("station_1", "player_2", ttl=30.0)
        self.assertFalse(success_2)

    @patch("time.time")
    def test_acquire_lock_auto_renewal(self, mock_time):
        """Test that same player acquiring an active lock is treated as auto-renewal."""
        mock_time.return_value = 1000.0
        self.lm.acquire_lock("station_1", "player_1", ttl=30.0)
        
        # Move time forward by 10s
        mock_time.return_value = 1010.0
        success = self.lm.acquire_lock("station_1", "player_1", ttl=30.0)
        self.assertTrue(success)
        
        status = self.lm.get_lock_status("station_1")
        self.assertEqual(status["remaining_ttl"], 30.0) # Reset to 30.0 relative to 1010

    @patch("time.time")
    def test_renew_lock_nominal(self, mock_time):
        """Test active lock renewal works only for holder."""
        mock_time.return_value = 1000.0
        self.lm.acquire_lock("station_1", "player_1", ttl=30.0)

        mock_time.return_value = 1015.0
        # Player_2 cannot renew
        self.assertFalse(self.lm.renew_lock("station_1", "player_2", ttl=30.0))
        
        # Player_1 can renew
        self.assertTrue(self.lm.renew_lock("station_1", "player_1", ttl=30.0))
        status = self.lm.get_lock_status("station_1")
        self.assertEqual(status["remaining_ttl"], 30.0)

    @patch("time.time")
    def test_release_lock_nominal(self, mock_time):
        """Test release only succeeds if player holds the lock."""
        mock_time.return_value = 1000.0
        self.lm.acquire_lock("station_1", "player_1", ttl=30.0)

        # Player_2 try to release lock
        self.assertFalse(self.lm.release_lock("station_1", "player_2"))
        self.assertIsNotNone(self.lm.get_lock_status("station_1"))

        # Player_1 releases lock
        self.assertTrue(self.lm.release_lock("station_1", "player_1"))
        self.assertIsNone(self.lm.get_lock_status("station_1"))

    @patch("time.time")
    def test_force_release_all_by_player(self, mock_time):
        """Test force-releasing all locks held by a player on disconnect."""
        mock_time.return_value = 1000.0
        self.lm.acquire_lock("station_1", "player_1", ttl=30.0)
        self.lm.acquire_lock("station_2", "player_1", ttl=30.0)
        self.lm.acquire_lock("station_3", "player_2", ttl=30.0)

        released = self.lm.force_release_all_by_player("player_1")
        self.assertIn("station_1", released)
        self.assertIn("station_2", released)
        self.assertEqual(len(released), 2)

        # station_3 should still be locked by player_2
        self.assertIsNotNone(self.lm.get_lock_status("station_3"))
        self.assertIsNone(self.lm.get_lock_status("station_1"))
        self.assertIsNone(self.lm.get_lock_status("station_2"))

    @patch("time.time")
    def test_cleanup_expired_locks(self, mock_time):
        """Test cleanup of expired locks works as expected."""
        mock_time.return_value = 1000.0
        self.lm.acquire_lock("station_1", "player_1", ttl=10.0)
        self.lm.acquire_lock("station_2", "player_2", ttl=30.0)

        # Move time forward by 15s (station_1 expires, station_2 remains valid)
        mock_time.return_value = 1015.0
        
        expired = self.lm.cleanup_expired_locks()
        self.assertEqual(expired, ["station_1"])
        
        # Check active locks
        active = self.lm.get_all_active_locks()
        self.assertNotIn("station_1", active)
        self.assertIn("station_2", active)
        self.assertEqual(active["station_2"]["holder_id"], "player_2")
