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
import { api } from './api';
import { useAISession } from './hooks/useAISession';
import { useWorkspace } from './hooks/useWorkspace';
import TopologyViewer from './components/TopologyViewer';
import { X, Terminal as TerminalIcon, Layout, Monitor, Users, Globe, Cloud, Cpu, BookOpen, Copy, RefreshCw, Pencil, Activity } from 'lucide-react';
import type { Tab } from './types';

function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(true);

  // Global AWS Context (shared with CloudExplorer)
  const [selectedProfile, setSelectedProfile] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
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
  const { thoughts, isAiProcessing, sendPrompt, sendConfirmation, abort, clearThoughts, toggleThought } = useAISession(workspaceId);

  // Auto-scroll AI panel
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thoughts]);

  // Fetch node inventory for SmartText
  useEffect(() => {
    api.getInventory()
      .then(res => { if (res?.nodes && Array.isArray(res.nodes)) setAvailableNodes(res.nodes); })
      .catch(e => console.error('Failed to fetch available nodes', e));
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // --- Tab Helpers ---
  const closeTab = (tabId: string) => {
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
    const tabId = `inspect:${assetId}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { id: tabId, nodeId: assetId, type: 'cloud_inspect', meta: { profile, region } };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenFlowLog = (eniId: string, flId: string, profile: string, region: string) => {
    const tabId = `flowlog:${flId}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { id: tabId, nodeId: flId, type: 'cloud_flowlog', meta: { profile, region, eniId } };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenGraph = (identifier: string, metricType: 'bw' | 'pps', profile: string, region: string) => {
    const tabId = `graph:${metricType}:${identifier}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { id: tabId, nodeId: `${metricType.toUpperCase()} - ${identifier}`, type: 'cloud_graph', meta: { profile, region, metricType, identifier } };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenConsole = (instanceId: string, profile: string, region: string) => {
    const consoleId = `aws-console:${instanceId}?profile=${profile}&region=${region}`;
    const existing = tabs.find(t => t.nodeId === consoleId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { id: Math.random().toString(36).substring(7), nodeId: consoleId, type: 'terminal' };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenSSM = (instanceId: string, profile: string, region: string) => {
    const ssmId = `aws-ssm:${instanceId}?profile=${profile}&region=${region}`;
    const existing = tabs.find(t => t.nodeId === ssmId);
    if (existing) { setActiveTabId(existing.id); return; }
    const newTab: Tab = { id: Math.random().toString(36).substring(7), nodeId: ssmId, type: 'terminal' };
    updateTabsAndPush([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenCloudExplorer = () => {
    const existing = tabs.find(t => t.type === 'cloud_explorer');
    if (existing) { setActiveTabId(existing.id); return; }
    const newId = Math.random().toString(36).substring(7);
    const newTabs: Tab[] = [...tabs, { id: newId, nodeId: 'AWS Explorer', type: 'cloud_explorer' }];
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

  const handleConnpyLink = (url: string) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'connpy:' && urlObj.host === 'aws' && urlObj.pathname === '/inspect') {
        const id = urlObj.searchParams.get('id');
        const profile = urlObj.searchParams.get('profile') || selectedProfile;
        const region = urlObj.searchParams.get('region') || selectedRegion;
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
            <button
              onClick={() => toggleWorkspace(tabs, clearThoughts)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${workspaceId ? 'bg-[#a3be8c]/20 border-[#a3be8c]/50 text-[#a3be8c] shadow-[0_0_10px_rgba(163,190,140,0.1)]' : 'bg-[#3b4252] border-[#5e81ac]/40 text-[#81a1c1]/60 hover:border-[#81a1c1]/30'}`}
            >
              <Users size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">{workspaceId ? `Co-Op [${workspaceId}]` : 'Multiplayer'}</span>
            </button>
            <button
              onClick={() => setShowAiPanel(!showAiPanel)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${showAiPanel ? 'bg-[#81a1c1]/20 border-[#81a1c1]/50 text-[#81a1c1] shadow-[0_0_10px_rgba(129,161,193,0.1)]' : 'bg-[#3b4252] border-[#81a1c1] text-[#81a1c1] hover:border-[#81a1c1]/30'}`}
            >
              <Cpu size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Neural Link</span>
            </button>

          </div>
        </div>

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
                      selectedProfile={selectedProfile}
                      selectedRegion={selectedRegion}
                      setSelectedProfile={setSelectedProfile}
                      setSelectedRegion={setSelectedRegion}
                      onRename={(newName) => handleRenameSubmit(tab.id, newName)}
                    />
                  ) : tab.type === 'playbook_editor' ? (
                    <PlaybookEditor onRun={handleOpenPlaybookResult} availableNodes={availableNodes} />
                  ) : tab.type === 'playbook_result' ? (
                    <PlaybookResult 
                        playbookData={JSON.parse(tab.meta?.playbookData || '{}')} 
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
                      onClose={() => closeTab(tab.id)}
                    />
                  ) : (
                    <Terminal nodeId={tab.nodeId} isActive={activeTabId === tab.id} workspaceId={workspaceId} />
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
              selectedProfile={selectedProfile}
              selectedRegion={selectedRegion}
              availableNodes={availableNodes}
              onSendPrompt={sendPrompt}
              onSendConfirmation={sendConfirmation}
              onAbort={abort}
              onClearThoughts={clearThoughts}
              onToggleThought={toggleThought}
              onClose={() => setShowAiPanel(false)}
              onOpenInspect={handleOpenInspect}
              onOpenNode={handleOpenNode}
              onOpenTopology={handleOpenTopology}
              onConnpyLink={handleConnpyLink}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
