import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal as TerminalIcon, Cpu, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../api';

interface PlaybookResultProps {
  playbookData: any;
  onClose: () => void;
  onStartAnalysis?: (playbookName: string, customPrompt: string, logs: any[]) => void;
}

export const PlaybookResult: React.FC<PlaybookResultProps> = ({ playbookData, onClose, onStartAnalysis }) => {
  const [logs, setLogs] = useState<{type: string, data: string, node?: string, status?: number, result?: any}[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    let isMounted = true;
    const ws = new WebSocket(api.getPlaybookWsUrl());
    
    ws.onopen = () => {
      if (isMounted) {
        ws.send(JSON.stringify({ playbook: playbookData }));
        setLogs([{ type: 'header', data: 'INITIALIZING EXECUTION PIPELINE...' }]);
      }
    };
    
    ws.onmessage = (event) => {
      if (!isMounted) return;
      const msg = JSON.parse(event.data);
      setLogs(prev => [...prev, msg]);
      if (msg.type === 'header' && msg.data.includes('COMPLETED')) {
          setIsRunning(false);
      }
    };
    
    ws.onerror = () => {
      if (!isMounted) return;
      setLogs(prev => [...prev, { type: 'error', data: 'WebSocket Connection Error: The execution link was interrupted.' }]);
      setIsRunning(false);
    };
    
    ws.onclose = () => {
      if (isMounted) {
          setIsRunning(false);
          setLogs(prev => {
              // Only add if not already marked as completed
              const last = prev[prev.length - 1];
              if (last && last.type === 'header' && last.data.includes('COMPLETED')) return prev;
              return [...prev, { type: 'header', data: '--- EXECUTION LINK CLOSED ---' }];
          });
      }
    };

    return () => {
      isMounted = false;
      ws.close();
    };
  }, []); // Empty dependency array ensures this only runs exactly once on mount

  return (
    <div className="flex flex-col h-full bg-[#2e3440] text-[#d8dee9] font-mono selection:bg-[#81a1c1]/30 relative">
      {/* Terminal Header */}
      <div className="bg-[#2e3440] px-6 py-4 flex justify-between items-center border-b border-[#3b4252] shrink-0 z-10 shadow-md">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${isRunning ? 'bg-[#a3be8c]/10 text-[#a3be8c]' : 'bg-[#81a1c1]/10 text-[#81a1c1]'}`}>
            {isRunning ? <Loader2 size={20} className="animate-spin" /> : <TerminalIcon size={20} />}
          </div>
          <div className="flex flex-col">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">
                {isRunning ? 'Execution in Progress' : 'Execution Completed'}
            </h2>
            <p className="text-[10px] text-[#81a1c1] font-bold uppercase tracking-widest mt-0.5">
                Playbook: {playbookData?.playbook || 'Untitled'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
            {!isRunning && onStartAnalysis && (
              <button
                onClick={() => setShowAnalysisModal(true)}
                className="appearance-none flex items-center gap-2 px-4 py-2 bg-[#81a1c1]/10 hover:bg-[#81a1c1]/20 border border-[#81a1c1]/30 text-[#81a1c1] rounded-lg transition-all text-xs font-black uppercase tracking-wider active:scale-95 cursor-pointer outline-none shadow-md shadow-[#81a1c1]/5 animate-in fade-in duration-300"
              >
                <Cpu size={14} className="animate-pulse" />
                Get AI Analysis
              </button>
            )}
            <div 
                role="button"
                tabIndex={0}
                onClick={onClose}
                className="appearance-none p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all ml-4 active:scale-90 border border-transparent cursor-pointer outline-none bg-transparent"
                title="Close Result"
            >
                <X size={20} />
            </div>
        </div>
      </div>

      {/* Terminal Body */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 custom-scrollbar scroll-smooth">
        <div className="max-w-5xl mx-auto space-y-4">
          {logs.map((log, i) => (
            <div key={i} className={`mb-4 animate-in fade-in slide-in-from-left-2 duration-300 ${
              log.type === 'header' ? 'mt-10 first:mt-0' : ''
            }`}>
              {log.type === 'header' ? (
                <div className="flex items-center gap-6 mb-6">
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#b48ead]/30" />
                    <span className="text-[#b48ead] font-black uppercase tracking-[0.5em] text-[11px] py-2 px-6 bg-[#b48ead]/5 border border-[#b48ead]/20 rounded-full shadow-lg shadow-[#b48ead]/5">
                        {log.data}
                    </span>
                    <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#b48ead]/30" />
                </div>
              ) : log.type === 'error' ? (
                <div className="bg-[#bf616a]/10 border-l-4 border-[#bf616a] p-4 my-4 text-[#bf616a] rounded-r-lg shadow-lg">
                    <div className="flex items-center gap-3 mb-1">
                        <AlertCircle size={16} />
                        <span className="font-black uppercase tracking-widest text-[10px]">Critical Error</span>
                    </div>
                    <p className="text-sm">{log.data}</p>
                </div>
              ) : log.type === 'output' ? (
                <div className="group flex flex-col gap-3 p-4 bg-[#3b4252]/30 hover:bg-[#3b4252]/50 rounded-xl transition-all border border-[#4c566a]/20 hover:border-[#81a1c1]/30 shadow-md">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        {log.node && (
                            <div className="flex items-center gap-2 bg-[#2e3440] px-3 py-1 rounded-md border border-[#4c566a]/30">
                                <Cpu size={12} className="text-[#81a1c1]" />
                                <span className="text-[#81a1c1] font-black uppercase tracking-widest text-[11px]">{log.node}</span>
                            </div>
                        )}
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-widest border ${
                        log.status === 0 
                        ? 'bg-[#a3be8c]/10 text-[#a3be8c] border-[#a3be8c]/30' 
                        : 'bg-[#bf616a]/10 text-[#bf616a] border-[#bf616a]/30'
                    }`}>
                        {log.status === 0 ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                        {log.status === 0 ? 'Success' : `Failed (${log.status})`}
                    </div>
                  </div>
                  
                  <div className="mt-2 text-[#d8dee9] whitespace-pre-wrap break-all font-mono text-[14px] leading-relaxed bg-[#2e3440]/50 p-5 rounded-lg border border-[#4c566a]/20 shadow-inner">
                    {log.data}
                  </div>

                  {log.result && Object.keys(log.result).length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="text-[10px] font-black text-[#81a1c1] uppercase tracking-[0.3em] mb-1 flex items-center gap-2">
                        <div className="h-[1px] w-4 bg-[#81a1c1]/30" />
                        Verification Pipeline
                      </div>
                      <div className="flex flex-col gap-1.5 pl-2">
                        {Object.entries(log.result).map(([key, val]) => (
                          <div key={key} className={`flex items-center justify-between text-[11px] font-mono px-4 py-2 rounded-md border bg-[#2e3440]/30 ${
                              val 
                              ? 'border-[#a3be8c]/20 text-[#a3be8c]' 
                              : 'border-[#bf616a]/20 text-[#bf616a]'
                          }`}>
                            <div className="flex items-center gap-3">
                                <span className={`w-1.5 h-1.5 rounded-full ${val ? 'bg-[#a3be8c] shadow-[0_0_5px_#a3be8c]' : 'bg-[#bf616a] shadow-[0_0_5px_#bf616a]'}`} />
                                <span className="uppercase tracking-widest font-bold opacity-80">{key}</span>
                            </div>
                            <span className="font-black tracking-widest text-[10px] px-2 py-0.5 rounded bg-black/20">
                                {val ? 'PASSED' : 'FAILED'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[#81a1c1]/40 italic pl-10 py-1 text-[10px] uppercase tracking-widest">{log.data}</div>
              )}
            </div>
          ))}
          <div className="h-20 shrink-0" />
        </div>
      </div>

      {/* Playbook AI Analysis Modal */}
      {showAnalysisModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#2e3440] border border-[#81a1c1]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-[#3b4252]/50 border-b border-[#3b4252] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Cpu size={18} className="text-[#81a1c1]" />
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#eceff4]">Playbook Tactical Analysis</span>
              </div>
              <button 
                onClick={() => setShowAnalysisModal(false)} 
                className="p-1 text-[#81a1c1] hover:text-[#eceff4] hover:bg-white/5 rounded-md transition-all outline-none bg-transparent border-none cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <p className="text-xs text-[#d8dee9]/80 leading-relaxed font-mono">
                The <strong className="text-[#81a1c1]">Network Architect</strong> will review the playbook execution metrics, verify command stdout, check verify pipelines, and draft a high-fidelity diagnostic report.
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#81a1c1] block">
                  Custom Operator Query Context (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. Verify BGP peers routing convergence, identify which interfaces had issues, suggest regex adjustments..."
                  className="w-full h-24 bg-[#1e222a] border border-[#3b4252] rounded-xl p-4 text-xs font-mono text-[#d8dee9] focus:outline-none focus:border-[#81a1c1] transition-all resize-none shadow-inner leading-relaxed placeholder:text-[#81a1c1]/20"
                />
              </div>

            </div>

            <div className="px-6 py-4 bg-[#3b4252]/30 border-t border-[#3b4252] flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setShowAnalysisModal(false)} 
                className="px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#d8dee9]/60 hover:text-[#eceff4] hover:bg-white/5 transition-all outline-none bg-transparent border-none cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (onStartAnalysis) {
                    onStartAnalysis(playbookData?.playbook || 'Untitled Playbook', customPrompt, logs);
                  }
                  setShowAnalysisModal(false);
                }}
                className="bg-[#81a1c1] hover:bg-[#88c0d0] text-[#2e3440] px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-[#81a1c1]/20 outline-none border-none cursor-pointer"
              >
                <Cpu size={14} /> Initiate Architect Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
