'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSpaceStore } from '@/stores/spaceStore';
import { useUserStore } from '@/stores/userStore';
import { useMissionStore } from '@/stores/missionStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useSkillStore } from '@/stores/skillStore';
import { api, streamChat, SpatialRagChunk } from '@/services/apiClient';
import { careerService, missionService, skillService } from '@/services';
import { PixelBadge, PixelButton, PixelCard } from '@/components/pixel';
import { audioManager } from '@/utils/audioManager';
import CareerWorldMap, { CareerMapIsland } from '@/components/lobby/CareerWorldMap';
import CareerPreviewPanel from '@/components/lobby/CareerPreviewPanel';
import { CareerSkillTree } from '@/components/career';
import { CareerIsland, Mission, MissionStatus } from '@/types';

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
  } = useSpaceStore();

  const { currentCareerId, totalXp, selectCareer, addXp } = useUserStore();
  const { getMissionStatus, acceptMission, completeMission, submitMission } = useMissionStore();
  const { skills, setSkills } = useSkillStore();

  // Internal states
  const lastMoveTimeRef = useRef<number>(0);
  const [activeZone, setActiveZone] = useState<string>('Lobby');

  // Unified overlay screen state: lobby | quests | portfolio | community | sandbox | skills | null
  const [activeOverlay, setActiveOverlay] = useState<'lobby' | 'quests' | 'portfolio' | 'community' | 'sandbox' | 'skills' | null>(null);

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

  // Handle Keyboard Inputs
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if user is writing in inputs
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
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
            openOverlay('skills');
            return;
          }
          if (interactiveNpcId) {
            const npc = NPC_INFO[interactiveNpcId as keyof typeof NPC_INFO];
            if (npc) {
              startConversation(npc);
            }
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
  }, [movePlayer, interactiveNpcId, isAdjacentToTable, isNearLobbyDesk, isNearDevWorkstation, isNearArchiveBookshelf, isNearSkillTerminal, activeChatNpc]);

  const openOverlay = (overlayType: 'lobby' | 'quests' | 'portfolio' | 'community' | 'sandbox' | 'skills') => {
    audioManager.playOpen();
    setActiveOverlay(overlayType);
    if (overlayType === 'skills') {
      setAmbientTheme('quiet-blue');
    }
  };

  const closeOverlay = () => {
    audioManager.playClose();
    setActiveOverlay(null);
    if (activeOverlay === 'skills' || ambientTheme === 'quiet-blue') {
      setAmbientTheme('default');
    }
  };

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

  // NPCs Chat conversation
  const startConversation = (npc: typeof NPC_INFO.mentor_ling) => {
    setActiveChatNpc(npc);
    audioManager.playOpen();
    setChatMessages([{ role: 'npc', content: npc.greeting }]);
    setChatInput('');
  };

  const closeConversation = () => {
    setActiveChatNpc(null);
    audioManager.playClose();
    setChatMessages([]);
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

  // Sandbox Code compile & tests simulator
  const handleCompileCode = async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    setTestResult('running');
    setScreenShake(true);
    setCompileLog(['⏳ [0.0s] Booting virtual Sandbox Pandas runtime container...']);

    // Play compile sound loop and vibrate
    audioManager.playThemeTransition('alert-red');

    setTimeout(() => {
      setCompileLog((prev) => [...prev, '📦 [0.4s] Mounting system core libraries: pandas, numpy, scikit-learn...']);
      audioManager.playTypewriter();
    }, 450);

    setTimeout(() => {
      setCompileLog((prev) => [...prev, '🔬 [0.9s] Injecting task evaluation schema: pandas_active_days_validation_suite...']);
      audioManager.playTypewriter();
    }, 900);

    setTimeout(() => {
      setCompileLog((prev) => [...prev, '⚙️ [1.3s] Executing Pandas DataFrame query assertions...']);
      audioManager.playTypewriter();
    }, 1300);

    setTimeout(() => {
      setScreenShake(false);
      
      // Analyze code for groupby/fillna
      const hasGroupby = sandboxCode.includes('groupby');
      const hasFillna = sandboxCode.includes('fillna');

      if (hasGroupby && hasFillna) {
        setCompileLog((prev) => [
          ...prev,
          '✓ [1.6s] Test assert_fillna_completions: PASSED',
          '✓ [1.8s] Test assert_groupby_aggregates: PASSED',
          '🎉 [2.0s] SUCCESS: All 3/3 testing constraints compiled with absolute success!',
        ]);
        setTestResult('success');
        setAmbientTheme('celebrate-gold');
        audioManager.playThemeTransition('celebrate-gold');
      } else {
        setCompileLog((prev) => [
          ...prev,
          '❌ [1.6s] Test assert_fillna_completions: FAILED',
          `🚨 Syntax Error: pandas dataframe columns contain unresolved NaN values.`,
          `AttributeError: 'DataFrame' object has no attribute 'fillna' or 'groupby'.`,
          '💔 [2.0s] COMPILATION FAILED: test suites failed because of syntax anomalies.',
        ]);
        setTestResult('fail');
        setAmbientTheme('alert-red');
        audioManager.playThemeTransition('alert-red');
      }
      setIsCompiling(false);
    }, 2000);
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
    return !!(isNearLobbyDesk || isNearDevWorkstation || isNearArchiveBookshelf || isNearSkillTerminal || isAdjacentToTable);
  }, [isNearLobbyDesk, isNearDevWorkstation, isNearArchiveBookshelf, isNearSkillTerminal, isAdjacentToTable]);

  return (
    <div className={`w-screen h-screen flex flex-col xl:flex-row gap-4 justify-between items-center relative select-none p-4 ${screenShake ? 'console-screen-shake' : ''}`}>
      
      {/* ================== FLOATING HUD PANELS ================== */}

      {/* 1. TOP MENU CAPSULE */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-4 md:gap-6 px-6 py-2.5 glass-cockpit rounded-full select-none shadow-2xl transition-all duration-300 pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="text-xl animate-pulse">🕹️</span>
          <div>
            <span className="text-[10px] font-bold text-slate-500 tracking-wider">OFFICECRAFT AI CONSOLE</span>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[9px] text-emerald-400 font-bold uppercase font-mono">Cockpit OK</span>
            </div>
          </div>
        </div>

        <div className="w-[1px] h-6 bg-slate-800" />

        {/* Global User status badge */}
        <div className="flex gap-4 font-mono text-xs">
          <div>
            <div className="text-[8px] text-slate-500 uppercase leading-none">Career Path</div>
            <div className="text-xs font-bold text-amber-300 leading-tight">
              {currentCareerId ? (currentCareerId === 'data-analyst' ? '数据分析师' : '初级软件工程师') : '尚未选择职业'}
            </div>
          </div>
          <div>
            <div className="text-[8px] text-slate-500 uppercase leading-none">Growth XP</div>
            <div className="text-xs font-bold text-cyan-400 leading-tight">{totalXp} XP</div>
          </div>
          <div>
            <div className="text-[8px] text-slate-500 uppercase leading-none">Rank</div>
            <div className="text-xs font-bold text-purple-400 leading-tight">Lvl {Math.floor(totalXp / 100) + 1}</div>
          </div>
        </div>

        <div className="w-[1px] h-6 bg-slate-800" />

        {/* Location coordinate & volume controls */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1 bg-slate-950/60 px-2.5 py-1 border border-slate-800/80 rounded">
            <span className="text-[10px] text-slate-400">COORDS:</span>
            <span className="font-bold text-cyan-300">({playerCoords.x}, {playerCoords.y})</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1 border border-slate-800/80 rounded">
            <button onClick={toggleMute} className="text-sm select-none hover:scale-110 focus:outline-none">
              {isMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-14 h-1 rounded bg-slate-800 accent-indigo-500 cursor-pointer border border-slate-700 outline-none"
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

      {/* 2. LEFT COCKPIT DECK (COLLAPSIBLE) */}
      <div className={`fixed top-20 bottom-4 w-[285px] z-30 flex flex-col gap-4 p-4 glass-cockpit overflow-y-auto pointer-events-auto rounded-xl shadow-2xl select-none transition-all duration-300 ${
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
            ambientTheme === 'celebrate-gold' ? 'bg-amber-950/40 border-amber-800/60 text-amber-400' :
            'bg-slate-900/40 border-slate-800 text-slate-400'
          }`}>
            {ambientTheme === 'quiet-blue' ? '🔵 静谧幽蓝工作环境' :
             ambientTheme === 'alert-red' ? '🚨 警报红色异常主题' :
             ambientTheme === 'celebrate-gold' ? '✨ 金色庆典丰碑主题' :
             '⚪ 经典日光灰度环境'}
          </div>
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
          </div>
        </div>
      </div>

      {/* ================== CENTRAL 2D MAP GRID PANEL ================== */}
      <div className="w-full h-full flex-1 flex items-center justify-center relative overflow-hidden">
        <div className="transform scale-[0.85] sm:scale-[0.95] md:scale-100 lg:scale-[1.05] xl:scale-[1.1] 2xl:scale-[1.15] origin-center transition-all duration-300 select-none">
          
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

            {/* Interactive Skill Matrix Server Terminal */}
            <div
              onClick={() => openOverlay('skills')}
              className="absolute top-0 left-0 w-[32px] h-[32px] pixel-server-rack hover:scale-105 active:scale-95 transition-all duration-100 flex flex-col items-center justify-between p-[2px] cursor-pointer z-20 group"
              style={{ transform: `translate3d(${SKILL_TERMINAL.coords.x * 32}px, ${SKILL_TERMINAL.coords.y * 32}px, 0)` }}
            >
              {/* Floating Proximity Prompt Bubble */}
              {isNearSkillTerminal && (
                <div className="absolute bottom-8 flex flex-col items-center animate-bounce z-30">
                  <div className="bg-slate-900/95 border-2 border-cyan-500 text-[9px] font-bold text-cyan-300 font-mono py-1 px-1.5 rounded whitespace-nowrap shadow-md">
                    [Space] 技能星图
                  </div>
                  <div className="w-1.5 h-1.5 bg-cyan-500 rotate-45 -mt-1 border-r border-b border-cyan-500" />
                </div>
              )}

              {/* Pulsing LEDs indicators */}
              <div className="w-[28px] h-full flex flex-col justify-around py-0.5 pointer-events-none">
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className="w-[3px] h-full bg-cyan-400 animate-pulse" />
                  <div className="w-[3px] h-full bg-cyan-400/50" />
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className="w-[3px] h-full bg-emerald-500 animate-pulse delay-300" />
                </div>
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className="w-[3px] h-full bg-cyan-400 animate-pulse delay-100" />
                  <div className="w-[3px] h-full bg-emerald-500 animate-pulse delay-500" />
                  <div className="w-[3px] h-full bg-slate-800" />
                </div>
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className="w-[3px] h-full bg-cyan-400 animate-pulse delay-200" />
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className="w-[3px] h-full bg-cyan-400 animate-pulse delay-700" />
                  <div className="w-[3px] h-full bg-emerald-500 animate-pulse delay-150" />
                </div>
                <div className="h-[2px] w-full bg-slate-950 flex gap-[2px] px-[1px]">
                  <div className="w-[3px] h-full bg-emerald-500 animate-pulse delay-400" />
                  <div className="w-[3px] h-full bg-cyan-400 animate-pulse" />
                  <div className="w-[3px] h-full bg-slate-800" />
                  <div className="w-[3px] h-full bg-slate-800" />
                </div>
              </div>

              {/* Hover Tooltip */}
              <div className="absolute top-8 scale-0 group-hover:scale-100 transition-all bg-slate-900/90 border border-slate-700 text-[9px] text-slate-300 py-0.5 px-2 rounded whitespace-nowrap pointer-events-none z-30">
                {SKILL_TERMINAL.name}
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
              const coords = npc.id === 'mentor_ling' ? { x: 15, y: 6 } : npc.id === 'pm_amy' ? { x: 18, y: 5 } : { x: 20, y: 20 };
              const isTargetNear = interactiveNpcId === npc.id;
              return (
                <div
                  key={npc.id}
                  onClick={() => startConversation(npc)}
                  className="absolute top-0 left-0 w-[32px] h-[32px] flex items-center justify-center text-xl cursor-pointer z-20 select-none group"
                  style={{ transform: `translate3d(${coords.x * 32}px, ${coords.y * 32}px, 0)` }}
                >
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

            {/* Dynamic ambient lighting/spotlight mask (Phase 10) */}
            <div 
              className="absolute inset-0 pointer-events-none z-25 transition-all duration-300 mix-blend-multiply"
              style={{
                background: `radial-gradient(circle 180px at ${playerCoords.x * 32 + 16}px ${playerCoords.y * 32 + 16}px, ${
                  ambientTheme === 'quiet-blue' ? 'rgba(186, 230, 253, 0.25) 0%, rgba(30, 41, 59, 0.65) 60%, rgba(15, 23, 42, 0.92) 100%' :
                  ambientTheme === 'alert-red' ? 'rgba(254, 202, 202, 0.2) 0%, rgba(127, 29, 29, 0.7) 50%, rgba(15, 23, 42, 0.95) 100%' :
                  ambientTheme === 'celebrate-gold' ? 'rgba(254, 243, 199, 0.3) 0%, rgba(120, 53, 4, 0.6) 60%, rgba(15, 23, 42, 0.9) 100%' :
                  'rgba(255, 255, 240, 0.15) 0%, rgba(30, 41, 59, 0.5) 65%, rgba(15, 23, 42, 0.88) 100%'
                })`
              }}
            />

            {/* Ambient Overlays (Prompt-to-Light) */}
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
            {ambientTheme === 'celebrate-gold' && (
              <div className="absolute inset-0 bg-amber-500/5 pointer-events-none z-10 border-8 border-amber-600/20">
                <div className="absolute inset-0 bg-radial-at-b from-amber-500/10 via-transparent to-transparent" />
                <div className="absolute bottom-12 left-1/4 text-amber-300 text-xs animate-bounce opacity-80">✨</div>
                <div className="absolute bottom-36 right-1/3 text-amber-300 text-xs animate-pulse opacity-60">✨</div>
                <div className="absolute bottom-24 right-12 text-amber-300 text-sm animate-bounce opacity-70">🌟</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================== HIGH-FIDELITY SPATIAL OVERLAYS (MODALS) ================== */}

      {/* 1. LOBBY OVERLAY */}
      {activeOverlay === 'lobby' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-5xl bg-slate-900 border-4 border-amber-500 shadow-2xl p-6 rounded-lg relative flex flex-col md:flex-row gap-6 animate-slide-in-up">
            <button onClick={closeOverlay} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-sm font-mono">[关闭 Esc]</button>
            
            <div className="flex-1">
              <div className="mb-4">
                <PixelBadge variant="warning">LOBBY WORLD MAP</PixelBadge>
                <h3 className="pixel-title text-xl text-amber-300 font-bold mt-1">请绑定并进入你的第一条职业大陆</h3>
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-4xl bg-slate-900 border-4 border-indigo-500 shadow-2xl p-6 rounded-lg relative flex flex-col gap-4 animate-slide-in-up">
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-4xl bg-slate-900 border-4 border-purple-500 shadow-2xl p-6 rounded-lg relative flex flex-col gap-6 animate-slide-in-up">
            <button onClick={closeOverlay} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-sm font-mono">[关闭 Esc]</button>
            
            <div className="border-b-4 border-purple-950 pb-3">
              <PixelBadge variant="warning">GROWTH PORTFOLIO</PixelBadge>
              <h3 className="pixel-title text-xl text-slate-100 font-bold mt-1">初学者个人成长档案馆</h3>
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

              <div className="col-span-2 bg-slate-950 p-5 border-2 border-purple-900/40 rounded flex flex-col justify-between">
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-5xl bg-slate-900 border-4 border-emerald-500 shadow-2xl p-6 rounded-lg relative flex flex-col gap-4 animate-slide-in-up">
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
        <div className="fixed top-20 right-4 bottom-4 w-[740px] bg-slate-950/95 border-2 border-cyan-500 rounded-xl shadow-2xl z-40 p-5 flex flex-col gap-4 animate-slide-in-right pointer-events-auto select-none">
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

          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 font-mono">
            {/* Left Col: Instructions & handbook */}
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
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
            <div className="flex flex-col gap-3 min-h-0">
              <div className="flex-1 flex flex-col border border-slate-800 rounded bg-slate-900/40 relative">
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
            </div>
          </div>
        </div>
      )}

      {/* 6. SKILL MATRIX OVERLAY (FULL SCREEN GLASSMORPHIC DIALOG) */}
      {activeOverlay === 'skills' && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 font-mono select-none animate-fade-in pointer-events-auto">
          <div className="w-full max-w-5xl h-[85vh] bg-slate-950/90 border-4 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)] p-6 relative flex flex-col gap-4 rounded-xl">
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
            <div className="flex justify-between items-center bg-slate-900/50 p-3 border border-slate-800/60 rounded text-[11px] text-slate-400">
              <div className="flex items-center gap-4">
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

    </div>
  );
}
