import React, { useState, useEffect, useRef } from 'react';
import { X, Zap, Cpu, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api';

interface PlaybookPreflightProps {
  playbookData: any;
  onClose: () => void;
}

interface PreflightTask {
  name: string;
  nodes: string[];
  text: string;
  isComplete: boolean;
  error?: string;
}

export const PlaybookPreflight: React.FC<PlaybookPreflightProps> = ({ playbookData, onClose }) => {
  const [tasks, setTasks] = useState<PreflightTask[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [tasks, globalError]);

  useEffect(() => {
    let isMounted = true;
    const ws = new WebSocket(api.getPlaybookPreflightWsUrl());

    ws.onopen = () => {
      if (isMounted) {
        ws.send(JSON.stringify({ playbook: playbookData }));
      }
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;
      const msg = JSON.parse(event.data);

      if (msg.type === 'task_start') {
        setTasks(prev => [
          ...prev,
          {
            name: msg.task_name,
            nodes: msg.nodes || [],
            text: '',
            isComplete: false
          }
        ]);
      } else if (msg.type === 'text') {
        setTasks(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          updated[lastIndex] = {
            ...updated[lastIndex],
            text: updated[lastIndex].text + (msg.text_chunk || '')
          };
          return updated;
        });
      } else if (msg.type === 'completed') {
        setTasks(prev => prev.map(t => ({ ...t, isComplete: true })));
        setIsRunning(false);
      } else if (msg.type === 'error') {
        setGlobalError(msg.data || 'An unexpected error occurred during simulation.');
        setIsRunning(false);
      }
    };

    ws.onerror = (e) => {
      if (!isMounted) return;
      console.error("Preflight WS Error:", e);
      setGlobalError('Connection to Preflight Simulation failed.');
      setIsRunning(false);
    };

    ws.onclose = () => {
      if (isMounted) {
        setIsRunning(false);
      }
    };

    return () => {
      isMounted = false;
      ws.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#2e3440] text-[#d8dee9] font-mono selection:bg-[#d08770]/30 relative">
      {/* Simulation Header */}
      <div className="bg-[#2e3440] px-6 py-4 flex justify-between items-center border-b border-[#3b4252] shrink-0 z-10 shadow-md">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${isRunning ? 'bg-[#d08770]/10 text-[#d08770]' : 'bg-[#a3be8c]/10 text-[#a3be8c]'}`}>
            {isRunning ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}
          </div>
          <div className="flex flex-col">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">
              {isRunning ? 'Preflight AI Simulating' : 'Preflight Simulation Complete'}
            </h2>
            <p className="text-[10px] text-[#81a1c1] font-bold uppercase tracking-widest mt-0.5">
              Playbook: {playbookData?.playbook || 'Untitled'}
            </p>
          </div>
        </div>
        <div className="flex items-center">
          <div
            role="button"
            tabIndex={0}
            onClick={onClose}
            className="appearance-none p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all active:scale-90 border border-transparent cursor-pointer outline-none bg-transparent"
            title="Close Preflight"
          >
            <X size={20} />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 custom-scrollbar scroll-smooth">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* System status message */}
          {isRunning && tasks.length === 0 && !globalError && (
            <div className="flex flex-col items-center justify-center py-20 text-[#81a1c1]/40 uppercase tracking-[0.2em] font-black text-xs gap-4">
              <Loader2 size={24} className="animate-spin text-[#d08770]" />
              Initializing AI Preflight pipelines...
            </div>
          )}

          {/* Global Simulation Error */}
          {globalError && (
            <div className="bg-[#bf616a]/10 border-l-4 border-[#bf616a] p-5 rounded-r-xl shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3 mb-2 text-[#bf616a]">
                <AlertCircle size={18} />
                <span className="font-black uppercase tracking-widest text-[10px]">Preflight Failure</span>
              </div>
              <p className="text-xs leading-relaxed text-[#d8dee9]/90">{globalError}</p>
            </div>
          )}

          {/* Task Reports */}
          <div className="space-y-8">
            {tasks.map((task, i) => (
              <div key={i} className="bg-[#3b4252]/20 border border-[#4c566a]/30 rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
                
                {/* Task Header Bar */}
                <div className="bg-[#3b4252]/40 px-6 py-4 flex justify-between items-center border-b border-[#4c566a]/20">
                  <div className="flex items-center gap-3">
                    <Cpu size={14} className="text-[#d08770]" />
                    <span className="text-xs font-black uppercase tracking-widest text-[#eceff4]">
                      Task {i + 1}: {task.name}
                    </span>
                  </div>
                  <div>
                    {task.isComplete ? (
                      <div className="flex items-center gap-1 bg-[#a3be8c]/15 text-[#a3be8c] border border-[#a3be8c]/30 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest">
                        <CheckCircle size={10} /> Simulated
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-[#d08770]/10 text-[#d08770] border border-[#d08770]/20 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest animate-pulse">
                        <Loader2 size={10} className="animate-spin" /> Analysing
                      </div>
                    )}
                  </div>
                </div>

                {/* Task Nodes Sub-Bar */}
                <div className="bg-[#2e3440]/30 px-6 py-2.5 border-b border-[#4c566a]/20 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#81a1c1]">
                  <span className="opacity-50">Target Nodes:</span>
                  <span className="text-[#eceff4] font-black">
                    {task.nodes.length > 0 ? task.nodes.join(', ') : 'None'}
                  </span>
                </div>

                {/* Task AI Feedback Body */}
                <div className="p-6 bg-[#232731]/30">
                  {task.text ? (
                    <div className="text-sm text-[#eceff4] leading-relaxed font-sans whitespace-pre-wrap tracking-wide markdown-content prose prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {task.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-xs text-[#81a1c1]/40 uppercase tracking-widest py-4">
                      <Loader2 size={14} className="animate-spin text-[#d08770]" />
                      Generating AI Simulation output...
                    </div>
                  )}
                </div>

              </div>
            ))}
          </div>

          <div className="h-20 shrink-0" />
        </div>
      </div>
    </div>
  );
};
