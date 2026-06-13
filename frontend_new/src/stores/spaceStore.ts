'use client';

import { create } from 'zustand';
import { api, SpaceCoords, SpaceActiveMission, SpaceConflict, SpaceStateResponse } from '@/services/apiClient';
import { audioManager } from '@/utils/audioManager';
import { getPlayerId } from '@/services/identity';

export interface RemotePlayerState {
  id: string;
  x: number;
  y: number;
  facingDirection: 'down' | 'up' | 'left' | 'right';
  isWalking: boolean;
  isTyping: boolean;
}

const getWebSocketUrl = () => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  const wsProto = apiBaseUrl.startsWith('https') ? 'wss' : 'ws';
  const host = apiBaseUrl.replace(/^https?:\/\//, '');
  const playerId = getPlayerId() || '';
  return `${wsProto}://${host}/api/v1/space/ws?player_id=${playerId}`;
};

interface SpaceStore {
  playerCoords: SpaceCoords;
  ambientTheme: string;
  mapAssetsUrl: string;
  activeMission: SpaceActiveMission | null;
  unresolvedConflict: SpaceConflict | null;
  interactiveNpcId: string | null;
  collisionMatrix: number[][];
  isLoading: boolean;
  facingDirection: 'down' | 'up' | 'left' | 'right';
  isWalking: boolean;

  // Multiplayer fields
  remotePlayers: Record<string, RemotePlayerState>;
  socket: WebSocket | null;

  // Actions
  syncFromBackend: () => Promise<void>;
  movePlayer: (dx: number, dy: number) => Promise<string | null>;
  setAmbientTheme: (theme: string) => void;
  triggerBookcaseSearch: (bookcaseId: string, query: string) => Promise<any>;

  // Multiplayer actions
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  setLocalTyping: (isTyping: boolean) => void;
}

function createCollisionMatrix(): number[][] {
  const matrix = Array.from({ length: 25 }, () => Array(25).fill(0));
  
  // 1. Division wall between left side (Lobby, Dev Bay) and right side (Meeting, Archive)
  // x = 12 is the divider wall. Standard openings at y = 5 and y = 16.
  for (let y = 0; y < 25; y++) {
    if (y !== 5 && y !== 16) {
      matrix[y][12] = 1;
    }
  }

  // 2. Division wall between Lobby (y <= 10) and Dev Bay (y >= 11) on the left side (x <= 11)
  // y = 10 is the divider. Standard opening at x = 4.
  for (let x = 0; x < 12; x++) {
    if (x !== 4) {
      matrix[10][x] = 1;
    }
  }

  // 3. Division wall between Meeting Room (y <= 12) and Archive Room (y >= 13) on the right side (x >= 13)
  // y = 12 is the divider. Standard opening at x = 18.
  for (let x = 13; x < 25; x++) {
    if (x !== 18) {
      matrix[12][x] = 1;
    }
  }

  // 4. Lobby furniture/reception desk (y = 3, x = 3 to 7)
  for (let x = 3; x <= 7; x++) {
    matrix[3][x] = 1;
  }

  // 5. Dev Bay tables (y = 14, x = 2 to 8) and (y = 18, x = 2 to 8)
  for (let x = 2; x <= 8; x++) {
    matrix[14][x] = 1;
    matrix[18][x] = 1;
  }

  // 6. Bookcase collision nodes (cannot walk on them, must stand adjacent)
  matrix[5][4] = 1; // pandas_library at (4, 5) [y=5, x=4]
  matrix[15][10] = 1; // software_design_rules at (10, 15) [y=15, x=10]

  // 7. NPCs collision nodes
  matrix[6][15] = 1; // Gao Ling mentor_ling (15, 6)
  matrix[5][18] = 1; // Amy pm_amy (18, 5)
  matrix[20][20] = 1; // Zheng Ying mentor_ying (20, 20)

  // 8. Conference Table collision nodes (y = 6 to 7, x = 17 to 18)
  for (let y = 6; y <= 7; y++) {
    for (let x = 17; x <= 18; x++) {
      matrix[y][x] = 1;
    }
  }

  return matrix;
}

export const useSpaceStore = create<SpaceStore>((set, get) => ({
  playerCoords: { x: 0, y: 0 },
  ambientTheme: 'default',
  mapAssetsUrl: '',
  activeMission: null,
  unresolvedConflict: null,
  interactiveNpcId: null,
  collisionMatrix: createCollisionMatrix(),
  isLoading: false,
  facingDirection: 'down',
  isWalking: false,
  remotePlayers: {},
  socket: null,

  syncFromBackend: async () => {
    set({ isLoading: true });
    try {
      const state: SpaceStateResponse = await api.fetchSpaceState();
      
      // Update interactive NPC state based on new sync coordinates
      let initialNpcId: string | null = null;
      const npcCoords = {
        mentor_ling: { x: 15, y: 6 },
        pm_amy: { x: 18, y: 5 },
        mentor_ying: { x: 20, y: 20 },
      };

      for (const [npcId, coords] of Object.entries(npcCoords)) {
        const dx = Math.abs(state.player_coords.x - coords.x);
        const dy = Math.abs(state.player_coords.y - coords.y);
        if (dx <= 1 && dy <= 1) {
          initialNpcId = npcId;
          break;
        }
      }

      set({
        playerCoords: state.player_coords,
        ambientTheme: state.ambient_theme || 'default',
        mapAssetsUrl: state.map_assets_url || '',
        activeMission: state.active_mission || null,
        unresolvedConflict: state.unresolved_conflict || null,
        interactiveNpcId: initialNpcId,
      });
    } catch (error) {
      console.warn('Failed to sync spatial state from backend:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  movePlayer: async (dx: number, dy: number) => {
    const { playerCoords, collisionMatrix } = get();
    const nextX = playerCoords.x + dx;
    const nextY = playerCoords.y + dy;

    // Boundary check
    if (nextX < 0 || nextX > 24 || nextY < 0 || nextY > 24) {
      return null;
    }

    // Collision check
    if (collisionMatrix[nextY][nextX] === 1) {
      return null;
    }

    // Determine facing direction based on displacement
    let facing: 'down' | 'up' | 'left' | 'right' = 'down';
    if (dx > 0) facing = 'right';
    else if (dx < 0) facing = 'left';
    else if (dy > 0) facing = 'down';
    else if (dy < 0) facing = 'up';

    // Optimistically update player coordinates locally for ultra-snappy feedback
    set({ 
      playerCoords: { x: nextX, y: nextY },
      facingDirection: facing,
      isWalking: true
    });
    audioManager.playStep();

    // Send MOVE update to WebSocket immediately
    const socket = get().socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'MOVE',
        x: nextX,
        y: nextY,
        direction: facing,
        isWalking: true
      }));
    }

    // Reset walking state after the tile-movement transition completes (100ms duration)
    setTimeout(() => {
      set({ isWalking: false });
      const currentSocket = get().socket;
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({
          type: 'MOVE',
          x: nextX,
          y: nextY,
          direction: facing,
          isWalking: false
        }));
      }
    }, 120);

    try {
      const response = await api.moveSpacePlayer(nextX, nextY);
      set({
        playerCoords: response.coords,
        interactiveNpcId: response.triggered_npc_id,
      });
      return response.triggered_npc_id;
    } catch (error) {
      console.warn('Failed to sync movement with backend:', error);
      return null;
    }
  },

  setAmbientTheme: (theme: string) => {
    set({ ambientTheme: theme });
  },

  triggerBookcaseSearch: async (bookcaseId: string, query: string) => {
    try {
      const response = await api.searchSpaceRag(bookcaseId, query);
      return response;
    } catch (error) {
      console.error(`Failed bookcase RAG search for ${bookcaseId}:`, error);
      throw error;
    }
  },

  connectWebSocket: () => {
    if (get().socket) return;
    if (typeof window === 'undefined') return;

    const wsUrl = getWebSocketUrl();
    console.log('Connecting to Space WebSocket:', wsUrl);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      return;
    }

    set({ socket: ws });

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type } = data;

        if (type === 'SYNC') {
          set({ remotePlayers: data.players });
        } else if (type === 'PLAYER_JOIN') {
          const { player_id, state } = data;
          set((prev) => ({
            remotePlayers: {
              ...prev.remotePlayers,
              [player_id]: {
                id: player_id,
                x: state.x,
                y: state.y,
                facingDirection: state.direction,
                isWalking: state.isWalking,
                isTyping: state.isTyping,
              },
            },
          }));
        } else if (type === 'PLAYER_MOVE') {
          const { player_id, x, y, direction, isWalking } = data;
          set((prev) => ({
            remotePlayers: {
              ...prev.remotePlayers,
              [player_id]: {
                ...(prev.remotePlayers[player_id] || {}),
                id: player_id,
                x,
                y,
                facingDirection: direction,
                isWalking,
              },
            },
          }));
        } else if (type === 'PLAYER_TYPING') {
          const { player_id, isTyping } = data;
          set((prev) => ({
            remotePlayers: {
              ...prev.remotePlayers,
              [player_id]: {
                ...(prev.remotePlayers[player_id] || {}),
                id: player_id,
                isTyping,
              },
            },
          }));
        } else if (type === 'PLAYER_LEAVE') {
          const { player_id } = data;
          set((prev) => {
            const nextRemotes = { ...prev.remotePlayers };
            delete nextRemotes[player_id];
            return { remotePlayers: nextRemotes };
          });
        }
      } catch (err) {
        console.warn('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.log('Space WebSocket disconnected.');
      set({ socket: null });
      setTimeout(() => {
        if (!get().socket) {
          get().connectWebSocket();
        }
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('Space WebSocket error:', err);
    };
  },

  disconnectWebSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.onclose = null;
      socket.close();
      set({ socket: null, remotePlayers: {} });
      console.log('Space WebSocket closed manually.');
    }
  },

  setLocalTyping: (isTyping: boolean) => {
    const { socket } = get();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'TYPING', isTyping }));
    }
  },
}));
