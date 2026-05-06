import { useState, useEffect, useMemo } from 'react';
import { Cloud, X, RefreshCw, Server, Network, Layers, Shield, Search, Activity, Eye, Zap, Wind, ChevronDown, Terminal as TerminalIcon, BarChart2 } from 'lucide-react';
import { api } from '../api';

interface CloudExplorerProps {
  onClose: () => void;
  onOpenInspect: (assetId: string, profile: string, region: string) => void;
  onOpenConsole?: (instanceId: string, profile: string, region: string) => void;
  onOpenSSM?: (instanceId: string, profile: string, region: string) => void;
  onOpenGraph?: (identifier: string, metricType: 'bw' | 'pps', profile: string, region: string) => void;
  workspaceId?: string | null;
  ws?: React.MutableRefObject<WebSocket | null>;
  selectedProfile: string;
  selectedRegion: string;
  setSelectedProfile: (profile: string) => void;
  setSelectedRegion: (region: string) => void;
  onRename?: (newName: string) => void;
}

interface CloudAsset {
  id: string;
  name?: string;
  state?: string;
  status?: string;
  ips?: string[];
  cidr?: string;
  ipv6_cidr?: string;
  type?: string;
  vpc_id?: string;
  subnet_id?: string;
  flow_log_status?: 'ACTIVE' | 'INACTIVE';
  flow_log_id?: string;
  [key: string]: unknown;
}

interface InventoryData {
  instances?: CloudAsset[];
  vpcs?: CloudAsset[];
  subnets?: CloudAsset[];
  enis?: CloudAsset[];
  tgws?: CloudAsset[];
  tgw_rtbs?: CloudAsset[];
  route_tables?: CloudAsset[];
  dxgws?: CloudAsset[];
  dx_conns?: CloudAsset[];
  vifs?: CloudAsset[];
  [key: string]: CloudAsset[] | undefined;
}

export default function CloudExplorer({ onClose, onOpenInspect, onOpenConsole, onOpenSSM, onOpenGraph, workspaceId, ws, selectedProfile, selectedRegion, setSelectedProfile, setSelectedRegion, onRename }: CloudExplorerProps) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync with multiplayer events
  useEffect(() => {
    if (!ws?.current || !workspaceId) return;

    const handleWsMessage = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'aws_discovery_start') {
                setIsScanning(true);
                setInventory(null);
                setError(null);
                if (data.profile) setSelectedProfile(data.profile);
                if (data.region) setSelectedRegion(data.region);
            } else if (data.type === 'aws_discovery_complete') {
                setIsScanning(false);
                setInventory(data.inventory);
                setError(data.error || null);
            }
        } catch { /* ignore */ }
    };

    ws.current.addEventListener('message', handleWsMessage);
    return () => ws.current?.removeEventListener('message', handleWsMessage);
  }, [ws, workspaceId]);

  const [activeTab, setActiveTab] = useState<keyof InventoryData>('instances');
  const [searchTerm, setSearchTerm] = useState('');
  const [directInspectId, setDirectInspectId] = useState('');

  useEffect(() => {
    api.awsInfo()
      .then(data => {
        if (data.error) throw new Error(data.error);
        const p = Array.isArray(data.profiles) ? data.profiles : [];
        const r = Array.isArray(data.regions) ? data.regions : [];
        setProfiles(p);
        setRegions(r);
        if (p.length > 0) setSelectedProfile(p[0]);
        if (r.length > 0) setSelectedRegion(r[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setIsLoadingInfo(false));
  }, []);

  const handleScan = async () => {
    if (!selectedProfile || !selectedRegion) return;
    setIsScanning(true);
    setError(null);
    setInventory(null);

    if (onRename) {
      onRename(`${selectedProfile}@${selectedRegion}`);
    }

    // Broadcast scan start
    if (ws?.current && workspaceId) {
        ws.current.send(JSON.stringify({ 
            type: 'aws_discovery_start', 
            profile: selectedProfile, 
            region: selectedRegion 
        }));
    }

    try {
      const data = await api.awsInventory(selectedProfile, selectedRegion);
      if (data.error) throw new Error(data.error);
      setInventory(data as InventoryData);

      // Broadcast scan complete
      if (ws?.current && workspaceId) {
          ws.current.send(JSON.stringify({ 
              type: 'aws_discovery_complete', 
              inventory: data 
          }));
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred during AWS discovery.';
      setError(errorMsg);
      if (ws?.current && workspaceId) {
          ws.current.send(JSON.stringify({ 
              type: 'aws_discovery_complete', 
              error: errorMsg,
              inventory: null
          }));
      }
    } finally {
      setIsScanning(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!inventory || !inventory[activeTab]) return [];
    const items = inventory[activeTab] as CloudAsset[];
    if (!searchTerm) return items;

    const matchText = (text: string, term: string) => {
      if (!text || !term) return false;
      const t = text.toLowerCase();
      const s = term.toLowerCase();

      // 1. Try Regex if term looks like a pattern
      if (/[.*+?^${}()|[\]\\]/.test(term)) {
        try {
          if (new RegExp(term, 'i').test(text)) return true;
        } catch { /* ignore */ }
      }

      // 2. Fast exact substring
      if (t.includes(s)) return true;

      // 3. Fuzzy subsequence match (e.g. "i123" matches "i-0123...")
      let sIdx = 0;
      let tIdx = 0;
      while (tIdx < t.length && sIdx < s.length) {
        if (t[tIdx] === s[sIdx]) sIdx++;
        tIdx++;
      }
      return sIdx === s.length;
    };

    return items.filter(item => {
      // Check ID
      if (item.id && matchText(item.id, searchTerm)) return true;
      // Check Name
      if (item.name && matchText(item.name, searchTerm)) return true;
      // Check CIDR
      if (item.cidr && matchText(item.cidr, searchTerm)) return true;
      // Check IPv6 CIDR
      if (item.ipv6_cidr && matchText(item.ipv6_cidr, searchTerm)) return true;
      // Check IPs
      if (Array.isArray(item.ips) && item.ips.some(ip => matchText(ip, searchTerm))) return true;
      
      return false;
    });
  }, [inventory, activeTab, searchTerm]);

  const tabs = [
    { id: 'instances', label: 'Instances', icon: Server },
    { id: 'vpcs', label: 'VPCs', icon: Network },
    { id: 'subnets', label: 'Subnets', icon: Layers },
    { id: 'enis', label: 'ENIs', icon: Activity },
    { id: 'route_tables', label: 'Route Tables', icon: Wind },
    { id: 'tgws', label: 'TGWs', icon: Zap },
    { id: 'tgw_rtbs', label: 'TGW Routes', icon: Zap },
    { id: 'dxgws', label: 'DX Gateways', icon: Network },
    { id: 'dx_conns', label: 'DX Conns', icon: Activity },
    { id: 'vifs', label: 'VIFs', icon: Layers },
  ];

  const middleColumn = useMemo(() => {
    switch (activeTab) {
      case 'instances': return { label: 'State', key: 'state' };
      case 'vpcs': return { label: 'Primary CIDR', key: 'cidr' };
      case 'subnets': return { label: 'VPC Context', key: 'vpc_id' };
      case 'enis': return { label: 'Status', key: 'status' };
      case 'route_tables': return { label: 'VPC Context', key: 'vpc_id' };
      case 'tgws': return { label: 'Owner ID', key: 'owner_id' };
      case 'tgw_rtbs': return { label: 'TGW ID', key: 'tgw_id' };
      case 'dxgws': return { label: 'State', key: 'state' };
      case 'dx_conns': return { label: 'State', key: 'state' };
      case 'vifs': return { label: 'VIF State', key: 'state' };
      default: return { label: 'State', key: 'state' };
    }
  }, [activeTab]);

  return (
    <div className="w-full h-full bg-[#2e3440] flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="p-6 border-b border-[#3b4252] bg-[#3b4252]/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#d08770]/20 text-[#d08770] rounded-xl flex items-center justify-center shadow-inner border border-transparent">
              <Cloud size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#eceff4] tracking-wider uppercase italic">Cloud Explorer</h2>
              <p className="text-xs text-[#d8dee9]/60 font-bold tracking-widest uppercase mt-1">AWS Infrastructure Discovery</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-[#2e3440] rounded-lg border border-[#434c5e] p-1 shadow-inner relative">
              <select 
                value={selectedProfile} 
                onChange={(e) => setSelectedProfile(e.target.value)}
                disabled={isLoadingInfo || isScanning}
                className="bg-[#2e3440] appearance-none text-xs font-bold text-[#d8dee9] px-4 py-2 pr-8 outline-none border-r border-[#434c5e] uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {profiles.length === 0 && <option className="bg-[#2e3440]" value="">NO PROFILES</option>}
                {profiles.map(p => <option key={p} className="bg-[#2e3440]" value={p}>{p}</option>)}
              </select>
              <select 
                value={selectedRegion} 
                onChange={(e) => setSelectedRegion(e.target.value)}
                disabled={isLoadingInfo || isScanning}
                className="bg-[#2e3440] appearance-none text-xs font-bold text-[#d8dee9] px-4 py-2 pr-8 outline-none uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {regions.map(r => <option key={r} className="bg-[#2e3440]" value={r}>{r}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#81a1c1] pointer-events-none" />
            </div>
            
            <div
              role="button"
              tabIndex={0}
              onClick={handleScan}
              className={`flex items-center justify-center gap-2 bg-[#d08770] hover:bg-[#bf616a] text-[#2e3440] px-6 py-3 rounded-lg font-black text-[11px] uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg shadow-[#d08770]/20 min-w-[140px] outline-none cursor-pointer border-none ${(isLoadingInfo || isScanning || !selectedProfile) ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              {isScanning ? 'SCANNING...' : 'DISCOVER'}
            </div>            


            <div 
              role="button"
              tabIndex={0}
              onClick={onClose} 
              className="appearance-none p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all ml-4 active:scale-90 border border-transparent cursor-pointer outline-none bg-transparent"
              title="Close Explorer"
            >
              <X size={20} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden bg-[#2e3440]">
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="w-16 h-16 bg-[#bf616a]/20 text-[#bf616a] rounded-2xl flex items-center justify-center mb-6">
                <Shield size={32} />
              </div>
              <h3 className="text-[#eceff4] text-xl font-black uppercase tracking-widest mb-2">Discovery Failed</h3>
              <p className="text-[#d8dee9]/70 font-mono text-sm max-w-2xl bg-[#3b4252]/50 p-4 rounded-lg border border-[#bf616a]/30">{error}</p>
            </div>
          ) : !inventory && !isScanning ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <Cloud size={64} className="text-[#81a1c1]/50 mb-6" />
              <h3 className="text-[#eceff4] text-2xl font-black uppercase tracking-widest mb-2 italic">Awaiting Telemetry</h3>
              <p className="text-[#d8dee9]/50 font-bold tracking-wide max-w-md mb-8">Select your target environment and initiate discovery to map cloud assets.</p>
              
              <div className="flex items-center gap-4 text-[#d8dee9]/30 uppercase font-black tracking-[0.2em] text-[10px] w-96 mb-8">
                <div className="flex-1 border-t border-[#3b4252]"></div>
                <span>OR DIRECT INSPECT</span>
                <div className="flex-1 border-t border-[#3b4252]"></div>
              </div>

              <div className="flex items-center bg-[#3b4252]/40 rounded-xl border border-[#434c5e]/50 shadow-inner p-2 w-fit focus-within:border-[#88c0d0]/50 transition-all hover:bg-[#3b4252]/60 hover:border-[#88c0d0]/30">
                <Search size={18} className="text-[#88c0d0]/50 ml-3 mr-2" />
                <input 
                  type="text" 
                  value={directInspectId}
                  onChange={(e) => setDirectInspectId(e.target.value)}
                  placeholder="Enter Asset ID (e.g. i-1234, vpc-abcd)" 
                  className="bg-transparent border-none py-3 px-2 w-64 text-sm font-bold text-[#d8dee9] outline-none placeholder:text-[#434c5e]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && directInspectId) {
                      onOpenInspect(directInspectId, selectedProfile, selectedRegion);
                      setDirectInspectId('');
                    }
                  }}
                />
                <div 
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (directInspectId) {
                      onOpenInspect(directInspectId, selectedProfile, selectedRegion);
                      setDirectInspectId('');
                    }
                  }}
                  className={`appearance-none flex items-center gap-2 px-6 py-3 bg-[#88c0d0]/20 hover:bg-[#88c0d0]/40 text-[#88c0d0] font-black uppercase tracking-[0.15em] text-xs rounded-lg transition-all outline-none border-none cursor-pointer ${(!directInspectId || !selectedProfile || !selectedRegion) ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <Eye size={16} /> INSPECT
                </div>
              </div>
            </div>
          ) : isScanning ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="relative">
                <Cloud size={64} className="text-[#d08770]/20 mb-6" />
                <Activity size={32} className="text-[#d08770] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -mt-3 animate-pulse" />
              </div>
              <h3 className="text-[#d08770] text-xl font-black uppercase tracking-[0.3em] mb-2 animate-pulse">Deep Scanning</h3>
              <p className="text-[#d8dee9]/50 font-bold tracking-widest text-xs uppercase">Polling AWS APIs across {selectedRegion} via {selectedProfile}...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-w-0">
              
              {/* Filter Bar */}
              <div className="px-8 py-3 flex items-center justify-between gap-4 shrink-0 border-b border-[#3b4252]/50">
                <div className="flex-1 max-w-md flex items-center bg-[#2e3440] border border-[#434c5e] rounded-lg px-3 focus-within:border-[#d08770]/50 transition-all shadow-inner">
                  <Search size={14} className="text-[#81a1c1]/50 shrink-0" />
                  <input 
                    type="text" 
                    placeholder="Search instances, vpcs, enis..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent border-none py-2 px-3 text-[10px] font-black uppercase tracking-widest text-[#eceff4] focus:outline-none placeholder:text-[#81a1c1]/30"
                  />
                </div>

                <div className="w-64 flex items-center bg-[#2e3440] border border-[#434c5e] rounded-lg shadow-inner focus-within:border-[#88c0d0]/50 transition-colors ml-auto mr-4">
                  <input 
                    type="text" 
                    value={directInspectId}
                    onChange={(e) => setDirectInspectId(e.target.value)}
                    placeholder="Direct Asset ID..." 
                    className="bg-transparent border-none py-1.5 px-3 text-[10px] font-bold text-[#d8dee9] outline-none placeholder:text-[#434c5e] w-full"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && directInspectId) {
                        onOpenInspect(directInspectId, selectedProfile, selectedRegion);
                        setDirectInspectId('');
                      }
                    }}
                  />
                  <div 
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (directInspectId) {
                        onOpenInspect(directInspectId, selectedProfile, selectedRegion);
                        setDirectInspectId('');
                      }
                    }}
                    className={`appearance-none px-3 py-1.5 bg-[#88c0d0]/10 hover:bg-[#88c0d0]/20 text-[#88c0d0] text-[10px] font-black uppercase tracking-widest rounded-r-lg border-l border-[#434c5e] transition-colors flex items-center gap-1 outline-none border-y-transparent border-r-transparent cursor-pointer ${(!directInspectId || !selectedProfile || !selectedRegion) ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <Eye size={12} /> Inspect
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-1.5 h-4 bg-[#d08770] rounded-full" />
                  <div className="text-[10px] font-black text-[#d8dee9] uppercase tracking-[0.2em] whitespace-nowrap">
                    <span className="text-[#d08770]">{filteredItems.length}</span> of <span className="text-[#d08770]">{inventory?.[activeTab]?.length || 0}</span> Assets
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex px-8 pt-4 border-b border-[#3b4252] shrink-0 items-center w-full">
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveTab(tab.id as keyof InventoryData)}
                    className={`flex-1 pb-4 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 flex items-center justify-center gap-2 whitespace-nowrap bg-transparent cursor-pointer outline-none ${
                      activeTab === tab.id 
                        ? 'border-[#d08770] text-[#d08770]' 
                        : 'border-transparent text-[#d8dee9]/60 hover:text-[#d8dee9]'
                    }`}
                  >
                    <tab.icon size={12} className={activeTab === tab.id ? 'text-[#d08770]' : 'text-[#d8dee9]/30'} />
                    {tab.label}
                  </div>
                ))}
              </div>

              {/* Table Area */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#2e3440] z-10 shadow-sm">
                    <tr>
                      <th className="py-3 px-4 text-[10px] font-black text-[#81a1c1] uppercase tracking-widest border-b border-[#3b4252]">Name</th>
                      <th className="py-3 px-4 text-[10px] font-black text-[#81a1c1] uppercase tracking-widest border-b border-[#3b4252]">ID</th>
                      <th className="py-3 px-4 text-[10px] font-black text-[#81a1c1] uppercase tracking-widest border-b border-[#3b4252]">{middleColumn.label}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-[#81a1c1] uppercase tracking-widest border-b border-[#3b4252]">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item: CloudAsset, idx: number) => (
                      <tr key={idx} className="border-b border-[#3b4252]/30 hover:bg-[#3b4252]/20 transition-colors group">
                        <td className="py-4 px-4">
                          <span className="text-sm font-bold text-[#eceff4]">{item.name}</span>
                        </td>
                        <td className="py-4 px-4">
                          <div 
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpenInspect(item.id, selectedProfile, selectedRegion)}
                            className="text-xs font-mono text-[#d8dee9]/80 bg-[#3b4252]/30 px-3 py-1.5 rounded-lg border border-transparent hover:bg-[#d08770]/10 hover:text-[#d08770] transition-all flex items-center gap-2 shadow-sm outline-none cursor-pointer"
                          >
                            {item.id} <Eye size={10} className="opacity-0 group-hover:opacity-100" />
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                            item[middleColumn.key] === 'running' || item[middleColumn.key] === 'available' || item[middleColumn.key] === 'in-use' || item[middleColumn.key] === 'active' || (middleColumn.key === 'vpc_id' && item.vpc_id)
                              ? 'bg-[#a3be8c]/10 text-[#a3be8c] border border-[#a3be8c]/20' 
                              : 'bg-[#81a1c1]/20 text-[#d8dee9]/60 border border-[#81a1c1]/40'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${item[middleColumn.key] === 'running' || item[middleColumn.key] === 'available' || item[middleColumn.key] === 'in-use' || item[middleColumn.key] === 'active' ? 'bg-[#a3be8c]' : 'bg-[#81a1c1]'}`} />
                            {String(item[middleColumn.key] || 'N/A')}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            {Array.isArray(item.ips) && item.ips.length > 0 && <span className="text-xs font-mono text-[#88c0d0]">{item.ips.join(', ')}</span>}
                            {item.cidr && middleColumn.key !== 'cidr' && <span className="text-xs font-mono text-[#b48ead]">{item.cidr}</span>}
                            {item.ipv6_cidr && <span className="text-[10px] font-mono text-[#a3be8c]">{item.ipv6_cidr}</span>}
                            {item.vpc_id && middleColumn.key !== 'vpc_id' && <span className="text-[10px] font-bold text-[#81a1c1]">VPC: {item.vpc_id}</span>}
                            {activeTab === 'instances' && item.state === 'running' && (
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {onOpenConsole && (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onOpenConsole(item.id, selectedProfile, selectedRegion)}
                                    className="flex items-center justify-center gap-2 bg-[#81a1c1]/20 hover:bg-[#81a1c1]/40 text-[#81a1c1] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 w-fit cursor-pointer outline-none"
                                  >
                                    <TerminalIcon size={12} /> Console
                                  </div>
                                )}
                                {onOpenSSM && (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onOpenSSM(item.id, selectedProfile, selectedRegion)}
                                    className="flex items-center justify-center gap-2 bg-[#a3be8c]/20 hover:bg-[#a3be8c]/40 text-[#a3be8c] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 w-fit cursor-pointer outline-none"
                                  >
                                    <TerminalIcon size={12} /> SSM
                                  </div>
                                )}
                                {onOpenGraph && (
                                   <div className="flex items-center gap-2 border-l border-[#3b4252] pl-2 ml-1">
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onOpenGraph(item.id, 'bw', selectedProfile, selectedRegion)}
                                        className="flex items-center justify-center gap-1 bg-[#b48ead]/10 hover:bg-[#b48ead]/30 text-[#b48ead] px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 w-fit cursor-pointer outline-none"
                                      >
                                        <BarChart2 size={12} /> BW
                                      </div>
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onOpenGraph(item.id, 'pps', selectedProfile, selectedRegion)}
                                        className="flex items-center justify-center gap-1 bg-[#d08770]/10 hover:bg-[#d08770]/30 text-[#d08770] px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-transparent transition-all active:scale-95 w-fit cursor-pointer outline-none"
                                      >
                                        <BarChart2 size={12} /> PPS
                                      </div>
                                   </div>
                                )}
                              </div>
                            )}
                            </div>                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
