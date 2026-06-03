import React, { useState, useEffect, useRef } from 'react';
import { X, Cpu, AlertCircle, Loader2, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api';

interface PlaybookAnalysisProps {
  playbookName: string;
  customPrompt: string;
  results: any;
  onClose: () => void;
}

export const PlaybookAnalysis: React.FC<PlaybookAnalysisProps> = ({ 
  playbookName, 
  customPrompt, 
  results, 
  onClose 
}) => {
  const [analysisText, setAnalysisText] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [statusText, setStatusText] = useState<string>('Initiating diagnostic pipeline...');
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [analysisText, statusText, error]);

  useEffect(() => {
    let isMounted = true;
    const ws = new WebSocket(api.getPlaybookAnalyzeWsUrl());

    ws.onopen = () => {
      if (isMounted) {
        ws.send(JSON.stringify({ 
          results, 
          query: customPrompt 
        }));
        setStatusText('Connected to Network Architect agent...');
      }
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;
      const data = JSON.parse(event.data);

      if (data.status_update) {
        // Filter out internal control keywords
        if (data.status_update.toLowerCase().includes('is thinking')) return;
        if (data.status_update.startsWith('__RESPONDER__:') && data.status_update.includes(':')) return;
        
        setStatusText(data.status_update);
      }

      if (data.text_chunk) {
        setAnalysisText(prev => prev + data.text_chunk);
      }

      if (data.is_final) {
        setIsRunning(false);
        setStatusText('Analysis complete.');
      }

      if (data.type === 'error' || data.error) {
        setError(data.data || data.error || 'An error occurred during analysis.');
        setIsRunning(false);
      }
    };

    ws.onerror = (e) => {
      if (!isMounted) return;
      console.error("Analysis WS Error:", e);
      setError('Connection to Network Architect failed.');
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
  }, [results, customPrompt]);

  return (
    <div className="flex flex-col h-full bg-[#2e3440] text-[#d8dee9] font-mono selection:bg-[#81a1c1]/30 relative">
      {/* Header */}
      <div className="bg-[#2e3440] px-6 py-4 flex justify-between items-center border-b border-[#3b4252] shrink-0 z-10 shadow-md">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${isRunning ? 'bg-[#b48ead]/10 text-[#b48ead]' : 'bg-[#a3be8c]/10 text-[#a3be8c]'}`}>
            {isRunning ? <Loader2 size={20} className="animate-spin" /> : <Cpu size={20} />}
          </div>
          <div className="flex flex-col">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">
              {isRunning ? 'Architect Analysis in Progress' : 'Architect Analysis Complete'}
            </h2>
            <p className="text-[10px] text-[#81a1c1] font-bold uppercase tracking-widest mt-0.5">
              Target: {playbookName || 'Untitled Playbook'}
            </p>
          </div>
        </div>
        <div className="flex items-center">
          <div
            role="button"
            tabIndex={0}
            onClick={onClose}
            className="appearance-none p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all active:scale-90 border border-transparent cursor-pointer outline-none bg-transparent"
            title="Close Analysis"
          >
            <X size={20} />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 custom-scrollbar scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Custom Query Card if provided */}
          {customPrompt && customPrompt.trim().length > 0 && (
            <div className="bg-[#3b4252]/30 border border-[#81a1c1]/20 rounded-xl p-5 shadow-lg flex gap-4 items-start animate-in fade-in duration-300">
              <Info size={18} className="text-[#81a1c1] shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#81a1c1]">Operator Inquiry Context</span>
                <p className="text-xs font-sans text-[#eceff4]/80 italic">"{customPrompt.trim()}"</p>
              </div>
            </div>
          )}

          {/* Diagnostics Log Output */}
          <div className="bg-[#3b4252]/20 border border-[#4c566a]/30 rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Status Bar */}
            <div className="bg-[#3b4252]/40 px-6 py-3.5 flex justify-between items-center border-b border-[#4c566a]/20 text-[10px] font-black uppercase tracking-widest text-[#81a1c1]">
              <div className="flex items-center gap-2">
                <Loader2 size={12} className={`text-[#81a1c1] ${isRunning ? 'animate-spin' : 'hidden'}`} />
                <span>{statusText}</span>
              </div>
              <span className="opacity-40">Tactical Audit Log</span>
            </div>

            {/* Analysis Content */}
            <div className="p-8 bg-[#232731]/30">
              {error ? (
                <div className="flex items-center gap-3 text-xs text-[#bf616a] font-bold uppercase tracking-widest py-4">
                  <AlertCircle size={16} />
                  {error}
                </div>
              ) : analysisText ? (
                <div className="text-sm text-[#eceff4] leading-relaxed font-sans whitespace-pre-wrap tracking-wide markdown-content prose prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {analysisText}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-xs text-[#81a1c1]/40 uppercase tracking-widest py-8">
                  <Loader2 size={14} className="animate-spin text-[#81a1c1]" />
                  Awaiting analysis payload from Network Architect...
                </div>
              )}
            </div>
          </div>

          <div className="h-20 shrink-0" />
        </div>
      </div>
    </div>
  );
};
