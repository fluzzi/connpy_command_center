import { Activity, Copy, X } from 'lucide-react';
import { SmartText } from './SmartText';

interface TopologyViewerProps {
  content: string;
  onClose: () => void;
  availableNodes?: string[];
  onOpenInspect: (assetId: string, profile: string, region: string) => void;
  onOpenNode: (node: string) => void;
}

export default function TopologyViewer({ 
  content, onClose, availableNodes = [], onOpenInspect, onOpenNode 
}: TopologyViewerProps) {
  
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  const smartTextProps = {
    selectedProfile: '',
    selectedRegion: '',
    availableNodes,
    onOpenInspect,
    onOpenNode,
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#2e3440] text-[#d8dee9]">
      {/* Header */}
      <div className="p-6 border-b border-[#3b4252] bg-[#3b4252]/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#88c0d0]/10 text-[#88c0d0] rounded-xl flex items-center justify-center shadow-inner border border-[#88c0d0]/20">
            <Activity size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#eceff4] tracking-wider uppercase italic">Tactical Topology</h2>
            <p className="text-xs text-[#d8dee9]/60 font-bold tracking-widest uppercase mt-1">Infrastructure Visualization & Analysis</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div 
            role="button"
            tabIndex={0}
            onClick={handleCopy}
            className="appearance-none flex items-center justify-center gap-2 bg-[#3b4252] hover:bg-[#434c5e] text-[#88c0d0] px-6 py-3 rounded-lg font-black text-[11px] uppercase tracking-[0.2em] transition-all active:scale-95 border border-transparent cursor-pointer outline-none focus:outline-none"
          >
            <Copy size={14} /> Copy Diagram
          </div>
          
          <div 
            role="button"
            tabIndex={0}
            onClick={onClose} 
            className="appearance-none p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all ml-4 active:scale-90 border border-transparent cursor-pointer outline-none bg-transparent"
            title="Close Topology View"
          >
            <X size={20} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-10 bg-[#2e3440] scrollbar-hide">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#3b4252] rounded-2xl border border-[#434c5e] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#434c5e]/30 border-b border-[#434c5e] flex items-center justify-between">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#bf616a]" />
                <div className="w-3 h-3 rounded-full bg-[#ebcb8b]" />
                <div className="w-3 h-3 rounded-full bg-[#a3be8c]" />
              </div>
              <span className="text-[10px] font-black text-[#81a1c1] uppercase tracking-[0.3em]">ASCII_TELEMETRY_STREAM</span>
            </div>
            
            <div className="p-10 bg-[#2e3440]/50">
              <pre className="font-mono text-sm leading-relaxed whitespace-pre text-[#88c0d0] overflow-x-auto scrollbar-thin">
                <SmartText 
                  text={content} 
                  {...smartTextProps}
                />
              </pre>
            </div>
          </div>
          
          <div className="mt-8 flex items-center justify-center gap-8 opacity-40">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#88c0d0]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Active Node</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#d08770]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Gateway</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#ebcb8b]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Edge Link</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
