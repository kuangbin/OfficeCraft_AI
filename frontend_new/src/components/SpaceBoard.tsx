'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSpaceStore } from '@/stores/spaceStore';
import { useUserStore } from '@/stores/userStore';
import { useMissionStore } from '@/stores/missionStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useSkillStore } from '@/stores/skillStore';
import { api, streamChat, SpatialRagChunk, CoopReview } from '@/services/apiClient';
import { careerService, missionService, skillService } from '@/services';
import { PixelBadge, PixelButton, PixelCard } from '@/components/pixel';
import { audioManager } from '@/utils/audioManager';
import CareerWorldMap, { CareerMapIsland } from '@/components/lobby/CareerWorldMap';
import CareerPreviewPanel from '@/components/lobby/CareerPreviewPanel';
import { CareerSkillTree } from '@/components/career';
import { CareerIsland, Mission, MissionStatus } from '@/types';
import { getPlayerId } from '@/services/identity';

// Map area labels
const ZONES = {
  LOBBY: { name: '大厅接待区 (Lobby)', color: 'from-amber-950/20 to-transparent border-amber-950/20 text-amber-300' },
  DEV_BAY: { name: '技术开发区 (Dev Bay)', color: 'from-slate-900/30 to-transparent border-slate-900/20 text-blue-300' },
  MEETING: { name: '会议讨论区 (Meeting Room)', color: 'from-indigo-950/20 to-transparent border-indigo-950/20 text-indigo-300' },
  ARCHIVE: { name: '物理资料库 (Archive Room)', color: 'from-emerald-950/20 to-transparent border-emerald-950/20 text-emerald-300' },
};

// NPCs descriptions and details
const NPC_INFO = {
  mentor_ling: {
    id: 'mentor_ling',
    name: '高凌 | 技术主管 (Tech Lead)',
    roleName: '高凌',
    emoji: '👩‍💻',
    color: 'text-purple-400 border-purple-500',
    bgColor: 'bg-purple-950/40',
    greeting: '你好，我是技术主管高凌。写代码最忌讳浮躁，遇到技术卡点先查阅“物理资料库/书架区”的技术文档或 Pandas 手册。有不明白的可以向我领任务或咨询。',
    desc: '严谨认真的前端与系统架构专家，对代码规范和性能优化有极高要求。',
  },
  pm_amy: {
    id: 'pm_amy',
    name: 'Amy | 产品经理 (Product Manager)',
    roleName: 'Amy',
    emoji: '👩‍💼',
    color: 'text-amber-400 border-amber-500',
    bgColor: 'bg-amber-950/40',
    greeting: '嗨，我是产品主管 Amy！我们现在的迭代节奏非常快。如果你想要锻炼自己的产品思维、领取业务分析需求，可以直接找我。记住，数据分析才是支撑需求的硬道理！',
    desc: '敏锐高效的业务线 PM，热衷于通过敏捷开发与用户数据驱动产品迭代。',
  },
  mentor_ying: {
    id: 'mentor_ying',
    name: '郑莹 | 高级分析师 (Senior Analyst)',
    roleName: '郑莹',
    emoji: '🧠',
    color: 'text-cyan-400 border-cyan-500',
    bgColor: 'bg-cyan-950/40',
    greeting: '我是高级分析顾问郑莹。数据是一门艺术，也是最具说服力的武器。在开始你的分析任务前，最好多去书架区检索一些 Pandas 指南 and 分析规范。有任何疑惑随时来问我。',
    desc: '沉稳的数据建模大师，精通清洗、挖掘和业务指标体系搭建。',
  },
};

// Bookcase details
const BOOKCASES = {
  pandas_library: {
    id: 'pandas_library',
    name: '📖 Pandas 物理书架',
    coords: { x: 4, y: 5 },
    desc: '包含 Pandas 常用语法、清洗指令、Merge / Join 手册以及常见数据处理异常的解决方案。',
    quickQueries: ['DataFrame merge', 'fillna method', 'groupby aggregate', 'SettingWithCopyWarning'],
  },
  software_design_rules: {
    id: 'software_design_rules',
    name: '📚 软件设计原则书架',
    coords: { x: 10, y: 15 },
    desc: '包含 SOLID 原则、Clean Code 规范、面向对象设计、设计模式以及单元测试最佳实践。',
    quickQueries: ['SOLID principles', 'try-except exception handling', 'Dependency Injection', 'Clean Code naming'],
  },
};

const SKILL_TERMINAL = {
  id: 'skill_terminal',
  name: '🖥️ 核心技能星图终端 (Skill Matrix Server)',
  coords: { x: 18, y: 15 },
  desc: '连接至高维职业技能星图的量子终端。',
};

const MILESTONES = [
  { id: 'm1', name: '新手起航', subtitle: '选择并进入你的第一个职业岛屿', achieved: true, xpAwarded: 20 },
  { id: 'm2', name: '快速交付', subtitle: '运行单元测试并成功通过代码编译', achieved: false, xpAwarded: 30 },
  { id: 'm3', name: '费曼挑战者', subtitle: '通过 AI 同事的数据分析考核并解决团队分歧', achieved: false, xpAwarded: 40 },
  { id: 'm4', name: '空间守护者', subtitle: '将环境传感器转换为 Celebrate Gold 庆典光效', achieved: false, xpAwarded: 50 },
];

export default function SpaceBoard() {
  // Global States
  const {
    playerCoords,
    ambientTheme,
    activeMission,
    unresolvedConflict,
    interactiveNpcId,
    syncFromBackend,
    movePlayer,
    triggerBookcaseSearch,
    facingDirection,
    isWalking,
    remotePlayers,
    connectWebSocket,
    disconnectWebSocket,
    setLocalTyping,
    setAmbientTheme,
    chatMessages: spatialChatMessages,
    localLastMessage,
    localLastMessageTime,
    sendChatMessage,
    activeAnomaly,
    triggerAnomaly,
    resolveAnomaly,
    pendingReviews,
    isCoopWhiteboardOpen,
    submitPeerReview,
    submitCodeForReview,
    fetchPendingReviews,
    setCoopWhiteboardOpen,
    networkLatency,
    networkLoss,
    isPacketDroppedFlash,
    activeLocks,
    partitionResolvedStations,
    setNetworkLatency,
    setNetworkLoss,
    acquireStationLock,
    renewStationLock,
    releaseStationLock,
    sendWSMessage,
  } = useSpaceStore();

  const { currentCareerId, totalXp, selectCareer, addXp } = useUserStore();
  const { getMissionStatus, acceptMission, completeMission, submitMission } = useMissionStore();
  const { skills, setSkills } = useSkillStore();

  // Internal states
  const lastMoveTimeRef = useRef<number>(0);
  const [activeZone, setActiveZone] = useState<string>('Lobby');

  // Phase 18 state additions
  const isNearDevBTerminal = useMemo(() => {
    return Math.abs(playerCoords.x - 11) <= 1 && Math.abs(playerCoords.y - 17) <= 1;
  }, [playerCoords]);

  const [currentTerminalStationId, setCurrentTerminalStationId] = useState<'station_mainframe' | 'station_dev_b' | 'station_whiteboard' | null>(null);
  const [gaoLingStep, setGaoLingStep] = useState<'idle' | 'active' | 'locked' | 'submitting' | 'done'>('idle');

  // Lock auto-renew heartbeat loop
  useEffect(() => {
    if (!currentTerminalStationId) return;
    const interval = setInterval(() => {
      renewStationLock(currentTerminalStationId);
    }, 10000);
    return () => clearInterval(interval);
  }, [currentTerminalStationId, renewStationLock]);

  // AI Autopilot Gao Ling automation effects
  const isGaoLingAutopilotActive = activeAnomaly?.anomaly_id === 'network_partition' && Object.keys(remotePlayers).length === 0;

  useEffect(() => {
    if (!isGaoLingAutopilotActive) {
      if (gaoLingStep !== 'idle') {
        setGaoLingStep('idle');
      }
      return;
    }
    if (gaoLingStep === 'idle') {
      setGaoLingStep('active');
    }
  }, [isGaoLingAutopilotActive, gaoLingStep]);

  useEffect(() => {
    if (!isGaoLingAutopilotActive) return;

    if (gaoLingStep === 'active') {
      const timer = setTimeout(() => {
        sendWSMessage({
          type: 'LOCK_ACQUIRE',
          station_id: 'station_dev_b',
          player_id: 'ai_gao_ling'
        });
        setGaoLingStep('locked');
      }, 4000);
      return () => clearTimeout(timer);
    }

    if (gaoLingStep === 'locked') {
      const timer = setTimeout(async () => {
        try {
          const mockScript = `def sync_data(packet):\n    print("Gao Ling Autopilot syncing consensus data...")\n    return {"status": "consensus_ok", "node": "sub_node_b"}`;
          await resolveAnomaly(mockScript, 'station_dev_b');
          setGaoLingStep('done');
        } catch (err) {
          console.error('Gao Ling autopilot submit failed:', err);
        }
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [isGaoLingAutopilotActive, gaoLingStep, sendWSMessage, resolveAnomaly]);

  // Recovery terminal states (Phase 13)
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [currentCpu, setCurrentCpu] = useState<number>(100);
  const [recoveryScript, setRecoveryScript] = useState<string>('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [isRecoveryCompiling, setIsRecoveryCompiling] = useState<boolean>(false);
  const [isConsoleShaking, setIsConsoleShaking] = useState<boolean>(false);

  // Co-Op whiteboard and review state variables
  const [whiteboardTab, setWhiteboardTab] = useState<'reviews' | 'quests'>('reviews');
  const [selectedReview, setSelectedReview] = useState<CoopReview | null>(null);
  const [coopFeedback, setCoopFeedback] = useState('');
  const [isReviewActionRunning, setIsReviewActionRunning] = useState(false);
  const [isPeerReviewModalOpen, setIsPeerReviewModalOpen] = useState(false);
  const [peerReviewTitle, setPeerReviewTitle] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Mobile Adaptations and Scaling states
  const [mapScale, setMapScale] = useState<number>(1);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const touchIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Unified overlay screen state: lobby | quests | portfolio | community | sandbox | skills | recovery | null
  const [activeOverlay, setActiveOverlay] = useState<'lobby' | 'quests' | 'portfolio' | 'community' | 'sandbox' | 'skills' | 'recovery' | null>(null);

  // Controls collapsible HUD panels
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);

  // Screen shake animation trigger state
  const [screenShake, setScreenShake] = useState(false);

  // Audio settings
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);

  // Bookcase/RAG state
  const [selectedBookcase, setSelectedBookcase] = useState<typeof BOOKCASES.pandas_library | null>(null);
  const [bookcaseQuery, setBookcaseQuery] = useState('');
  const [ragResults, setRagResults] = useState<SpatialRagChunk[]>([]);
  const [isSearchingRag, setIsSearchingRag] = useState(false);

  // Chat state
  const [activeChatNpc, setActiveChatNpc] = useState<typeof NPC_INFO.mentor_ling | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'npc'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isNpcStreaming, setIsNpcStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Meeting & Arbitration state
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  const [meetingAmyText, setMeetingAmyText] = useState('');
  const [meetingLingText, setMeetingLingText] = useState('');
  const [meetingPlayerText, setMeetingPlayerText] = useState('');
  const [isMeetingStreaming, setIsMeetingStreaming] = useState(false);
  const [meetingFinished, setMeetingFinished] = useState(false);
  const [arbitrationResponse, setArbitrationResponse] = useState<any | null>(null);

  // Lobby lists states
  const [selectedIsland, setSelectedIsland] = useState<CareerMapIsland | null>(null);
  const [careerOverrides, setCareerOverrides] = useState<Array<{ id: string; name: string; description: string; unlocked: boolean }>>([]);

  // Quests list states
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loadingMissions, setLoadingMissions] = useState(false);

  // Coding Sandbox Editor states
  const [sandboxCode, setSandboxCode] = useState<string>(
    `import pandas as pd\n\ndef clean_and_analyze(filepath):\n    # 1. 读取社区数据集\n    df = pd.read_csv(filepath)\n    \n    # 2. 补齐缺失数据 (fillna)\n    df['active_days'] = df['active_days'].fillna(0)\n    \n    # 3. 分组聚合活跃度 (groupby)\n    summary = df.groupby('career_path')['active_days'].mean().reset_index()\n    \n    return summary`
  );
  const [sandboxReport, setSandboxReport] = useState<string>(
    `任务复盘报告：\n- 业务问题：社区论坛近期用户活跃度出现明显下降。\n- 分析口径：采用 active_days 指标进行平均日活跃聚合。\n- 关键洞察：技术开发类用户的平均活跃时间远低于预期，存在明显的工具链流失。\n- 行动建议：在开发区增加更具交互性的 Pandas 物理书架 RAG，以此补齐学习卡点。`
  );
  const [compileLogs, setCompileLog] = useState<string[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'running' | 'success' | 'fail'>('idle');

  // Community whiteboard states
  const { issues, addReply, displayName, setDisplayName } = useCommunityStore();
  const [commChannel, setCommChannel] = useState<string>('all');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [showCreatePost, setShowPostDialog] = useState(false);

  // Spatial Chat local states & refs
  const [spatialChatInput, setSpatialChatInput] = useState('');
  const [isSpatialChatCollapsed, setIsSpatialChatCollapsed] = useState(false);
  const spatialChatEndRef = useRef<HTMLDivElement>(null);
  const spatialChatInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll spatial chat
  useEffect(() => {
    if (spatialChatEndRef.current) {
      spatialChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [spatialChatMessages]);

  // Proximity calculations
  const isAdjacentToTable = useMemo(() => {
    return (
      playerCoords.x >= 16 &&
      playerCoords.x <= 19 &&
      playerCoords.y >= 5 &&
      playerCoords.y <= 8 &&
      !(playerCoords.x >= 17 && playerCoords.x <= 18 && playerCoords.y >= 6 && playerCoords.y <= 7)
    );
  }, [playerCoords]);

  const isNearLobbyDesk = useMemo(() => {
    return playerCoords.y >= 2 && playerCoords.y <= 4 && playerCoords.x >= 3 && playerCoords.x <= 7;
  }, [playerCoords]);

  const isNearDevWorkstation = useMemo(() => {
    return (
      (playerCoords.y >= 13 && playerCoords.y <= 15 && playerCoords.x >= 2 && playerCoords.x <= 8) ||
      (playerCoords.y >= 16 && playerCoords.y <= 18 && playerCoords.x >= 2 && playerCoords.x <= 8)
    );
  }, [playerCoords]);

  const isNearArchiveBookshelf = useMemo(() => {
    return (
      (Math.abs(playerCoords.x - BOOKCASES.pandas_library.coords.x) <= 1 && Math.abs(playerCoords.y - BOOKCASES.pandas_library.coords.y) <= 1) ||
      (Math.abs(playerCoords.x - BOOKCASES.software_design_rules.coords.x) <= 1 && Math.abs(playerCoords.y - BOOKCASES.software_design_rules.coords.y) <= 1)
    );
  }, [playerCoords]);

  const isNearSkillTerminal = useMemo(() => {
    return Math.abs(playerCoords.x - SKILL_TERMINAL.coords.x) <= 1 && Math.abs(playerCoords.y - SKILL_TERMINAL.coords.y) <= 1;
  }, [playerCoords]);

  const isNearCoopWhiteboard = useMemo(() => {
    return Math.abs(playerCoords.x - 15) <= 1 && Math.abs(playerCoords.y - 5) <= 1;
  }, [playerCoords]);

  // Phase 11 Stance States selectors
  const isSitting = useMemo(() => {
    const { x, y } = playerCoords;
    return (y === 2 && (x === 2 || x === 3)) || (y === 16 && (x === 21 || x === 22));
  }, [playerCoords]);

  const isReading = useMemo(() => {
    return selectedBookcase !== null;
  }, [selectedBookcase]);

  const isWorkingLaptop = useMemo(() => {
    return activeOverlay === 'sandbox' || (activeOverlay === 'quests' && isNearDevWorkstation);
  }, [activeOverlay, isNearDevWorkstation]);

  const isTalking = useMemo(() => {
    return !!activeChatNpc || isMeetingOpen || (!!unresolvedConflict && isAdjacentToTable);
  }, [activeChatNpc, isMeetingOpen, unresolvedConflict, isAdjacentToTable]);

  // Local active mission derived from the frontend store if the backend activeMission is not yet synced or available
  const localActiveMission = useMemo(() => {
    if (activeMission) {
      return {
        mission_id: activeMission.mission_id,
        title: activeMission.title,
        status: activeMission.status,
      };
    }
    // Fallback: find any mission in the current list that is accepted
    const acceptedMission = missions.find(
      (m) => getMissionStatus(m.id, m.status) === MissionStatus.ACCEPTED
    );
    if (acceptedMission) {
      return {
        mission_id: acceptedMission.id,
        title: acceptedMission.title,
        status: 'active',
      };
    }
    return null;
  }, [activeMission, missions, getMissionStatus]);

  // Look up active mission details from missions store
  const activeMissionDetails = useMemo(() => {
    if (!localActiveMission) return null;
    return missions.find((m) => m.id === localActiveMission.mission_id) || null;
  }, [localActiveMission, missions]);

  // Sync initial setup
  useEffect(() => {
    setIsMuted(audioManager.getMuted());
    setVolume(audioManager.getVolume());
    syncFromBackend().catch(() => undefined);
    connectWebSocket();

    // Fetch career islands
    careerService.getAllCareerIslandsWithSource()
      .then(({ data }) => {
        setCareerOverrides(
          data.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            unlocked: item.unlocked,
          }))
        );
      })
      .catch(() => undefined);

    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket, syncFromBackend]);

  // Handle viewport auto-scaling & touch/mobile detection
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(width < 1024 || hasTouch);

      const minDim = Math.min(width - 32, height - 240);
      let scale = minDim / 816;
      
      if (scale > 1.15) scale = 1.15;
      if (scale < 0.35) scale = 0.35;
      
      setMapScale(scale);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (touchIntervalRef.current) {
        clearInterval(touchIntervalRef.current);
      }
    };
  }, []);

  // Fetch career-specific quests and skills when career changes
  useEffect(() => {
    if (currentCareerId) {
      setLoadingMissions(true);
      missionService.getMissionsByCareerId(currentCareerId)
        .then((data) => {
          setMissions(data);
        })
        .catch(() => undefined)
        .finally(() => setLoadingMissions(false));

      skillService.getSkillsByCareerId(currentCareerId)
        .then((data) => {
          setSkills(data);
        })
        .catch(() => undefined);
    }
  }, [currentCareerId, setSkills]);

  // Track active zone name
  useEffect(() => {
    const { x, y } = playerCoords;
    if (x <= 11) {
      setActiveZone(y <= 10 ? 'Lobby' : 'Dev Bay');
    } else {
      setActiveZone(y <= 12 ? 'Meeting Room' : 'Archive Room');
    }
  }, [playerCoords]);

  // Audio ignition gestures
  useEffect(() => {
    const handleGesture = () => audioManager.initContext();
    window.addEventListener('pointerdown', handleGesture);
    window.addEventListener('keydown', handleGesture);
    return () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, []);

  // Theme transitions audio triggers
  useEffect(() => {
    if (ambientTheme && ambientTheme !== 'default') {
      audioManager.playThemeTransition(ambientTheme);
    }
  }, [ambientTheme]);

  // Chat auto-scroll
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Recovery console CPU simulator logic (Phase 13)
  useEffect(() => {
    if (activeOverlay !== 'recovery') {
      setCpuHistory([]);
      setCurrentCpu(100);
      if (activeAnomaly?.anomaly_id === 'service_breaker_trip') {
        setTerminalOutput([
          'SYSTEM BOOT SECTOR: STATUS OK',
          'DISTRIBUTED BUS ROUTER: HEARTBEAT EXPIRED',
          'MICROSERVICE B STATUS: TRIPPED (CIRCUIT BREAKER OPEN)',
          'CPU LOAD STATUS: 100% TIMEOUT BLOCK',
          'ANALYSIS: Downstream service B is timing out, flooding upstream request queue.',
          'INSTRUCTIONS: Please configure @circuitbreaker decorator with custom fallback function,',
          'defining circuit-breaker states (open, closed) to prevent cascading failures!'
        ]);
      } else {
        setTerminalOutput([
          'SYSTEM BOOT SECTOR: STATUS OK',
          'MAIN DATA ACCESS LAYER: OFFLINE (SERVER CONGESTION)',
          'CPU LOAD STATUS: 100% UNSTABLE',
          'ANALYSIS: Database index missing or connections blocking socket queue.',
          'INSTRUCTIONS: Please write a CREATE INDEX script to resolve order latency,',
          'or construct a Python Exception rollback block to recover core engine transactions.'
        ]);
      }
      return;
    }

    const interval = setInterval(() => {
      const targetBase = activeAnomaly ? 99 : 12;
      const jitter = Math.random() * 1.8 - 0.9;
      const nextCpu = Math.max(0, Math.min(100, parseFloat((targetBase + jitter).toFixed(1))));
      setCurrentCpu(nextCpu);
      setCpuHistory((prev) => {
        const nextHist = [...prev, nextCpu];
        if (nextHist.length > 25) {
          nextHist.shift();
        }
        return nextHist;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [activeOverlay, activeAnomaly]);

  // Hoisted overlay actions
  const openOverlay = useCallback((overlayType: 'lobby' | 'quests' | 'portfolio' | 'community' | 'sandbox' | 'skills' | 'recovery') => {
    audioManager.playOpen();
    setActiveOverlay(overlayType);
    if (overlayType === 'skills') {
      setAmbientTheme('quiet-blue');
    }
  }, [setAmbientTheme]);

  const closeOverlay = useCallback(() => {
    audioManager.playClose();
    setActiveOverlay(null);
    if (activeOverlay === 'skills' || ambientTheme === 'quiet-blue') {
      setAmbientTheme('default');
    }
    if (currentTerminalStationId) {
      releaseStationLock(currentTerminalStationId);
      setCurrentTerminalStationId(null);
    }
  }, [activeOverlay, ambientTheme, setAmbientTheme, currentTerminalStationId, releaseStationLock]);

  const closeCoopWhiteboard = useCallback(() => {
    audioManager.playClose();
    setCoopWhiteboardOpen(false);
    if (ambientTheme === 'quiet-blue') {
      setAmbientTheme('default');
    }
    if (currentTerminalStationId) {
      releaseStationLock(currentTerminalStationId);
      setCurrentTerminalStationId(null);
    }
  }, [ambientTheme, setAmbientTheme, setCoopWhiteboardOpen, currentTerminalStationId, releaseStationLock]);

  const openCoopWhiteboard = useCallback(() => {
    audioManager.playOpen();
    setCoopWhiteboardOpen(true);
    fetchPendingReviews();
    setAmbientTheme('quiet-blue');
  }, [fetchPendingReviews, setCoopWhiteboardOpen, setAmbientTheme]);

  // NPCs Chat conversation
  const startConversation = useCallback((npc: typeof NPC_INFO.mentor_ling) => {
    setActiveChatNpc(npc);
    audioManager.playOpen();
    setChatMessages([{ role: 'npc', content: npc.greeting }]);
    setChatInput('');
  }, [setActiveChatNpc, setChatMessages, setChatInput]);

  const closeConversation = useCallback(() => {
    setActiveChatNpc(null);
    audioManager.playClose();
    setChatMessages([]);
  }, [setActiveChatNpc, setChatMessages]);

  // Mobile touch and virtual gamepad event handlers
  const handleTouchMoveStart = useCallback((dx: number, dy: number) => {
    if (touchIntervalRef.current) {
      clearInterval(touchIntervalRef.current);
    }
    
    movePlayer(dx, dy).catch(() => undefined);
    
    touchIntervalRef.current = setInterval(() => {
      movePlayer(dx, dy).catch(() => undefined);
    }, 120);
  }, [movePlayer]);

  const handleTouchMoveEnd = useCallback(() => {
    if (touchIntervalRef.current) {
      clearInterval(touchIntervalRef.current);
      touchIntervalRef.current = null;
    }
  }, []);

  const handleTouchInteract = useCallback(() => {
    if (isAdjacentToTable) {
      startTeamMeetingModal().catch(() => undefined);
      return;
    }
    if (isNearLobbyDesk) {
      openOverlay('lobby');
      return;
    }
    if (isNearDevWorkstation) {
      openOverlay('quests');
      return;
    }
    if (isNearArchiveBookshelf) {
      setSelectedBookcase(BOOKCASES.pandas_library);
      audioManager.playOpen();
      return;
    }
    if (isNearSkillTerminal) {
      if (activeAnomaly) {
        openOverlay('recovery');
      } else {
        openOverlay('skills');
      }
      return;
    }
    if (isNearCoopWhiteboard) {
      openCoopWhiteboard();
      return;
    }
    if (interactiveNpcId) {
      const npc = NPC_INFO[interactiveNpcId as keyof typeof NPC_INFO];
      if (npc) {
        startConversation(npc);
      }
      return;
    }
  }, [
    isAdjacentToTable,
    isNearLobbyDesk,
    isNearDevWorkstation,
    isNearArchiveBookshelf,
    isNearSkillTerminal,
    isNearCoopWhiteboard,
    interactiveNpcId,
    activeAnomaly,
    startConversation,
    openCoopWhiteboard,
    openOverlay
  ]);

  // Handle Keyboard Inputs
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if user is writing in inputs, but allow Escape to blur
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      // Prevent movement and close with Escape if an overlay or the whiteboard is open
      if (activeOverlay || isCoopWhiteboardOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (isCoopWhiteboardOpen) {
            closeCoopWhiteboard();
          } else {
            closeOverlay();
          }
        }
        return;
      }

      // Focus spatial chat input on pressing 't'
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        spatialChatInputRef.current?.focus();
        return;
      }

      // Prohibit movement & trigger keys if conversing; bind space/enter to auto-focus chat input
      if (activeChatNpc) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeConversation();
          return;
        }
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          chatInputRef.current?.focus();
        }
        return;
      }

      const now = Date.now();
      if (now - lastMoveTimeRef.current < 50) return;

      let dx = 0;
      let dy = 0;

      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          dy = -1;
          break;
        case 's':
        case 'arrowdown':
          dy = 1;
          break;
        case 'a':
        case 'arrowleft':
          dx = -1;
          break;
        case 'd':
        case 'arrowright':
          dx = 1;
          break;
        case ' ':
        case 'enter':
          e.preventDefault();
          if (isAdjacentToTable) {
            startTeamMeetingModal();
            return;
          }
          if (isNearLobbyDesk) {
            openOverlay('lobby');
            return;
          }
          if (isNearDevWorkstation) {
            openOverlay('quests');
            return;
          }
          if (isNearArchiveBookshelf) {
            setSelectedBookcase(BOOKCASES.pandas_library);
            audioManager.playOpen();
            return;
          }
          if (isNearSkillTerminal) {
            if (activeAnomaly) {
              openOverlay('recovery');
              setCurrentTerminalStationId('station_mainframe');
              acquireStationLock('station_mainframe');
            } else {
              openOverlay('skills');
            }
            return;
          }
          if (isNearDevBTerminal) {
            if (activeAnomaly && activeAnomaly.anomaly_id === 'network_partition') {
              openOverlay('recovery');
              setCurrentTerminalStationId('station_dev_b');
              acquireStationLock('station_dev_b');
            }
            return;
          }
          if (isNearCoopWhiteboard) {
            openCoopWhiteboard();
            setCurrentTerminalStationId('station_whiteboard');
            acquireStationLock('station_whiteboard');
            return;
          }
          if (interactiveNpcId) {
            const npc = NPC_INFO[interactiveNpcId as keyof typeof NPC_INFO];
            if (npc) {
              startConversation(npc);
            }
            return;
          }
          // Focus chat input on Enter if not near any triggers
          if (e.key === 'Enter') {
            spatialChatInputRef.current?.focus();
          }
          return;
        default:
          return;
      }

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        lastMoveTimeRef.current = now;
        await movePlayer(dx, dy);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    movePlayer,
    interactiveNpcId,
    isAdjacentToTable,
    isNearLobbyDesk,
    isNearDevWorkstation,
    isNearArchiveBookshelf,
    isNearSkillTerminal,
    isNearDevBTerminal,
    activeAnomaly,
    activeChatNpc,
    isNearCoopWhiteboard,
    isCoopWhiteboardOpen,
    activeOverlay,
    openOverlay,
    closeOverlay,
    openCoopWhiteboard,
    closeCoopWhiteboard,
    currentTerminalStationId,
    setCurrentTerminalStationId,
    acquireStationLock,
  ]);

  const toggleMute = () => {
    const nextMute = !isMuted;
    audioManager.setMuted(nextMute);
    setIsMuted(nextMute);
    if (!nextMute) {
      audioManager.playOpen();
    }
  };

  const handleVolumeChange = (vol: number) => {
    audioManager.setVolume(vol);
    setVolume(vol);
    if (isMuted && vol > 0) {
      audioManager.setMuted(false);
      setIsMuted(false);
    }
  };



  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !activeChatNpc || isNpcStreaming) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setIsNpcStreaming(true);
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: userMsg },
      { role: 'npc', content: '' },
    ]);

    try {
      await streamChat(activeChatNpc.roleName, userMsg, (chunk: string) => {
        setChatMessages((prev) => {
          const lastIndex = prev.length - 1;
          if (lastIndex >= 0 && prev[lastIndex].role === 'npc') {
            const updatedMsg = {
              ...prev[lastIndex],
              content: prev[lastIndex].content + chunk,
            };
            audioManager.playTypewriter();
            return [...prev.slice(0, lastIndex), updatedMsg];
          }
          return prev;
        });
      });
    } catch {
      setChatMessages((prev) => {
        const lastIndex = prev.length - 1;
        if (lastIndex >= 0 && prev[lastIndex].role === 'npc') {
          const updatedMsg = {
            ...prev[lastIndex],
            content: '抱歉，我的神经网络连接稍微有些抖动，建议你再试一次。你也可以前往工位运行代码！',
          };
          return [...prev.slice(0, lastIndex), updatedMsg];
        }
        return prev;
      });
    } finally {
      setIsNpcStreaming(false);
    }
  };

  // Bookshelf search (RAG)
  const handleRagSearch = async (queryText = bookcaseQuery) => {
    if (!queryText.trim() || !selectedBookcase || isSearchingRag) return;
    setBookcaseQuery(queryText);
    setIsSearchingRag(true);
    audioManager.playRagScan();
    try {
      const response = await triggerBookcaseSearch(selectedBookcase.id, queryText);
      setRagResults(response.top_k_chunks || []);
    } catch {
      setRagResults([]);
    } finally {
      setIsSearchingRag(false);
    }
  };

  const openBookcasePanel = (bookcase: typeof BOOKCASES.pandas_library) => {
    setSelectedBookcase(bookcase);
    audioManager.playOpen();
    setBookcaseQuery('');
    setRagResults([]);
  };

  // Multipart standup session
  const startTeamMeetingModal = async () => {
    setIsMeetingOpen(true);
    audioManager.playOpen();
    setMeetingAmyText('');
    setMeetingLingText('');
    setMeetingPlayerText('');
    setMeetingFinished(false);
    setArbitrationResponse(null);

    if (unresolvedConflict) return;

    setIsMeetingStreaming(true);
    try {
      const { streamTeamMeeting } = await import('@/services/apiClient');
      await streamTeamMeeting((chunk) => {
        if (chunk.speaker === 'pm_amy' && chunk.chunk) {
          setMeetingAmyText((prev) => prev + chunk.chunk);
          audioManager.playTypewriter();
        } else if (chunk.speaker === 'mentor_ling' && chunk.chunk) {
          setMeetingLingText((prev) => prev + chunk.chunk);
          audioManager.playTypewriter();
        } else if (chunk.status === 'finished') {
          setMeetingFinished(true);
        }
      });
    } catch {
      setMeetingAmyText('大家早上好！最近活跃用户下滑有些厉害，运营部门希望本周五强行发版我们的主线MVP功能。');
      setMeetingLingText('产品强行发布只会积压严重的底层技术债。如果我们不补齐数据指标的单元测试，极易产生生产事故。质量重于泰山。');
      setMeetingFinished(true);
    } finally {
      setIsMeetingStreaming(false);
    }
  };

  const handleArbitrateChoice = async (choice: 'speed' | 'quality' | 'balance') => {
    if (!unresolvedConflict || isMeetingStreaming) return;
    audioManager.playOpen();
    setIsMeetingStreaming(true);
    try {
      const res = await api.arbitrateConflict(unresolvedConflict.conflict_id, choice);
      setArbitrationResponse(res);

      const playerTurn = res.dialogue_history.find((d: any) => d.speaker === 'player')?.text || '';
      const amyTurn = res.dialogue_history.find((d: any) => d.speaker === 'pm_amy' && d.text !== 'Hurry up!')?.text || '';
      const lingTurn = res.dialogue_history.find((d: any) => d.speaker === 'mentor_ling')?.text || '';

      setMeetingPlayerText(playerTurn);

      let amyWritten = '';
      for (let i = 0; i < amyTurn.length; i++) {
        amyWritten += amyTurn[i];
        setMeetingAmyText(amyWritten);
        audioManager.playTypewriter();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      let lingWritten = '';
      for (let i = 0; i < lingTurn.length; i++) {
        lingWritten += lingTurn[i];
        setMeetingLingText(lingWritten);
        audioManager.playTypewriter();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      setMeetingFinished(true);
    } catch {
      setMeetingFinished(true);
    } finally {
      setIsMeetingStreaming(false);
    }
  };

  const handleCloseMeeting = () => {
    setIsMeetingOpen(false);
    audioManager.playClose();
    syncFromBackend();
  };

  // Lobby selections
  const handleSelectCareerIsland = async (islandId: string) => {
    try {
      audioManager.playThemeTransition('celebrate-gold');
      await selectCareer(islandId);
      closeOverlay();
      syncFromBackend();
    } catch (e) {
      console.error(e);
    }
  };

  // Task accept triggers
  const handleAcceptMission = (missionId: string) => {
    audioManager.playOpen();
    acceptMission(missionId);
    syncFromBackend();
  };

  // Sandbox Code compile & tests service caller
  const handleCompileCode = async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    setTestResult('running');
    setScreenShake(true);
    setCompileLog(['⏳ [0.0s] Booting virtual Sandbox container...']);

    // Play compile sound loop and vibrate
    audioManager.playThemeTransition('alert-red');

    try {
      const language = (sandboxCode.toLowerCase().includes('create index') || sandboxCode.toLowerCase().includes('select ')) ? 'sql' : 'python';
      
      const res = await missionService.compileSandboxCode(
        sandboxCode,
        language,
        localActiveMission?.mission_id
      );

      setScreenShake(false);
      setCompileLog(res.logs);

      if (res.status === 'success') {
        setTestResult('success');
        setAmbientTheme('celebrate-gold');
        audioManager.playThemeTransition('celebrate-gold');
      } else {
        setTestResult('fail');
        setAmbientTheme('alert-red');
        audioManager.playThemeTransition('alert-red');
      }
    } catch (err) {
      setScreenShake(false);
      setTestResult('fail');
      setAmbientTheme('alert-red');
      audioManager.playThemeTransition('alert-red');
      setCompileLog([
        '🚨 Connection timed out or server compiler service is offline.',
        '💔 COMPILATION FAILED: unable to establish connection with the sandboxed evaluator.'
      ]);
    } finally {
      setIsCompiling(false);
    }
  };

  // Submit to AI evaluation
  const handleSandboxSubmit = async () => {
    if (!localActiveMission || isCompiling) return;
    setIsCompiling(true);
    try {
      const evaluationMaterial = [sandboxReport.trim(), sandboxCode.trim() ? `\n\nCode materials:\n${sandboxCode.trim()}` : ''].join('');
      const result = await missionService.evaluateSubmission(localActiveMission.mission_id, evaluationMaterial);
      
      audioManager.playThemeTransition('celebrate-gold');
      completeMission(localActiveMission.mission_id);
      const gainsXp = Object.values(result.experience_gains || {}).reduce((a, b) => a + b, 0) || 60;
      addXp(gainsXp);
      closeOverlay();
      syncFromBackend();
      
      alert(`🎉 恭喜！AI 导师评审通过：\n评分：${gainsXp} XP\n评语：${result.feedback || '非常棒的代码实现与数据分析！'}`);
    } catch {
      // Offline fallback
      completeMission(localActiveMission.mission_id);
      addXp(60);
      closeOverlay();
      syncFromBackend();
      alert('⚙️ 离线评估机制：任务已圆满提交，成长 XP 证书已成功归档！');
    } finally {
      setIsCompiling(false);
    }
  };

  // Whiteboard new post
  const handleCreatePost = () => {
    if (!newPostTitle.trim() || !newPostContent.trim()) return;
    useCommunityStore.getState().issues.unshift({
      id: `issue_${Date.now()}`,
      careerId: currentCareerId || 'software-engineer',
      title: newPostTitle,
      content: newPostContent,
      authorId: 'local_player',
      authorName: displayName || '我',
      priority: 'normal',
      status: 'open',
      tags: ['Pandas', '调试'],
      createdAt: new Date().toISOString(),
      replies: [],
    });
    setNewPostTitle('');
    setNewPostContent('');
    setShowPostDialog(false);
    audioManager.playThemeTransition('celebrate-gold');
  };

  const filteredCommunityIssues = useMemo(() => {
    return issues.filter((iss) => commChannel === 'all' || iss.careerId === commChannel);
  }, [issues, commChannel]);

  const showSensorHud = useMemo(() => {
    return !!(isNearLobbyDesk || isNearDevWorkstation || isNearArchiveBookshelf || isNearSkillTerminal || isAdjacentToTable || isNearCoopWhiteboard);
  }, [isNearLobbyDesk, isNearDevWorkstation, isNearArchiveBookshelf, isNearSkillTerminal, isAdjacentToTable, isNearCoopWhiteboard]);

  return (
    <div className={`w-screen h-screen flex flex-col xl:flex-row gap-4 justify-between items-center relative select-none p-4 ${screenShake ? 'console-screen-shake' : ''}`}>
      
      {/* Emergency Alert Bar (Phase 13) */}
      {activeAnomaly && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-xl animate-bounce pointer-events-none">
          <div className="bg-red-950/90 backdrop-blur-md border-2 border-red-600 px-4 py-2.5 rounded-lg shadow-[0_0_25px_rgba(239,68,68,0.5)] text-center text-[10px] font-mono font-bold text-red-200">
            <span className="text-red-500 mr-2">🚨 [CRITICAL P0 EVENT]</span>
            警告：机房核心数据库遭受 P0 级故障（CPU 100% 满载），系统濒临崩溃，请立刻前往机房 (18, 15) 终端抢修！
          </div>
        </div>
      )}

      {/* ================== FLOATING HUD PANELS ================== */}

      {/* 1. TOP MENU CAPSULE */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2.5 md:gap-6 px-4 md:px-6 py-2 glass-cockpit rounded-full select-none shadow-2xl transition-all duration-300 pointer-events-auto max-w-[95%]">
        <div className="flex items-center gap-1.5">
          <span className="text-sm md:text-xl animate-pulse">🕹️</span>
          <div className="hidden sm:block">
            <span className="text-[8px] md:text-[10px] font-bold text-slate-500 tracking-wider">OFFICECRAFT AI</span>
          </div>
        </div>

        <div className="hidden md:block w-[1px] h-6 bg-slate-800" />

        {/* Global User status badge */}
        <div className="flex gap-2.5 md:gap-4 font-mono text-xs">
          <div className="hidden sm:block">
            <div className="text-[8px] text-slate-500 uppercase leading-none">Career</div>
            <div className="text-[10px] md:text-xs font-bold text-amber-300 leading-tight">
              {currentCareerId ? (currentCareerId === 'data-analyst' ? '数据' : '开发') : '未选'}
            </div>
          </div>
          <div>
            <div className="text-[8px] text-slate-500 uppercase leading-none">XP</div>
            <div className="text-[10px] md:text-xs font-bold text-cyan-400 leading-tight">{totalXp}</div>
          </div>
          <div>
            <div className="text-[8px] text-slate-500 uppercase leading-none">Rank</div>
            <div className="text-[10px] md:text-xs font-bold text-purple-400 leading-tight">Lvl {Math.floor(totalXp / 100) + 1}</div>
          </div>
        </div>

        <div className="hidden md:block w-[1px] h-6 bg-slate-800" />

        {/* Trigger Outage Debug Button */}
        <button
          onClick={async () => {
            try {
              await triggerAnomaly();
            } catch (err) {
              console.error(err);
            }
          }}
          disabled={!!activeAnomaly}
          className={`px-2.5 py-0.5 md:px-3.5 md:py-1 font-mono text-[8px] md:text-[9px] font-bold rounded-full border transition-all duration-200 ${
            activeAnomaly
              ? 'bg-red-950/60 border-red-700/80 text-red-400 cursor-not-allowed animate-pulse'
              : 'bg-amber-950/45 hover:bg-amber-900/60 border-amber-700/60 text-amber-300 active:scale-95'
          }`}
          title="点击模拟核心数据库 CPU 100% 满载故障"
        >
          {activeAnomaly ? '🚨 故障中' : '⚠️ 模拟故障'}
        </button>

        <div className="hidden md:block w-[1px] h-6 bg-slate-800" />

        {/* Location coordinate & volume controls */}
        <div className="flex items-center gap-2 md:gap-4 text-xs font-mono">
          <div className="flex items-center gap-1 bg-slate-950/60 px-1.5 py-0.5 md:px-2.5 md:py-1 border border-slate-800/80 rounded">
            <span className="text-[8px] md:text-[10px] text-slate-400">POS:</span>
            <span className="font-bold text-cyan-300 text-[10px] md:text-xs">({playerCoords.x},{playerCoords.y})</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 md:px-3 md:py-1 border border-slate-800/80 rounded">
            <button onClick={toggleMute} className="text-xs md:text-sm select-none hover:scale-110 focus:outline-none">
              {isMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="hidden md:block w-14 h-1 rounded bg-slate-800 accent-indigo-500 cursor-pointer border border-slate-700 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Collapsed Left Panel Trigger Badge */}
      {!isLeftPanelOpen && (
        <div className="fixed top-20 left-4 z-30 animate-slide-in-left">
          <button
            onClick={() => {
              setIsLeftPanelOpen(true);
              audioManager.playOpen();
            }}
            className="px-4 py-3 bg-slate-950/85 backdrop-blur-md hover:bg-slate-900/90 border border-cyan-500/40 hover:border-cyan-400 text-left rounded-xl shadow-xl transition-all duration-200 pointer-events-auto flex items-center gap-3 group"
          >
            <div className="relative">
              <span className="text-lg group-hover:scale-110 transition-transform block">🛠️</span>
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400" />
            </div>
            <div>
              <div className="text-[9px] font-bold text-slate-500 font-mono tracking-wider">PILOT CONSOLE</div>
              <div className="text-[11px] font-bold font-mono text-slate-200 flex items-center gap-1">
                主控面板 <span className="text-cyan-400 group-hover:translate-x-0.5 transition-transform">▶</span>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Mobile background backdrop mask when Left panel is open */}
      {isMobile && isLeftPanelOpen && (
        <div 
          className="mobile-drawer-overlay" 
          onClick={() => {
            setIsLeftPanelOpen(false);
            audioManager.playClose();
          }} 
        />
      )}

      {/* 2. LEFT COCKPIT DECK (COLLAPSIBLE) */}
      <div className={`fixed top-20 bottom-4 w-[285px] max-w-[85vw] z-50 md:z-30 flex flex-col gap-4 p-4 glass-cockpit overflow-y-auto pointer-events-auto rounded-xl shadow-2xl select-none transition-all duration-300 ${
        isLeftPanelOpen ? 'left-4 opacity-100 translate-x-0' : '-left-80 opacity-0 -translate-x-full pointer-events-none'
      }`}>
        <div className="border-b border-slate-800/80 pb-2 flex justify-between items-center">
          <div>
            <span className="text-[10px] font-bold text-cyan-400 font-mono tracking-widest uppercase">💾 PILOT DETAILS</span>
            <h3 className="font-bold font-mono text-slate-100 text-sm mt-1">主控面板状态栏</h3>
          </div>
          <button 
            onClick={() => {
              setIsLeftPanelOpen(false);
              audioManager.playClose();
            }} 
            className="px-2 py-1 text-xs font-mono text-slate-400 hover:text-cyan-400 bg-slate-950/50 hover:bg-slate-900 border border-slate-800 rounded transition-all"
            title="折叠主控面板"
          >
            ◀ 折叠
          </button>
        </div>

        {/* User stats overview */}
        <div className="space-y-2 font-mono">
          <div className="flex justify-between items-center bg-slate-950/40 p-2.5 border border-slate-800/50 rounded-lg">
            <span className="text-[10px] text-slate-500">职业段位</span>
            <span className="text-xs font-bold text-amber-300">{currentCareerId === 'data-analyst' ? '初级数据分析顾问' : currentCareerId ? '软件工程实训生' : '待绑定'}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-950/40 p-2.5 border border-slate-800/50 rounded-lg">
            <span className="text-[10px] text-slate-500">已点亮能力</span>
            <span className="text-xs font-bold text-cyan-400">
              {skills.length > 0 ? `${skills.filter((s) => s.unlocked).length} / ${skills.length} 个节点` : '0 个节点'}
            </span>
          </div>
        </div>

        {/* Environment ambient sensor display */}
        <div className="space-y-2 font-mono">
          <span className="text-[9px] font-bold text-slate-500 tracking-wider">💡 空间环境光效传感器</span>
          <div className={`p-3 text-center border font-bold text-xs select-none rounded-lg animate-pulse ${
            ambientTheme === 'quiet-blue' ? 'bg-blue-950/40 border-cyan-800/60 text-cyan-400' :
            ambientTheme === 'alert-red' ? 'bg-red-950/40 border-red-800/60 text-red-400' :
            ambientTheme === 'alert-cyan' ? 'bg-cyan-950/40 border-cyan-700/60 text-cyan-300' :
            ambientTheme === 'celebrate-gold' ? 'bg-amber-950/40 border-amber-800/60 text-amber-400' :
            'bg-slate-900/40 border-slate-800 text-slate-400'
          }`}>
            {ambientTheme === 'quiet-blue' ? '🔵 静谧幽蓝工作环境' :
             ambientTheme === 'alert-red' ? '🚨 警报红色异常主题' :
             ambientTheme === 'alert-cyan' ? '🌀 闪烁冷青协作主题 (网络分区隔离)' :
             ambientTheme === 'celebrate-gold' ? '✨ 金色庆典丰碑主题' :
             '⚪ 经典日光灰度环境'}
          </div>
        </div>

        {/* 📶 物理信道调试器 */}
        <div className={`space-y-2 font-mono border p-3 rounded-lg bg-slate-950/40 transition-all duration-300 ${
          isPacketDroppedFlash ? 'border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'border-slate-800/60'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider">📶 物理信道调试器</span>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${
                networkLoss > 0 || networkLatency >= 300 ? 'bg-red-500 animate-ping' :
                networkLatency === 100 ? 'bg-amber-400 animate-pulse' :
                'bg-emerald-400'
              }`} />
              <span className={`text-[9px] font-bold ${
                networkLoss > 0 || networkLatency >= 300 ? 'text-red-400' :
                networkLatency === 100 ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {networkLoss > 0 || networkLatency >= 300 ? '📶 阻塞 / 丢包' :
                 networkLatency === 100 ? '📶 延迟' :
                 '📶 极佳'}
              </span>
            </div>
          </div>

          {/* Latency Selection */}
          <div className="space-y-1">
            <div className="flex justify-between text-[8px] text-slate-500 uppercase">
              <span>信道延迟 (Latency)</span>
              <span className="text-cyan-400 font-bold">{networkLatency} ms</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0, 100, 300, 800].map((val) => (
                <button
                  key={`lat-${val}`}
                  onClick={() => {
                    setNetworkLatency(val);
                    audioManager.playClick();
                  }}
                  className={`text-[9px] font-bold py-1 rounded transition-all border ${
                    networkLatency === val
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {val === 0 ? '直连' : `${val}ms`}
                </button>
              ))}
            </div>
          </div>

          {/* Packet Loss Selection */}
          <div className="space-y-1">
            <div className="flex justify-between text-[8px] text-slate-500 uppercase">
              <span>人工丢包 (Packet Loss)</span>
              <span className="text-amber-400 font-bold">{(networkLoss * 100).toFixed(0)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0, 0.05, 0.15, 0.35].map((val) => (
                <button
                  key={`loss-${val}`}
                  onClick={() => {
                    setNetworkLoss(val);
                    audioManager.playClick();
                  }}
                  className={`text-[9px] font-bold py-1 rounded transition-all border ${
                    networkLoss === val
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {(val * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>

          {isPacketDroppedFlash && (
            <div className="text-center text-[9px] text-amber-400 font-bold animate-pulse py-0.5 bg-amber-950/40 border border-amber-900/60 rounded">
              ⚠️ WARNING: PACKET DROP OCCURRED!
            </div>
          )}
        </div>

        {/* Active Objectives checklist */}
        <div className="flex-1 flex flex-col justify-between border-t border-slate-800/80 pt-3">
          <div className="space-y-3 font-mono">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">🔥 ACTIVE OBJECTIVES</span>
            
            {localActiveMission ? (
              <div className="space-y-2.5">
                <h4 className="font-bold text-amber-300 text-xs">{localActiveMission.title}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {activeMissionDetails?.background
                    ? `${activeMissionDetails.background.substring(0, 75)}...`
                    : '正在载入实训任务背景细节...'}
                </p>
                
                {/* Simulated checklist */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                    <span>✓</span> <span className="line-through">理解项目数据需求</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-300">
                    <span className="text-cyan-400 animate-pulse">⚙️</span> <span>调用 Pandas fillna 及 groupby 聚合</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>☐</span> <span>运行单元测试通过编译</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/40 space-y-1.5">
                  <button onClick={() => openBookcasePanel(BOOKCASES.pandas_library)} className="w-full py-1 text-center bg-emerald-950/50 hover:bg-emerald-900/50 border border-emerald-800/50 text-[10px] text-emerald-300 rounded">
                    📖 物理资料书架 (RAG)
                  </button>
                  <button onClick={() => openOverlay('sandbox')} className="w-full py-1 text-center bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-800/50 text-[10px] text-cyan-300 font-bold animate-pulse rounded">
                    💻 打开 splitscreen 编译沙盒
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-slate-800/80 p-4 text-center text-slate-500 text-[11px] leading-5 rounded-lg">
                🚨 暂无在研任务，请走到物理大厅接待处绑定职业，或走到主管高凌(x=15, y=6)工位领取任务。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. FLOATING FAST-TRAVEL NAVIGATION (FAB) */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-auto select-none font-mono">
        {/* Floating Nav Menu List */}
        <div className={`flex flex-col gap-2 transition-all duration-300 origin-bottom ${
          isNavOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-75 opacity-0 translate-y-8 pointer-events-none'
        }`}>
          <div className="bg-slate-950/90 border border-slate-800/80 p-3 rounded-2xl shadow-2xl flex flex-col gap-1.5 w-[220px] backdrop-blur-md">
            <span className="text-[8px] font-bold text-amber-500 tracking-widest uppercase mb-1 border-b border-slate-800/60 pb-1 flex items-center justify-between">
              <span>🚀 FAST-TRAVEL DOCK</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            </span>

            <button onClick={() => { openOverlay('lobby'); setIsNavOpen(false); }} className="w-full py-1.5 px-2.5 bg-slate-900/60 hover:bg-amber-950/30 border border-slate-800/40 hover:border-amber-600/70 rounded-lg text-left text-[11px] text-slate-300 flex justify-between items-center transition-all group">
              <span>💼 办事大厅 (Lobby)</span>
              <span className="text-[9px] text-slate-500 group-hover:text-amber-400">👉</span>
            </button>

            <button onClick={() => { openOverlay('quests'); setIsNavOpen(false); }} className="w-full py-1.5 px-2.5 bg-slate-900/60 hover:bg-blue-950/30 border border-slate-800/40 hover:border-blue-600/70 rounded-lg text-left text-[11px] text-slate-300 flex justify-between items-center transition-all group">
              <span>📋 任务工位 (Quests)</span>
              <span className="text-[9px] text-slate-500 group-hover:text-blue-400">👉</span>
            </button>

            <button onClick={() => { openOverlay('portfolio'); setIsNavOpen(false); }} className="w-full py-1.5 px-2.5 bg-slate-900/60 hover:bg-purple-950/30 border border-slate-800/40 hover:border-purple-600/70 rounded-lg text-left text-[11px] text-slate-300 flex justify-between items-center transition-all group">
              <span>📊 成长档案 (Portfolio)</span>
              <span className="text-[9px] text-slate-500 group-hover:text-purple-400">👉</span>
            </button>

            <button onClick={() => { openOverlay('skills'); setIsNavOpen(false); }} className="w-full py-1.5 px-2.5 bg-slate-900/60 hover:bg-cyan-950/30 border border-slate-800/40 hover:border-cyan-600/70 rounded-lg text-left text-[11px] text-slate-300 flex justify-between items-center transition-all group">
              <span>🌟 技能星图 (Skill Tree)</span>
              <span className="text-[9px] text-slate-500 group-hover:text-cyan-400">👉</span>
            </button>

            <button onClick={() => { openOverlay('community'); setIsNavOpen(false); }} className="w-full py-1.5 px-2.5 bg-slate-900/60 hover:bg-emerald-950/30 border border-slate-800/40 hover:border-emerald-600/70 rounded-lg text-left text-[11px] text-slate-300 flex justify-between items-center transition-all group">
              <span>💬 交流白板 (Community)</span>
              <span className="text-[9px] text-slate-500 group-hover:text-emerald-400">👉</span>
            </button>

            <button onClick={() => { openBookcasePanel(BOOKCASES.pandas_library); setIsNavOpen(false); }} className="w-full py-1.5 px-2.5 bg-slate-900/60 hover:bg-teal-950/30 border border-slate-800/40 hover:border-teal-600/70 rounded-lg text-left text-[11px] text-slate-300 flex justify-between items-center transition-all group">
              <span>🏛️ 物理资料库 (Archive)</span>
              <span className="text-[9px] text-slate-500 group-hover:text-teal-400">👉</span>
            </button>
          </div>
        </div>

        {/* Main Circular Trigger Button */}
        <button
          onClick={() => {
            setIsNavOpen(!isNavOpen);
            audioManager.playOpen();
          }}
          className={`h-14 px-4 rounded-full flex items-center gap-2 font-bold shadow-2xl border transition-all duration-300 ${
            isNavOpen
              ? 'bg-slate-900 border-amber-500 text-amber-400 scale-95 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
              : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-amber-500 hover:shadow-[0_0_15px_rgba(245,158,11,0.25)]'
          }`}
          title="飞渡导航快捷栏"
        >
          <span className={`text-xl transition-transform duration-300 ${isNavOpen ? 'rotate-45' : 'rotate-0'}`}>🚀</span>
          <span className="text-xs tracking-wider">飞渡导航</span>
          <span className="text-[9px] text-slate-500 bg-slate-900 border border-slate-800/80 px-1.5 py-0.5 rounded-full ml-1">
            {isNavOpen ? '关闭' : '传送'}
          </span>
        </button>
      </div>

      {/* ================== GLASSMORPHIC SPATIAL CHAT HUD ================== */}
      <div 
        className={`fixed bottom-6 z-40 w-[92vw] max-w-[320px] transition-all duration-300 font-mono select-none ${
          isMobile 
            ? 'left-1/2 -translate-x-1/2 bottom-[140px]' 
            : isLeftPanelOpen ? 'left-[315px]' : 'left-6'
        }`}
      >
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="bg-slate-950/60 border-b border-slate-800/50 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm animate-pulse">💬</span>
              <div>
                <span className="text-[9px] font-bold text-slate-500 tracking-wider">SPATIAL CHAT</span>
                <div className="text-[10px] text-cyan-400 font-bold flex items-center gap-1 leading-none mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  <span>{1 + Object.keys(remotePlayers).length} 玩家在线</span>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => {
                setIsSpatialChatCollapsed(!isSpatialChatCollapsed);
                audioManager.playOpen();
              }}
              className="text-xs text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded transition-colors"
            >
              {isSpatialChatCollapsed ? '[展开]' : '[折叠]'}
            </button>
          </div>

          {/* Chat Messages Feed & Input */}
          {!isSpatialChatCollapsed && (
            <>
              {/* Message scroll list */}
              <div className="h-44 overflow-y-auto p-3 space-y-2 scrollbar-thin">
                {spatialChatMessages.length === 0 ? (
                  <div className="text-[10px] text-slate-500 italic text-center py-6">
                    暂无聊天消息。键盘按 T 键或直接在下方输入聊天内容
                  </div>
                ) : (
                  spatialChatMessages.map((msg) => {
                    const isMe = msg.playerId === 'local' || msg.playerId === getPlayerId();
                    
                    let hash = 0;
                    for (let i = 0; i < msg.playerId.length; i++) {
                      hash = msg.playerId.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    const hue = Math.abs(hash) % 360;
                    const shortId = msg.playerId.substring(0, 5);

                    return (
                      <div key={msg.id} className="text-xs flex flex-col gap-0.5">
                        <div className="flex items-center justify-between text-[8px] text-slate-500">
                          <span 
                            className={`font-bold ${isMe ? 'text-cyan-400' : 'text-indigo-400'}`}
                            style={isMe ? {} : { filter: `hue-rotate(${hue}deg)` }}
                          >
                            {isMe ? '你 (You)' : `Guest (${shortId})`}
                          </span>
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                        <div 
                          className={`p-1.5 rounded-lg border text-[11px] break-words ${
                            isMe 
                              ? 'bg-cyan-950/20 border-cyan-800/40 text-cyan-200' 
                              : 'bg-indigo-950/10 border-indigo-950/40 text-indigo-200'
                          }`}
                          style={isMe ? {} : { filter: `hue-rotate(${hue}deg)` }}
                        >
                          {msg.message}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={spatialChatEndRef} />
              </div>

              {/* Chat Input Form */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!spatialChatInput.trim()) return;
                  sendChatMessage(spatialChatInput.trim());
                  setSpatialChatInput('');
                }}
                className="p-2 border-t border-slate-800/50 flex gap-1.5 bg-slate-950/40"
              >
                <input
                  ref={spatialChatInputRef}
                  type="text"
                  value={spatialChatInput}
                  onChange={(e) => setSpatialChatInput(e.target.value)}
                  onFocus={() => setLocalTyping(true)}
                  onBlur={() => setLocalTyping(false)}
                  placeholder="说点什么... (Enter 发送)"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-200 px-2.5 py-1.5 focus:outline-none focus:border-cyan-500/80 transition-colors"
                  maxLength={100}
                />
                <button
                  type="submit"
                  disabled={!spatialChatInput.trim()}
                  className="px-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-lg transition-colors"
                >
                  发送
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* 4. FLOATING PROXIMITY SENSOR RADAR TIP */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-30 font-mono transition-all duration-300 ${
        showSensorHud ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'
      }`}>
        <div className="bg-slate-950/90 border-2 border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.3)] px-5 py-3 rounded-full flex items-center gap-3 select-none backdrop-blur-md">
          <div className="relative flex items-center justify-center">
            <span className="text-base animate-pulse">📡</span>
            <span className="absolute w-4 h-4 rounded-full border border-cyan-400 animate-ping opacity-60" />
          </div>
          
          <div className="text-xs text-slate-200">
            {isNearLobbyDesk && (
              <span className="flex items-center gap-2"><strong className="text-amber-400">大厅前台：</strong> 靠近大厅前台，按 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Enter</kbd> 或 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Space</kbd> 绑定职业。</span>
            )}
            {isNearDevWorkstation && (
              <span className="flex items-center gap-2"><strong className="text-blue-400">研发工位：</strong> 靠近研发工位，按 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Enter</kbd> 或 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Space</kbd> 展开任务列表。</span>
            )}
            {isNearArchiveBookshelf && (
              <span className="flex items-center gap-2"><strong className="text-emerald-400">物理资料库：</strong> 靠近物理资料库，按 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Enter</kbd> 或 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Space</kbd> 开始 RAG 检索。</span>
            )}
            {isNearSkillTerminal && (
              <span className="flex items-center gap-2"><strong className="text-cyan-400">技能终端：</strong> 靠近技能星图终端，按 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Enter</kbd> 或 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Space</kbd> 进入量子技能星图！</span>
            )}
            {isAdjacentToTable && (
              <span className="flex items-center gap-2"><strong className="text-indigo-400">会议圆桌：</strong> 靠近会议圆桌，按 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Enter</kbd> 或 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Space</kbd> 开启多智能体仲裁晨会！</span>
            )}
            {isNearCoopWhiteboard && (
              <span className="flex items-center gap-2"><strong className="text-violet-400">协作白板：</strong> 靠近会议室协作白板，按 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Enter</kbd> 或 <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white">Space</kbd> 开启同业代码评审。</span>
            )}
          </div>
        </div>
      </div>

      {/* ================== CENTRAL 2D MAP GRID PANEL ================== */}
      <div className="w-full h-full flex-1 flex items-center justify-center relative overflow-hidden">
        <div className="origin-center transition-all duration-300 select-none" style={{ transform: `scale(${mapScale})` }}>
          
          {/* Main RPG grid container */}
          <div className="relative w-[816px] h-[816px] border-8 border-slate-800 bg-slate-950 p-1 overflow-hidden shadow-2xl crt-screen">
            
            {/* Split floors */}
            <div className="absolute inset-y-0 left-0 w-[384px] pixel-slate-floor z-0 pointer-events-none" />
            <div className="absolute inset-y-0 left-[416px] right-0 pixel-wood-floor z-0 pointer-events-none" />
            <div className="absolute inset-y-0 left-[384px] w-[32px] bg-[#492e1f] z-0 pointer-events-none" />

            {/* Grid cell lines overlay */}
            <div className="absolute inset-0 bg-pixel-grid opacity-10 pointer-events-none z-5" />

            {/* Rug under Conference Table */}
            <div
              className="absolute top-0 left-0 w-[128px] h-[128px] pixel-patterned-rug z-5 pointer-events-none"
              style={{ transform: `translate3d(512px, 160px, 0)` }}
            />

            {/* Green sofas */}
            <div
              className="absolute top-0 left-0 w-[64px] h-[32px] pixel-green-sofa z-10 pointer-events-none"
              style={{ transform: `translate3d(64px, 64px, 0)` }}
            />
            <div
              className="absolute top-0 left-0 w-[64px] h-[32px] pixel-green-sofa z-10 pointer-events-none"
              style={{ transform: `translate3d(672px, 512px, 0)` }}
            />

            {/* Decorative plants */}
            <div
              className="absolute top-0 left-0 w-[32px] h-[32px] pixel-potted-plant z-10 pointer-events-none"
              style={{ transform: `translate3d(32px, 32px, 0)` }}
            />
            <div
              className="absolute top-0 left-0 w-[32px] h-[32px] pixel-potted-plant z-10 pointer-events-none"
              style={{ transform: `translate3d(736px, 32px, 0)` }}
            />

            {/* Top-left boxes stack */}
            <div
              className="absolute top-0 left-0 w-[48px] h-[48px] pixel-boxes z-10 pointer-events-none"
              style={{ transform: `translate3d(32px, 224px, 0)` }}
            />
            <div
              className="absolute top-0 left-0 w-[32px] h-[32px] pixel-toolboxes z-10 pointer-events-none"
              style={{ transform: `translate3d(32px, 288px, 0)` }}
            />

            {/* Lobby reception desk */}
            <div
              className="absolute top-0 left-0 w-[160px] h-[32px] pixel-reception-desk flex items-center justify-center font-bold text-[9px] tracking-tight whitespace-nowrap text-amber-200 z-10 border-2 border-amber-950/20 shadow-md"
              style={{ transform: `translate3d(96px, 96px, 0)` }}
            >
              💼 大厅前台接待处 (Lobby Desk)
            </div>

            {/* Dev workstations */}
            <div
              className="absolute top-0 left-0 w-[224px] h-[32px] pixel-dev-desk flex items-center justify-center font-bold text-[9px] tracking-tight whitespace-nowrap text-slate-100 z-10"
              style={{ transform: `translate3d(64px, 448px, 0)` }}
            >
              💻 研发工位 A ( G-5 Code Console)
            </div>
            <div
              className="absolute top-0 left-0 w-[224px] h-[32px] pixel-dev-desk flex items-center justify-center font-bold text-[9px] tracking-tight whitespace-nowrap text-slate-100 z-10"
              style={{ transform: `translate3d(64px, 544px, 0)` }}
            >
              💻 研发工位 B (Pandas Analytics Engine)
            </div>

            {/* Partition divider walls */}
            {Array.from({ length: 25 }).map((_, y) => {
              if (y !== 5 && y !== 16) {
                return (
                  <div
                    key={`v-wall-${y}`}
                    className="absolute top-0 left-0 w-[32px] h-[32px] pixel-wood-wall z-10"
                    style={{ transform: `translate3d(${12 * 32}px, ${y * 32}px, 0)` }}
                  />
                );
              }
              return null;
            })}

            {/* Horizontal left slate divider y=10 */}
            {Array.from({ length: 12 }).map((_, x) => {
              if (x !== 4) {
                return (
                  <div
                    key={`h-left-wall-${x}`}
                    className="absolute top-0 left-0 w-[32px] h-[32px] pixel-slate-wall z-10"
                    style={{ transform: `translate3d(${x * 32}px, ${10 * 32}px, 0)` }}
                  />
                );
              }
              return null;
            })}

            {/* Horizontal right divider y=12 */}
            {Array.from({ length: 12 }).map((_, i) => {
              const x = i + 13;
              if (x !== 18) {
                return (
                  <div
                    key={`h-right-wall-${x}`}
                    className="absolute top-0 left-0 w-[32px] h-[32px] pixel-wood-wall z-10"
                    style={{ transform: `translate3d(${x * 32}px, ${12 * 32}px, 0)` }}
                  />
                );
              }
              return null;
            })}

            {/* RAG Bookcases */}
            {Object.values(BOOKCASES).map((bookcase) => (
              <div
                key={bookcase.id}
                onClick={() => openBookcasePanel(bookcase)}
                className="absolute top-0 left-0 w-[32px] h-[32px] pixel-bookshelf hover:scale-110 active:scale-95 transition-all duration-100 flex items-center justify-center text-sm cursor-pointer z-20 group"
                style={{ transform: `translate3d(${bookcase.coords.x * 32}px, ${bookcase.coords.y * 32}px, 0)` }}
                title="点击查阅物理书架 (RAG)"
              >
                <div className="absolute bottom-8 scale-0 group-hover:scale-100 transition-all bg-slate-900/95 border border-emerald-500 text-[10px] text-emerald-300 font-mono py-1 px-2 whitespace-nowrap rounded shadow-lg pointer-events-none z-30">
                  {bookcase.name}
                </div>
              </div>
            ))}

            {/* Co-Op Whiteboard */}
            <div
              onClick={() => {
                if (isNearCoopWhiteboard) {
                  openCoopWhiteboard();
                  setCurrentTerminalStationId('station_whiteboard');
                  acquireStationLock('station_whiteboard');
                }
              }}
              className="absolute top-0 left-0 w-[32px] h-[32px] pixel-whiteboard hover:scale-105 active:scale-95 transition-all duration-100 flex flex-col items-center justify-between p-[2px] cursor-pointer z-20 group"
              style={{ transform: `translate3d(${15 * 32}px, ${5 * 32}px, 0)` }}
              title="点击打开协作白板与代码评审 (Co-Op Whiteboard)"
            >
              {/* Floating Proximity Prompt Bubble */}
              {isNearCoopWhiteboard && (
                <div className="absolute bottom-8 flex flex-col items-center animate-bounce z-30">
                  <div className="bg-slate-900/95 border-2 border-violet-500 text-[9px] font-bold text-violet-300 font-mono py-1 px-1.5 rounded whitespace-nowrap shadow-md">
                    [Space] 协作白板
                  </div>
                  <div className="w-1.5 h-1.5 bg-violet-500 rotate-45 -mt-1 border-r border-b border-violet-500" />
                </div>
              )}
              
              {/* Whiteboard content drawings */}
              <div className="w-full h-full flex flex-col justify-between p-1 select-none pointer-events-none">
                <div className="text-[7px] text-violet-700/80 font-bold font-mono text-center leading-none tracking-tighter">CO-OP</div>
                <div className="flex justify-center gap-1">
                  <div className="w-1.5 h-1 bg-violet-500/70 rounded-full animate-pulse" />
                  <div className="w-2 h-1 bg-cyan-500/70 rounded-full" />
                </div>
              </div>

              {/* Hover Tooltip */}
              <div className="absolute top-8 scale-0 group-hover:scale-100 transition-all bg-slate-900/90 border border-slate-700 text-[9px] text-slate-300 py-0.5 px-2 rounded whitespace-nowrap pointer-events-none z-30">
                👥 协作白板 (Co-Op Whiteboard)
              </div>
            </div>

            {/* Interactive Skill Matrix Server Terminal */}
            <div
              onClick={() => activeAnomaly ? openOverlay('recovery') : openOverlay('skills')}
              className={`absolute top-0 left-0 w-[32px] h-[32px] hover:scale-105 active:scale-95 transition-all duration-100 flex flex-col items-center justify-between p-[2px] cursor-pointer z-20 group ${
                activeAnomaly 
                  ? (activeAnomaly.anomaly_id === 'service_breaker_trip' ? 'pixel-server-rack-breaker-trip' : 'pixel-server-rack-anomaly')
                  : 'pixel-server-rack'
              }`}
              style={{ transform: `translate3d(${SKILL_TERMINAL.coords.x * 32}px, ${SKILL_TERMINAL.coords.y * 32}px, 0)` }}
            >
              {/* Floating Proximity Prompt Bubble */}
              {isNearSkillTerminal && (
                <div className="absolute bottom-8 flex flex-col items-center animate-bounce z-30">
                  <div className={`bg-slate-900/95 border-2 text-[9px] font-bold font-mono py-1 px-1.5 rounded whitespace-nowrap shadow-md ${
                    activeAnomaly 
                      ? (activeAnomaly.anomaly_id === 'service_breaker_trip' ? 'border-orange-500 text-orange-300' : 'border-red-500 text-red-300')
                      : 'border-cyan-500 text-cyan-300'
                  }`}>
                    {activeAnomaly 
                      ? (activeAnomaly.anomaly_id === 'service_breaker_trip' ? '[Space] 熔断修复！' : '[Space] 故障抢修！')
                      : '[Space] 技能星图'
                    }
                  </div>
                  <div className={`w-1.5 h-1.5 rotate-45 -mt-1 border-r border-b ${
                    activeAnomaly 
                      ? (activeAnomaly.anomaly_id === 'service_breaker_trip' ? 'bg-orange-500 border-orange-500' : 'bg-red-500 border-red-500 animate-pulse')
                      : 'bg-cyan-500 border-cyan-500'
                  }`} />
                </div>
              )}

              {/* Pulsing LEDs indicators */}
              <div className="w-[28px] h-full flex flex-col justify-around py-0.5 pointer-events-none">
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className={`w-[3px] h-full animate-pulse ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-cyan-400'}`} />
                  <div className={`w-[3px] h-full ${activeAnomaly ? 'bg-red-500/50' : 'bg-cyan-400/50'}`} />
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className={`w-[3px] h-full animate-pulse delay-300 ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-emerald-500'}`} />
                </div>
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className={`w-[3px] h-full animate-pulse delay-100 ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-cyan-400'}`} />
                  <div className={`w-[3px] h-full animate-pulse delay-500 ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-emerald-500'}`} />
                  <div className="w-[3px] h-full bg-slate-800" />
                </div>
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className={`w-[3px] h-full animate-pulse delay-200 ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-cyan-400'}`} />
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className={`w-[3px] h-full animate-pulse delay-700 ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-cyan-400'}`} />
                  <div className={`w-[3px] h-full animate-pulse delay-150 ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-emerald-500'}`} />
                </div>
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className={`w-[3px] h-full animate-pulse delay-400 ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-emerald-500'}`} />
                  <div className={`w-[3px] h-full animate-pulse ${activeAnomaly ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : 'bg-cyan-400'}`} />
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className="w-[3px] h-full bg-slate-800" />
                </div>
              </div>

              {/* Hover Tooltip */}
              <div className="absolute top-8 scale-0 group-hover:scale-100 transition-all bg-slate-900/90 border border-slate-700 text-[9px] text-slate-300 py-0.5 px-2 rounded whitespace-nowrap pointer-events-none z-30">
                {activeAnomaly ? '🚨 核心数据库 core_db_cpu_overload 严重过载' : SKILL_TERMINAL.name}
              </div>
            </div>

            {/* Conference roundtable */}
            <div
              onClick={startTeamMeetingModal}
              className={`absolute top-0 left-0 w-[64px] h-[64px] pixel-meeting-table rounded flex flex-col items-center justify-center font-bold text-[10px] text-amber-100 z-15 transition-all duration-500 border-4 cursor-pointer hover:scale-105 active:scale-95 ${
                unresolvedConflict
                  ? 'border-yellow-400 shadow-[0_0_25px_rgba(234,179,8,0.7)] animate-pulse'
                  : 'border-[#513123] hover:border-[#cf8754]'
              }`}
              style={{ transform: `translate3d(544px, 192px, 0)` }}
            >
              <span className="text-lg">{unresolvedConflict ? '⚠️' : '🪴'}</span>
              <span className="text-[8px] font-mono tracking-wide uppercase">晨会圆桌</span>
            </div>

            {/* NPCs characters spawn */}
            {Object.values(NPC_INFO).map((npc) => {
              let coords = npc.id === 'mentor_ling' ? { x: 15, y: 6 } : npc.id === 'pm_amy' ? { x: 18, y: 5 } : { x: 20, y: 20 };
              if (npc.id === 'mentor_ling' && isGaoLingAutopilotActive) {
                coords = { x: 11, y: 17 };
              }
              const isTargetNear = interactiveNpcId === npc.id;
              return (
                <div
                  key={npc.id}
                  onClick={() => startConversation(npc)}
                  className={`absolute top-0 left-0 w-[32px] h-[32px] flex items-center justify-center text-xl cursor-pointer z-20 select-none group ${
                    npc.id === 'mentor_ling' && isGaoLingAutopilotActive ? 'transition-all duration-[4000ms] ease-in-out' : ''
                  }`}
                  style={{ transform: `translate3d(${coords.x * 32}px, ${coords.y * 32}px, 0)` }}
                >
                  {/* Dialogue bubble for Gao Ling Autopilot */}
                  {npc.id === 'mentor_ling' && isGaoLingAutopilotActive && gaoLingStep !== 'idle' && (
                    <div className="absolute bottom-[48px] flex flex-col items-center z-50 animate-speech-bubble pointer-events-none">
                      <div className="bg-slate-950/95 border-2 border-cyan-400 text-[9px] text-cyan-200 font-mono py-1 px-2 rounded-md shadow-2xl w-[190px] text-center break-words backdrop-blur-sm relative">
                        {gaoLingStep === 'active' && '⚠️ 分布式网关发生网络隔离故障！我先赶往工位 B (11,17) 修复备份共识，你们快去机房 (18,15) 终端并网协作！'}
                        {gaoLingStep === 'locked' && '🔌 我已在工位 B 独占并请求校验同步！机房核心网端必须同时下发索引重建，双端闭环即可消退分区故障！'}
                        {gaoLingStep === 'done' && '✅ 我已成功在备份端下发数据！等候机房控制端索引同步，双端并网即可消除这次大故障！'}
                      </div>
                      <div className="w-1.5 h-1.5 bg-slate-950 border-r-2 border-b-2 border-cyan-400 rotate-45 -mt-[4px] relative z-10" />
                    </div>
                  )}

                  {/* Character shadow */}
                  <div className="absolute -bottom-1.5 w-6 h-2 bg-black/45 rounded-full blur-[1px] z-10 pointer-events-none" />
                  {isTargetNear && (
                    <div className="absolute bottom-8 flex flex-col items-center animate-bounce z-30">
                      <div className="bg-slate-900/95 border-2 border-amber-500 text-[9px] font-bold text-amber-300 font-mono py-1 px-1.5 rounded whitespace-nowrap shadow-md">
                        [Space] 对话
                      </div>
                      <div className="w-1.5 h-1.5 bg-amber-500 rotate-45 -mt-1 border-r border-b border-amber-500" />
                    </div>
                  )}
                  <div className={`absolute inset-0 w-8 h-8 rounded-full border border-dashed animate-spin ${isTargetNear ? 'border-amber-500 opacity-60' : 'border-slate-700 opacity-35'}`} />
                  <span className="relative z-10 text-2xl filter drop-shadow-md group-hover:scale-110 transition-transform">{npc.emoji}</span>
                  <div className="absolute top-8 scale-0 group-hover:scale-100 transition-all bg-slate-900/90 border border-slate-700 text-[9px] text-slate-300 py-0.5 px-2 rounded whitespace-nowrap pointer-events-none">
                    {npc.name}
                  </div>
                </div>
              );
            })}

            {/* Player Avatar */}
            <div
              className="absolute top-0 left-0 w-[32px] h-[32px] flex items-center justify-center z-30 transition-all duration-100 select-none pointer-events-none"
              style={{ transform: `translate3d(${playerCoords.x * 32}px, ${playerCoords.y * 32}px, 0)` }}
            >
              {/* Character shadow */}
              {!isSitting && (
                <div className="absolute -bottom-1.5 w-6 h-2 bg-black/45 rounded-full blur-[1px] z-10 pointer-events-none" />
              )}
              <div className="absolute w-8 h-8 rounded-full bg-cyan-500/20 blur-xs scale-110 animate-ping" />
              <div className="absolute w-8 h-8 rounded-full border-2 border-cyan-400/40 scale-100" />
              
              <div className="absolute -top-6 bg-slate-950/90 border border-cyan-500/80 text-[8px] text-cyan-300 py-0.5 px-1.5 font-mono rounded select-none whitespace-nowrap z-30">
                You
              </div>

              {localLastMessage && localLastMessageTime && (Date.now() - localLastMessageTime < 5000) && (
                <div key={localLastMessageTime} className="absolute bottom-[48px] flex flex-col items-center z-50 animate-speech-bubble pointer-events-none">
                  <div className="bg-slate-950/95 border-2 border-cyan-400 text-[10px] text-cyan-200 font-mono py-1 px-2 rounded-md shadow-2xl max-w-[140px] text-center break-words backdrop-blur-sm relative">
                    {localLastMessage}
                  </div>
                  <div className="w-1.5 h-1.5 bg-slate-950 border-r-2 border-b-2 border-cyan-400 rotate-45 -mt-[4px] relative z-10" />
                </div>
              )}

              <div 
                className="pixel-char-sprite" 
                data-direction={facingDirection} 
                data-walking={isWalking ? "true" : "false"}
                data-sitting={isSitting ? "true" : "false"}
                data-reading={isReading ? "true" : "false"}
                data-working={isWorkingLaptop ? "true" : "false"}
                data-talking={isTalking ? "true" : "false"}
              >
                <div className="pixel-char-hair" />
                <div className="pixel-char-face" />
                <div className="pixel-char-body">
                  <div className="pixel-char-arm-l" />
                  <div className="pixel-char-arm-r" />
                  <div className="pixel-char-bag" />
                  <div className="pixel-char-book" />
                  <div className="pixel-char-laptop" />
                </div>
              </div>
            </div>

            {/* Remote Players */}
            {Object.entries(remotePlayers).map(([id, p]) => {
              let hash = 0;
              for (let i = 0; i < id.length; i++) {
                hash = id.charCodeAt(i) + ((hash << 5) - hash);
              }
              const hue = Math.abs(hash) % 360;
              const shortId = id.substring(0, 5);

              // Derive action stance states for remote players dynamically based on coordinates and status
              const remoteIsSitting = (p.y === 2 && (p.x === 2 || p.x === 3)) || (p.y === 16 && (p.x === 21 || p.x === 22));
              const remoteIsNearDevWorkstation = (p.y >= 13 && p.y <= 15 && p.x >= 2 && p.x <= 8) || (p.y >= 16 && p.y <= 18 && p.x >= 2 && p.x <= 8);
              const remoteIsWorkingLaptop = p.isTyping && remoteIsNearDevWorkstation;
              const remoteIsTalking = p.isTyping && !remoteIsNearDevWorkstation;
              const remoteIsReading = (
                Math.abs(p.x - BOOKCASES.pandas_library.coords.x) <= 1 && Math.abs(p.y - BOOKCASES.pandas_library.coords.y) <= 1
              ) || (
                Math.abs(p.x - BOOKCASES.software_design_rules.coords.x) <= 1 && Math.abs(p.y - BOOKCASES.software_design_rules.coords.y) <= 1
              );

              return (
                <div
                  key={id}
                  className="absolute top-0 left-0 w-[32px] h-[32px] flex items-center justify-center z-30 transition-all duration-100 select-none pointer-events-none"
                  style={{ transform: `translate3d(${p.x * 32}px, ${p.y * 32}px, 0)` }}
                >
                  {/* Character shadow */}
                  {!remoteIsSitting && (
                    <div className="absolute -bottom-1.5 w-6 h-2 bg-black/45 rounded-full blur-[1px] z-10 pointer-events-none" />
                  )}
                  <div className="absolute w-8 h-8 rounded-full bg-indigo-500/20 blur-xs scale-110 animate-ping" style={{ filter: `hue-rotate(${hue}deg)` }} />
                  <div className="absolute w-8 h-8 rounded-full border-2 border-indigo-400/40 scale-100" style={{ filter: `hue-rotate(${hue}deg)` }} />
                  
                  <div className="absolute -top-6 bg-slate-950/90 border border-slate-700 text-[8px] text-slate-300 py-0.5 px-1.5 font-mono rounded select-none whitespace-nowrap">
                    Guest ({shortId})
                  </div>

                  {p.lastMessage && p.lastMessageTime && (Date.now() - p.lastMessageTime < 5000) && (
                    <div key={p.lastMessageTime} className="absolute bottom-[48px] flex flex-col items-center z-50 animate-speech-bubble pointer-events-none">
                      <div className="bg-slate-950/95 border-2 border-indigo-400 text-[10px] text-indigo-200 font-mono py-1 px-2 rounded-md shadow-2xl max-w-[140px] text-center break-words backdrop-blur-sm relative" style={{ filter: `hue-rotate(${hue}deg)` }}>
                        {p.lastMessage}
                      </div>
                      <div className="w-1.5 h-1.5 bg-slate-950 border-r-2 border-b-2 border-indigo-400 rotate-45 -mt-[4px] relative z-10" style={{ filter: `hue-rotate(${hue}deg)` }} />
                    </div>
                  )}

                  <div 
                    className="pixel-char-sprite" 
                    data-direction={p.facingDirection} 
                    data-walking={p.isWalking ? "true" : "false"}
                    data-sitting={remoteIsSitting ? "true" : "false"}
                    data-reading={remoteIsReading ? "true" : "false"}
                    data-working={remoteIsWorkingLaptop ? "true" : "false"}
                    data-talking={remoteIsTalking ? "true" : "false"}
                    style={{ filter: `hue-rotate(${hue}deg)` }}
                  >
                    <div className="pixel-char-hair" />
                    <div className="pixel-char-face" />
                    <div className="pixel-char-body">
                      <div className="pixel-char-arm-l" />
                      <div className="pixel-char-arm-r" />
                      <div className="pixel-char-bag" />
                      <div className="pixel-char-book" />
                      <div className="pixel-char-laptop" />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Work Workstations Padlocks (🔒) */}
            {[
              { id: 'station_mainframe', x: 18, y: 15, name: '机柜' },
              { id: 'station_whiteboard', x: 15, y: 5, name: '白板' },
              { id: 'station_dev_b', x: 11, y: 17, name: '工位B' },
            ].map((station) => {
              const lockInfo = activeLocks[station.id];
              if (!lockInfo) return null;
              
              const holder = lockInfo.holder_id;
              const shortHolder = holder.length > 5 ? holder.substring(0, 5) : holder;
              
              return (
                <div
                  key={`padlock-${station.id}`}
                  className="absolute top-0 left-0 w-[32px] h-[32px] flex flex-col items-center justify-center z-25 pointer-events-auto select-none"
                  style={{ transform: `translate3d(${station.x * 32}px, ${station.y * 32}px, 0)` }}
                >
                  <div className="absolute -top-7 flex flex-col items-center z-30 animate-bounce">
                    <div className="bg-red-950/95 border border-red-500 text-[8px] font-bold text-red-400 font-mono py-0.5 px-1 rounded whitespace-nowrap shadow-md flex items-center gap-1">
                      <span>🔒</span>
                      <span>{shortHolder}</span>
                    </div>
                    <div className="w-1 h-1 bg-red-500 rotate-45 -mt-0.5" />
                  </div>
                  <div className="absolute inset-0 border-2 border-red-500/60 rounded bg-red-500/10 animate-pulse pointer-events-none" />
                </div>
              );
            })}

            {/* Dynamic ambient lighting/spotlight mask (Phase 10) */}
            <div 
              className="absolute inset-0 pointer-events-none z-25 transition-all duration-300 mix-blend-multiply"
              style={{
                background: `radial-gradient(circle 180px at ${playerCoords.x * 32 + 16}px ${playerCoords.y * 32 + 16}px, ${
                  ambientTheme === 'quiet-blue' ? 'rgba(186, 230, 253, 0.25) 0%, rgba(30, 41, 59, 0.65) 60%, rgba(15, 23, 42, 0.92) 100%' :
                  ambientTheme === 'alert-orange' ? 'rgba(254, 215, 170, 0.22) 0%, rgba(249, 115, 22, 0.65) 50%, rgba(15, 23, 42, 0.95) 100%' :
                  ambientTheme === 'alert-red' ? 'rgba(254, 202, 202, 0.2) 0%, rgba(127, 29, 29, 0.7) 50%, rgba(15, 23, 42, 0.95) 100%' :
                  ambientTheme === 'alert-cyan' ? 'rgba(207, 250, 254, 0.22) 0%, rgba(6, 182, 212, 0.65) 50%, rgba(15, 23, 42, 0.95) 100%' :
                  ambientTheme === 'celebrate-gold' ? 'rgba(254, 243, 199, 0.3) 0%, rgba(120, 53, 4, 0.6) 60%, rgba(15, 23, 42, 0.9) 100%' :
                  'rgba(255, 255, 240, 0.15) 0%, rgba(30, 41, 59, 0.5) 65%, rgba(15, 23, 42, 0.88) 100%'
                })`
              }}
            />

            {/* Ambient Overlays (Prompt-to-Light) */}
            {activeAnomaly && (
              activeAnomaly.anomaly_id === 'service_breaker_trip' ? (
                <div className="ambient-theme-alert-orange" />
              ) : (
                <div className="ambient-theme-alert-red" />
              )
            )}
            {ambientTheme === 'quiet-blue' && (
              <div className="absolute inset-0 bg-blue-950/15 mix-blend-color-dodge backdrop-brightness-95 pointer-events-none z-10 animate-pulse border-8 border-cyan-950/40" />
            )}
            {ambientTheme === 'alert-red' && (
              <div className="absolute inset-0 bg-red-950/20 mix-blend-color-burn pointer-events-none z-10 border-8 border-red-900/40 shadow-[inset_0_0_50px_rgba(239,68,68,0.25)] animate-pulse">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950 border-2 border-red-500 text-red-500 font-mono text-[9px] py-1 px-3 rounded flex items-center gap-1.5 font-bold animate-bounce">
                  <span>⚠️ COMPILATION UNIT TESTS DISRUPTED</span>
                </div>
              </div>
            )}
            {ambientTheme === 'alert-orange' && (
              <div className="absolute inset-0 bg-orange-950/20 mix-blend-color-burn pointer-events-none z-10 border-8 border-orange-900/40 shadow-[inset_0_0_50px_rgba(249,115,22,0.25)] animate-pulse">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-orange-950 border-2 border-orange-500 text-orange-500 font-mono text-[9px] py-1 px-3 rounded flex items-center gap-1.5 font-bold animate-bounce">
                  <span>⚠️ CORE MICROSERVICE OUTAGE DETECTED</span>
                </div>
              </div>
            )}
            {ambientTheme === 'celebrate-gold' && (
              <div className="absolute inset-0 bg-amber-500/5 pointer-events-none z-10 border-8 border-amber-600/20">
                <div className="absolute inset-0 bg-radial-at-b from-amber-500/10 via-transparent to-transparent" />
                <div className="absolute bottom-12 left-1/4 text-amber-300 text-xs animate-bounce opacity-80">✨</div>
                <div className="absolute bottom-36 right-1/3 text-amber-300 text-xs animate-pulse opacity-60">✨</div>
                <div className="absolute bottom-24 right-12 text-amber-300 text-sm animate-bounce opacity-70">🌟</div>
              </div>
            )}
            {ambientTheme === 'alert-cyan' && (
              <div className="absolute inset-0 bg-cyan-950/20 mix-blend-color-dodge pointer-events-none z-10 border-8 border-cyan-800/40 shadow-[inset_0_0_50px_rgba(6,182,212,0.25)] animate-pulse">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-cyan-950 border-2 border-cyan-500 text-cyan-400 font-mono text-[9px] py-1 px-3 rounded flex items-center gap-1.5 font-bold animate-bounce">
                  <span>🌀 DISTRIBUTED NETWORK PARTITION ISOLATED</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================== HIGH-FIDELITY SPATIAL OVERLAYS (MODALS) ================== */}

      {/* 1. LOBBY OVERLAY */}
      {activeOverlay === 'lobby' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-45 flex items-center justify-center p-2 sm:p-4 select-none">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-slate-900 border-4 border-amber-500 shadow-2xl p-4 md:p-6 rounded-lg relative flex flex-col md:flex-row gap-6 animate-slide-in-up">
            <button onClick={closeOverlay} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-sm font-mono">[关闭 Esc]</button>
            
            <div className="flex-1">
              <div className="mb-4">
                <PixelBadge variant="warning">LOBBY WORLD MAP</PixelBadge>
                <h3 className="pixel-title text-base md:text-xl text-amber-300 font-bold mt-1">请绑定并进入你的第一条职业大陆</h3>
              </div>
              <CareerWorldMap onIslandSelect={setSelectedIsland} careerOverrides={careerOverrides} />
            </div>

            <div className="w-full md:w-[320px] shrink-0">
              {selectedIsland ? (
                <div className="space-y-4">
                  <div className="border-4 border-slate-700 bg-slate-950/80 p-4 rounded text-slate-200">
                    <h4 className="font-bold text-amber-400 text-base">{selectedIsland.name}</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-5">{selectedIsland.description}</p>
                    <div className="mt-3 text-xs space-y-1.5 text-slate-300">
                      <div>🧑‍🏫 <strong>导师：</strong>{selectedIsland.mentor}</div>
                      <div>🏆 <strong>核心：</strong>{selectedIsland.currentTheme}</div>
                    </div>
                  </div>
                  <PixelButton fullWidth onClick={() => handleSelectCareerIsland(selectedIsland.id)}>
                    绑定此职业规划
                  </PixelButton>
                </div>
              ) : (
                <CareerPreviewPanel career={null} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. QUEST BOARD OVERLAY */}
      {activeOverlay === 'quests' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-45 flex items-center justify-center p-2 sm:p-4 select-none">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-slate-900 border-4 border-indigo-500 shadow-2xl p-4 md:p-6 rounded-lg relative flex flex-col gap-4 animate-slide-in-up">
            <button onClick={closeOverlay} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-sm font-mono">[关闭 Esc]</button>
            
            <div className="border-b-4 border-indigo-950 pb-3">
              <PixelBadge variant="primary">CAREER QUEST BOARD</PixelBadge>
              <h3 className="pixel-title text-xl text-slate-100 font-bold mt-1">主线与支线实训研发任务板</h3>
            </div>

            {loadingMissions ? (
              <div className="text-center py-12 text-slate-400 font-mono">正在检索可用任务包...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-1">
                {missions.length > 0 ? (
                  missions.map((mission) => {
                    const status = getMissionStatus(mission.id, mission.status);
                    return (
                      <div key={mission.id} className="border-2 border-slate-700 bg-slate-950/60 p-4 rounded flex flex-col justify-between hover:border-indigo-500 transition-colors">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <PixelBadge variant={mission.difficulty === 'hard' ? 'danger' : 'warning'} className="text-[10px]">
                              {mission.difficulty === 'easy' ? '初级' : '中级'}
                            </PixelBadge>
                            <span className="text-[11px] font-bold text-emerald-400">+{mission.rewardExp} XP</span>
                          </div>
                          <h4 className="font-bold text-slate-200 text-sm">{mission.title}</h4>
                          <p className="text-xs text-slate-400 leading-relaxed font-mono">{mission.background.substring(0, 110)}...</p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-900 flex justify-between items-center">
                          <span className="text-[10px] text-slate-500">状态: {status === MissionStatus.COMPLETED ? '✓ 已完成' : status === MissionStatus.ACCEPTED ? '🔥 正在开发中' : '☐ 可领取'}</span>
                          
                          {status === MissionStatus.COMPLETED ? (
                            <PixelBadge variant="success">已完成归档</PixelBadge>
                          ) : status === MissionStatus.ACCEPTED ? (
                            <PixelButton className="py-1 px-3 text-xs" onClick={() => openOverlay('sandbox')}>
                              去往沙盒 coding
                            </PixelButton>
                          ) : (
                            <PixelButton variant="secondary" className="py-1 px-3 text-xs" onClick={() => handleAcceptMission(mission.id)}>
                              领取实训任务
                            </PixelButton>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-2 text-center py-8 text-slate-500 border border-dashed border-slate-800">
                    未检索到该职业任务，请前往办事大厅接待处绑定。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. PORTFOLIO OVERLAY */}
      {activeOverlay === 'portfolio' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-45 flex items-center justify-center p-2 sm:p-4 select-none">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-slate-900 border-4 border-purple-500 shadow-2xl p-4 md:p-6 rounded-lg relative flex flex-col gap-6 animate-slide-in-up">
            <button onClick={closeOverlay} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-sm font-mono">[关闭 Esc]</button>
            
            <div className="border-b-4 border-purple-950 pb-3">
              <PixelBadge variant="warning">GROWTH PORTFOLIO</PixelBadge>
              <h3 className="pixel-title text-base md:text-xl text-slate-100 font-bold mt-1">初学者个人成长档案馆</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
              <div className="col-span-1 space-y-4">
                <div className="bg-slate-950 p-4 border-2 border-purple-900/60 rounded text-center">
                  <div className="text-[10px] text-slate-500">成长评级 (Growth Rating)</div>
                  <div className="text-4xl font-bold text-amber-300 mt-2">{totalXp} <span className="text-sm">XP</span></div>
                  <div className="text-xs text-purple-400 mt-1">Rank: Level {Math.floor(totalXp / 100) + 1}</div>
                </div>

                <div className="bg-slate-950 p-3 border border-slate-800 rounded space-y-1 text-xs text-slate-400">
                  <div>📌 <strong>认证单位：</strong>OfficeCraft AI</div>
                  <div>📄 <strong>履历证书：</strong>已归档 1 个主线证据</div>
                </div>
              </div>

              <div className="col-span-2 bg-slate-950 p-4 md:p-5 border-2 border-purple-900/40 rounded flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-purple-400 text-sm mb-3">🏅 实训里程碑证据墙</h4>
                  <div className="divide-y divide-slate-900">
                    {MILESTONES.map((milestone) => (
                      <div key={milestone.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center border font-bold ${milestone.id === 'm1' || totalXp >= 150 ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20' : 'border-slate-800 text-slate-600'}`}>✓</span>
                          <div>
                            <div className="font-bold text-slate-200">{milestone.name}</div>
                            <div className="text-[10px] text-slate-500">{milestone.subtitle}</div>
                          </div>
                        </div>
                        <span className="font-bold text-emerald-400">+{milestone.xpAwarded} XP</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. COMMUNITY WHITEBOARD OVERLAY */}
      {activeOverlay === 'community' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-45 flex items-center justify-center p-2 sm:p-4 select-none">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-slate-900 border-4 border-emerald-500 shadow-2xl p-4 md:p-6 rounded-lg relative flex flex-col gap-4 animate-slide-in-up">
            <button onClick={closeOverlay} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-sm font-mono">[关闭 Esc]</button>
            
            <div className="border-b-4 border-emerald-950 pb-3 flex justify-between items-center">
              <div>
                <PixelBadge variant="success">COMMUNITY WHITEBOARD</PixelBadge>
                <h3 className="pixel-title text-xl text-slate-100 font-bold mt-1">工程师交流白板论坛</h3>
              </div>
              <PixelButton className="py-1 px-4 text-xs" onClick={() => setShowPostDialog(true)}>发布问题工单</PixelButton>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 font-mono">
              <div className="col-span-1 bg-slate-950 p-4 border border-slate-800 rounded">
                <span className="text-[10px] text-slate-500 tracking-wider">频道索引 (CHANNELS)</span>
                <div className="flex flex-col gap-1.5 mt-3">
                  <button onClick={() => setCommChannel('all')} className={`py-1.5 px-2 text-left text-xs ${commChannel === 'all' ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300' : 'text-slate-400'}`}>全部讨论</button>
                  <button onClick={() => setCommChannel('data-analyst')} className={`py-1.5 px-2 text-left text-xs ${commChannel === 'data-analyst' ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300' : 'text-slate-400'}`}>数据山脉</button>
                  <button onClick={() => setCommChannel('software-engineer')} className={`py-1.5 px-2 text-left text-xs ${commChannel === 'software-engineer' ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300' : 'text-slate-400'}`}>软件工程</button>
                </div>
              </div>

              <div className="col-span-3 space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {filteredCommunityIssues.map((issue) => (
                  <div key={issue.id} className="border border-slate-800 bg-slate-950/80 p-4 rounded hover:border-emerald-600 transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] text-slate-500">作者: {issue.authorName}</span>
                      <PixelBadge variant="neutral" className="text-[9px]">{issue.careerId}</PixelBadge>
                    </div>
                    <h4 className="font-bold text-slate-200 text-sm">{issue.title}</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-5">{issue.content}</p>
                    
                    {issue.replies.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-900 space-y-2">
                        {issue.replies.map((rep) => (
                          <div key={rep.id} className="bg-slate-900/60 p-2 text-[10px] border border-slate-800/80 text-slate-300">
                            <strong>{rep.authorName}:</strong> {rep.content}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. CODE SANDBOX WORKSPACE (SLIDE-OUT DRAWER) */}
      {activeOverlay === 'sandbox' && localActiveMission && (
        <div className="fixed top-16 md:top-20 left-4 md:left-auto right-4 bottom-4 w-auto md:w-[740px] max-h-[92vh] md:max-h-none overflow-y-auto md:overflow-visible bg-slate-950/95 border-2 border-cyan-500 rounded-xl shadow-2xl z-40 p-4 md:p-5 flex flex-col gap-4 animate-slide-in-right pointer-events-auto select-none">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl animate-spin">⚙️</span>
              <div>
                <span className="text-[9px] font-bold text-cyan-400 font-mono tracking-widest">SPLITSCREEN SANDBOX COMPILER</span>
                <h3 className="font-bold text-slate-100 text-sm">Pandas & Python 代码编译实训台</h3>
              </div>
            </div>
            <button onClick={closeOverlay} className="text-slate-500 hover:text-slate-300 text-xs font-mono">[关闭 Esc]</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 font-mono">
            {/* Left Col: Instructions & handbook */}
            <div className="flex flex-col gap-3 md:overflow-y-auto pr-1">
              <div className="bg-slate-900/50 p-4 border border-slate-800/60 rounded">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Quest Overview</span>
                <h4 className="font-bold text-amber-300 text-xs mt-1">{localActiveMission.title}</h4>
                <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                  {activeMissionDetails?.background || activeMissionDetails?.description || '正在载入实训任务背景细节...'}
                </p>
              </div>

              <div className="bg-slate-900/50 p-4 border border-slate-800/60 rounded space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Delivery Requirements</span>
                <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc pl-4">
                  <li>清洗缺口: 必须包含 <code className="text-cyan-400 bg-slate-950 px-1">.fillna()</code>。</li>
                  <li>分组聚合: 必须包含 <code className="text-cyan-400 bg-slate-950 px-1">.groupby()</code>。</li>
                  <li>完成任务后点击 <strong className="text-slate-200">运行测试</strong> 触发空间光效。</li>
                </ul>
              </div>

              <div className="bg-slate-900/50 p-4 border border-slate-800/60 rounded flex-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">AI Mentor Review Dialogue</span>
                <div className="mt-2 text-[11px] text-slate-400 italic bg-slate-950 p-3 border border-slate-900 rounded leading-relaxed">
                  林澈：&ldquo;数据清洗最重要的逻辑是确保缺失项（NaN）填充完毕，再去 groupby 平均分组，千万别把 groupby 写成了 group_by！&rdquo;
                </div>
              </div>
            </div>

            {/* Right Col: Code Editor & Terminal */}
            <div className="flex flex-col gap-3 min-h-[350px] md:min-h-0">
              <div className="flex-1 flex flex-col border border-slate-800 rounded bg-slate-900/40 relative min-h-[180px] md:min-h-0">
                <div className="absolute top-2 right-4 text-[9px] text-slate-500">EDITOR.PY</div>
                <textarea
                  value={sandboxCode}
                  onChange={(e) => setSandboxCode(e.target.value)}
                  className="w-full flex-1 p-3 bg-slate-950 text-emerald-400 text-xs font-mono outline-none border-0 focus:ring-0 select-text resize-none"
                  style={{ fontFamily: '"Courier New", Courier, monospace' }}
                />
              </div>

              {/* Terminal Logs Output */}
              <div className="h-44 bg-slate-950 border border-slate-900 p-3 overflow-y-auto space-y-1 text-[10px] text-slate-400 font-mono">
                {compileLogs.length === 0 ? (
                  <div className="text-slate-600 italic">Terminal log standby. Click Run Tests above to compile...</div>
                ) : (
                  compileLogs.map((log, idx) => (
                    <div key={idx} className={log.startsWith('✓') ? 'text-emerald-400 font-bold' : log.startsWith('❌') || log.startsWith('🚨') ? 'text-red-400 font-bold' : 'text-slate-300'}>
                      {log}
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleCompileCode}
                    disabled={isCompiling}
                    className="flex-1 py-2 text-center bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded transition-colors active:scale-95 duration-75"
                  >
                    {isCompiling ? '⌛ 编译中...' : '🛠️ 运行测试并编译 (Run)'}
                  </button>
                  <button
                    onClick={handleSandboxSubmit}
                    disabled={testResult !== 'success' || isCompiling}
                    className={`flex-1 py-2 text-center font-bold text-xs rounded transition-colors active:scale-95 duration-75 ${
                      testResult === 'success' ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    🚀 交付并提交评审
                  </button>
                </div>
                <button
                  onClick={() => setIsPeerReviewModalOpen(true)}
                  className="w-full py-2 text-center bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold text-xs rounded transition-colors active:scale-95 duration-75 flex items-center justify-center gap-1.5 border border-violet-500/30"
                >
                  👥 发起同业代码评审 (Submit for Peer Review)
                </button>
              </div>

              {/* Mini Inline Peer Review Modal */}
              {isPeerReviewModalOpen && (
                <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm z-50 flex items-center justify-center p-6 rounded-xl">
                  <div className="bg-slate-900 border-2 border-violet-500/80 p-5 rounded-lg w-full max-w-sm font-mono shadow-[0_0_30px_rgba(139,92,246,0.3)] text-left">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                      <h4 className="text-violet-400 font-bold text-xs">👥 发起同业代码评审 (Peer Review)</h4>
                      <button 
                        onClick={() => setIsPeerReviewModalOpen(false)}
                        className="text-slate-500 hover:text-slate-300 text-[10px]"
                      >
                        [关闭]
                      </button>
                    </div>
                    
                    <p className="text-[10px] text-slate-400 mb-3 leading-normal">
                      你的代码将会发布在会议室的协作白板上。如果该空间只有你一人，AI 导师将在 5~8 秒后自动为您点评，并发放 XP 奖励！
                    </p>

                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      评审主题 / 模块描述
                    </label>
                    <input 
                      type="text"
                      placeholder="例如: P0 数据清洗与多维聚合模块"
                      value={peerReviewTitle}
                      onChange={(e) => setPeerReviewTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500 rounded p-2 text-xs text-slate-200 outline-none mb-4"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsPeerReviewModalOpen(false)}
                        className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={async () => {
                          if (!peerReviewTitle.trim()) {
                            alert('请输入评审主题！');
                            return;
                          }
                          setIsSubmittingReview(true);
                          try {
                            await submitCodeForReview(peerReviewTitle, sandboxCode, 'python');
                            setIsPeerReviewModalOpen(false);
                            setPeerReviewTitle('');
                            alert('提交成功！请前往会议室 (15,5) 协作白板，或等待 AI 导师/同业同事进行评审。');
                          } catch (err) {
                            alert('提交失败，请重试');
                          } finally {
                            setIsSubmittingReview(false);
                          }
                        }}
                        disabled={isSubmittingReview}
                        className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-100 text-[11px] font-bold rounded transition-colors"
                      >
                        {isSubmittingReview ? '提交中...' : '确认发布'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. SKILL MATRIX OVERLAY (FULL SCREEN GLASSMORPHIC DIALOG) */}
      {activeOverlay === 'skills' && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 font-mono select-none animate-fade-in pointer-events-auto">
          <div className="w-full max-w-5xl h-[90vh] md:h-[85vh] bg-slate-950/90 border-4 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)] p-4 md:p-6 relative flex flex-col gap-4 rounded-xl">
            {/* Header */}
            <div className="border-b-2 border-cyan-950 pb-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-pulse">🌟</span>
                <div>
                  <span className="text-[9px] font-bold text-cyan-400 tracking-wider uppercase">CAREER CONSTELLATION MAINFRAME</span>
                  <h3 className="pixel-title text-base font-bold text-slate-100">高维职业能力矩阵星图 (Skill Matrix)</h3>
                </div>
              </div>
              <button 
                onClick={closeOverlay} 
                className="text-slate-400 hover:text-cyan-400 border border-slate-800 bg-slate-950 hover:border-cyan-500/50 px-3 py-1 text-xs transition-colors duration-200 rounded"
              >
                [关闭 Esc]
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden min-h-0 relative rounded-lg bg-slate-950/60 border border-slate-900 shadow-inner">
              <div className="absolute inset-0 bg-pixel-grid opacity-5 pointer-events-none" />
              <div className="w-full h-full overflow-y-auto custom-scrollbar p-1">
                <CareerSkillTree skills={skills} />
              </div>
            </div>
            
            {/* Legend / Status bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/50 p-3 border border-slate-800/60 rounded text-[11px] text-slate-400">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.5)]" /> 已点亮</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500/50 border border-indigo-400/40" /> 已解锁(待点亮)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" /> 未解锁</span>
              </div>
              <div className="font-mono text-cyan-300">
                当前星图进度: {skills.filter(s => s.unlocked).length} / {skills.length} 节点已通电
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. SERVER RECOVERY CONSOLE OVERLAY (Phase 13 / Upgraded Phase 15) */}
      {activeOverlay === 'recovery' && (() => {
        const isBreakerTrip = activeAnomaly?.anomaly_id === 'service_breaker_trip' || terminalOutput.some(log => log.includes('Microservice B') || log.includes('熔断器'));
        return (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-2 sm:p-4 font-mono select-none animate-fade-in pointer-events-auto">
            <div className={`w-full max-w-4xl h-[90vh] md:h-[85vh] bg-slate-950/90 border-4 relative flex flex-col gap-4 rounded-xl max-h-[92vh] overflow-y-auto md:overflow-visible ${
              isConsoleShaking ? 'console-screen-shake' : ''
            } ${
              isBreakerTrip 
                ? 'border-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.45)]' 
                : 'border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)]'
            }`}>
              {/* Header */}
              <div className={`border-b-2 pb-3 flex justify-between items-center ${
                isBreakerTrip ? 'border-orange-950' : 'border-red-950'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl animate-pulse">
                    {isBreakerTrip ? '⚡' : '🚨'}
                  </span>
                  <div>
                    <span className={`text-[9px] font-bold tracking-wider uppercase ${
                      isBreakerTrip ? 'text-orange-500' : 'text-red-500'
                    }`}>
                      {isBreakerTrip ? 'DISTRIBUTED CIRCUIT BREAKER SECTOR DECK' : 'CORE SYSTEM FAILURE SECTOR DECK'}
                    </span>
                    <h3 className="pixel-title text-base font-bold text-slate-100">
                      {isBreakerTrip 
                        ? '机房分布式熔断应急抢修终端 (Circuit Breaker Recovery Terminal)' 
                        : '机房数据库核心重构终端 (Server Recovery Terminal)'}
                    </h3>
                  </div>
                </div>
                <button 
                  onClick={closeOverlay} 
                  className={`text-slate-400 hover:text-slate-200 border border-slate-800 bg-slate-950 px-3 py-1 text-xs transition-colors duration-200 rounded ${
                    isBreakerTrip ? 'hover:border-orange-500/50 hover:text-orange-400' : 'hover:border-red-500/50 hover:text-red-400'
                  }`}
                >
                  [关闭 Esc]
                </button>
              </div>

              {/* Main console content */}
              <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
                {/* Left Column: Stats & Logs */}
                <div className="w-full md:w-[320px] flex flex-col gap-4 overflow-y-auto pr-1">
                  {/* CPU load display card */}
                  <div className={`bg-slate-950/70 border rounded-lg p-4 flex flex-col gap-3 ${
                    isBreakerTrip ? 'border-orange-900/50' : 'border-red-900/50'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-bold ${isBreakerTrip ? 'text-orange-400' : 'text-red-400'}`}>
                        {isBreakerTrip ? '⚡ 分布式熔断延迟/心跳状态' : '🔥 核心数据库 CPU 负载'}
                      </span>
                      <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                        currentCpu > 90 
                          ? isBreakerTrip 
                            ? 'bg-orange-950/60 text-orange-500 animate-pulse' 
                            : 'bg-red-950/60 text-red-500 animate-pulse'
                          : 'bg-emerald-950/60 text-emerald-400'
                      }`}>
                        {currentCpu > 90 ? (isBreakerTrip ? 'CIRCUIT OPEN' : 'SEVERE OVERLOAD') : 'NOMINAL'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-bold font-mono tracking-tighter ${
                        currentCpu > 90 ? (isBreakerTrip ? 'text-orange-500' : 'text-red-500') : 'text-emerald-400'
                      }`}>
                        {currentCpu.toFixed(1)}
                      </span>
                      <span className="text-sm text-slate-500">%</span>
                    </div>

                    {/* SVG Jittery Line Graph */}
                    <div className="h-[60px] w-full bg-slate-950/80 border border-slate-900 rounded p-1 overflow-hidden relative">
                      <div className="absolute inset-0 bg-scanlines opacity-10 pointer-events-none" />
                      {cpuHistory.length > 1 ? (
                        <svg className="w-full h-full" viewBox="0 0 240 60" preserveAspectRatio="none">
                          <polyline
                            fill="none"
                            stroke={currentCpu > 90 ? (isBreakerTrip ? '#f97316' : '#ef4444') : '#10b981'}
                            strokeWidth="2"
                            points={cpuHistory.map((val, idx) => {
                              const x = (idx / Math.max(1, cpuHistory.length - 1)) * 240;
                              const y = 55 - (val / 100) * 50;
                              return `${x},${y}`;
                            }).join(' ')}
                          />
                        </svg>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">
                          正在初始化波形...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Breaker Switch Diagram (Blown Red Switch / Restored Green Switch) */}
                  {isBreakerTrip && (
                    <div className="bg-slate-950/70 border border-orange-500/30 rounded-lg p-3 flex flex-col gap-2 relative overflow-hidden">
                      <div className="absolute inset-0 bg-scanlines opacity-5 pointer-events-none" />
                      <span className="text-[10px] font-bold text-orange-400 tracking-wider">⚡ 熔断断路器脱扣监测 (Circuit Breaker)</span>
                      <div className="flex items-center justify-between bg-slate-950/50 p-2 border border-slate-900 rounded">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-300">微服务 B 保护链</span>
                          <span className="text-[9px] text-slate-500 font-mono">ID: breaker_ms_b_trip</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`relative w-14 h-8 rounded-full p-1 transition-colors duration-300 ${
                            activeAnomaly ? 'bg-red-950 border border-red-500/50' : 'bg-emerald-950 border border-emerald-500/50'
                          }`}>
                            <div className={`absolute top-1 w-6 h-5 rounded-md flex items-center justify-center font-bold text-[8px] tracking-tighter shadow-md transition-all duration-300 ${
                              activeAnomaly 
                                ? 'left-1 bg-red-600 text-slate-100 shadow-[0_0_8px_#ef4444]' 
                                : 'left-7 bg-emerald-500 text-slate-950 shadow-[0_0_8px_#10b981]'
                            }`}>
                              {activeAnomaly ? 'TRIP' : 'ON'}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold font-mono ${activeAnomaly ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                            {activeAnomaly ? 'OPEN' : 'CLOSED'}
                          </span>
                        </div>
                      </div>

                      {/* Switch Lever Visual Representation */}
                      <div className="flex justify-center p-2 border border-slate-900 bg-slate-950/40 rounded">
                        <svg width="180" height="40" viewBox="0 0 180 40" className="overflow-visible">
                          <circle cx="20" cy="20" r="4" fill={activeAnomaly ? "#ef4444" : "#10b981"} className={activeAnomaly ? "animate-pulse" : ""} />
                          <circle cx="160" cy="20" r="4" fill={activeAnomaly ? "#ef4444" : "#10b981"} className={activeAnomaly ? "animate-pulse" : ""} />
                          <text x="20" y="12" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">IN</text>
                          <text x="160" y="12" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">OUT</text>
                          <line x1="20" y1="20" x2="60" y2="20" stroke="#475569" strokeWidth="2" />
                          <line x1="120" y1="20" x2="160" y2="20" stroke="#475569" strokeWidth="2" />
                          {activeAnomaly ? (
                            <>
                              <path d="M 60 20 L 100 0" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                              <path d="M 90 8 L 98 14 M 85 5 L 90 10" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" className="animate-bounce" />
                              <text x="100" y="32" fill="#ef4444" fontSize="9" textAnchor="middle" fontFamily="monospace" fontWeight="bold" className="animate-pulse">DISCONNECTED</text>
                            </>
                          ) : (
                            <>
                              <line x1="60" y1="20" x2="120" y2="20" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                              <text x="90" y="32" fill="#10b981" fontSize="9" textAnchor="middle" fontFamily="monospace" fontWeight="bold">CLOSED (SECURE)</text>
                            </>
                          )}
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Problems and Diagnostic logs */}
                  <div className="flex-1 bg-slate-950/70 border border-slate-900 rounded-lg p-4 flex flex-col gap-2 overflow-hidden min-h-[140px]">
                    <span className="text-[10px] font-bold text-slate-500 tracking-wider">📋 诊断输出 (LOGS)</span>
                    <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-1.5 text-[10.5px] font-mono leading-relaxed text-slate-400 animate-pulse">
                      {terminalOutput.map((log, idx) => {
                        let color = 'text-slate-400';
                        if (log.includes('WARNING') || log.includes('UNSTABLE') || log.includes('TRIPPED') || log.includes('EXPIRED')) {
                          color = isBreakerTrip ? 'text-orange-400 font-bold' : 'text-red-400 font-bold';
                        } else if (log.includes('SUCCESS') || log.includes('OK') || log.includes('RESTORED') || log.includes('CLOSED')) {
                          color = 'text-emerald-400';
                        } else if (log.includes('INSTRUCTIONS') || log.includes('RAG') || log.includes('EVALUATION')) {
                          color = 'text-cyan-400';
                        }
                        
                        return (
                          <div key={idx} className={`${color} break-all`}>
                            &gt; {log}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Editor & Sandbox Submit */}
                <div className="flex-1 flex flex-col gap-3 min-h-[350px] md:min-h-0">
                  <div className="flex-1 flex flex-col bg-slate-950/85 border border-slate-900 rounded-lg overflow-hidden relative min-h-[180px] md:min-h-0">
                    {/* Editor Header */}
                    <div className={`bg-slate-950/90 border-b border-slate-900 px-4 py-2 flex justify-between items-center text-xs ${
                      isBreakerTrip ? 'text-orange-400' : 'text-slate-400'
                    }`}>
                      <span className="font-bold">
                        {isBreakerTrip 
                          ? '🛠️ 异常熔断中间件重构编辑器 (py_breaker_sandbox)' 
                          : '🛠️ 紧急安全重构编辑器 (sql_python_sandbox)'}
                      </span>
                      <span className="text-[9px] text-slate-600 uppercase font-mono font-bold">UTF-8 / Case-Insensitive</span>
                    </div>

                    {/* Textarea with retro line numbers design */}
                    <div className="flex-1 flex relative font-mono text-[12px] bg-slate-950 min-h-0">
                      {/* Line numbers dummy sidebar */}
                      <div className="w-10 bg-slate-950/60 border-r border-slate-900/60 text-slate-700 text-right pr-2 py-3 select-none flex flex-col gap-[3px]">
                        {Array.from({ length: 15 }).map((_, i) => (
                          <span key={i}>{i + 1}</span>
                        ))}
                      </div>

                      {/* Actual textarea input */}
                      <textarea
                        value={recoveryScript}
                        onChange={(e) => setRecoveryScript(e.target.value)}
                        disabled={!!(currentTerminalStationId && activeLocks[currentTerminalStationId] && activeLocks[currentTerminalStationId].holder_id !== (getPlayerId() || ''))}
                        placeholder={
                          currentTerminalStationId && activeLocks[currentTerminalStationId] && activeLocks[currentTerminalStationId].holder_id !== (getPlayerId() || '')
                            ? `[⚠️ 终端只读] 当前终端正由 ${activeLocks[currentTerminalStationId].holder_id} 独占操作中，请等待其释放...`
                            : isBreakerTrip
                              ? `# Python 示例: 编写分布式熔断降级中间件\n@circuitbreaker(timeout=3, fallback=handle_timeout_fallback)\ndef request_ms_b_service(payload):\n    # 当微服务 B 心跳状态 open 时触发熔断，切回 closed 自愈机制\n    if service_b.is_open():\n        raise Exception("Circuit Breaker is Open")\n    return service_b.call(payload)\n\ndef handle_timeout_fallback(payload):\n    return {"status": "fallback_offline", "data": "Using local fallback backup"}`
                              : `-- 示例 1: 创建缺失索引以解决 CPU 过载\n-- CREATE INDEX idx_user ON orders(user_id);\n\n# 示例 2: 使用 try-except 与 rollback 机制防止连接超时死锁\ntry:\n    db.commit()\nexcept Exception as e:\n    db.rollback()\n    raise e`
                        }
                        className={`flex-1 h-full bg-transparent text-slate-200 p-3 outline-none resize-none focus:ring-0 placeholder-slate-700 leading-[1.3] overflow-y-auto ${
                          currentTerminalStationId && activeLocks[currentTerminalStationId] && activeLocks[currentTerminalStationId].holder_id !== (getPlayerId() || '') ? 'opacity-40 select-none' : ''
                        }`}
                        style={{ caretColor: isBreakerTrip ? '#f97316' : '#ef4444' }}
                      />

                      {/* Frosted glass read-only cover & warning banner */}
                      {currentTerminalStationId && activeLocks[currentTerminalStationId] && activeLocks[currentTerminalStationId].holder_id !== (getPlayerId() || '') && (
                        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4 z-10 select-none">
                          <div className="bg-amber-950/90 border border-amber-500/80 p-4 rounded-xl shadow-2xl max-w-sm flex flex-col gap-2 animate-pulse">
                            <span className="text-xl">⚠️</span>
                            <h4 className="font-bold text-amber-300 text-xs">终端处于只读模式 (Read-Only)</h4>
                            <p className="text-[10px] text-amber-400 leading-normal">
                              该控制台已被玩家 <span className="underline font-bold text-white">{activeLocks[currentTerminalStationId].holder_id}</span> 独占锁定。分布式锁租约正在自动续期，请在物理地图中协作或等待其释位离开。
                            </p>
                            {activeLocks[currentTerminalStationId].remaining_ttl !== undefined && (
                              <div className="text-[9px] text-amber-500 border border-amber-900/40 py-0.5 px-2 bg-slate-950/60 rounded self-center">
                                独占剩余租约: {activeLocks[currentTerminalStationId].remaining_ttl.toFixed(1)}s
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Controls */}
                  <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-900/20 p-3 border border-slate-900 rounded-lg shrink-0">
                    <div className="text-[10px] text-slate-500 leading-snug flex-1">
                      {isBreakerTrip ? (
                        <>
                          <p>💡 <span className="text-orange-400">RAG 书架提示</span>: 检索 \`software_design_rules\` 书架，学习优雅降级与 CircuitBreaker 的状态转换。</p>
                          <p className="mt-0.5">💡 包含 <span className="text-orange-400 font-bold">circuitbreaker/breaker</span>, <span className="text-orange-400 font-bold">fallback</span>, <span className="text-orange-400 font-bold">open</span> 和 <span className="text-orange-400 font-bold">closed</span> 关键字即可闭合保护链路，获得 <span className="text-amber-400 font-bold">+80 XP</span>！</p>
                        </>
                      ) : (
                        <>
                          <p>💡 <span className="text-cyan-400">RAG 书架提示</span>: 检索 \`software_design_rules\` 书架以学习异常重试与数据事务规范。</p>
                          <p className="mt-0.5">💡 SQL 重写或 Python 异常回滚可以令 CPU 降至 <span className="text-emerald-400 font-bold">12%</span> 稳态，并获得 <span className="text-amber-400 font-bold">+50 XP</span>！</p>
                        </>
                      )}
                    </div>

                    <button
                      onClick={async () => {
                        if (isRecoveryCompiling || !recoveryScript.trim() || (currentTerminalStationId && activeLocks[currentTerminalStationId] && activeLocks[currentTerminalStationId].holder_id !== (getPlayerId() || ''))) return;
                        setIsRecoveryCompiling(true);
                        setTerminalOutput(prev => [...prev, '>>> EVALUATION PIPELINE RUNNING...', '>>> RUNNING SYNTAX & SEMANTIC STATIC CHECKS...']);
                        audioManager.playTypewriter();

                        try {
                          const response = await resolveAnomaly(recoveryScript);
                          // Synthesize compilation typewriter sounds
                          setTimeout(() => {
                            if (response.status === 'success') {
                              const xpGained = response.xp_gained || (isBreakerTrip ? 80 : 50);
                              setTerminalOutput(prev => [
                                ...prev,
                                '>>> COMPILER RESULT: SUCCESS',
                                `>>> FEEDBACK: ${response.feedback}`,
                                isBreakerTrip
                                  ? '>>> MICROSERVICE B BUS PATH RE-CLOSED (ON).'
                                  : '>>> DB ENGINE RESTORED TO NOMINAL STATE.',
                                `>>> EXCELLENT RECOVERY WORK! +${xpGained} XP AWARDED.`
                              ]);
                              setIsRecoveryCompiling(false);
                            } else {
                              setTerminalOutput(prev => [
                                ...prev,
                                '>>> COMPILER WARNING: FAILED STATIC CHECKS',
                                `>>> ERROR LOG: ${response.feedback}`,
                                '>>> REMEDY WORK NEEDED.'
                              ]);
                              setIsConsoleShaking(true);
                              audioManager.playClose(); // alert warning sound
                              setTimeout(() => setIsConsoleShaking(false), 500);
                              setIsRecoveryCompiling(false);
                            }
                          }, 1200);
                        } catch (err) {
                          setTerminalOutput(prev => [...prev, '>>> CONNECTION ERROR: UNABLE TO CONTACT SERVER COMPILER NODE.']);
                          setIsRecoveryCompiling(false);
                        }
                      }}
                      disabled={isRecoveryCompiling || !recoveryScript.trim() || !!(currentTerminalStationId && activeLocks[currentTerminalStationId] && activeLocks[currentTerminalStationId].holder_id !== (getPlayerId() || ''))}
                      className={`px-5 py-2.5 font-bold rounded-lg border transition-all duration-200 select-none text-xs flex items-center gap-2 shrink-0 ${
                        isRecoveryCompiling || !recoveryScript.trim() || !!(currentTerminalStationId && activeLocks[currentTerminalStationId] && activeLocks[currentTerminalStationId].holder_id !== (getPlayerId() || ''))
                          ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                          : isBreakerTrip
                            ? 'bg-orange-950/60 hover:bg-orange-900/60 border-orange-500/80 hover:border-orange-400 text-orange-200 active:scale-95'
                            : 'bg-red-950/60 hover:bg-red-900/60 border-red-500/80 hover:border-red-400 text-red-200 active:scale-95'
                      }`}
                    >
                      {isRecoveryCompiling ? (
                        <>
                          <span className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin ${
                            isBreakerTrip ? 'border-orange-500' : 'border-red-500'
                          }`} />
                          诊断检查中...
                        </>
                      ) : (
                        <>⚡ 运行重构检查</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================== CLASSIC RPG DIALOGUE BOX OVERLAYS ================== */}

      {activeChatNpc && (
        <div className="w-[816px] fixed bottom-4 left-1/2 -translate-x-1/2 border-4 border-amber-600 bg-slate-950 p-4 shadow-2xl z-40 animate-slide-in-up rounded">
          <div className="absolute top-2 right-4 text-slate-500 hover:text-slate-300 text-xs font-mono cursor-pointer" onClick={closeConversation}>
            [关闭 Esc]
          </div>

          <div className="flex gap-4 font-mono">
            <div className="w-16 h-16 border-2 border-amber-500 bg-slate-900 flex items-center justify-center text-4xl shrink-0 select-none shadow-md">
              {activeChatNpc.emoji}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-amber-400 mb-1">{activeChatNpc.name}</div>
              
              <div className="max-h-[160px] overflow-y-auto space-y-3 mb-4 pr-1 text-xs leading-6 text-slate-200">
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-2 border max-w-[85%] rounded shadow-sm ${msg.role === 'user' ? 'border-amber-500/40 bg-amber-950/50 text-amber-200 font-semibold' : 'border-slate-800 bg-slate-900/60'}`}>
                      {msg.role === 'user' ? '你: ' : ''}{msg.content || <span className="animate-pulse">正在思考...</span>}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onFocus={() => setLocalTyping(true)}
                  onBlur={() => setLocalTyping(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isNpcStreaming) {
                      handleSendChatMessage();
                    }
                  }}
                  placeholder={`和 ${activeChatNpc.roleName} 交流你的疑惑...`}
                  className="flex-1 pixel-input text-xs"
                  disabled={isNpcStreaming}
                />
                <PixelButton
                  variant="primary"
                  className="py-1 px-4 text-xs"
                  onClick={handleSendChatMessage}
                  disabled={isNpcStreaming || !chatInput.trim()}
                >
                  {isNpcStreaming ? '思考中' : '发送'}
                </PixelButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RAG sidebar Bookshelf panel */}
      {selectedBookcase && (
        <div className="fixed top-20 right-4 bottom-4 w-[380px] border-4 border-emerald-600 bg-slate-900/90 backdrop-blur-md p-5 shadow-2xl z-40 select-none animate-slide-in-right rounded-lg">
          <div className="absolute top-2 right-4 text-slate-500 hover:text-slate-300 text-xs font-mono cursor-pointer" onClick={() => { setSelectedBookcase(null); audioManager.playClose(); }}>
            [关闭 ×]
          </div>

          <div className="flex items-center gap-2 mb-3 font-mono">
            <span className="text-xl">🏛️</span>
            <h3 className="font-bold font-mono text-emerald-300 text-sm uppercase">{selectedBookcase.name}</h3>
          </div>

          <p className="text-xs text-slate-400 font-mono leading-5 mb-4 border-b border-emerald-950 pb-3">
            {selectedBookcase.desc}
          </p>

          <div className="mb-4 font-mono">
            <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">💡 快捷检索</h4>
            <div className="flex flex-wrap gap-1.5">
              {selectedBookcase.quickQueries.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleRagSearch(tag)}
                  className="text-[10px] font-mono bg-emerald-950/40 border border-emerald-900/60 hover:border-emerald-500 text-emerald-400 px-2 py-1 active:scale-95 transition-all"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 mb-5 font-mono">
            <div className="flex gap-2">
              <input
                type="text"
                value={bookcaseQuery}
                onChange={(e) => setBookcaseQuery(e.target.value)}
                onFocus={() => setLocalTyping(true)}
                onBlur={() => setLocalTyping(false)}
                placeholder="输入语义检索问题..."
                className="flex-1 pixel-input text-xs border-emerald-900 focus:border-emerald-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRagSearch();
                }}
              />
              <PixelButton
                variant="primary"
                className="py-1 px-4 text-xs bg-emerald-600 text-slate-950 border-emerald-500"
                onClick={() => handleRagSearch()}
                disabled={isSearchingRag || !bookcaseQuery.trim()}
              >
                {isSearchingRag ? '搜索中' : '检索'}
              </PixelButton>
            </div>
          </div>

          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 font-mono">
            <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-1.5 flex justify-between items-center">
              <span>📚 检索结果 ({ragResults.length})</span>
            </h4>

            {ragResults.length === 0 ? (
              <div className="border border-dashed border-slate-800 p-8 text-center text-slate-500 text-xs">
                {isSearchingRag ? 'ChromaDB 运算中...' : '暂无检索内容，请键入问题或点击上方关键词！'}
              </div>
            ) : (
              ragResults.map((result, idx) => (
                <div key={idx} className="border border-emerald-900/50 bg-slate-950/60 p-3 shadow-inner">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-[10px] font-bold text-emerald-400 truncate max-w-[200px]" title={result.doc_title}>
                      📄 {result.doc_title.split('/').pop()}
                    </span>
                    <PixelBadge variant="success" className="text-[9px] bg-emerald-950 text-emerald-400">
                      {(result.similarity_score * 100).toFixed(1)}%
                    </PixelBadge>
                  </div>
                  <p className="text-[11px] leading-5 text-slate-300 whitespace-pre-wrap select-text">{result.content_excerpt}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Multi-Agent standup meeting */}
      {isMeetingOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 font-mono select-none">
          <div className="w-full max-w-4xl bg-slate-900 border-4 border-indigo-500 shadow-2xl p-6 relative flex flex-col gap-6 rounded-lg animate-slide-in-up">
            
            <div className="border-b-4 border-indigo-950 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{unresolvedConflict ? '⚡' : '🤝'}</span>
                <div>
                  <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">DAILY STANDUP SESSION</span>
                  <h3 className="pixel-title text-base font-bold text-slate-100">多智能体每日晨会圆桌</h3>
                </div>
              </div>
              {!isMeetingStreaming && (
                <button onClick={handleCloseMeeting} className="text-slate-500 hover:text-slate-200 text-xs border border-slate-700 bg-slate-950 px-2 py-1">[关闭 Esc]</button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[220px]">
              {/* PM Amy */}
              <div className="border-2 border-amber-800/60 bg-amber-950/10 p-4 flex flex-col gap-3 relative rounded shadow-md">
                <div className="absolute top-2 right-4 text-[9px] text-amber-500 font-bold bg-amber-950 px-1.5 py-0.5 rounded border border-amber-900">PRODUCT MANAGER</div>
                <div className="flex items-center gap-3 border-b border-amber-900/40 pb-2">
                  <div className="w-12 h-12 rounded bg-amber-900/30 border-2 border-amber-500 flex items-center justify-center text-3xl shadow animate-pulse">👩‍💼</div>
                  <div>
                    <h4 className="font-bold text-xs text-amber-400">PM Amy (艾米)</h4>
                    <span className="text-[9px] text-slate-400">口头禅: 闭环, 赋能, 快速发版</span>
                  </div>
                </div>
                <p className="text-xs leading-6 text-amber-100/95 whitespace-pre-wrap min-h-[100px] p-1">
                  {meetingAmyText || (isMeetingStreaming && !meetingLingText ? <span className="text-amber-500/80 animate-pulse">思考发言中...</span> : <span className="text-slate-500 italic">静默倾听中...</span>)}
                </p>
              </div>

              {/* Tech Lead Gao Ling */}
              <div className="border-2 border-purple-800/60 bg-purple-950/10 p-4 flex flex-col gap-3 relative rounded shadow-md">
                <div className="absolute top-2 right-4 text-[9px] text-purple-500 font-bold bg-purple-950 px-1.5 py-0.5 rounded border border-purple-900">TECH LEAD</div>
                <div className="flex items-center gap-3 border-b border-purple-900/40 pb-2">
                  <div className="w-12 h-12 rounded bg-purple-900/30 border-2 border-purple-500 flex items-center justify-center text-3xl shadow">👩‍💻</div>
                  <div>
                    <h4 className="font-bold text-xs text-purple-400">高凌 (Gao Ling)</h4>
                    <span className="text-[9px] text-slate-400">口头禅: SOLID, 单元测试, 架构规范</span>
                  </div>
                </div>
                <p className="text-xs leading-6 text-purple-100/95 whitespace-pre-wrap min-h-[100px] p-1">
                  {meetingLingText || (isMeetingStreaming && meetingAmyText ? <span className="text-purple-500/80 animate-pulse">思考技术反馈中...</span> : <span className="text-slate-500 italic">静默聆听中...</span>)}
                </p>
              </div>
            </div>

            {unresolvedConflict && !arbitrationResponse && (
              <div className="border-2 border-yellow-800/40 bg-slate-950 p-4 rounded flex flex-col gap-4">
                <div className="border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-yellow-400">⚖️ 冲突斡旋：产品线 Amy 极速迭代诉求与质量分歧</h4>
                  <p className="text-[10px] text-slate-400 mt-1 leading-4">{unresolvedConflict.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button onClick={() => handleArbitrateChoice('speed')} disabled={isMeetingStreaming} className="flex flex-col gap-1.5 p-3 border-2 border-amber-900/60 bg-amber-950/20 hover:border-amber-500 active:scale-95 transition-all text-left group rounded">
                    <div className="flex justify-between items-center w-full">
                      <span className="text-xs font-bold text-amber-400">🚀 速度优先 (Speed)</span>
                      <PixelBadge variant="warning" className="text-[8px] bg-amber-950 text-amber-400">+40 XP</PixelBadge>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-4">牺牲代码单元测试强行发版，增加生产质量漏洞风险。</span>
                  </button>

                  <button onClick={() => handleArbitrateChoice('quality')} disabled={isMeetingStreaming} className="flex flex-col gap-1.5 p-3 border-2 border-purple-900/60 bg-purple-950/20 hover:border-purple-500 active:scale-95 transition-all text-left group rounded">
                    <div className="flex justify-between items-center w-full">
                      <span className="text-xs font-bold text-purple-400">🛡️ 质量优先 (Quality)</span>
                      <PixelBadge variant="success" className="text-[8px] bg-purple-950 text-purple-400">+60 XP</PixelBadge>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-4">先补齐完整的数据单元测试用例再发版，延期发布。</span>
                  </button>

                  <button onClick={() => handleArbitrateChoice('balance')} disabled={isMeetingStreaming} className="flex flex-col gap-1.5 p-3 border-2 border-indigo-900/60 bg-indigo-950/20 hover:border-indigo-500 active:scale-95 transition-all text-left group rounded">
                    <div className="flex justify-between items-center w-full">
                      <span className="text-xs font-bold text-indigo-400">⚖️ 渐进妥协 (Balance)</span>
                      <PixelBadge variant="primary" className="text-[8px] bg-indigo-950 text-indigo-400">+50 XP</PixelBadge>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-4">核心链路覆盖完整测试发布，子模块灰度开发。</span>
                  </button>
                </div>
              </div>
            )}

            {arbitrationResponse && (
              <div className="border-2 border-emerald-800/40 bg-emerald-950/5 p-4 rounded flex flex-col gap-2 relative shadow-inner animate-fade-in">
                <div className="absolute top-2 right-4 flex items-center gap-1.5">
                  <span className="text-xs">🏆</span>
                  <span className="text-xs font-bold text-emerald-400">+{arbitrationResponse.xp_gained} XP</span>
                </div>
                <h4 className="text-xs font-bold text-emerald-400">🎉 决策决议达成！</h4>
                <p className="text-[10px] text-slate-300 leading-5">{arbitrationResponse.feedback}</p>
              </div>
            )}

            <div className="flex justify-end border-t border-slate-800 pt-4 mt-2">
              {isMeetingStreaming ? (
                <div className="flex items-center gap-2 text-xs text-indigo-400">
                  <span className="animate-spin">⏳</span>
                  <span>智能体辩论生成中...</span>
                </div>
              ) : (
                <PixelButton variant="primary" className="py-1.5 px-6 text-xs" onClick={handleCloseMeeting}>确认并关闭晨会</PixelButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Community Post Dialog */}
      {showCreatePost && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border-4 border-emerald-500 p-6 rounded-lg relative flex flex-col gap-4 font-mono select-none">
            <button onClick={() => setShowPostDialog(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-xs">[关闭 ×]</button>
            <h3 className="font-bold text-emerald-400 text-sm">发布新问题工单</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="简明扼要写下你的技术疑问标题..."
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                className="w-full pixel-input text-xs"
              />
              <textarea
                placeholder="补充你的排查步骤，复现过程，以及期望获得怎样的协助..."
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                className="w-full h-32 pixel-input text-xs resize-none"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowPostDialog(false)} className="py-1.5 px-4 bg-slate-800 border border-slate-700 text-xs rounded text-slate-400">取消</button>
                <button onClick={handleCreatePost} className="py-1.5 px-4 bg-emerald-600 border border-emerald-500 text-slate-950 font-bold text-xs rounded">确认发布</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. CO-OP WHITEBOARD & PEER REVIEW OVERLAY */}
      {isCoopWhiteboardOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl h-[90vh] md:h-[650px] bg-slate-900 border-2 border-violet-500 rounded-xl shadow-[0_0_50px_rgba(139,92,246,0.35)] flex flex-col overflow-y-auto md:overflow-hidden font-mono select-none animate-slide-in-up pointer-events-auto">
            {/* Header */}
            <div className="bg-slate-950 px-6 py-4 flex justify-between items-center border-b border-violet-950">
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-pulse">📋</span>
                <div>
                  <span className="text-[9px] font-bold text-violet-400 tracking-widest uppercase">CO-OP DIGITAL WHITEBOARD</span>
                  <h3 className="pixel-title text-base font-bold text-slate-100">协作白板与同业代码评审 (Co-Op Review Center)</h3>
                </div>
              </div>
              <button 
                onClick={closeCoopWhiteboard} 
                className="text-slate-400 hover:text-violet-400 border border-slate-800 bg-slate-950 hover:border-violet-500/50 px-3 py-1 text-xs transition-colors duration-200 rounded"
              >
                [关闭 Esc]
              </button>
            </div>

            {/* Main Body */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
              {/* Whiteboard Frosted read-only cover & warning banner */}
              {activeLocks['station_whiteboard'] && activeLocks['station_whiteboard'].holder_id !== (getPlayerId() || '') && (
                <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-6 z-30 select-none">
                  <div className="bg-amber-950/90 border border-amber-500/80 p-6 rounded-xl shadow-2xl max-w-md flex flex-col gap-3 animate-pulse">
                    <span className="text-3xl">⚠️</span>
                    <h4 className="font-bold text-amber-300 text-sm">协作白板正处于只读模式 (Read-Only)</h4>
                    <p className="text-xs text-amber-400 leading-relaxed">
                      该协作白板已被玩家 <span className="underline font-bold text-white">{activeLocks['station_whiteboard'].holder_id}</span> 独占锁定进行同业代码评审。请在物理地图中与其协作，或等待其离开。
                    </p>
                    {activeLocks['station_whiteboard'].remaining_ttl !== undefined && (
                      <div className="text-[10px] text-amber-500 border border-amber-900/40 py-1 px-3 bg-slate-950/60 rounded self-center">
                        锁定租约剩余时间: {activeLocks['station_whiteboard'].remaining_ttl.toFixed(1)}s
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Left Column: Side Navigation Tabs (Pending Reviews, Active Quests) */}
              <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800/80 bg-slate-950/50 flex flex-col p-4 gap-4 overflow-y-auto shrink-0">
                {/* Tabs selection header */}
                <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-md">
                  <button 
                    onClick={() => setWhiteboardTab('reviews')}
                    className={`flex-1 text-center py-1.5 text-xs font-bold rounded transition-colors ${
                      whiteboardTab === 'reviews' ? 'bg-violet-950/65 border border-violet-500/50 text-violet-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    待评审 ({pendingReviews.length})
                  </button>
                  <button 
                    onClick={() => setWhiteboardTab('quests')}
                    className={`flex-1 text-center py-1.5 text-xs font-bold rounded transition-colors ${
                      whiteboardTab === 'quests' ? 'bg-violet-950/65 border border-violet-500/50 text-violet-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    团队任务 (3)
                  </button>
                </div>

                {whiteboardTab === 'reviews' ? (
                  <div className="flex flex-col gap-2 flex-1 min-h-0">
                    <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">待处理请求 (PENDING REVIEWS)</span>
                    {pendingReviews.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-800 rounded-lg">
                        <span className="text-2xl text-slate-700 mb-2">☕</span>
                        <p className="text-[11px] text-slate-500 leading-normal">暂无待处理的代码评审请求。去沙盒写点代码并提交同业评审吧！</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[440px] pr-1">
                        {pendingReviews.map((rev) => {
                          const isSelf = rev.user_id === (getPlayerId() || '');
                          return (
                            <button
                              key={rev.id}
                              onClick={() => setSelectedReview(rev)}
                              className={`w-full text-left p-3 rounded-lg border transition-all ${
                                selectedReview?.id === rev.id 
                                  ? 'bg-violet-950/40 border-violet-500/80 shadow-[0_0_12px_rgba(139,92,246,0.15)]' 
                                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700/80'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-1.5">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                  isSelf ? 'bg-indigo-950 text-indigo-400' : 'bg-cyan-950 text-cyan-400'
                                }`}>
                                  {isSelf ? '我的代码' : `用户: ${rev.user_id}`}
                                </span>
                                <span className="text-[9px] text-slate-500">{rev.language}</span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-200 truncate">{rev.title}</h4>
                              <p className="text-[10px] text-slate-500 mt-1 truncate">
                                {rev.code_content}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">共享协作副本 (ACTIVE TEAM QUESTS)</span>
                    
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-red-400 bg-red-950/50 border border-red-900/60 px-1.5 py-0.5 rounded">P0 高能事件</span>
                        <span className="text-[9px] text-red-400 animate-pulse">● 进行中</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-200">物理数据库100%满载排修</h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        由于连接并发溢出导致服务器卡死。需要两名开发人员：一名负责在 (18, 15) 核心终端执行索引重建，另一名在协作白板做最终代码同业复核。
                      </p>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                        <div className="bg-red-500 h-full w-[45%]" />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>进度: 45%</span>
                        <span>奖励: 150 XP</span>
                      </div>
                    </div>

                    <div className={`bg-slate-900/80 border ${activeAnomaly?.anomaly_id === 'service_breaker_trip' ? 'border-orange-500/80 shadow-[0_0_12px_rgba(249,115,22,0.15)]' : 'border-slate-800 hover:border-violet-500/60'} rounded-lg p-3 space-y-2 transition-all`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-orange-400 bg-orange-950/50 border border-orange-900/60 px-1.5 py-0.5 rounded">P1 架构重构</span>
                        {activeAnomaly?.anomaly_id === 'service_breaker_trip' ? (
                          <span className="text-[9px] text-orange-400 animate-pulse font-bold">● 战役已激活</span>
                        ) : (
                          <span className="text-[9px] text-emerald-400 font-bold">● 可接取</span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-slate-100">分布式熔断器改造</h4>
                      <p className="text-[10px] text-slate-300 leading-relaxed">
                        当单点节点心跳超时，协同编写异常熔断并自愈的熔断降级中间件，提升核心服务稳定性。
                      </p>

                      {activeAnomaly?.anomaly_id === 'service_breaker_trip' ? (
                        <div className="bg-orange-950/40 border border-orange-500/30 p-2 rounded text-[10px] text-orange-300 leading-normal">
                          ⚠️ 紧急事故：微服务 B 心跳超时已触发分布式脱扣熔断！请前往 Archive Room (18, 15) 进行应急抢修。
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await triggerAnomaly('service_breaker_trip');
                              alert('⚠️ 战役已激活：微服务 B 心跳超时，分布式系统已触发脱扣熔断保护！请立刻前往 Archive Room (18, 15) 重组核心保护链！');
                              closeCoopWhiteboard();
                            } catch (e) {
                              alert('激活战役失败，请检查网络/后台');
                            }
                          }}
                          className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-slate-950 hover:text-slate-100 text-[11px] font-bold rounded transition-colors flex items-center justify-center gap-1"
                        >
                          🎯 激活团队战役
                        </button>
                      )}

                      <div className="flex justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-900">
                        <span>奖励: +80 XP (协同红利)</span>
                        <span>难易度: ★★★★☆</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Pane: Green-Screen CRT Code Viewer & Feedback Terminal */}
              <div className="flex-1 bg-slate-950 flex flex-col relative overflow-hidden p-4 md:p-6 gap-4 min-h-[400px] md:min-h-0">
                <div className="absolute inset-0 bg-scanlines opacity-[0.03] pointer-events-none" />
                
                {selectedReview ? (
                  <div className="flex-1 flex flex-col gap-4 min-h-0">
                    {/* Header Details inside right pane */}
                    <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-4 flex flex-col gap-2 text-left">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500 font-bold text-xs">📟</span>
                          <span className="text-[9px] font-bold text-slate-500 tracking-wider">CODE INSPECTION TERMINAL</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono">STATUS: {selectedReview.status.toUpperCase()}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
                        <div>
                          <span className="text-slate-500">提交作者: </span>
                          <strong className="text-slate-100">{selectedReview.user_id}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">开发语言: </span>
                          <strong className="text-emerald-400 font-bold uppercase">{selectedReview.language}</strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-500">评审主题: </span>
                          <strong className="text-slate-100">{selectedReview.title}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Fenced scrollable code review panel */}
                    <div className="flex-1 border border-emerald-950/60 rounded bg-slate-950 relative flex flex-col min-h-[150px] md:min-h-0">
                      <div className="absolute top-2 right-4 text-[9px] font-bold text-emerald-600 tracking-wider">VIEWPORT</div>
                      <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-emerald-400/90 leading-relaxed select-text whitespace-pre text-left bg-[rgba(6,20,12,0.15)] glow-green-text">
                        {selectedReview.code_content}
                      </div>
                    </div>

                    {/* Feedback Form / Locked Prompt */}
                    {selectedReview.user_id === (getPlayerId() || '') ? (
                      <div className="bg-yellow-950/30 border border-yellow-800/40 p-4 rounded-lg flex items-center gap-3 text-left">
                        <span className="text-yellow-500 text-lg">⚠️</span>
                        <p className="text-[11px] text-yellow-300 leading-normal">
                          <strong>自评锁定:</strong> 您无法对自己的代码提交进行评审。请在团队聊天框中邀请同事在协作白板中为您提供 Review，或静候 AI 导师为您做代码核查。
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 text-left">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          输入同业代码评审意见 (REVIEWER COMMENTS)
                        </label>
                        <textarea
                          placeholder="在此写下你专业的评审意见，例如: 此实现优雅，但在高并发场景下可能存在竞态条件，已合并同意通过。"
                          value={coopFeedback}
                          onChange={(e) => setCoopFeedback(e.target.value)}
                          className="w-full h-20 bg-slate-900 border border-slate-800 focus:border-violet-500 rounded p-2.5 text-xs text-slate-200 outline-none resize-none"
                        />

                        {/* Interactive Buttons */}
                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              if (!coopFeedback.trim()) {
                                alert('请写下评审意见后再驳回！');
                                return;
                              }
                              setIsReviewActionRunning(true);
                              try {
                                await submitPeerReview(selectedReview.id, 'rejected', coopFeedback);
                                setSelectedReview(null);
                                setCoopFeedback('');
                                alert('代码评审已驳回。作者将收到带有您意见的提示，并在其沙盒中修改。');
                              } catch (err) {
                                alert('操作失败，请重试');
                              } finally {
                                setIsReviewActionRunning(false);
                              }
                            }}
                            disabled={isReviewActionRunning}
                            className="flex-1 py-2 text-center bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-100 font-bold text-xs rounded transition-all active:scale-95 duration-75"
                          >
                            ❌ 驳回并修改 (Reject)
                          </button>
                          <button
                            onClick={async () => {
                              if (!coopFeedback.trim()) {
                                alert('请填写评审意见后再通过！');
                                return;
                              }
                              setIsReviewActionRunning(true);
                              try {
                                await submitPeerReview(selectedReview.id, 'approved', coopFeedback);
                                setSelectedReview(null);
                                setCoopFeedback('');
                                alert('同业评审已通过！XP 奖励已派发至您的账户及原作者账户。');
                              } catch (err) {
                                alert('操作失败，请重试');
                              } finally {
                                setIsReviewActionRunning(false);
                              }
                            }}
                            disabled={isReviewActionRunning}
                            className="flex-1 py-2 text-center bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded transition-all active:scale-95 duration-75"
                          >
                            ✓ 同意并通过 (Approve)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <span className="text-4xl text-slate-700 animate-pulse mb-3">📟</span>
                    <h4 className="text-xs font-bold text-slate-400">同业评审终端就绪</h4>
                    <p className="text-[11px] text-slate-500 max-w-sm mt-1 leading-normal">
                      请从左侧列表选择一项待处理的代码请求，以开始查看其源码，补充评审反馈并进行审批。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 9. VIRTUAL RETRO GAMEPAD FOR MOBILE DEVICES */}
      {isMobile && !activeOverlay && !isCoopWhiteboardOpen && !activeChatNpc && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-between items-end px-4 py-2 pointer-events-none select-none pixel-gamepad-container">
          {/* Left Side: Retro Virtual D-Pad */}
          <div className="flex items-center justify-center bg-slate-950/40 p-1.5 rounded-3xl border border-slate-800/20 pointer-events-auto backdrop-blur-[4px] shadow-xl">
            <div className="relative w-28 h-28 flex items-center justify-center">
              {/* Center Core */}
              <div className="w-8 h-8 bg-slate-950 border border-slate-800 rounded-full flex items-center justify-center text-[10px] text-slate-600 font-bold z-10 shadow-inner">
                🕹️
              </div>
              
              {/* Up button */}
              <button
                onTouchStart={() => handleTouchMoveStart(0, -1)}
                onTouchEnd={handleTouchMoveEnd}
                onMouseDown={() => handleTouchMoveStart(0, -1)}
                onMouseUp={handleTouchMoveEnd}
                className="pixel-gamepad-btn absolute top-0 w-9 h-9 border rounded-md text-sm font-bold shadow-md"
                title="Move Up"
              >
                ▲
              </button>

              {/* Down button */}
              <button
                onTouchStart={() => handleTouchMoveStart(0, 1)}
                onTouchEnd={handleTouchMoveEnd}
                onMouseDown={() => handleTouchMoveStart(0, 1)}
                onMouseUp={handleTouchMoveEnd}
                className="pixel-gamepad-btn absolute bottom-0 w-9 h-9 border rounded-md text-sm font-bold shadow-md"
                title="Move Down"
              >
                ▼
              </button>

              {/* Left button */}
              <button
                onTouchStart={() => handleTouchMoveStart(-1, 0)}
                onTouchEnd={handleTouchMoveEnd}
                onMouseDown={() => handleTouchMoveStart(-1, 0)}
                onMouseUp={handleTouchMoveEnd}
                className="pixel-gamepad-btn absolute left-0 w-9 h-9 border rounded-md text-sm font-bold shadow-md"
                title="Move Left"
              >
                ◀
              </button>

              {/* Right button */}
              <button
                onTouchStart={() => handleTouchMoveStart(1, 0)}
                onTouchEnd={handleTouchMoveEnd}
                onMouseDown={() => handleTouchMoveStart(1, 0)}
                onMouseUp={handleTouchMoveEnd}
                className="pixel-gamepad-btn absolute right-0 w-9 h-9 border rounded-md text-sm font-bold shadow-md"
                title="Move Right"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Right Side: Retro Action Buttons (A, B, T) */}
          <div className="flex gap-3.5 items-center bg-slate-950/40 px-3.5 py-2.5 rounded-3xl border border-slate-800/20 pointer-events-auto backdrop-blur-[4px] shadow-xl">
            {/* T Button: Chat Focus */}
            <button
              onClick={() => {
                spatialChatInputRef.current?.focus();
                audioManager.playOpen();
              }}
              className="pixel-gamepad-btn pixel-gamepad-btn-violet w-12 h-12 rounded-full flex flex-col items-center justify-center font-mono"
            >
              <span className="text-[11px] font-bold leading-none">T</span>
              <span className="text-[7.5px] text-violet-400 font-medium scale-75 mt-0.5">CHAT</span>
            </button>

            {/* B Button: Close / Escape */}
            <button
              onClick={() => {
                if (activeOverlay) {
                  closeOverlay();
                } else if (isCoopWhiteboardOpen) {
                  closeCoopWhiteboard();
                } else if (activeChatNpc) {
                  closeConversation();
                }
                audioManager.playClose();
              }}
              className="pixel-gamepad-btn pixel-gamepad-btn-rose w-12 h-12 rounded-full flex flex-col items-center justify-center font-mono"
            >
              <span className="text-[11px] font-bold leading-none">B</span>
              <span className="text-[7.5px] text-rose-400 font-medium scale-75 mt-0.5">BACK</span>
            </button>

            {/* A Button: Interaction / Confirm */}
            <button
              onClick={() => {
                handleTouchInteract();
                audioManager.playOpen();
              }}
              className="pixel-gamepad-btn pixel-gamepad-btn-cyan w-14 h-14 rounded-full flex flex-col items-center justify-center font-mono"
            >
              <span className="text-[13px] font-bold leading-none">A</span>
              <span className="text-[8px] text-cyan-300 font-medium scale-75 mt-0.5">ACTION</span>
            </button>
          </div>
        </div>
      )}

      {/* Network Partition Double-Station Coordinated HUD */}
      {activeAnomaly?.anomaly_id === 'network_partition' && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-35 flex items-center gap-4 px-5 py-2.5 bg-slate-950/90 backdrop-blur-md border border-cyan-500/50 rounded-xl select-none shadow-2xl font-mono text-xs max-w-[95%] pointer-events-auto animate-bounce-slow">
          <div className="flex items-center gap-2">
            <span className="text-base animate-pulse">🌀</span>
            <div>
              <div className="text-[8px] font-bold text-slate-500 tracking-wider">CO-OP STATUS</div>
              <div className="text-[10px] font-bold text-cyan-300">分布式双端协作网关 (Network Partition Active)</div>
            </div>
          </div>
          
          <div className="w-[1px] h-6 bg-slate-800" />
          
          {/* Station 1: Mainframe */}
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              partitionResolvedStations?.includes('station_mainframe') 
                ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' 
                : activeLocks['station_mainframe']
                  ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                  : 'bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]'
            }`} />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400">机房核心网关 (18, 15)</span>
              <span className="text-[10px] font-bold">
                {partitionResolvedStations?.includes('station_mainframe') 
                  ? '✅ 已配置通过' 
                  : activeLocks['station_mainframe'] 
                    ? `🔌 ${activeLocks['station_mainframe'].holder_id.substring(0, 5)} 正在编译...` 
                    : '🔒 未锁定 (需要解决)'}
              </span>
            </div>
          </div>

          <span className="text-slate-700 font-bold">&lt;══双端并联闭环══&gt;</span>

          {/* Station 2: Sub-Node */}
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              partitionResolvedStations?.includes('station_dev_b') 
                ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' 
                : activeLocks['station_dev_b']
                  ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                  : 'bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]'
            }`} />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400">工位 B 备份网卡 (11, 17)</span>
              <span className="text-[10px] font-bold">
                {partitionResolvedStations?.includes('station_dev_b') 
                  ? '✅ 已共识同步' 
                  : activeLocks['station_dev_b'] 
                    ? `🔌 ${activeLocks['station_dev_b'].holder_id.substring(0, 5)} 正在同步...` 
                    : '🔒 未锁定 (需要解决)'}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
