import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import CloudExplorer from './components/CloudExplorer';
import CloudInspect from './components/CloudInspect';
import CloudFlowLog from './components/CloudFlowLog';
import CloudGraph from './components/CloudGraph';
import AIPanel from './components/AIPanel';
import { PlaybookEditor } from './components/PlaybookEditor';
import { PlaybookResult } from './components/PlaybookResult';
import { PlaybookPreflight } from './components/PlaybookPreflight';
import { PlaybookAnalysis } from './components/PlaybookAnalysis';
import { api } from './api';
import { useAISession } from './hooks/useAISession';
import { useWorkspace } from './hooks/useWorkspace';
import TopologyViewer from './components/TopologyViewer';
import { X, Terminal as TerminalIcon, Layout, Monitor, Users, Globe, Cloud, Cpu, BookOpen, Copy, RefreshCw, Pencil, Activity, Check, LogOut, User } from 'lucide-react';
import type { Tab } from './types';
import LoginPage from './components/LoginPage';

function App() {
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [ssoError, setSsoError] = useState<string | null>(null);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [activeAiTab, setActiveAiTab] = useState<'global' | 'terminal'>('global');
  const [aiPanelWidth, setAiPanelWidth] = useState(380);
  const [copiedId, setCopiedId] = useState(false);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState<boolean>(false);
  const [showExpiredModal, setShowExpiredModal] = useState<boolean>(false);
  const [showReauthModal, setShowReauthModal] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string | null>(localStorage.getItem('connpy_session_token'));

  // Global AWS Context (shared with CloudExplorer)
  const [selectedProfile, setSelectedProfile] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [profiles, setProfiles] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Global Nodes Inventory (for SmartText linking)
  const [availableNodes, setAvailableNodes] = useState<string[]>([]);

  // Tab Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tab: Tab } | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Hooks ---
  const { workspaceId, socketRef: workspaceSocketRef, updateTabsAndPush, toggleWorkspace } = useWorkspace(tabs, setTabs);
  const { thoughts, isAiProcessing, setThoughts, sendPrompt, sendConfirmation, abort, clearThoughts, toggleThought, startNewSession } = useAISession(workspaceId, sessionToken);

  // Auto-scroll AI panel
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thoughts]);

  // Patch fetch to automatically handle 401 Unauthorized responses globally
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const token = localStorage.getItem('connpy_session_token');
        if (token) {
          if (!isReadOnlyMode) {
            setShowExpiredModal(true);
          }
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [isReadOnlyMode]);

  // Probe Auth Status on Boot
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const stateProvider = urlParams.get('state') || localStorage.getItem('sso_provider') || '';

    if (code) {
      // Clear URL params to avoid exchange loops on page refreshes
      window.history.replaceState({}, document.title, window.location.pathname);
      setAuthRequired(null); // Show loading handshake screen during exchange
      
      api.loginSso(code, stateProvider, undefined, window.location.origin)
        .then(res => {
          setSsoError(null);
          localStorage.removeItem('sso_provider');
          localStorage.setItem('connpy_session_token', res.token);
          localStorage.setItem('connpy_username', res.username);
          setSessionToken(res.token);
          setAuthRequired(true);
          setIsAuthenticated(true);
          setUsername(res.username);
        })
        .catch(err => {
          localStorage.removeItem('sso_provider');
          console.error("SSO Token Exchange failed:", err);
          setSsoError(err.message || 'SSO authentication failed');
          setIsAuthenticated(false);
          setAuthRequired(true);
        });
      return;
    }

    api.getAuthStatus()
      .then(res => {
        if (res.token) {
          // SSO Auto-login (Forward Auth headers detected)
          localStorage.setItem('connpy_session_token', res.token);
          localStorage.setItem('connpy_username', res.username);
          setSessionToken(res.token);
          setAuthRequired(true);
          setIsAuthenticated(true);
          setUsername(res.username);
          return;
        }

        setAuthRequired(res.auth_required);
        if (res.auth_required) {
          const token = localStorage.getItem('connpy_session_token');
          const storedUser = localStorage.getItem('connpy_username');
          if (token && storedUser) {
            api.getMe()
              .then(me => {
                setIsAuthenticated(true);
                setUsername(me.username || storedUser);
              })
              .catch(() => {
                localStorage.removeItem('connpy_session_token');
                localStorage.removeItem('connpy_username');
                setSessionToken(null);
                setIsAuthenticated(false);
                setUsername('');
              });
          } else {
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(true);
        }
      })
      .catch(e => {
        console.error("Failed to probe auth status", e);
        setAuthRequired(false);
        setIsAuthenticated(true);
      });
  }, []);

  // Schedule proactive session expiration check based on JWT expiration claim
  useEffect(() => {
    if (!isAuthenticated || isReadOnlyMode || showExpiredModal) return;

    const token = localStorage.getItem('connpy_session_token');
    if (!token) return;

    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(window.atob(base64).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(jsonPayload);
      
      const exp = payload.exp;
      if (exp) {
        const timeLeftMs = (exp * 1000) - Date.now();
        if (timeLeftMs > 0) {
          const timer = setTimeout(() => {
            setShowExpiredModal(true);
          }, timeLeftMs);
          return () => clearTimeout(timer);
        } else {
          // Already expired
          setShowExpiredModal(true);
        }
      }
    } catch (e) {
      console.error('Failed to parse token expiration', e);
    }
  }, [isAuthenticated, isReadOnlyMode, showExpiredModal]);

  // Fetch node inventory for SmartText
  useEffect(() => {
    if (!isAuthenticated) return;

    api.getInventory()
      .then(res => { if (res?.nodes && Array.isArray(res.nodes)) setAvailableNodes(res.nodes); })
      .catch(e => console.error('Failed to fetch available nodes', e));
    
    api.awsInfo()
      .then(data => {
        if (data.error) return;
        const p = Array.isArray(data.profiles) ? data.profiles : [];
        const r = Array.isArray(data.regions) ? data.regions : [];
        setProfiles(p);
        setRegions(r);
        if (p.length > 0) setSelectedProfile(p[0]);
        if (r.length > 0) setSelectedRegion(r[0]);
      })
      .catch(e => console.error('Failed to fetch AWS info', e));
  }, [isAuthenticated]);

  // --- Phase 5: Copilot Event Bridge ---
  useEffect(() => {
    const handleCopilotAction = (e: any) => {
      const { nodeId } = e.detail;
      const isRun = e.type === 'copilot-run-commands' || e.type === 'copilot-custom-run-commands';

      if (nodeId) {
        // Find the latest active confirm thought for this node
        const latestConfirm = [...thoughts].reverse().find(t => t.nodeId === nodeId && t.type === 'confirm' && !t.status);
        if (latestConfirm) {
          sendConfirmation(latestConfirm.id, isRun ? 'y' : 'n');
        }
      }
    };

    const handleCopilotMessage = (e: any) => {
      const payload = e.detail;
      const dispatcher = (window as any).terminalCopilotDispatcher;
      
      // If the message is an external cancel notification from the server
      if (payload.type === 'copilot_external_cancel') {
        const latestConfirm = [...thoughts].reverse().find(t => t.nodeId === payload.nodeId && t.type === 'confirm' && !t.status);
        if (latestConfirm) {
           sendConfirmation(latestConfirm.id, 'n');
        }
      }

      // Auto-open and switch AI tab to terminal for both local operator and remote co-op viewers
      if (payload.type === 'copilot_question_local' || payload.type === 'copilot_question_remote') {
        setShowAiPanel(true);
        setActiveAiTab('terminal');
      }

      if (dispatcher) {
        dispatcher(payload);
      }
    };

    window.addEventListener('copilot-message', handleCopilotMessage);
    window.addEventListener('copilot-run-commands', handleCopilotAction);
    window.addEventListener('copilot-custom-run-commands', handleCopilotAction);
    window.addEventListener('copilot-external-cancel', handleCopilotAction);

    return () => {
      window.removeEventListener('copilot-message', handleCopilotMessage);
      window.removeEventListener('copilot-run-commands', handleCopilotAction);
      window.removeEventListener('copilot-custom-run-commands', handleCopilotAction);
      window.removeEventListener('copilot-external-cancel', handleCopilotAction);
    };
  }, [thoughts, sendConfirmation]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // --- Tab Helpers ---
  const closeTab = (tabId: string) => {
    const tabToClose = tabs.find(t => t.id === tabId);
    if (tabToClose?.nodeId) {
      // Clear AI thoughts for this node when closing the tab
      setThoughts(prev => prev.filter(t => t.nodeId !== tabToClose.nodeId));
    }
    const newTabs = tabs.filter(t => t.id !== tabId);
    updateTabsAndPush(newTabs);
    if (activeTabId === tabId) setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
  };

  const handleOpenNode = (node: string) => {
    const existing = tabs.find(t => t.nodeId === node && t.type !== 'cloud_explorer');
    if (existing) { setActiveTabId(existing.id); return; }
    const newId = Math.random().toString(36).substring(7);
    const newTabs: Tab[] = [...tabs, { id: newId, nodeId: node, type: 'terminal' }];
    updateTabsAndPush(newTabs);
    setActiveTabId(newId);
  };

  const handleOpenInspect = (assetId: string, profile: string, region: string) => {
    const tabId = `inspect:${assetId}:${profile}:${region}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { id: tabId, nodeId: assetId, type: 'cloud_inspect', meta: { profile, region } };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenFlowLog = (eniId: string, flId: string, profile: string, region: string) => {
    const tabId = `flowlog:${flId}:${profile}:${region}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { id: tabId, nodeId: flId, type: 'cloud_flowlog', meta: { profile, region, eniId } };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenGraph = (identifier: string, metricType: 'bw' | 'pps', profile: string, region: string, name?: string) => {
    const tabId = `graph:${metricType}:${identifier}:${profile}:${region}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) { setActiveTabId(existing.id); return; }
    const displayLabel = name ? `${metricType.toUpperCase()} - ${name}` : `${metricType.toUpperCase()} - ${identifier}`;
    const newTab: Tab = { id: tabId, nodeId: displayLabel, type: 'cloud_graph', meta: { profile, region, metricType, identifier, name: name || '' } };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenConsole = (instanceId: string, profile: string, region: string, name?: string) => {
    const consoleId = `aws-console:${instanceId}?profile=${profile}&region=${region}`;
    const existing = tabs.find(t => t.nodeId === consoleId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { 
      id: Math.random().toString(36).substring(7), 
      nodeId: consoleId, 
      type: 'terminal',
      customName: name ? `Console - ${name}` : undefined
    };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenSSM = (instanceId: string, profile: string, region: string, name?: string) => {
    const ssmId = `aws-ssm:${instanceId}?profile=${profile}&region=${region}`;
    const existing = tabs.find(t => t.nodeId === ssmId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { 
      id: Math.random().toString(36).substring(7), 
      nodeId: ssmId, 
      type: 'terminal',
      customName: name ? `SSM - ${name}` : undefined
    };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenCloudExplorer = () => {
    const newId = Math.random().toString(36).substring(7);
    const newTabs: Tab[] = [...tabs, { 
      id: newId, 
      nodeId: 'AWS Explorer', 
      type: 'cloud_explorer',
      meta: { profile: selectedProfile, region: selectedRegion }
    }];
    updateTabsAndPush(newTabs);
    setActiveTabId(newId);
  };

  
  const handleOpenPlaybookEditor = () => {
    const existing = tabs.find(t => t.type === 'playbook_editor');
    if (existing) { setActiveTabId(existing.id); return; }
    const newId = Math.random().toString(36).substring(7);
    const newTabs: Tab[] = [...tabs, { id: newId, nodeId: 'Playbook', type: 'playbook_editor' }];
    updateTabsAndPush(newTabs);
    setActiveTabId(newId);
  };

  const handleOpenPlaybookResult = (playbookData: any) => {
    const newId = `result-${Math.random().toString(36).substring(7)}`;
    const newTab: Tab = { 
        id: newId, 
        nodeId: `Result: ${playbookData.playbook || 'Execution'}`, 
        type: 'playbook_result',
        meta: { playbookData: JSON.stringify(playbookData) }
    };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newId);
  };

  const handleOpenPlaybookPreflight = (playbookData: any) => {
    const newId = `preflight-${Math.random().toString(36).substring(7)}`;
    const newTab: Tab = { 
        id: newId, 
        nodeId: `Preflight: ${playbookData.playbook || 'Simulation'}`, 
        type: 'playbook_preflight',
        meta: { playbookData: JSON.stringify(playbookData) }
    };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newId);
  };

  const handleStartPlaybookAnalysis = (
    playbookName: string, 
    customPrompt: string, 
    logs: any[]
  ) => {
    console.log("Analyzing playbook:", playbookName);
    const outputs = logs.filter(l => l.type === 'output');
    
    // Build the results dictionary matching connpy structure
    const resultsDict: Record<string, any> = {};
    outputs.forEach(o => {
      resultsDict[o.node || 'global'] = {
        output: o.data || '',
        status: o.status || 0,
        result: o.result || {}
      };
    });

    const newId = `analysis-${Math.random().toString(36).substring(7)}`;
    const newTab: Tab = { 
        id: newId, 
        nodeId: `Analysis: ${playbookName}`, 
        type: 'playbook_analysis',
        meta: { 
            playbookName, 
            customPrompt, 
            results: JSON.stringify(resultsDict)
        }
    };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newId);
  };


  const handleOpenTopology = (content: string) => {
    const tabId = `topo-${Math.random().toString(36).substring(7)}`;
    const newTab: Tab = { 
      id: tabId, 
      nodeId: 'Topology', 
      type: 'topology', 
      meta: { content } 
    };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(tabId);
  };

  const handleAbort = () => {
    // 1. Always abort the global AI session
    abort();

    // 2. If we are in a terminal tab, send an external cancel event to that terminal's WebSocket
    if (activeTab?.type === 'terminal' && activeTab.nodeId) {
      window.dispatchEvent(new CustomEvent('copilot-external-cancel', { 
        detail: { nodeId: activeTab.nodeId } 
      }));
    }
  };

  const handleClearThoughts = (tab: 'global' | 'terminal') => {
    if (tab === 'global') {
      // Clear only global thoughts (those with no nodeId)
      setThoughts(prev => prev.filter(t => t.nodeId));
    } else if (activeTab?.type === 'terminal' && activeTab.nodeId) {
      // Clear only thoughts for the CURRENT active node
      setThoughts(prev => prev.filter(t => t.nodeId !== activeTab.nodeId));
    }
  };

  const handleCopilotRequest = (text: string, mode: string) => {
    setShowAiPanel(true);
    setActiveAiTab('terminal');
    console.log(`Phase 2 Hook: AI Copilot Requested -> "${text}" (Mode: ${mode})`);
  };

  const handleConnpyLink = (url: string) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'connpy:' && urlObj.host === 'aws' && urlObj.pathname === '/inspect') {
        const id = urlObj.searchParams.get('id');
        const profile = urlObj.searchParams.get('profile') || (activeTab?.meta?.profile || selectedProfile);
        const region = urlObj.searchParams.get('region') || (activeTab?.meta?.region || selectedRegion);
        if (id && profile && region) handleOpenInspect(id, profile, region);
      }
    } catch (e) {
      console.error('Failed to parse connpy link', e);
    }
  };

  const handleReplicateTab = (tabToCopy: Tab) => {
    const newId = Math.random().toString(36).substring(7);
    const newTab: Tab = { ...tabToCopy, id: newId };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newId);
    setContextMenu(null);
  };

  const handleReloadTab = (tabToReload: Tab) => {
    const newId = Math.random().toString(36).substring(7);
    const newTabs = tabs.map(t => t.id === tabToReload.id ? { ...t, id: newId } : t);
    updateTabsAndPush(newTabs);
    if (activeTabId === tabToReload.id) setActiveTabId(newId);
    setContextMenu(null);
  };

  const handleStartRename = (tab: Tab) => {
    setRenamingTabId(tab.id);
    setContextMenu(null);
  };

  const handleRenameSubmit = (tabId: string, newName: string) => {
    const newTabs = tabs.map(t => t.id === tabId ? { ...t, customName: newName } : t);
    updateTabsAndPush(newTabs);
    setRenamingTabId(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('connpy_session_token');
    localStorage.removeItem('connpy_username');
    setSessionToken(null);
    setIsAuthenticated(false);
    setUsername('');
    setTabs([]);
    setActiveTabId(null);
    setIsReadOnlyMode(false);
    setShowExpiredModal(false);
  };

  if (authRequired === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#2e3440] text-[#d8dee9] font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#88c0d0]/30 border-t-[#88c0d0] rounded-full animate-spin" />
          <div className="text-[10px] font-black uppercase tracking-widest text-[#81a1c1] animate-pulse">Establishing secure handshake...</div>
        </div>
      </div>
    );
  }

  if (authRequired && !isAuthenticated) {
    return <LoginPage 
      initialError={ssoError}
      onLoginSuccess={(user, token) => {
        setSsoError(null);
        setSessionToken(token);
        setIsReadOnlyMode(false);
        setShowExpiredModal(false);
        setIsAuthenticated(true);
        setUsername(user);
      }} 
    />;
  }

  return (
    <div className="flex h-screen w-screen bg-[#2e3440] text-[#d8dee9] font-sans overflow-hidden">
      {contextMenu && (
        <>
          <div className="fixed inset-0 w-full h-full z-[100]" onClick={(e) => { e.stopPropagation(); setContextMenu(null); }} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div 
            className="fixed z-[101] bg-[#333844] rounded-md shadow-2xl py-1 w-48 text-[#d8dee9] text-[11px] font-bold overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button 
              className="w-full text-left px-4 py-2 hover:bg-[#454c5c] transition-colors flex items-center gap-3 text-[#88c0d0] outline-none border-none focus:outline-none ring-0"
              onClick={(e) => { e.stopPropagation(); handleStartRename(contextMenu.tab); }}
            >
              <Pencil size={14} /> Rename
            </button>
            <button 
              className="w-full text-left px-4 py-2 hover:bg-[#454c5c] transition-colors flex items-center gap-3 text-[#a3be8c] outline-none border-none focus:outline-none ring-0"
              onClick={(e) => { e.stopPropagation(); handleReplicateTab(contextMenu.tab); }}
            >
              <Copy size={14} /> Replicate Session
            </button>
            <button 
              className="w-full text-left px-4 py-2 hover:bg-[#454c5c] transition-colors flex items-center gap-3 text-[#ebcb8b] outline-none border-none focus:outline-none ring-0"
              onClick={(e) => { e.stopPropagation(); handleReloadTab(contextMenu.tab); }}
            >
              <RefreshCw size={14} /> Reconnect / Reload
            </button>
          </div>
        </>
      )}

      <Sidebar 
        onSelectNode={handleOpenNode} 
        activeNodeId={activeTab?.nodeId} 
        onCloudExplorer={handleOpenCloudExplorer} 
        onPlaybookEditor={handleOpenPlaybookEditor} 
        width={sidebarWidth}
      />

      {/* Sidebar Resize Handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingSidebar(true);
          const handleMouseMove = (ev: MouseEvent) => {
            if (ev.clientX >= 200 && ev.clientX <= 600) setSidebarWidth(ev.clientX);
          };
          const handleMouseUp = () => {
            setIsResizingSidebar(false);
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
          };
          document.body.style.cursor = 'ew-resize';
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
        }}
        className="w-1 h-full cursor-ew-resize z-50 group shrink-0"
      >
        <div className={`w-[2px] h-full transition-all ${isResizingSidebar ? 'bg-[#88c0d0]' : 'bg-transparent group-hover:bg-[#88c0d0]/50'}`} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header / Tab Bar */}
        <div className="h-14 border-b border-[#3b4252] bg-[#3b4252]/40 flex items-center justify-between px-4 shrink-0 z-30">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pr-4">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, tab }); }}
                className={`group flex items-center gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px] cursor-pointer rounded-md transition-all border ${activeTabId === tab.id ? 'bg-[#2e3440] border-[#81a1c1] text-[#88c0d0]' : 'bg-transparent border-transparent text-[#81a1c1] hover:text-[#d8dee9]/80'}`}
              >
                {tab.type === 'playbook_editor' ? (
                  <BookOpen size={14} className={activeTabId === tab.id ? 'text-[#b48ead]' : 'text-[#81a1c1]/60'} />
                ) : tab.type === 'cloud_explorer' ? (
                  <Cloud size={14} className={activeTabId === tab.id ? 'text-[#d08770]' : 'text-[#81a1c1]/60'} />
                ) : tab.type === 'playbook_result' ? (
                  <TerminalIcon size={14} className={activeTabId === tab.id ? 'text-[#a3be8c]' : 'text-[#81a1c1]/60'} />
                ) : tab.type === 'topology' ? (
                  <Activity size={14} className={activeTabId === tab.id ? 'text-[#88c0d0]' : 'text-[#81a1c1]/60'} />
                ) : (
                  <TerminalIcon size={14} className={activeTabId === tab.id ? 'text-[#88c0d0]' : 'text-[#81a1c1]/60'} />
                )}
                {renamingTabId === tab.id ? (
                  <input
                    autoFocus
                    defaultValue={tab.customName || (tab.type === 'playbook_editor' ? 'Playbook Builder' : tab.type === 'cloud_explorer' ? 'AWS Explorer' : tab.type === 'playbook_result' ? (tab.nodeId || 'Result') : (tab.nodeId || '').split('@')[0])}
                    onBlur={(e) => handleRenameSubmit(tab.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(tab.id, e.currentTarget.value);
                      if (e.key === 'Escape') setRenamingTabId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#2e3440] border border-[#81a1c1] outline-none text-[11px] font-bold uppercase tracking-wider w-24 text-[#d8dee9] px-1 rounded"
                  />
                ) : (
                  <span 
                    className="text-[11px] font-bold truncate flex-1 uppercase tracking-wider"
                    onDoubleClick={(e) => { e.stopPropagation(); handleStartRename(tab); }}
                  >
                    {tab.customName || (tab.type === 'playbook_editor' ? 'Playbook Builder' : tab.type === 'cloud_explorer' ? 'AWS Explorer' : tab.type === 'playbook_result' ? (tab.nodeId || 'Result') : tab.type === 'topology' ? 'Topology' : (tab.nodeId || '').split('@')[0])}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#3b4252] rounded transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {tabs.length === 0 && (
              <div className="text-[#81a1c1]/70 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <Layout size={14} /> Workspace Empty
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center">
              <button
                onClick={() => toggleWorkspace(tabs, clearThoughts)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${workspaceId ? 'bg-[#a3be8c]/20 border-[#a3be8c]/50 text-[#a3be8c] shadow-[0_0_10px_rgba(163,190,140,0.1)] rounded-r-none border-r-0' : 'bg-[#3b4252] border-[#5e81ac]/40 text-[#81a1c1]/60 hover:border-[#81a1c1]/30'}`}
              >
                <Users size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">{workspaceId ? `Co-Op [${workspaceId}]` : 'Multiplayer'}</span>
              </button>
              {workspaceId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (navigator.clipboard && workspaceId) {
                      navigator.clipboard.writeText(workspaceId);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 2000);
                    }
                  }}
                  className="px-2 py-1.5 rounded-md rounded-l-none border border-l-0 border-[#a3be8c]/50 bg-[#a3be8c]/20 text-[#a3be8c] hover:bg-[#a3be8c]/30 transition-all flex items-center justify-center"
                  title="Copy Session ID"
                >
                  {copiedId ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>
            <button
              onClick={() => setShowAiPanel(!showAiPanel)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${showAiPanel ? 'bg-[#81a1c1]/20 border-[#81a1c1]/50 text-[#81a1c1] shadow-[0_0_10px_rgba(129,161,193,0.1)]' : 'bg-[#3b4252] border-[#81a1c1] text-[#81a1c1] hover:border-[#81a1c1]/30'}`}
            >
              <Cpu size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Neural Link</span>
            </button>

            {authRequired && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#81a1c1]/50 bg-[#81a1c1]/20 text-[#81a1c1] shadow-[0_0_10px_rgba(129,161,193,0.1)] hover:bg-[#bf616a]/15 hover:border-[#bf616a]/40 hover:text-[#bf616a] hover:shadow-[0_0_10px_rgba(191,97,106,0.15)] transition-all cursor-pointer group"
                title="Disconnect Session"
              >
                <User size={14} className="group-hover:text-[#bf616a] transition-colors" />
                <span className="text-[10px] font-black uppercase tracking-widest">{username}</span>
                <span className="w-px h-3 bg-[#81a1c1]/30 mx-1 group-hover:bg-[#bf616a]/30 transition-colors" />
                <LogOut size={14} className="group-hover:text-[#bf616a] transition-colors" />
              </button>
            )}
          </div>
        </div>

        {isReadOnlyMode && (
          <div className="bg-[#bf616a]/20 border-b border-[#bf616a]/50 text-[#d8dee9] px-4 py-2.5 text-xs flex items-center justify-between shrink-0 font-bold tracking-wide select-none">
            <div className="flex items-center gap-2">
              <span className="text-[#bf616a] text-sm">⚠️</span>
              <span>SESSION EXPIRED / READ-ONLY MODE — Interactions are disabled due to session token expiration.</span>
            </div>
            <button
              onClick={() => setShowReauthModal(true)}
              className="bg-[#5e81ac] hover:bg-[#81a1c1] text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-colors outline-none border-none cursor-pointer"
            >
              Re-authenticate
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden bg-[#2e3440]">
          {tabs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <Monitor size={64} className="text-[#81a1c1]/50 mb-8" />
              <h1 className="text-[#d8dee9] font-black text-4xl tracking-tighter uppercase italic opacity-95">Ready for Dispatch</h1>
              <p className="text-[#d8dee9]/70 mt-4 text-base font-medium tracking-wide max-w-md leading-relaxed">Select nodes from the tactical inventory to establish parallel secure links and initiate command sequence.</p>
              {workspaceId && (
                <div className="mt-8 bg-[#81a1c1]/10 border border-[#81a1c1]/30 p-4 rounded-lg flex items-center gap-4 text-[#81a1c1]">
                  <Globe size={20} />
                  <div className="text-left">
                    <p className="text-xs font-black uppercase tracking-widest">Co-op Session Active</p>
                    <p className="text-[10px] mt-1 opacity-70">ID: {workspaceId}. Waiting for peers to open nodes...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 relative h-full w-full overflow-hidden">
              {tabs.map(tab => (
                <div key={tab.id} style={{ display: activeTabId === tab.id ? 'block' : 'none' }} className="absolute inset-0 w-full h-full">
                  {tab.type === 'cloud_explorer' ? (
                    <CloudExplorer
                      onClose={() => closeTab(tab.id)}
                      onOpenInspect={handleOpenInspect}
                      onOpenConsole={handleOpenConsole}
                      onOpenSSM={handleOpenSSM}
                      onOpenGraph={handleOpenGraph}
                      workspaceId={workspaceId}
                      ws={workspaceSocketRef}
                      selectedProfile={tab.meta?.profile || selectedProfile}
                      selectedRegion={tab.meta?.region || selectedRegion}
                      profiles={profiles}
                      regions={regions}
                      setSelectedProfile={(p) => {
                        const newTabs = tabs.map(t => t.id === tab.id ? { ...t, meta: { ...t.meta, profile: p, autoRun: 'false' } } : t);
                        updateTabsAndPush(newTabs);
                        setSelectedProfile(p);
                      }}
                      setSelectedRegion={(r) => {
                        const newTabs = tabs.map(t => t.id === tab.id ? { ...t, meta: { ...t.meta, region: r, autoRun: 'false' } } : t);
                        updateTabsAndPush(newTabs);
                        setSelectedRegion(r);
                      }}
                      onRename={(newName) => handleRenameSubmit(tab.id, newName)}
                      autoRun={tab.meta?.autoRun === 'true'}
                      onScanStarted={(p, r) => {
                        const newTabs = tabs.map(t => t.id === tab.id ? {
                          ...t,
                          customName: `${p}@${r}`,
                          meta: { ...t.meta, profile: p, region: r, autoRun: 'true' }
                        } : t);
                        updateTabsAndPush(newTabs);
                      }}
                    />
                  ) : tab.type === 'playbook_editor' ? (
                    <PlaybookEditor 
                        onRun={handleOpenPlaybookResult} 
                        onPreflight={handleOpenPlaybookPreflight}
                        availableNodes={availableNodes} 
                    />
                  ) : tab.type === 'playbook_preflight' ? (
                    <PlaybookPreflight 
                        playbookData={JSON.parse(tab.meta?.playbookData || '{}')} 
                        onClose={() => closeTab(tab.id)}
                    />
                  ) : tab.type === 'playbook_result' ? (
                    <PlaybookResult 
                        playbookData={JSON.parse(tab.meta?.playbookData || '{}')} 
                        onClose={() => closeTab(tab.id)}
                        onStartAnalysis={handleStartPlaybookAnalysis}
                    />
                  ) : tab.type === 'playbook_analysis' ? (
                    <PlaybookAnalysis 
                        playbookName={tab.meta?.playbookName || ''}
                        customPrompt={tab.meta?.customPrompt || ''}
                        results={JSON.parse(tab.meta?.results || '{}')}
                        onClose={() => closeTab(tab.id)}
                    />
                  ) : tab.type === 'cloud_inspect' ? (
                    <CloudInspect
                      assetId={tab.nodeId}
                      profile={tab.meta?.profile || ''}
                      region={tab.meta?.region || ''}
                      availableNodes={availableNodes}
                      onClose={() => closeTab(tab.id)}
                      onOpenInspect={handleOpenInspect}
                      onOpenFlowLog={handleOpenFlowLog}
                      onOpenConsole={handleOpenConsole}
                      onOpenSSM={handleOpenSSM}
                      onOpenGraph={handleOpenGraph}
                      onOpenNode={handleOpenNode}
                    />
                  ) : tab.type === 'cloud_flowlog' ? (
                    <CloudFlowLog
                      eniId={tab.meta?.eniId || ''}
                      flId={tab.nodeId}
                      profile={tab.meta?.profile || ''}
                      region={tab.meta?.region || ''}
                      availableNodes={availableNodes}
                      onClose={() => closeTab(tab.id)}
                      onOpenInspect={handleOpenInspect}
                      onOpenNode={handleOpenNode}
                    />
                  ) : tab.type === 'topology' ? (
                    <TopologyViewer 
                      content={tab.meta?.content || ''}
                      onClose={() => closeTab(tab.id)}
                      availableNodes={availableNodes}
                      onOpenInspect={handleOpenInspect}
                      onOpenNode={handleOpenNode}
                    />
                  ) : tab.type === 'cloud_graph' ? (
                    <CloudGraph
                      identifier={tab.meta?.identifier || ''}
                      metricType={(tab.meta?.metricType as 'bw' | 'pps') || 'bw'}
                      profile={tab.meta?.profile || ''}
                      region={tab.meta?.region || ''}
                      name={tab.meta?.name || ''}
                      onClose={() => closeTab(tab.id)}
                    />
                  ) : (
                    <Terminal 
                      nodeId={tab.nodeId} 
                      isActive={activeTabId === tab.id} 
                      isAiProcessing={isAiProcessing}
                      workspaceId={workspaceId}
                      onCopilotRequest={handleCopilotRequest}
                      onAbort={handleAbort}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AI Panel */}
          {showAiPanel && (
            <AIPanel
              thoughts={thoughts}
              isAiProcessing={isAiProcessing}
              isConnected={true}
              workspaceId={workspaceId}
              activeNodeId={activeTab?.type === 'terminal' ? activeTab.nodeId : undefined}
              availableNodes={availableNodes}
              activeTab={activeAiTab}
              onTabChange={setActiveAiTab}
              onSendPrompt={sendPrompt}
              onSendConfirmation={sendConfirmation}
              onAbort={handleAbort}
              onClearThoughts={handleClearThoughts}
              onNewSession={startNewSession}
              onToggleThought={toggleThought}
              onClose={() => setShowAiPanel(false)}
              onOpenInspect={handleOpenInspect}
              onOpenNode={handleOpenNode}
              onOpenTopology={handleOpenTopology}
              onConnpyLink={handleConnpyLink}
              width={aiPanelWidth}
              onWidthChange={setAiPanelWidth}
            />
          )}
        </div>
      </div>

      {showExpiredModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(46,52,64,0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}>
          <div style={{
            width: '100%', maxWidth: 420,
            padding: '2rem',
            background: 'rgba(59,66,82,0.95)',
            border: '1px solid rgba(76,86,106,0.8)',
            borderTop: '3px solid #bf616a',
            borderRadius: '1rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            boxSizing: 'border-box',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#d8dee9',
          }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#bf616a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚠️ LINK EXPIRED
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.825rem', lineHeight: '1.5', color: '#e5e9f0' }}>
              The secure link to the Command Center has expired. Enter your password to keep the session active without losing your progress, or select another option.
            </p>
            <p style={{ margin: '0 0 1rem', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#81a1c1' }}>
              Operator: {username}
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const passwordInput = form.elements.namedItem('expired-reauth-password') as HTMLInputElement;
              const errorDiv = form.querySelector('.expired-reauth-error') as HTMLDivElement;
              const submitBtn = form.querySelector('.expired-reauth-submit') as HTMLButtonElement;
              
              if (!passwordInput.value) {
                if (errorDiv) {
                  errorDiv.textContent = 'Please enter your password.';
                  errorDiv.style.display = 'block';
                }
                return;
              }

              if (errorDiv) errorDiv.style.display = 'none';
              if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'AUTHENTICATING...';
              }

              try {
                const res = await api.login(username, passwordInput.value);
                if (res.token) {
                  localStorage.setItem('connpy_session_token', res.token);
                  localStorage.setItem('connpy_username', res.username);
                  setSessionToken(res.token);
                  setIsReadOnlyMode(false);
                  setShowExpiredModal(false);
                } else {
                  throw new Error('No token received.');
                }
              } catch (err: any) {
                if (errorDiv) {
                  errorDiv.textContent = err.message || 'Incorrect password.';
                  errorDiv.style.display = 'block';
                }
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.textContent = 'RE-ESTABLISH LINK';
                }
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#81a1c1', marginBottom: '0.4rem' }}>
                  Access Password
                </label>
                <input
                  type="password"
                  name="expired-reauth-password"
                  placeholder="••••••••••••"
                  autoFocus
                  required
                  style={{
                    width: '100%', padding: '0.75rem',
                    background: 'rgba(46,52,64,0.6)', border: '1px solid rgba(76,86,106,0.6)',
                    borderRadius: '0.5rem', outline: 'none', color: '#d8dee9', fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div className="expired-reauth-error" style={{
                display: 'none', padding: '0.5rem 0.75rem',
                background: 'rgba(191,97,106,0.15)', border: '1px solid rgba(191,97,106,0.5)',
                borderRadius: '0.25rem', color: '#bf616a', fontSize: '0.7rem', fontWeight: 700,
              }} />

              <button
                type="submit"
                className="expired-reauth-submit"
                style={{
                  width: '100%', padding: '0.75rem',
                  background: '#5e81ac', border: '1px solid #5e81ac',
                  borderRadius: '0.5rem', color: '#e5e9f0',
                  fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#81a1c1')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#5e81ac')}
              >
                Re-establish Link
              </button>

              <div style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid rgba(76,86,106,0.4)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowExpiredModal(false);
                    setIsReadOnlyMode(true);
                  }}
                  style={{
                    flex: 1, padding: '0.6rem',
                    background: 'transparent', border: '1px solid rgba(136,192,208,0.4)',
                    borderRadius: '0.5rem', color: '#88c0d0',
                    fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(136,192,208,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Read Only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExpiredModal(false);
                    handleLogout();
                  }}
                  style={{
                    flex: 1, padding: '0.6rem',
                    background: 'transparent', border: '1px solid rgba(191,97,106,0.4)',
                    borderRadius: '0.5rem', color: '#bf616a',
                    fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(191,97,106,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Sign Out
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReauthModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(46,52,64,0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}>
          <div style={{
            width: '100%', maxWidth: 360,
            padding: '2rem',
            background: 'rgba(59,66,82,0.95)',
            border: '1px solid rgba(76,86,106,0.8)',
            borderTop: '3px solid #88c0d0',
            borderRadius: '1rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            boxSizing: 'border-box',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#d8dee9',
          }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#88c0d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔑 RE-AUTHENTICATE OPERATOR
            </h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#81a1c1' }}>
              Re-establish link for {username}
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const passwordInput = form.elements.namedItem('reauth-password') as HTMLInputElement;
              const errorDiv = form.querySelector('.reauth-error') as HTMLDivElement;
              const submitBtn = form.querySelector('.reauth-submit') as HTMLButtonElement;
              
              if (!passwordInput.value) {
                if (errorDiv) {
                  errorDiv.textContent = 'Please enter your password.';
                  errorDiv.style.display = 'block';
                }
                return;
              }

              if (errorDiv) errorDiv.style.display = 'none';
              if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'AUTHENTICATING...';
              }

              try {
                const res = await api.login(username, passwordInput.value);
                if (res.token) {
                  localStorage.setItem('connpy_session_token', res.token);
                  localStorage.setItem('connpy_username', res.username);
                  setSessionToken(res.token);
                  setIsReadOnlyMode(false);
                  setShowReauthModal(false);
                } else {
                  throw new Error('No token received.');
                }
              } catch (err: any) {
                if (errorDiv) {
                  errorDiv.textContent = err.message || 'Incorrect password.';
                  errorDiv.style.display = 'block';
                }
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.textContent = 'RE-ESTABLISH LINK';
                }
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#81a1c1', marginBottom: '0.4rem' }}>
                  Access Password
                </label>
                <input
                  type="password"
                  name="reauth-password"
                  placeholder="••••••••••••"
                  autoFocus
                  required
                  style={{
                    width: '100%', padding: '0.75rem',
                    background: 'rgba(46,52,64,0.6)', border: '1px solid rgba(76,86,106,0.6)',
                    borderRadius: '0.5rem', outline: 'none', color: '#d8dee9', fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div className="reauth-error" style={{
                display: 'none', padding: '0.5rem 0.75rem',
                background: 'rgba(191,97,106,0.15)', border: '1px solid rgba(191,97,106,0.5)',
                borderRadius: '0.25rem', color: '#bf616a', fontSize: '0.7rem', fontWeight: 700,
              }} />

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowReauthModal(false)}
                  style={{
                    flex: 1, padding: '0.75rem',
                    background: 'transparent', border: '1px solid rgba(76,86,106,0.6)',
                    borderRadius: '0.5rem', color: '#d8dee9',
                    fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="reauth-submit"
                  style={{
                    flex: 2, padding: '0.75rem',
                    background: '#5e81ac', border: '1px solid #5e81ac',
                    borderRadius: '0.5rem', color: '#e5e9f0',
                    fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#81a1c1')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#5e81ac')}
                >
                  Re-establish Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
