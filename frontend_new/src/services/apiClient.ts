import { getAuthHeaders, resetPlayerId } from './identity';
import { toBackendCareerId, toFrontendCareerId } from './apiAdapters';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
  'http://localhost:8000';

const DEFAULT_TIMEOUT_MS = 3*60000;
const MISSION_GENERATION_TIMEOUT_MS = 10 * 60000;
const AI_REVIEW_TIMEOUT_MS = 5 * 60000;

export class AbortError extends Error {
  constructor(message: string = 'Request was cancelled') {
    super(message);
    this.name = 'AbortError';
  }
}

export class ApiError extends Error {
  status?: number;
  path: string;
  fallbackAllowed: boolean;

  constructor(
    message: string,
    options: {
      path: string;
      status?: number;
      fallbackAllowed?: boolean;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.path = options.path;
    this.status = options.status;
    this.fallbackAllowed = options.fallbackAllowed ?? true;
  }
}

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  fallbackAllowed?: boolean;
  skipAuthRetry?: boolean;
};

const pendingRequests = new Map<string, AbortController>();

function getRequestKey(path: string, options: RequestInit = {}): string {
  const method = options.method || 'GET';
  const body = typeof options.body === 'string' ? options.body : '';
  return `${method}:${path}:${body}`;
}

function linkAbortSignals(
  controller: AbortController,
  signal?: AbortSignal
): () => void {
  // 只在客户端环境中使用
  if (typeof window === 'undefined') return () => {};
  if (!signal) return () => {};

  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }

  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function withAuthHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  Object.entries(getAuthHeaders()).forEach(([key, value]) => {
    merged.set(key, value);
  });
  return merged;
}

async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = await res.clone().json();
    const detail = body?.detail;
    return typeof detail === 'object' && detail !== null && typeof detail.code === 'string'
      ? detail.code
      : null;
  } catch {
    return null;
  }
}

async function fetchWithAuthRetry(
  url: string,
  init: RequestInit,
  skipAuthRetry = false,
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: withAuthHeaders(init.headers),
  });

  if (res.status !== 401 || skipAuthRetry) {
    return res;
  }

  const code = await readErrorCode(res);
  if (code === 'identity.invalid_player_id') {
    resetPlayerId();
  } else if (code !== 'identity.missing_player_id') {
    return res;
  }

  return fetch(url, {
    ...init,
    headers: withAuthHeaders(init.headers),
  });
}

export function abortPendingRequest(
  path: string,
  options: RequestInit = {}
): void {
  // 只在客户端环境中运行
  if (typeof window === 'undefined') return;
  
  const key = getRequestKey(path, options);
  const controller = pendingRequests.get(key);
  if (controller) {
    controller.abort();
    pendingRequests.delete(key);
  }
}

export function abortAllRequests(): void {
  // 只在客户端环境中运行
  if (typeof window === 'undefined') return;
  
  pendingRequests.forEach((controller) => controller.abort());
  pendingRequests.clear();
}

async function request<T>(
  path: string,
  options: ApiRequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  console.log('apiClient: request to:', url);
  const controller = new AbortController();
  const key = getRequestKey(path, options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fallbackAllowed = options.fallbackAllowed ?? true;
  const skipAuthRetry = options.skipAuthRetry ?? false;
  
  // 只在客户端环境中使用 AbortController 和 timeout
  let unlinkExternalAbort: () => void = () => {};
  let timeoutId: any = null;
  
  if (typeof window !== 'undefined') {
    unlinkExternalAbort = linkAbortSignals(
      controller,
      options.signal ?? undefined
    );

    timeoutId = window.setTimeout(() => {
      controller.abort(`timeout:${timeoutMs}`);
    }, timeoutMs);

    pendingRequests.set(key, controller);
  }

  try {
    console.log('apiClient: Starting fetch to:', url);
    const {
      timeoutMs: _timeoutMs,
      fallbackAllowed: _fallbackAllowed,
      skipAuthRetry: _skipAuthRetry,
      ...fetchOptions
    } = options;
    const headers = new Headers(fetchOptions.headers);
    headers.set('Accept', 'application/json');
    if (typeof fetchOptions.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetchWithAuthRetry(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers,
    }, skipAuthRetry);

    console.log('apiClient: Got response status:', res.status);
    if (!res.ok) {
      throw new ApiError(`API ${path} returned ${res.status}`, {
        path,
        status: res.status,
        fallbackAllowed,
      });
    }

    const json = await res.json();
    console.log('apiClient: Response JSON:', json);
    return json;
  } catch (err) {
    console.log('apiClient: Error:', err);
    // 服务端渲染时不抛出 AbortError，直接返回错误
    if (typeof window !== 'undefined' && err instanceof Error && err.name === 'AbortError') {
      throw new AbortError(`Request cancelled: ${path}`);
    }

    if (err instanceof ApiError) {
      throw err;
    }

    throw new ApiError(`API ${path} failed`, {
      path,
      fallbackAllowed,
    });
  } finally {
    if (typeof window !== 'undefined') {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      unlinkExternalAbort();
      pendingRequests.delete(key);
    }
  }
}

export async function streamChat(
  roleName: string,
  message: string,
  onChunk: (char: string) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  let unlinkExternalAbort: () => void = () => {};
  let timeoutId: any = null;
  
  // 只在客户端环境中使用 AbortController 和 timeout
  if (typeof window !== 'undefined') {
    unlinkExternalAbort = linkAbortSignals(controller, abortSignal);
    timeoutId = window.setTimeout(() => {
      controller.abort(`timeout:${DEFAULT_TIMEOUT_MS}`);
    }, DEFAULT_TIMEOUT_MS);
  }

  try {
    const url = `${BASE_URL}/api/v1/agent/chat?role_name=${encodeURIComponent(
      roleName
    )}&message=${encodeURIComponent(message)}`;
    const response = await fetchWithAuthRetry(url, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    }, true);

    if (!response.ok) throw new ApiError('Agent chat connection failed', { path: '/api/v1/agent/chat' });
    if (!response.body) throw new ApiError('Stream not supported', { path: '/api/v1/agent/chat' });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.substring(0, boundary);
        buffer = buffer.substring(boundary + 2);
        const lines = frame.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            let payload = line.substring(5);
            if (payload.startsWith(' ')) payload = payload.substring(1);
            if (payload) {
              fullText += payload;
              onChunk(payload);
            }
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
    return fullText;
  } catch (err) {
    if (typeof window !== 'undefined' && err instanceof Error && err.name === 'AbortError') {
      throw new AbortError('Agent chat stream was cancelled');
    }
    throw err;
  } finally {
    if (typeof window !== 'undefined') {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      unlinkExternalAbort();
    }
  }
}

export const api = {
  async checkHealth(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await request<{ status: string }>('/', { signal, timeoutMs: 5000 });
      return res.status === 'healthy';
    } catch {
      return false;
    }
  },

  async fetchCareers(signal?: AbortSignal): Promise<BackendCareer[]> {
    return request<BackendCareer[]>('/api/v1/careers', { signal });
  },

  async searchKnowledgeBase(
    query: string,
    domain: string,
    signal?: AbortSignal
  ): Promise<Resource[]> {
    const url = `/api/v1/careers/resources?query=${encodeURIComponent(query)}&domain=${encodeURIComponent(domain)}`;
    return request<Resource[]>(url, { signal });
  },

  async generateMission(
    roleId: string,
    difficulty: string = 'easy',
    taskDirection?: string | null,
    missionStyle?: string | null,
    signal?: AbortSignal
  ): Promise<GeneratedMission> {
    return request<GeneratedMission>('/api/v1/missions/generate', {
      method: 'POST',
      body: JSON.stringify({
        role_id: roleId,
        difficulty,
        task_direction: taskDirection ?? null,
        mission_style: missionStyle ?? null,
      }),
      signal,
      timeoutMs: MISSION_GENERATION_TIMEOUT_MS,
      fallbackAllowed: false,
    });
  },

  async evaluateSubmission(
    missionId: string,
    submissionText: string,
    signal?: AbortSignal
  ): Promise<EvaluationResult> {
    return request<EvaluationResult>('/api/v1/missions/evaluate', {
      method: 'POST',
      body: JSON.stringify({ mission_id: missionId, submission_text: submissionText }),
      signal,
      timeoutMs: AI_REVIEW_TIMEOUT_MS,
      fallbackAllowed: false,
    });
  },

  async fetchUserProfile(signal?: AbortSignal): Promise<UserSyncData> {
    const data = await request<UserSyncData>('/api/v1/user/sync', { signal });
    return {
      ...data,
      user: {
        ...data.user,
        current_career_id: toFrontendCareerId(data.user.current_career_id),
      },
    };
  },

  async updateCareer(
    careerId: string,
    signal?: AbortSignal
  ): Promise<{ status: string; current_career_id: string }> {
    const data = await request<{ status: string; current_career_id: string }>('/api/v1/user/career', {
      method: 'POST',
      body: JSON.stringify({ career_id: toBackendCareerId(careerId) }),
      signal,
    });
    return {
      ...data,
      current_career_id: toFrontendCareerId(data.current_career_id) ?? '',
    };
  },

  async upgradeSkill(
    skillId: string,
    level: number,
    experience: number,
    signal?: AbortSignal
  ): Promise<{ status: string }> {
    return request('/api/v1/user/skills/upgrade', {
      method: 'POST',
      body: JSON.stringify({ skill_id: skillId, level, experience }),
      signal,
      fallbackAllowed: false,
    });
  },

  async submitFeynman(
    missionId: string,
    answer: string,
    signal?: AbortSignal
  ): Promise<{ status: string; feedback: string; mission_status?: string }> {
    return request('/api/v1/user/feynman/submit', {
      method: 'POST',
      body: JSON.stringify({ mission_id: missionId, answer }),
      signal,
      timeoutMs: AI_REVIEW_TIMEOUT_MS,
      fallbackAllowed: false,
    });
  },

  async fetchSpaceState(signal?: AbortSignal): Promise<SpaceStateResponse> {
    return request<SpaceStateResponse>('/api/v1/space/state', { signal });
  },

  async moveSpacePlayer(x: number, y: number, signal?: AbortSignal): Promise<SpaceMoveResponse> {
    return request<SpaceMoveResponse>('/api/v1/space/move', {
      method: 'POST',
      body: JSON.stringify({ x, y }),
      signal,
    });
  },

  async searchSpaceRag(bookcaseId: string, query: string, signal?: AbortSignal): Promise<SpatialRagSearchResponse> {
    return request<SpatialRagSearchResponse>('/api/v1/space/rag/search', {
      method: 'POST',
      body: JSON.stringify({ bookcase_id: bookcaseId, query }),
      signal,
    });
  },

  async arbitrateConflict(
    conflictId: string,
    choice: 'speed' | 'quality' | 'balance',
    signal?: AbortSignal
  ): Promise<ArbitrationResponse> {
    return request<ArbitrationResponse>('/api/v1/space/meeting/arbitrate', {
      method: 'POST',
      body: JSON.stringify({ conflict_id: conflictId, choice }),
      signal,
      fallbackAllowed: false,
    });
  },

  async triggerSpaceAnomaly(anomalyId?: string, signal?: AbortSignal): Promise<SpaceAnomaly> {
    return request<SpaceAnomaly>('/api/v1/space/anomaly/trigger', {
      method: 'POST',
      body: anomalyId ? JSON.stringify({ anomaly_id: anomalyId }) : undefined,
      signal,
    });
  },

  async resolveSpaceAnomaly(script: string, signal?: AbortSignal): Promise<SpaceAnomalyResolveResponse> {
    return request<SpaceAnomalyResolveResponse>('/api/v1/space/anomaly/resolve', {
      method: 'POST',
      body: JSON.stringify({ script }),
      signal,
    });
  },

  async compileSandboxCode(code: string, language: string, missionId?: string, signal?: AbortSignal): Promise<SandboxCompileResponse> {
    return request<SandboxCompileResponse>('/api/v1/sandbox/compile', {
      method: 'POST',
      body: JSON.stringify({ code, language, mission_id: missionId }),
      signal,
    });
  },

  async submitCoopCode(title: string, codeContent: string, language: string, signal?: AbortSignal): Promise<CoopReview> {
    return request<CoopReview>('/api/v1/space/coop/submit', {
      method: 'POST',
      body: JSON.stringify({ title, code_content: codeContent, language }),
      signal,
    });
  },

  async fetchPendingCoopReviews(signal?: AbortSignal): Promise<CoopReview[]> {
    return request<CoopReview[]>('/api/v1/space/coop/pending', { signal });
  },

  async submitPeerReview(reviewId: string, status: 'approved' | 'rejected', feedback: string, signal?: AbortSignal): Promise<CoopActionResponse> {
    return request<CoopActionResponse>('/api/v1/space/coop/review', {
      method: 'POST',
      body: JSON.stringify({ review_id: reviewId, status, feedback }),
      signal,
    });
  },
};

export async function streamTeamMeeting(
  onChunk: (chunk: MeetingChunk) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const controller = new AbortController();
  let unlinkExternalAbort: () => void = () => {};
  let timeoutId: any = null;
  
  if (typeof window !== 'undefined') {
    unlinkExternalAbort = linkAbortSignals(controller, abortSignal);
    timeoutId = window.setTimeout(() => {
      controller.abort(`timeout:${DEFAULT_TIMEOUT_MS}`);
    }, DEFAULT_TIMEOUT_MS);
  }

  try {
    const url = `${BASE_URL}/api/v1/space/meeting/stream`;
    const response = await fetchWithAuthRetry(url, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    }, true);

    if (!response.ok) throw new ApiError('Team standup stream failed', { path: '/api/v1/space/meeting/stream' });
    if (!response.body) throw new ApiError('Stream not supported', { path: '/api/v1/space/meeting/stream' });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.substring(0, boundary);
        buffer = buffer.substring(boundary + 2);
        const lines = frame.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            let payloadStr = line.substring(5);
            if (payloadStr.startsWith(' ')) payloadStr = payloadStr.substring(1);
            if (payloadStr) {
              try {
                const chunk: MeetingChunk = JSON.parse(payloadStr);
                onChunk(chunk);
              } catch (e) {
                console.warn('Failed to parse SSE payload:', payloadStr, e);
              }
            }
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } catch (err) {
    if (typeof window !== 'undefined' && err instanceof Error && err.name === 'AbortError') {
      throw new AbortError('Team meeting stream was cancelled');
    }
    throw err;
  } finally {
    if (typeof window !== 'undefined') {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      unlinkExternalAbort();
    }
  }
}

export interface BackendCareer {
  career_id: string;
  name: string;
  description: string;
  unlocked: boolean;
  role_id?: string | null;
  resource_domain?: string | null;
  api_supported?: boolean;
}

export interface Resource {
  doc_id: string;
  title: string;
  snippet: string;
  relevance_score: number;
  source?: string | null;
  tags?: string[];
}

export interface GeneratedMission {
  mission_id: string;
  career_id?: string | null;
  role_id?: string | null;
  title: string;
  description: string;
  mock_data_url: string;
  delivery_requirements: string[];
  difficulty?: string;
  task_direction?: string | null;
  mission_style?: string | null;
  status?: string;
  reward_xp?: number;
  reward_skills?: string[];
  evaluation_criteria?: string[];
  display_metadata?: MissionDisplayMetadata | null;
}

export interface MissionDisplayMetadata {
  ai_lead?: string | null;
  business_background?: string | null;
  objectives?: string[] | null;
  recommended_skills?: string[] | null;
  recommended_resources?: string[] | null;
  estimated_time?: string | null;
}

export interface EvaluationResult {
  status: string;
  feedback: string;
  experience_gains: Record<string, number>;
  trigger_feynman_challenge: boolean;
  feynman_question: string | null;
  mission_status?: string | null;
  feynman_active?: boolean | null;
}

export interface UserSyncData {
  user: {
    id: string;
    current_career_id: string | null;
    total_xp: number;
  };
  skills: {
    skill_id: string;
    level: number;
    experience: number;
  }[];
  missions: {
    mission_id: string;
    title: string;
    description: string;
    mock_data_url: string;
    delivery_requirements: string[];
    career_id?: string | null;
    role_id?: string | null;
    difficulty?: string | null;
    task_direction?: string | null;
    mission_style?: string | null;
    reward_xp?: number | null;
    reward_skills?: string[] | null;
    evaluation_criteria?: string[] | null;
    display_metadata?: MissionDisplayMetadata | null;
    status: string;
    submission_text: string | null;
    feedback: string | null;
    experience_gains: Record<string, number>;
    feynman_active: boolean;
    feynman_question: string | null;
    feynman_answer: string | null;
    feynman_feedback: string | null;
  }[];
}

export interface SpaceCoords {
  x: number;
  y: number;
}

export interface SpaceActiveMission {
  mission_id: string;
  title: string;
  status: string;
}

export interface SpaceConflict {
  conflict_id: string;
  trigger_npc_ids: string[];
  description: string;
}

export interface SpaceAnomaly {
  anomaly_id: string;
  title: string;
  description: string;
  cpu_load: number;
  status: string;
}

export interface SpaceAnomalyResolveResponse {
  status: string;
  feedback: string;
  xp_gained: number;
}

export interface SpaceStateResponse {
  player_coords: SpaceCoords;
  ambient_theme: string;
  map_assets_url: string;
  active_mission: SpaceActiveMission | null;
  unresolved_conflict: SpaceConflict | null;
  active_anomaly: SpaceAnomaly | null;
}

export interface SpaceMoveResponse {
  status: string;
  coords: SpaceCoords;
  triggered_npc_id: string | null;
}

export interface SpatialRagChunk {
  doc_title: string;
  content_excerpt: string;
  similarity_score: number;
}

export interface SpatialRagSearchResponse {
  bookcase_id: string;
  top_k_chunks: SpatialRagChunk[];
}

export interface MeetingChunk {
  speaker?: string;
  chunk?: string;
  done?: boolean;
  status?: string;
}

export interface ArbitrationResponse {
  status: string;
  dialogue_history: { speaker: string; text: string }[];
  xp_gained: number;
  feedback: string;
}

export interface CoopReview {
  id: string;
  user_id: string;
  title: string;
  code_content: string;
  language: string;
  status: string;
  reviewer_id?: string | null;
  feedback?: string | null;
  created_at?: string;
}

export interface CoopActionResponse {
  status: string;
  message: string;
  xp_gained: number;
}

export interface SandboxCompileResponse {
  status: string;
  feedback: string;
  logs: string[];
  diagnostics: {
    syntax_valid: boolean;
    complexity: string;
    functions: string[];
    decorators: string[];
    has_try_except: boolean;
    has_rollback: boolean;
    has_circuit_breaker: boolean;
    has_fallback_defined: boolean;
    has_pandas_groupby: boolean;
    has_pandas_fillna: boolean;
    sandbox_success: boolean;
    [key: string]: any;
  };
}


