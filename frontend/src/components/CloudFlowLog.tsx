import { useState, useEffect, useRef } from 'react';
import { Shield, RefreshCw, X, Activity, Wind, Database, Clock, Search, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { api } from '../api';
import { SmartText } from './SmartText';

interface CloudFlowLogProps {
  eniId: string;
  flId: string;
  profile: string;
  region: string;
  onClose: () => void;
  onOpenInspect: (assetId: string, profile: string, region: string) => void;
  onOpenNode: (node: string) => void;
  availableNodes?: string[];
}

export default function CloudFlowLog({ 
  eniId, flId, profile, region, onClose, 
  onOpenInspect, onOpenNode, availableNodes = [] 
}: CloudFlowLogProps) {
  const [events, setEvents] = useState<Record<string, string[]> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(1);
  const [filterText, setFilterText] = useState('');
  const [collapsedTimestamps, setCollapsedTimestamps] = useState<Set<string>>(new Set());

  const toggleCollapse = (ts: string) => {
    setCollapsedTimestamps(prev => {
      const next = new Set(prev);
      if (next.has(ts)) {
        next.delete(ts);
      } else {
        next.add(ts);
      }
      return next;
    });
  };

  const collapseAll = () => {
    if (events) {
      setCollapsedTimestamps(new Set(Object.keys(events)));
    }
  };

  const expandAll = () => {
    setCollapsedTimestamps(new Set());
  };

  const parseYaml = (yaml: string): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    const lines = yaml.split('\n');
    let currentTimestamp = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('---')) continue;
      
      // Check for list items FIRST (they start with '- ')
      if (trimmed.startsWith('- ') && currentTimestamp) {
        let value = trimmed.substring(2).trim();
        // Strip surrounding single quotes from yaml.dump
        if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        result[currentTimestamp].push(value);
      }
      // Top-level key (timestamp) ends with ':' but doesn't start with '- '
      else if (!trimmed.startsWith('- ') && trimmed.endsWith(':')) {
        // Remove trailing colon and strip surrounding quotes
        let key = trimmed.slice(0, -1).trim();
        if (key.startsWith("'") && key.endsWith("'")) {
          key = key.slice(1, -1);
        }
        currentTimestamp = key;
        result[currentTimestamp] = [];
      }
    }
    return result;
  };

  const wsRef = useRef<WebSocket | null>(null);

  const connectStream = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setIsLoading(true);
    setError(null);
    setEvents({});
    setCollapsedTimestamps(new Set());
    
    const wsUrl = api.getAwsFlowLogWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setIsLoading(false);
      ws.send(JSON.stringify({
        identifier: eniId,
        fl_id: flId,
        profile,
        region,
        hours,
        filter: filterText || null
      }));
    };
    
    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          ws.close();
          return;
        }
        if (data.output) {
          const parsed = parseYaml(data.output);
          setEvents(prev => {
            const next = { ...(prev || {}) };
            for (const [ts, msgs] of Object.entries(parsed)) {
              if (!next[ts]) next[ts] = [];
              for (const msg of msgs) {
                if (!next[ts].includes(msg)) {
                  next[ts].push(msg);
                }
              }
            }
            return next;
          });
        }
      } catch (e) {
        console.error("Error parsing ws message", e);
      }
    };
    
    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setError("Stream connection error");
      setIsLoading(false);
    };
    
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setIsLoading(false);
    };
  };

  useEffect(() => {
    connectStream();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [flId, eniId]);

  return (
    <div className="w-full h-full bg-[#2e3440] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#3b4252] bg-[#3b4252]/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#ebcb8b]/20 text-[#ebcb8b] rounded-xl flex items-center justify-center shadow-inner border border-[#ebcb8b]/30">
            <Activity size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#eceff4] tracking-wider uppercase italic">FlowLog Stream</h2>
            <p className="text-xs text-[#d8dee9]/60 font-bold tracking-widest uppercase mt-1">{flId} / {eniId}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Tactical Filters */}
          <div className="flex items-center bg-[#2e3440] border border-[#434c5e] rounded-lg px-2 h-10 shadow-inner">
            <div className="flex items-center gap-2 px-3 border-r border-[#434c5e]">
                <Clock size={12} className="text-[#ebcb8b]/60" />
                <select 
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="bg-transparent border-none text-[10px] font-black text-[#eceff4] uppercase tracking-widest focus:outline-none appearance-none cursor-pointer pr-4"
                >
                    <option value={1} className="bg-[#2e3440]">1 Hour</option>
                    <option value={3} className="bg-[#2e3440]">3 Hours</option>
                    <option value={6} className="bg-[#2e3440]">6 Hours</option>
                    <option value={12} className="bg-[#2e3440]">12 Hours</option>
                    <option value={24} className="bg-[#2e3440]">24 Hours</option>
                </select>
                <ChevronDown size={10} className="text-[#d8dee9]/30 -ml-3 pointer-events-none" />
            </div>
            <div className="flex items-center gap-2 px-3 min-w-[200px]">
                <Search size={12} className="text-[#81a1c1]/60" />
                <input 
                    type="text"
                    placeholder="FILTER BY IP, PORT, PROTOCOL..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && connectStream()}
                    className="bg-transparent border-none text-[10px] font-black text-[#eceff4] uppercase tracking-[0.1em] focus:outline-none placeholder:text-[#d8dee9]/20 w-full"
                />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#2e3440]/50 border border-[#434c5e] rounded-lg overflow-hidden h-10 shadow-lg">
              <button 
                onClick={expandAll}
                className="px-4 h-full bg-transparent border-none border-r border-r-[#434c5e] outline-none text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#81a1c1]/10 transition-all flex items-center gap-2 group cursor-pointer"
                title="Expand All"
              >
                <ChevronsUpDown size={14} className="group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-wider">Expand All</span>
              </button>
              <button 
                onClick={collapseAll}
                className="px-4 h-full bg-transparent border-none outline-none text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#81a1c1]/10 transition-all flex items-center gap-2 group cursor-pointer"
                title="Collapse All"
              >
                <ChevronsDownUp size={14} className="group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-wider">Collapse All</span>
              </button>
            </div>

            <button 
              onClick={connectStream}
              disabled={isLoading}
              className="p-2 bg-transparent border-none outline-none text-[#d8dee9]/40 hover:text-[#ebcb8b] hover:bg-[#ebcb8b]/10 rounded-lg transition-all disabled:opacity-50"
              title="Refresh Stream"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <div className="w-px h-6 bg-[#3b4252] mx-2" />
            <div 
              role="button"
              tabIndex={0}
              onClick={onClose} 
              className="appearance-none p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all ml-4 active:scale-90 border border-transparent cursor-pointer outline-none bg-transparent"
              title="Close Stream"
            >
              <X size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8 scrollbar-thin">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <Activity size={48} className="animate-pulse text-[#ebcb8b] mb-4" />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">Polling Traffic Logs...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-[#bf616a]/20 text-[#bf616a] rounded-2xl flex items-center justify-center mb-6">
              <Shield size={32} />
            </div>
            <h3 className="text-[#eceff4] text-xl font-black uppercase tracking-widest mb-2">Log Fetch Failed</h3>
            <p className="text-[#d8dee9]/70 font-mono text-sm max-w-2xl bg-[#3b4252]/50 p-4 rounded-lg border border-[#bf616a]/30">{error}</p>
          </div>
        ) : !events || Object.keys(events).length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <Wind size={48} className="text-[#81a1c1] mb-4" />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">No Traffic Detected in the Last Hour</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-4 pb-20">
            {Object.entries(events).sort((a, b) => b[0].localeCompare(a[0])).map(([timestamp, messages]) => {
              const isCollapsed = collapsedTimestamps.has(timestamp);
              return (
                <div key={timestamp} className="bg-[#3b4252]/20 border border-[#3b4252]/50 rounded-xl overflow-hidden shadow-lg transition-all">
                  <div 
                    onClick={() => toggleCollapse(timestamp)}
                    className="px-4 py-2 bg-[#3b4252]/40 border-b border-[#3b4252]/50 flex items-center justify-between cursor-pointer hover:bg-[#3b4252]/60 transition-colors group"
                  >
                      <div className="flex items-center gap-2">
                        <Database size={12} className="text-[#81a1c1]" />
                        <span className="text-[10px] font-black text-[#81a1c1] uppercase tracking-widest font-mono">{timestamp}</span>
                        <span className="text-[9px] text-[#d8dee9]/30 font-bold ml-2">({messages.length} events)</span>
                      </div>
                      <div className="text-[#d8dee9]/30 group-hover:text-[#81a1c1] transition-colors">
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </div>
                  </div>
                  {!isCollapsed && (
                    <div className="p-4 space-y-2">
                        {messages.map((msg, i) => {
                            const isReject = msg.includes('REJECT');
                            return (
                                <div key={i} className={`font-mono text-[11px] py-1 px-3 rounded flex items-center gap-3 ${isReject ? 'bg-[#bf616a]/10 text-[#bf616a]' : 'bg-[#a3be8c]/5 text-[#d8dee9]/80'}`}>
                                    <div className={`w-1 h-1 rounded-full ${isReject ? 'bg-[#bf616a]' : 'bg-[#a3be8c]'}`} />
                                    <SmartText 
                                        text={msg} 
                                        selectedProfile={profile} 
                                        selectedRegion={region} 
                                        availableNodes={availableNodes}
                                        onOpenInspect={onOpenInspect}
                                        onOpenNode={onOpenNode}
                                    />
                                </div>
                            );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-[#3b4252]/20 border-t border-[#3b4252] flex justify-between items-center shrink-0">
        <div className="flex gap-4 text-[9px] font-black text-[#81a1c1] uppercase tracking-widest">
           <span>Profile: {profile}</span>
           <span>Region: {region}</span>
           <span className="text-[#a3be8c] flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#a3be8c] animate-pulse"></div> Live Stream</span>
        </div>
        <div 
          role="button"
          tabIndex={0}
          onClick={onClose} 
          className="text-[9px] font-black text-[#d8dee9]/40 hover:text-[#eceff4] hover:bg-[#bf616a]/20 px-3 py-1 rounded transition-all cursor-pointer border-none bg-transparent outline-none"
        >
          Close Stream
        </div>
      </div>
    </div>
  );
}
