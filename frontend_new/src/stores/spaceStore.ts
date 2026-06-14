'use client';

import { create } from 'zustand';
import { api, SpaceCoords, SpaceActiveMission, SpaceConflict, SpaceStateResponse, SpaceAnomaly, CoopReview, CoopActionResponse } from '@/services/apiClient';
import { audioManager } from '@/utils/audioManager';
import { getPlayerId } from '@/services/identity';
import { useUserStore } from '@/stores/userStore';

let lerpLoopStarted = false;
const startLerpLoop = (store: any) => {
  if (lerpLoopStarted) return;
  lerpLoopStarted = true;
  
  const tick = () => {
    const { remotePlayers, socket } = store.getState();
    if (!socket) {
      lerpLoopStarted = false;
      return;
    }
    
    let updated = false;
    const nextRemotes = { ...remotePlayers };
    
    for (const pid in nextRemotes) {
      const p = nextRemotes[pid] as any;
      if (p.targetX === undefined) p.targetX = p.x;
      if (p.targetY === undefined) p.targetY = p.y;
      
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      
      // Interpolate remote player coordinates smoothly
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        p.x += dx * 0.15;
        p.y += dy * 0.15;
        updated = true;
      } else {
        if (p.x !== p.targetX || p.y !== p.targetY) {
          p.x = p.targetX;
          p.y = p.targetY;
          updated = true;
        }
      }
    }
    
    if (updated) {
      store.setState({ remotePlayers: nextRemotes });
    }
    
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

export interface RemotePlayerState {
  id: string;
  x: number;
  y: number;
  facingDirection: 'down' | 'up' | 'left' | 'right';
  isWalking: boolean;
  isTyping: boolean;
  lastMessage?: string;
  lastMessageTime?: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  message: string;
  timestamp: number;
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

  // Anomaly state
  activeAnomaly: SpaceAnomaly | null;

  // Multiplayer fields
  remotePlayers: Record<string, RemotePlayerState>;
  socket: WebSocket | null;

  // Network Simulation & Lock state
  networkLatency: number;
  networkLoss: number;
  isPacketDroppedFlash: boolean;
  activeLocks: Record<string, { holder_id: string; remaining_ttl: number }>;
  partitionResolvedStations: string[];

  // Spatial Chat fields
  chatMessages: ChatMessage[];
  localLastMessage: string | null;
  localLastMessageTime: number | null;

  // Co-op Peer Code Review state
  pendingReviews: CoopReview[];
  isCoopWhiteboardOpen: boolean;

  // Actions
  syncFromBackend: () => Promise<void>;
  movePlayer: (dx: number, dy: number) => Promise<string | null>;
  setAmbientTheme: (theme: string) => void;
  triggerBookcaseSearch: (bookcaseId: string, query: string) => Promise<any>;
  triggerAnomaly: (anomalyId?: string) => Promise<void>;
  resolveAnomaly: (script: string, stationId?: string) => Promise<{ status: string; feedback: string; xp_gained: number }>;

  // Multiplayer actions
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  setLocalTyping: (isTyping: boolean) => void;
  sendChatMessage: (message: string) => void;
  sendWSMessage: (message: any) => void;

  // Network Simulation & Lock actions
  setNetworkLatency: (latency: number) => void;
  setNetworkLoss: (loss: number) => void;
  acquireStationLock: (stationId: string) => void;
  renewStationLock: (stationId: string) => void;
  releaseStationLock: (stationId: string) => void;

  // Co-op actions
  submitCodeForReview: (title: string, code: string, lang: string) => Promise<void>;
  fetchPendingReviews: () => Promise<void>;
  submitPeerReview: (reviewId: string, status: 'approved' | 'rejected', feedback: string) => Promise<CoopActionResponse>;
  setCoopWhiteboardOpen: (isOpen: boolean) => void;
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

  // 5. Dev Bay tables (y = 14, x = 2 to 8) and (y = 17, x = 2 to 8)
  for (let x = 2; x <= 8; x++) {
    matrix[14][x] = 1;
    matrix[17][x] = 1;
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

  // 9. Mainframe Server Rack / Skill Terminal at (18, 15) [y=15, x=18]
  matrix[15][18] = 1;

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
  activeAnomaly: null,
  remotePlayers: {},
  socket: null,
  networkLatency: 0,
  networkLoss: 0,
  isPacketDroppedFlash: false,
  activeLocks: {},
  partitionResolvedStations: [],
  chatMessages: [],
  localLastMessage: null,
  localLastMessageTime: null,
  pendingReviews: [],
  isCoopWhiteboardOpen: false,

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
        activeAnomaly: state.active_anomaly || null,
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
    get().sendWSMessage({
      type: 'MOVE',
      x: nextX,
      y: nextY,
      direction: facing,
      isWalking: true
    });

    // Reset walking state after the tile-movement transition completes (100ms duration)
    setTimeout(() => {
      set({ isWalking: false });
      get().sendWSMessage({
        type: 'MOVE',
        x: nextX,
        y: nextY,
        direction: facing,
        isWalking: false
      });
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

  triggerAnomaly: async (anomalyId?: string) => {
    try {
      const anomaly = await api.triggerSpaceAnomaly(anomalyId);
      const isBreaker = anomaly.anomaly_id === 'service_breaker_trip';
      set({
        activeAnomaly: anomaly,
        ambientTheme: isBreaker ? 'alert-orange' : 'alert-red',
      });
      if (isBreaker) {
        audioManager.playBreakerTrip();
      } else {
        audioManager.playAlarmSiren();
      }
    } catch (error) {
      console.error('Failed to trigger space anomaly:', error);
      throw error;
    }
  },

  resolveAnomaly: async (script: string, stationId?: string) => {
    try {
      const isBreaker = get().activeAnomaly?.anomaly_id === 'service_breaker_trip';
      const isPartition = get().activeAnomaly?.anomaly_id === 'network_partition';
      const response = await api.resolveSpaceAnomaly(script, stationId);
      if (response.status === 'success') {
        if (!isPartition || (response.feedback && response.feedback.includes("协作大功告成"))) {
          set({
            activeAnomaly: null,
            ambientTheme: 'default',
            partitionResolvedStations: [],
          });
          if (isBreaker) {
            audioManager.playBreakerRestore();
          } else if (isPartition) {
            audioManager.playPartitionSuccess();
          } else {
            audioManager.playCelebrateGold();
          }
        }
        // Sync user state to update XP
        await useUserStore.getState().syncFromBackend();
      }
      return response;
    } catch (error) {
      console.error('Failed to resolve space anomaly:', error);
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
      // Incoming network quality simulation
      const loss = get().networkLoss;
      const latency = get().networkLatency;

      if (loss > 0 && Math.random() < loss) {
        audioManager.playStaticStaticBurst();
        set({ isPacketDroppedFlash: true });
        setTimeout(() => set({ isPacketDroppedFlash: false }), 200);
        console.warn('Incoming WebSocket packet dropped due to simulated packet loss!');
        return;
      }

      const processMessage = () => {
        try {
          const data = JSON.parse(event.data);
          const { type } = data;

          if (type === 'SYNC') {
            // Setup target coordinates for LERP positioning
            const syncedPlayers = { ...data.players };
            for (const pid in syncedPlayers) {
              syncedPlayers[pid].targetX = syncedPlayers[pid].x;
              syncedPlayers[pid].targetY = syncedPlayers[pid].y;
            }
            set({ remotePlayers: syncedPlayers });
          } else if (type === 'PLAYER_JOIN') {
            const { player_id, state } = data;
            set((prev) => ({
              remotePlayers: {
                ...prev.remotePlayers,
                [player_id]: {
                  id: player_id,
                  x: state.x,
                  y: state.y,
                  targetX: state.x,
                  targetY: state.y,
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
                  targetX: x,
                  targetY: y,
                  x: prev.remotePlayers[player_id]?.x !== undefined ? prev.remotePlayers[player_id].x : x,
                  y: prev.remotePlayers[player_id]?.y !== undefined ? prev.remotePlayers[player_id].y : y,
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
          } else if (type === 'PLAYER_CHAT') {
            const { player_id, message } = data;
            const timestamp = Date.now();
            const newMsg: ChatMessage = {
              id: `${player_id}-${timestamp}`,
              playerId: player_id,
              message,
              timestamp,
            };
            audioManager.playChatChirp();
            set((prev) => ({
              chatMessages: [...prev.chatMessages, newMsg],
              remotePlayers: {
                ...prev.remotePlayers,
                [player_id]: {
                  ...(prev.remotePlayers[player_id] || {}),
                  id: player_id,
                  lastMessage: message,
                  lastMessageTime: timestamp,
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
          } else if (type === 'ANOMALY_TRIGGER') {
            const { anomaly } = data;
            const isBreaker = anomaly.anomaly_id === 'service_breaker_trip';
            const isPartition = anomaly.anomaly_id === 'network_partition';
            if (isBreaker) {
              audioManager.playBreakerTrip();
            } else if (isPartition) {
              audioManager.playAlarmSiren(); // Play cyber pulse siren
            } else {
              audioManager.playAlarmSiren();
            }
            set({
              activeAnomaly: anomaly,
              ambientTheme: isBreaker ? 'alert-orange' : (isPartition ? 'alert-cyan' : 'alert-red'),
              partitionResolvedStations: [],
            });
          } else if (type === 'ANOMALY_RESOLVED') {
            const isBreaker = get().activeAnomaly?.anomaly_id === 'service_breaker_trip';
            const isPartition = get().activeAnomaly?.anomaly_id === 'network_partition';
            if (isBreaker) {
              audioManager.playBreakerRestore();
            } else if (isPartition) {
              audioManager.playPartitionSuccess();
            } else {
              audioManager.playCelebrateGold();
            }
            set({
              activeAnomaly: null,
              ambientTheme: 'default',
              partitionResolvedStations: [],
            });
            useUserStore.getState().syncFromBackend().catch(console.warn);
          } else if (type === 'COOP_REVIEW_CREATED') {
            const { review } = data;
            audioManager.playPeerReviewAlert();
            set((prev) => ({
              pendingReviews: [review, ...prev.pendingReviews],
            }));
          } else if (type === 'COOP_REVIEW_RESOLVED') {
            const { review_id, status, feedback, xp_gained, author_id, reviewer_id } = data;
            const currentPlayerId = getPlayerId() || '';

            if (status === 'approved') {
              audioManager.playPeerReviewApproved();
            } else {
              audioManager.playStep();
            }

            set((prev) => ({
              pendingReviews: prev.pendingReviews.filter((r) => r.id !== review_id),
            }));

            if (currentPlayerId === author_id || currentPlayerId === reviewer_id) {
              useUserStore.getState().syncFromBackend().catch(console.warn);
            }
          } else if (type === 'LOCK_STATE') {
            set({ activeLocks: data.active_locks });
          } else if (type === 'PARTITION_PARTIAL_RESOLVED') {
            set({ partitionResolvedStations: data.resolved_stations });
            audioManager.playChatChirp();
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket message:', err);
        }
      };

      if (latency > 0) {
        setTimeout(processMessage, latency);
      } else {
        processMessage();
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

    // Start remote players smoothing LERP loop
    startLerpLoop(useSpaceStore);
  },

  disconnectWebSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.onclose = null;
      socket.close();
      set({ socket: null, remotePlayers: {}, activeLocks: {} });
      console.log('Space WebSocket closed manually.');
    }
  },

  setLocalTyping: (isTyping: boolean) => {
    get().sendWSMessage({ type: 'TYPING', isTyping });
  },

  sendChatMessage: (message: string) => {
    const playerId = getPlayerId() || 'local';
    const timestamp = Date.now();
    const newMsg: ChatMessage = {
      id: `local-${timestamp}`,
      playerId,
      message,
      timestamp,
    };

    audioManager.playTypewriter();

    set((prev) => ({
      chatMessages: [...prev.chatMessages, newMsg],
      localLastMessage: message,
      localLastMessageTime: timestamp,
    }));

    get().sendWSMessage({
      type: 'CHAT',
      message
    });
  },

  sendWSMessage: (message: any) => {
    const { socket, networkLatency, networkLoss } = get();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    if (networkLoss > 0 && Math.random() < networkLoss) {
      audioManager.playStaticStaticBurst();
      set({ isPacketDroppedFlash: true });
      setTimeout(() => set({ isPacketDroppedFlash: false }), 200);
      console.warn('Outgoing WebSocket packet dropped due to simulated packet loss!');
      return;
    }

    const payload = JSON.stringify(message);
    if (networkLatency > 0) {
      setTimeout(() => {
        const s = get().socket;
        if (s && s.readyState === WebSocket.OPEN) {
          s.send(payload);
        }
      }, networkLatency);
    } else {
      socket.send(payload);
    }
  },

  setNetworkLatency: (latency: number) => {
    set({ networkLatency: latency });
  },

  setNetworkLoss: (loss: number) => {
    set({ networkLoss: loss });
  },

  acquireStationLock: (stationId: string) => {
    get().sendWSMessage({ type: 'LOCK_ACQUIRE', station_id: stationId });
  },

  renewStationLock: (stationId: string) => {
    get().sendWSMessage({ type: 'LOCK_RENEW', station_id: stationId });
  },

  releaseStationLock: (stationId: string) => {
    get().sendWSMessage({ type: 'LOCK_RELEASE', station_id: stationId });
  },

  submitCodeForReview: async (title: string, code: string, lang: string) => {
    try {
      await api.submitCoopCode(title, code, lang);
      await get().fetchPendingReviews();
    } catch (error) {
      console.error('Failed to submit code for peer review:', error);
      throw error;
    }
  },

  fetchPendingReviews: async () => {
    try {
      const pending = await api.fetchPendingCoopReviews();
      set({ pendingReviews: pending });
    } catch (error) {
      console.error('Failed to fetch pending reviews:', error);
    }
  },

  submitPeerReview: async (reviewId: string, status: 'approved' | 'rejected', feedback: string) => {
    try {
      const response = await api.submitPeerReview(reviewId, status, feedback);
      set((prev) => ({
        pendingReviews: prev.pendingReviews.filter((r) => r.id !== reviewId),
      }));
      // Sync user state to update XP
      await useUserStore.getState().syncFromBackend();
      return response;
    } catch (error) {
      console.error('Failed to submit peer review:', error);
      throw error;
    }
  },

  setCoopWhiteboardOpen: (isOpen: boolean) => {
    set({ isCoopWhiteboardOpen: isOpen });
  },
}));
