import React, { useRef, useState, useEffect } from 'react';
import { usePlaybookStore } from '../store/usePlaybookStore';
import { Plus, Trash2, Play, Code, Book, Upload, Download, Settings2, ChevronDown, Bot, Zap, Send, Sparkles, Check, Loader2, X, User } from 'lucide-react';
import { TagInput } from './TagInput';
import { SmartCommandEditor } from './SmartCommandEditor';
import { VariableMatrix } from './VariableMatrix';
import yaml from 'js-yaml';
import { api } from '../api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PlaybookEditorProps {
  onRun?: (playbookData: any) => void;
  onPreflight?: (playbookData: any) => void;
  availableNodes?: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'status';
  content: string;
  playbookYaml?: string | null;
}

export const PlaybookEditor: React.FC<PlaybookEditorProps> = ({ onRun, onPreflight, availableNodes = [] }) => {
  const playbookName = usePlaybookStore(state => state.name);
  const updatePlaybookName = usePlaybookStore(state => state.updatePlaybookName);
  const tasks = usePlaybookStore(state => state.tasks);
  const addTask = usePlaybookStore(state => state.addTask);
  const updateTask = usePlaybookStore(state => state.updateTask);
  const removeTask = usePlaybookStore(state => state.removeTask);
  const getPlaybookJSON = usePlaybookStore(state => state.getPlaybookJSON);
  const loadPlaybookFromJSON = usePlaybookStore(state => state.loadPlaybookFromJSON);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Layout views
  const [showYaml, setShowYaml] = useState(false);
  const [showAiBuilder, setShowAiBuilder] = useState(false);

  // Heights and widths for resizers
  const [yamlHeight, setYamlHeight] = useState(240);
  const [isResizingYaml, setIsResizingYaml] = useState(false);

  const [aiBuilderWidth, setAiBuilderWidth] = useState(420);
  const [isResizingAiBuilder, setIsResizingAiBuilder] = useState(false);

  // AI Playbook Builder Chat states
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const chatWsRef = useRef<WebSocket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isAiProcessing, aiStatus]);

  // Clean status tags
  const cleanStatusText = (text: string) => {
    if (!text) return '';
    return text.replace(/\[\/?\w+\]/g, '').trim();
  };

  // Connect to Playbook Builder WebSocket
  const connectBuilderWs = () => {
    if (chatWsRef.current) {
      chatWsRef.current.close();
    }

    const ws = new WebSocket(api.getPlaybookBuilderWsUrl());
    chatWsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status_update) {
        if (data.status_update.toLowerCase().includes('is thinking')) return;
        if (data.status_update.startsWith('__RESPONDER__:') && data.status_update.includes(':')) return;
        setAiStatus(cleanStatusText(data.status_update));
      }

      if (data.text_chunk) {
        setChatMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + data.text_chunk }];
          } else {
            return [...prev, { id: Math.random().toString(36), role: 'assistant', content: data.text_chunk }];
          }
        });
      }

      if (data.is_final) {
        setIsAiProcessing(false);
        setAiStatus('');
        
        const res = data.full_result;
        if (res) {
          if (res.chat_history) {
            setChatHistory(res.chat_history);
          }
          if (res.playbook_yaml) {
            setChatMessages(prev => [
              ...prev,
              {
                id: Math.random().toString(36),
                role: 'assistant',
                content: 'Playbook successfully generated and validated.',
                playbookYaml: res.playbook_yaml
              }
            ]);
          }
        }
      }
    };

    ws.onerror = (e) => {
      console.error("AI Builder WS Error:", e);
      setIsAiProcessing(false);
      setAiStatus('');
    };

    ws.onclose = () => {
      setIsAiProcessing(false);
      setAiStatus('');
    };
  };

  useEffect(() => {
    if (showAiBuilder) {
      connectBuilderWs();
      // Add welcome message if chat is empty
      if (chatMessages.length === 0) {
        setChatMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: 'Welcome to **Playbook Builder AI**! Describe the automation workflow you want to design, and I will generate and validate a structured playbook for you.'
          }
        ]);
      }
    } else {
      if (chatWsRef.current) {
        chatWsRef.current.close();
        chatWsRef.current = null;
      }
    }
    return () => {
      chatWsRef.current?.close();
    };
  }, [showAiBuilder]);

  const handleSendChat = () => {
    if (!chatInput.trim() || isAiProcessing) return;

    const userPrompt = chatInput.trim();
    setChatMessages(prev => [...prev, { id: Math.random().toString(36), role: 'user', content: userPrompt }]);
    setChatInput('');
    setIsAiProcessing(true);
    setAiStatus('Agent is starting...');

    if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(JSON.stringify({
        input_text: userPrompt,
        chat_history: chatHistory
      }));
    } else {
      // Fallback: reconnect and send
      connectBuilderWs();
      setTimeout(() => {
        if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) {
          chatWsRef.current.send(JSON.stringify({
            input_text: userPrompt,
            chat_history: chatHistory
          }));
        } else {
          setIsAiProcessing(false);
          setAiStatus('');
          setChatMessages(prev => [...prev, { 
            id: Math.random().toString(36), 
            role: 'assistant', 
            content: 'Error: Connection to the Playbook Builder service could not be established.' 
          }]);
        }
      }, 1000);
    }
  };

  const syncPlaybookToEditor = (playbookYaml: string) => {
    try {
      const parsed = yaml.load(playbookYaml);
      loadPlaybookFromJSON(parsed);
    } catch (e: any) {
      alert(`Error parsing playbook YAML: ${e.message}`);
    }
  };

  const runPlaybook = () => {
    if (onRun) {
      onRun(getPlaybookJSON());
    }
  };

  const runPreflight = () => {
    if (onPreflight) {
      onPreflight(getPlaybookJSON());
    }
  };

  const yamlPreview = React.useMemo(() => {
    try {
      return yaml.dump(getPlaybookJSON(), { noRefs: true, sortKeys: false });
    } catch (e) {
      return '# Error rendering YAML\n';
    }
  }, [getPlaybookJSON, tasks, playbookName]);

  const handleExport = () => {
    const blob = new Blob([yamlPreview], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playbookName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'playbook'}.yml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = yaml.load(content);
        loadPlaybookFromJSON(parsed);
      } catch (err: any) {
        alert(`Failed to import YAML: ${err.message}`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex h-full w-full bg-[#2e3440] text-[#d8dee9] overflow-hidden">
      
      {/* Visual Editor Pane */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[#3b4252] flex justify-between items-center bg-[#2e3440] z-20 shrink-0 shadow-md">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="p-2 bg-[#81a1c1]/10 rounded-lg">
              <Book size={20} className="text-[#81a1c1]" />
            </div>
            <input
              type="text"
              value={playbookName}
              onChange={(e) => updatePlaybookName(e.target.value)}
              className="text-xl font-black uppercase tracking-wider bg-transparent border-b border-transparent hover:border-[#4c566a] focus:border-[#81a1c1] focus:outline-none w-full transition-colors text-[#eceff4]"
              placeholder="Playbook Name"
            />
          </div>
          <div className="flex gap-3 shrink-0 ml-4">
            <input
              type="file"
              accept=".yml,.yaml"
              ref={fileInputRef}
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-[#4c566a]/10 text-[#d8dee9]/70 border border-[#4c566a]/30 hover:bg-[#4c566a]/30 hover:text-[#d8dee9] font-black text-[10px] uppercase tracking-[0.2em] px-4 py-2 rounded-md transition-all active:scale-95"
            >
              <Upload size={14} /> Import
            </button>
            <button
              onClick={handleExport}
              disabled={tasks.length === 0}
              className="flex items-center gap-2 bg-[#4c566a]/10 text-[#d8dee9]/70 border border-[#4c566a]/30 hover:bg-[#4c566a]/30 hover:text-[#d8dee9] font-black text-[10px] uppercase tracking-[0.2em] px-4 py-2 rounded-md transition-all active:scale-95 disabled:opacity-50"
            >
              <Download size={14} /> Export
            </button>

            <div className="w-px h-8 bg-[#4c566a]/30 mx-2" />

            {/* AI Builder Button */}
            <button
              onClick={() => setShowAiBuilder(!showAiBuilder)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-black text-[10px] uppercase tracking-[0.2em] transition-all border active:scale-95 ${showAiBuilder
                ? 'bg-[#b48ead]/20 text-[#b48ead] border-[#b48ead]/50 shadow-[0_0_10px_rgba(180,142,173,0.1)]'
                : 'bg-[#4c566a]/10 text-[#d8dee9]/70 border-[#4c566a]/30 hover:bg-[#4c566a]/30 hover:text-[#d8dee9]'
              }`}
            >
              <Bot size={14} className={isAiProcessing ? "animate-pulse" : ""} /> AI Builder
            </button>

            <button
              onClick={() => {
                setShowYaml(!showYaml);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-black text-[10px] uppercase tracking-[0.2em] transition-all border active:scale-95 ${showYaml
                ? 'bg-[#b48ead]/20 text-[#b48ead] border-[#b48ead]/50 shadow-[0_0_10px_rgba(180,142,173,0.1)]'
                : 'bg-[#4c566a]/10 text-[#d8dee9]/70 border-[#4c566a]/30 hover:bg-[#4c566a]/30 hover:text-[#d8dee9]'
              }`}
            >
              <Code size={14} /> YAML
            </button>

            {/* AI Preflight Button */}
            <button
              onClick={runPreflight}
              disabled={tasks.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md font-black text-[10px] uppercase tracking-[0.2em] transition-all border bg-[#d08770]/10 text-[#d08770] border-[#d08770]/30 hover:bg-[#d08770]/20 hover:border-[#d08770] active:scale-95 shadow-lg shadow-[#d08770]/5 disabled:opacity-50"
            >
              <Zap size={14} /> Preflight AI
            </button>

            <button
              onClick={runPlaybook}
              disabled={tasks.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md font-black text-[10px] uppercase tracking-[0.2em] transition-all border bg-[#a3be8c]/10 text-[#a3be8c] border-[#a3be8c]/30 hover:bg-[#a3be8c]/20 hover:border-[#a3be8c] active:scale-95 shadow-lg shadow-[#a3be8c]/5 disabled:opacity-50"
            >
              <Play size={14} fill="currentColor" /> Run Playbook
            </button>
            <button
              onClick={() => addTask({ name: `Task ${tasks.length + 1}` })}
              className="flex items-center gap-2 bg-[#81a1c1]/10 text-[#81a1c1] border border-[#81a1c1]/30 hover:bg-[#81a1c1]/20 hover:border-[#81a1c1] font-black text-[10px] uppercase tracking-[0.2em] px-4 py-2 rounded-md transition-all active:scale-95 shadow-lg shadow-[#81a1c1]/5"
            >
              <Plus size={14} /> Add Task
            </button>
          </div>
        </div>

        {/* Scrollable Tasks */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6 pb-20 custom-scrollbar">
          <div className="space-y-6">
            {tasks.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-[#4c566a] rounded-xl text-[#d8dee9]/30 uppercase tracking-[0.3em] font-black text-xs flex flex-col items-center gap-4">
                <div className="p-4 bg-[#3b4252]/30 rounded-full">
                  <Code size={32} />
                </div>
                No tasks defined. Click "Add Task" or use the "AI Builder" to start.
              </div>
            ) : (
              tasks.map((task, index) => (
                <div key={task.id} className="bg-[#3b4252]/30 border border-[#4c566a]/30 rounded-xl p-5 shadow-lg relative group hover:bg-[#3b4252]/40 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between mb-6 items-center">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex flex-col items-center justify-center bg-[#4c566a]/20 border border-[#4c566a]/30 w-8 h-8 rounded-lg">
                        <span className="text-[#88c0d0] font-black text-[10px] uppercase tracking-tighter leading-none">T</span>
                        <span className="text-[#88c0d0] font-black text-[11px] leading-none">{index + 1}</span>
                      </div>
                      <input
                        type="text"
                        value={task.name}
                        onChange={(e) => updateTask(task.id, { name: e.target.value })}
                        className="bg-transparent border-b border-transparent text-lg font-black uppercase tracking-[0.15em] focus:outline-none focus:border-[#81a1c1] w-full text-[#eceff4] transition-colors py-1"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => updateTask(task.id, { action: 'run' })}
                        className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] rounded-md transition-all border outline-none ${task.action === 'run'
                          ? 'bg-[#81a1c1]/20 text-[#81a1c1] border-[#81a1c1]/50 shadow-[0_0_10px_rgba(129,161,193,0.1)]'
                          : 'bg-transparent text-[#d8dee9]/40 border-transparent hover:border-[#4c566a]/50 hover:bg-[#3b4252]/50'
                          }`}
                      >
                        Run
                      </button>
                      <button
                        onClick={() => updateTask(task.id, { action: 'test' })}
                        className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] rounded-md transition-all border outline-none ${task.action === 'test'
                          ? 'bg-[#a3be8c]/20 text-[#a3be8c] border-[#a3be8c]/50 shadow-[0_0_10px_rgba(163,190,140,0.1)]'
                          : 'bg-transparent text-[#d8dee9]/40 border-transparent hover:border-[#4c566a]/50 hover:bg-[#3b4252]/50'
                          }`}
                      >
                        Test
                      </button>

                      <button
                        onClick={() => removeTask(task.id)}
                        className="text-[#bf616a]/50 hover:text-[#bf616a] transition-all p-2 bg-[#2e3440]/50 border border-[#bf616a]/20 rounded-lg hover:bg-[#bf616a]/10 hover:border-[#bf616a] active:scale-95"
                        title="Remove Task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    <SmartCommandEditor
                      label="COMMANDS TO EXECUTE"
                      commands={task.commands}
                      onChange={(commands) => updateTask(task.id, { commands })}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {task.action === 'test' && (
                        <TagInput
                          label="EXPECTED OUTPUT CRITERIA"
                          tags={task.expected || []}
                          onChange={(expected) => updateTask(task.id, { expected })}
                          placeholder="e.g., success, active, OK"
                        />
                      )}

                      <TagInput
                        label="TARGET INFRASTRUCTURE (TAGS)"
                        tags={task.nodes}
                        onChange={(nodes) => updateTask(task.id, { nodes })}
                        placeholder="e.g., router1, @datacenter"
                        suggestions={availableNodes}
                      />
                    </div>
                  </div>

                  {/* Advanced Options Bar */}
                  <div className="mt-6 pt-4 border-t border-[#4c566a]/30 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-[#81a1c1] text-[13px] font-black uppercase tracking-[0.15em] mb-1">
                      <Settings2 size={12} /> Execution Options
                    </div>

                    <div className="flex items-center justify-between bg-[#2e3440]/30 p-3 rounded-lg border border-[#4c566a]/20 w-full md:w-2/3 lg:w-1/2">
                      <label className="text-[13px] font-black uppercase tracking-[0.15em] text-[#d8dee9]/70">Timeout (Seconds)</label>
                      <input
                        type="number"
                        value={task.timeout || ''}
                        onChange={(e) => updateTask(task.id, { timeout: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="20"
                        className="w-24 bg-[#2e3440]/80 border border-[#4c566a]/50 rounded px-3 py-1.5 text-sm font-mono text-[#eceff4] focus:border-[#81a1c1] focus:outline-none text-right transition-colors"
                      />
                    </div>

                    <div className="flex items-center justify-between bg-[#2e3440]/30 p-3 rounded-lg border border-[#4c566a]/20 w-full md:w-2/3 lg:w-1/2">
                      <label className="text-[13px] font-black uppercase tracking-[0.15em] text-[#d8dee9]/70">Parallel Workers</label>
                      <input
                        type="number"
                        value={task.parallel || ''}
                        onChange={(e) => updateTask(task.id, { parallel: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="10"
                        className="w-24 bg-[#2e3440]/80 border border-[#4c566a]/50 rounded px-3 py-1.5 text-sm font-mono text-[#eceff4] focus:border-[#81a1c1] focus:outline-none text-right transition-colors"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {tasks.length > 0 && (
            <div className="mt-8 pb-10">
              <VariableMatrix />
            </div>
          )}
        </div>

        {/* YAML Schema Bottom Panel */}
        {showYaml && (
          <>
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizingYaml(true);
                const startY = e.clientY;
                const startHeight = yamlHeight;
                const handleMouseMove = (ev: MouseEvent) => {
                  const deltaY = startY - ev.clientY;
                  setYamlHeight(Math.max(100, Math.min(startHeight + deltaY, window.innerHeight - 200)));
                };
                const handleMouseUp = () => {
                  setIsResizingYaml(false);
                  document.body.style.cursor = 'default';
                  window.removeEventListener('mousemove', handleMouseMove);
                  window.removeEventListener('mouseup', handleMouseUp);
                };
                document.body.style.cursor = 'ns-resize';
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
              }}
              className="h-3 w-full cursor-ns-resize z-50 group shrink-0 flex items-center"
            >
              <div className={`h-[2px] w-full transition-all ${isResizingYaml ? 'bg-[#88c0d0]' : 'bg-transparent group-hover:bg-[#88c0d0]/50'}`} />
            </div>

            <div style={{ height: `${yamlHeight}px` }} className="shrink-0 border-t border-[#3b4252] bg-[#2e3440] flex flex-col animate-in slide-in-from-bottom duration-300">
              <div className="px-4 py-3 border-b border-[#3b4252] bg-[#2e3440] shrink-0 flex items-center justify-between">
                <h3 className="text-[#81a1c1] font-black uppercase tracking-[0.2em] text-[11px] flex items-center gap-3">
                  <Code size={16} />
                  <span>Playbook Schema</span>
                  <span className="ml-2 bg-[#b48ead]/10 text-[#b48ead] border border-[#b48ead]/20 px-2 py-0.5 rounded text-[9px] font-black">YAML</span>
                </h3>
                <button onClick={() => setShowYaml(false)} className="bg-transparent border-none hover:bg-[#4c566a]/50 text-[#d8dee9]/50 hover:text-[#eceff4] rounded p-1.5 transition-colors focus:outline-none"><ChevronDown size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                <pre className="text-[#ebcb8b] text-[14px] font-mono p-6 leading-relaxed whitespace-pre-wrap break-all selection:bg-[#81a1c1]/20">
                  {yamlPreview}
                </pre>
              </div>
            </div>
          </>
        )}


      </div>

      {/* AI Builder Right Side Panel */}
      {showAiBuilder && (
        <>
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingAiBuilder(true);
              const handleMouseMove = (ev: MouseEvent) => {
                const newWidth = window.innerWidth - ev.clientX;
                if (newWidth >= 300 && newWidth <= 800) setAiBuilderWidth(newWidth);
              };
              const handleMouseUp = () => {
                setIsResizingAiBuilder(false);
                document.body.style.cursor = 'default';
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
              };
              document.body.style.cursor = 'ew-resize';
              window.addEventListener('mousemove', handleMouseMove);
              window.addEventListener('mouseup', handleMouseUp);
            }}
            className="w-1 h-full cursor-ew-resize z-50 group shrink-0 relative"
          >
            <div className={`w-[2px] h-full transition-all ${isResizingAiBuilder ? 'bg-[#88c0d0]' : 'bg-transparent group-hover:bg-[#88c0d0]/50'}`} />
          </div>

          <div 
            style={{ width: `${aiBuilderWidth}px` }}
            className="border-l border-[#3b4252] bg-[#2e3440] flex flex-col shrink-0 h-full overflow-hidden animate-in slide-in-from-right duration-300"
          >
            {/* AI Builder Header */}
            <div className="p-4 px-6 border-b border-[#3b4252] flex items-center justify-between bg-[#3b4252]/20 h-14 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1 rounded text-[#b48ead]"><Bot size={16} /></div>
                <span className="font-black text-[10px] uppercase tracking-[0.2em] text-[#b48ead]">Playbook AI Builder</span>
              </div>
              <button 
                onClick={() => setShowAiBuilder(false)} 
                className="p-2 bg-transparent border-none outline-none hover:bg-white/5 hover:text-[#d8dee9] text-[#d8dee9]/60 transition-colors rounded-md focus:outline-none"
              >
                <X size={16} />
              </button>
            </div>

            {/* AI Builder Chat Feed */}
            <div ref={chatScrollRef} className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar bg-[#3b4252]/5">
              {chatMessages.map((msg) => {
                const isAi = msg.role === 'assistant';
                return (
                  <div key={msg.id} className={`flex gap-4 p-5 rounded-xl border animate-in fade-in duration-200 ${isAi ? 'bg-[#b48ead]/5 border-[#b48ead]/20 text-[#d8dee9]' : 'bg-[#3b4252]/30 border-[#434c5e]/40 text-[#eceff4]'}`}>
                    <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${isAi ? 'bg-[#b48ead]/10 text-[#b48ead]' : 'bg-[#434c5e] text-[#d8dee9]'}`}>
                      {isAi ? <Bot size={16} /> : <User size={16} />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isAi ? 'text-[#b48ead]' : 'text-[#81a1c1]'}`}>
                          {isAi ? 'Playbook Agent' : 'Operator'}
                        </span>
                      </div>
                      <div className="text-[13px] leading-relaxed font-mono whitespace-pre-wrap tracking-tight markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      
                      {/* Validated YAML Load Option */}
                      {msg.playbookYaml && (
                        <div className="mt-4 p-4 rounded-lg bg-[#a3be8c]/5 border border-[#a3be8c]/20 flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-xs text-[#a3be8c] font-bold uppercase tracking-wider">
                            <Check size={14} /> Validated Playbook Ready
                          </div>
                          <button
                            onClick={() => syncPlaybookToEditor(msg.playbookYaml!)}
                            className="bg-[#a3be8c] hover:bg-[#a3be8c]/80 text-[#2e3440] text-[10px] font-black py-2 rounded-md transition-all active:scale-95 flex items-center justify-center gap-1.5 uppercase tracking-widest"
                          >
                            <Sparkles size={12} fill="currentColor" /> Load into Visual Workspace
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isAiProcessing && (
                <div className="flex items-center gap-3 p-4 text-[#b48ead]/60 animate-pulse font-black text-[9px] uppercase tracking-[0.2em]">
                  <Loader2 size={12} className="animate-spin" />
                  {aiStatus || 'BUILDER PROCESSING...'}
                </div>
              )}
            </div>

            {/* AI Builder Input */}
            <div className="p-4 border-t border-[#3b4252] bg-[#3b4252]/40 shrink-0">
              <div className="relative group">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                  placeholder="Ask Playbook AI to generate or modify tasks..."
                  className="w-full bg-[#2e3440] border border-[#434c5e] rounded-xl p-4 pr-12 text-xs text-[#d8dee9] focus:outline-none focus:border-[#b48ead] transition-all resize-none h-20 scrollbar-hide shadow-inner placeholder:text-[#81a1c1]/40"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || isAiProcessing}
                  className="absolute bottom-3 right-3 p-2 bg-[#b48ead] hover:bg-[#b48ead]/80 text-[#2e3440] rounded-lg transition-all disabled:opacity-30 shadow-lg shadow-[#b48ead]/20 active:scale-90"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
