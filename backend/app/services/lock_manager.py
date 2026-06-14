import time
import logging

logger = logging.getLogger(__name__)

class LockManager:
    """Manages lease-based lock states for multiplayer workstations and consoles."""

    def __init__(self):
        # Format: { station_id: { "holder_id": str, "expires_at": float } }
        self.locks: dict[str, dict] = {}

    def acquire_lock(self, station_id: str, player_id: str, ttl: float = 30.0) -> bool:
        """Attempts to acquire an exclusive lock lease on a terminal.
        
        Returns:
            True if lock was successfully acquired/granted, False otherwise.
        """
        now = time.time()
        current_lock = self.locks.get(station_id)

        # If lock doesn't exist or has expired, we can acquire it
        if not current_lock or now > current_lock["expires_at"]:
            self.locks[station_id] = {
                "holder_id": player_id,
                "expires_at": now + ttl
            }
            logger.info(f"Lock ACQUIRED on '{station_id}' by player '{player_id}' for {ttl}s.")
            return True

        # If current lock is held by the same player, treat as automatic renewal
        if current_lock["holder_id"] == player_id:
            current_lock["expires_at"] = now + ttl
            logger.debug(f"Lock RENEWED (auto-acquire) on '{station_id}' by player '{player_id}' for {ttl}s.")
            return True

        # Otherwise, lock is held by someone else and is still valid
        logger.info(f"Lock DENIED on '{station_id}' for player '{player_id}'. Held by '{current_lock['holder_id']}' for {current_lock['expires_at'] - now:.1f}s more.")
        return False

    def renew_lock(self, station_id: str, player_id: str, ttl: float = 30.0) -> bool:
        """Renews an existing lock lease if held by the same player."""
        now = time.time()
        current_lock = self.locks.get(station_id)

        if current_lock and current_lock["holder_id"] == player_id and now <= current_lock["expires_at"]:
            current_lock["expires_at"] = now + ttl
            logger.debug(f"Lock RENEWED on '{station_id}' by player '{player_id}' for {ttl}s.")
            return True

        return False

    def release_lock(self, station_id: str, player_id: str) -> bool:
        """Releases the lock on a terminal if held by the specifying player."""
        current_lock = self.locks.get(station_id)
        if current_lock and current_lock["holder_id"] == player_id:
            del self.locks[station_id]
            logger.info(f"Lock RELEASED on '{station_id}' by player '{player_id}'.")
            return True
        return False

    def force_release_all_by_player(self, player_id: str) -> list[str]:
        """Forcefully releases all locks held by a specific player (e.g. on disconnect).
        
        Returns:
            A list of station_ids that were released.
        """
        released_stations = []
        for station_id, lock_info in list(self.locks.items()):
            if lock_info["holder_id"] == player_id:
                del self.locks[station_id]
                released_stations.append(station_id)
                logger.info(f"Lock FORCE-RELEASED on '{station_id}' for player '{player_id}' due to disconnect.")
        return released_stations

    def get_lock_status(self, station_id: str) -> dict | None:
        """Returns lock lease details if active and unexpired."""
        now = time.time()
        current_lock = self.locks.get(station_id)
        if current_lock and now <= current_lock["expires_at"]:
            return {
                "station_id": station_id,
                "holder_id": current_lock["holder_id"],
                "remaining_ttl": max(0.0, current_lock["expires_at"] - now)
            }
        return None

    def get_all_active_locks(self) -> dict[str, dict]:
        """Returns all unexpired locks."""
        now = time.time()
        active = {}
        for station_id, lock_info in self.locks.items():
            if now <= lock_info["expires_at"]:
                active[station_id] = {
                    "holder_id": lock_info["holder_id"],
                    "remaining_ttl": max(0.0, lock_info["expires_at"] - now)
                }
        return active

    def cleanup_expired_locks(self) -> list[str]:
        """Removes expired locks.
        
        Returns:
            A list of expired station_ids.
        """
        now = time.time()
        expired_stations = []
        for station_id, lock_info in list(self.locks.items()):
            if now > lock_info["expires_at"]:
                del self.locks[station_id]
                expired_stations.append(station_id)
                logger.info(f"Lock EXPIRED on '{station_id}' (held by '{lock_info['holder_id']}').")
        return expired_stations
