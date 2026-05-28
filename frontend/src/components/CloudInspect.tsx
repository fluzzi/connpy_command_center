import { useState, useEffect } from 'react';
import { Shield, RefreshCw, Activity, X, Network, Layers, Server, Search, Settings, Zap, Terminal as TerminalIcon, List, BarChart2 } from 'lucide-react';
import { SmartText } from './SmartText';
import { api } from '../api';

interface CloudInspectProps {
  assetId: string;
  profile: string;
  region: string;
  availableNodes?: string[];
  onClose: () => void;
  onOpenInspect: (assetId: string, profile: string, region: string) => void;
  onOpenFlowLog: (eniId: string, flId: string, profile: string, region: string) => void;
  onOpenConsole?: (instanceId: string, profile: string, region: string, name?: string) => void;
  onOpenSSM?: (instanceId: string, profile: string, region: string, name?: string) => void;
  onOpenGraph?: (identifier: string, metricType: 'bw' | 'pps', profile: string, region: string, name?: string) => void;
  onOpenNode?: (node: string) => void;
}

export default function CloudInspect({ 
  assetId, profile: initialProfile, region: initialRegion, availableNodes = [], 
  onClose, onOpenInspect, onOpenFlowLog, onOpenConsole, onOpenSSM, onOpenGraph, onOpenNode 
}: CloudInspectProps) {
  const [data, setData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterIp, setFilterIp] = useState('');
  
  // Local state for profile/region if not provided
  const [localProfile, setLocalProfile] = useState(initialProfile);
  const [localRegion, setLocalRegion] = useState(initialRegion);
  const [localAssetId, setLocalAssetId] = useState(assetId);
  const [awsInfo, setAwsInfo] = useState<{profiles: string[], regions: string[]} | null>(null);
  const [hasInitialized, setHasInitialized] = useState(!!(initialProfile && initialRegion));

  const assetIdLower = localAssetId.toLowerCase();
  const isRouteTable = assetIdLower.startsWith('rtb-') || assetIdLower.startsWith('tgw-rtb-') || assetIdLower.startsWith('lgw-rtb-');
  const isPrefixList = assetIdLower.includes('pl-');
  const isInstance = assetIdLower.startsWith('i-');

  const getNameFromYaml = () => {
    if (!data) return undefined;
    const lines = data.split('\n');
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.toLowerCase().startsWith('name:')) {
        return cleanLine.substring(5).trim();
      }
    }
    return undefined;
  };

  const fetchAwsInfo = async () => {
    try {
      const result = await api.awsInfo();
      setAwsInfo({
        profiles: result.profiles || [],
        regions: result.regions || []
      });
    } catch (e) {
      console.error("Failed to fetch AWS info", e);
    }
  };

  const fetchDetails = async (force = false) => {
    // Safety lock: if not initialized and not forced, do nothing
    if (!hasInitialized && !force) return;

    if (!localProfile || !localRegion) {
        setIsLoading(false);
        if (!awsInfo) fetchAwsInfo();
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await api.awsInspect(localProfile, localRegion, localAssetId, filterIp || null);
      if (result.error) throw new Error(result.error);
      setData(result.output);
      setHasInitialized(true); // Mark as successfully initialized
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Always fetch awsInfo so header dropdowns have data
    if (!awsInfo) fetchAwsInfo();

    if (initialProfile && initialRegion) {
        setHasInitialized(true);
        fetchDetails(true);
    } else {
        setIsLoading(false);
    }
  }, [assetId]);


  const getIcon = () => {
    if (isInstance) return <Server size={24} />;
    if (assetIdLower.startsWith('vpc-')) return <Network size={24} />;
    if (assetIdLower.startsWith('subnet-')) return <Layers size={24} />;
    if (assetIdLower.startsWith('eni-')) return <Activity size={24} />;
    if (isPrefixList) return <List size={24} />;
    return <Shield size={24} />;
  };

  const renderYaml = (yaml: string | null) => {
    if (!yaml) return null;
    return yaml.split('\n').map((line, idx) => {
      // Matches key: value or just key:
      const match = line.match(/^(\s*)([^:]+):(.*)$/);
      if (match) {
        const [, indent, key, value] = match;
        
        // Special handling for flowlogs list items
        if (key.trim().toLowerCase() === 'flowlogs' || line.trim().startsWith('- fl-') || line.trim().startsWith('- SC-')) {
            // If it's a list item starting with fl- or SC-
            const flMatch = value.match(/-\s+(fl-[a-z0-9]+|SC-[a-z0-9-]+)/i) || line.match(/-\s+(fl-[a-z0-9]+|SC-[a-z0-9-]+)/i);
            if (flMatch) {
                const flId = flMatch[1];
                return (
                    <div key={idx} className="flex items-center">
                        <span className="whitespace-pre text-[#d8dee9]/30">{indent}</span>
                        <span className="text-[#81a1c1] font-black mr-1">{key}:</span>
                        <div 
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpenFlowLog(assetId, flId, localProfile, localRegion)}
                            className="text-[#ebcb8b] hover:text-[#eceff4] hover:bg-[#ebcb8b]/20 px-1.5 py-0.5 rounded transition-all flex items-center gap-1 font-bold italic bg-transparent border-none outline-none cursor-pointer p-0 m-0"
                        >
                            <Activity size={10} /> {flId}
                        </div>
                    </div>
                );
            }
        }


        return (
          <div key={idx} className="flex flex-wrap items-center">
            <span className="whitespace-pre text-[#d8dee9]/30">{indent}</span>
            <span className="text-[#81a1c1] font-black mr-1">
              <SmartText 
                text={key} 
                selectedProfile={localProfile} 
                selectedRegion={localRegion} 
                availableNodes={availableNodes}
                onOpenInspect={onOpenInspect}
                onOpenNode={onOpenNode || (() => {})}
              />:
            </span>
            <div className="flex flex-wrap gap-1 text-[#a3be8c]">
              <SmartText 
                text={value} 
                selectedProfile={localProfile} 
                selectedRegion={localRegion} 
                availableNodes={availableNodes}
                onOpenInspect={onOpenInspect}
                onOpenNode={onOpenNode || (() => {})}
              />
            </div>
          </div>
        );
      }
      
      // Check for bullet points that didn't match the key:value pattern (like flowlog list items)
      const listMatch = line.match(/^(\s*)-\s+(fl-[a-z0-9]+|SC-[a-z0-9-]+)(.*)$/);
      if (listMatch) {
          const [, indent, flId, rest] = listMatch;
          return (
              <div key={idx} className="flex items-center">
                  <span className="whitespace-pre text-[#d8dee9]/30">{indent}- </span>
                  <div 
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenFlowLog(assetId, flId, localProfile, localRegion)}
                      className="text-[#ebcb8b] hover:text-[#eceff4] hover:bg-[#ebcb8b]/20 px-1.5 py-0.5 rounded transition-all flex items-center gap-1 font-bold italic bg-transparent border-none outline-none cursor-pointer p-0 m-0"
                  >
                      <Activity size={10} /> {flId}
                  </div>
                  <span className="text-[#a3be8c] break-all ml-1">
                    <SmartText 
                      text={rest} 
                      selectedProfile={localProfile} 
                      selectedRegion={localRegion} 
                      availableNodes={availableNodes}
                      onOpenInspect={onOpenInspect}
                      onOpenNode={onOpenNode || (() => {})}
                    />
                  </span>
              </div>
          );
      }

      const awsRegex = /\b(sg-[a-zA-Z0-9-]+|vpc-[a-zA-Z0-9-]+|subnet-[a-zA-Z0-9-]+|eni-[a-zA-Z0-9-]+|tgw-rtb-[a-zA-Z0-9-]+|lgw-rtb-[a-zA-Z0-9-]+|tgw-[a-zA-Z0-9-]+|rtb-[a-zA-Z0-9-]+|acl-[a-zA-Z0-9-]+|(-lists\s+)?pl-[a-zA-Z0-9-]+|dxgw-[a-zA-Z0-9-]+|dxcon-[a-zA-Z0-9-]+|vif-[a-zA-Z0-9-]+|i-[a-zA-Z0-9-]+|igw-[a-zA-Z0-9-]+|vgw-[a-zA-Z0-9-]+|cgw-[a-zA-Z0-9-]+|tgw-attach-[a-zA-Z0-9-]+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/gi;
      const hasAwsId = line.match(awsRegex);

      if (hasAwsId || (availableNodes && availableNodes.some(n => line.includes(n)))) {
          return (
              <div key={idx} className="flex flex-wrap items-center py-0.5">
                  <SmartText 
                    text={line} 
                    selectedProfile={localProfile} 
                    selectedRegion={localRegion} 
                    availableNodes={availableNodes}
                    onOpenInspect={onOpenInspect}
                    onOpenNode={onOpenNode || (() => {})}
                  />
              </div>
          );
      }

      return (
        <div key={idx} className="whitespace-pre text-[#d8dee9]/70 py-0.5">
          {line}
        </div>
      );
    });
  };

  return (
    <div className="w-full h-full bg-[#2e3440] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#3b4252] bg-[#3b4252]/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#88c0d0]/20 text-[#88c0d0] rounded-xl flex items-center justify-center shadow-inner border border-transparent">
            {getIcon()}
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#eceff4] tracking-wider uppercase italic">Tactical Asset View</h2>
            <div className="flex items-center gap-2 mt-1">
              <input 
                type="text"
                value={localAssetId}
                onChange={(e) => setLocalAssetId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchDetails(true)}
                className="bg-transparent border-none text-xs text-[#d8dee9]/60 font-bold tracking-widest uppercase focus:outline-none focus:text-[#88c0d0] transition-colors w-40"
              />
              <span className="text-[#81a1c1] font-bold">@</span>
              <select 
                  value={localProfile} 
                  onChange={(e) => { setLocalProfile(e.target.value); }}
                  className="bg-transparent border border-[#434c5e]/50 hover:border-[#434c5e] text-[#d8dee9]/80 rounded px-2 py-1 focus:outline-none focus:border-[#88c0d0] text-xs font-bold uppercase transition-colors cursor-pointer appearance-none pr-4 relative"
              >
                  <option value="" className="bg-[#2e3440] text-[#d8dee9]">PROFILE...</option>
                  {awsInfo?.profiles.map(p => <option key={p} value={p} className="bg-[#2e3440] text-[#d8dee9]">{p}</option>)}
              </select>
              <select 
                  value={localRegion} 
                  onChange={(e) => { setLocalRegion(e.target.value); }}
                  className="bg-transparent border border-[#434c5e]/50 hover:border-[#434c5e] text-[#d8dee9]/80 rounded px-2 py-1 focus:outline-none focus:border-[#88c0d0] text-xs font-bold uppercase transition-colors cursor-pointer appearance-none pr-4 relative"
              >
                  <option value="" className="bg-[#2e3440] text-[#d8dee9]">REGION...</option>
                  {awsInfo?.regions.map(r => <option key={r} value={r} className="bg-[#2e3440] text-[#d8dee9]">{r}</option>)}
              </select>
            </div>
          </div>
        </div>

        {isRouteTable && (
          <div className="flex items-center bg-[#2e3440] border border-[#434c5e] rounded-lg px-3 h-10 shadow-inner min-w-[300px]">
              <Search size={14} className="text-[#81a1c1]/60 mr-2" />
              <input 
                  type="text"
                  placeholder="LOOKUP MATCHING ROUTE (IP)..."
                  value={filterIp}
                  onChange={(e) => setFilterIp(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchDetails(true)}
                  className="bg-transparent border-none text-xs font-black text-[#eceff4] uppercase tracking-[0.1em] focus:outline-none placeholder:text-[#d8dee9]/20 w-full"
              />
          </div>
        )}
        
        <div className="flex items-center gap-2">
          {isInstance && onOpenConsole && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpenConsole(localAssetId, localProfile, localRegion, getNameFromYaml())}
              className="appearance-none flex items-center gap-2 bg-[#81a1c1]/20 hover:bg-[#81a1c1]/40 text-[#81a1c1] px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 cursor-pointer outline-none"
              title="Launch Console"
            >
              <TerminalIcon size={14} /> Console
            </div>
          )}
          {isInstance && onOpenSSM && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpenSSM(localAssetId, localProfile, localRegion, getNameFromYaml())}
              className="appearance-none flex items-center gap-2 bg-[#a3be8c]/20 hover:bg-[#a3be8c]/40 text-[#a3be8c] px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 cursor-pointer outline-none"
              title="Launch SSM"
            >
              <TerminalIcon size={14} /> SSM
            </div>
          )}
          {isInstance && onOpenGraph && (
             <div className="flex items-center gap-2 border-l border-[#3b4252] pl-2 ml-1">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenGraph(localAssetId, 'bw', localProfile, localRegion, getNameFromYaml())}
                  className="appearance-none flex items-center gap-2 bg-[#b48ead]/20 hover:bg-[#b48ead]/40 text-[#b48ead] px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 cursor-pointer outline-none"
                  title="Bandwidth Utilization"
                >
                  <BarChart2 size={14} /> BW
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenGraph(localAssetId, 'pps', localProfile, localRegion, getNameFromYaml())}
                  className="appearance-none flex items-center gap-2 bg-[#d08770]/20 hover:bg-[#d08770]/40 text-[#d08770] px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 cursor-pointer outline-none"
                  title="Packets Per Second"
                >
                  <BarChart2 size={14} /> PPS
                </div>
             </div>
          )}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => fetchDetails(true)}
            className={`p-2 bg-transparent border-none outline-none text-[#d8dee9]/40 hover:text-[#88c0d0] hover:bg-[#88c0d0]/10 rounded-lg transition-all cursor-pointer ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
            title="Refresh Telemetry"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </div>
          <div className="w-px h-6 bg-[#3b4252] mx-2" />
          <div 
            role="button"
            tabIndex={0}
            onClick={onClose} 
            className="appearance-none p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all ml-4 active:scale-90 border border-transparent cursor-pointer outline-none bg-transparent"
            title="Close Inspection"
          >
            <X size={18} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8 relative scrollbar-hide">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <RefreshCw size={48} className="animate-spin text-[#88c0d0] mb-4" />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">Intercepting Telemetry...</p>
          </div>
        ) : !hasInitialized ? (
          <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center">
            <div className="w-16 h-16 bg-[#ebcb8b]/20 text-[#ebcb8b] rounded-2xl flex items-center justify-center mb-6">
              <Settings size={32} />
            </div>
            <h3 className="text-[#eceff4] text-xl font-black uppercase tracking-widest mb-2">Context Required</h3>
            <p className="text-[#d8dee9]/60 text-sm mb-8 leading-relaxed">This deep-link was captured without account context. Please select target infrastructure details to initialize telemetry.</p>
            
            <div className="w-full space-y-4">
              <div className="flex flex-col gap-1 text-left">
                <label className="text-[10px] font-black text-[#81a1c1] uppercase tracking-[0.2em] ml-1">AWS Profile</label>
                <select 
                  value={localProfile} 
                  onChange={(e) => setLocalProfile(e.target.value)}
                  className="w-full bg-[#3b4252] border border-[#434c5e] text-[#eceff4] rounded-lg px-4 py-3 focus:outline-none focus:border-[#88c0d0] font-bold text-sm"
                >
                  <option value="">Select Profile...</option>
                  {awsInfo?.profiles.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1 text-left">
                <label className="text-[10px] font-black text-[#81a1c1] uppercase tracking-[0.2em] ml-1">Infrastructure Region</label>
                <select 
                  value={localRegion} 
                  onChange={(e) => setLocalRegion(e.target.value)}
                  className="w-full bg-[#3b4252] border border-[#434c5e] text-[#eceff4] rounded-lg px-4 py-3 focus:outline-none focus:border-[#88c0d0] font-bold text-sm"
                >
                  <option value="">Select Region...</option>
                  {awsInfo?.regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div 
                role="button"
                tabIndex={0}
                onClick={() => fetchDetails(true)}
                className={`w-full mt-4 bg-[#88c0d0] hover:bg-[#81a1c1] text-[#2e3440] font-black uppercase tracking-[0.2em] py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${(!localProfile || !localRegion || isLoading) ? 'opacity-30 pointer-events-none' : ''}`}
              >
                <Zap size={18} /> Initialize Inspection
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-[#bf616a]/20 text-[#bf616a] rounded-2xl flex items-center justify-center mb-6">
              <Shield size={32} />
            </div>
            <h3 className="text-[#eceff4] text-xl font-black uppercase tracking-widest mb-2">Access Denied</h3>
            <p className="text-[#d8dee9]/70 font-mono text-sm max-w-2xl bg-[#3b4252]/50 p-4 rounded-lg border border-[#bf616a]/30">{error}</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto flex flex-col gap-8">
            

            {/* Main Telemetry */}
            <div className="bg-[#2e3440] border border-[#3b4252] rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-6 py-4 bg-[#3b4252]/30 border-b border-[#3b4252] flex items-center justify-between">
                <span className="text-xs font-black text-[#81a1c1] uppercase tracking-[0.2em]">Asset Telemetry YAML</span>
                <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-[#bf616a]" />
                    <div className="w-2 h-2 rounded-full bg-[#ebcb8b]" />
                    <div className="w-2 h-2 rounded-full bg-[#a3be8c]" />
                </div>
              </div>
              <div className="p-8 bg-[#1e222a]/50">
                <div className="font-mono text-[13px] leading-relaxed">
                  {renderYaml(data)}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-[#3b4252]/20 border-t border-[#3b4252] flex justify-between items-center shrink-0">
        <div className="flex items-center text-[10px] font-black text-[#81a1c1] uppercase tracking-widest">
           <span style={{ marginRight: '40px' }}>Profile: {localProfile || 'N/A'}</span>
           <span>Region: {localRegion || 'N/A'}</span>
        </div>
        <div 
          role="button"
          tabIndex={0}
          onClick={onClose} 
          className="text-[10px] font-black text-[#d8dee9]/40 hover:text-[#eceff4] hover:bg-[#bf616a]/20 px-3 py-1 rounded transition-all cursor-pointer border-none bg-transparent outline-none uppercase tracking-[0.2em]"
        >
          Discard View
        </div>
      </div>
    </div>
  );
}
