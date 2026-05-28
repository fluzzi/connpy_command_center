import React, { useState, useEffect, useMemo } from 'react';
import { Terminal, ChevronDown, ChevronRight, Network, Folder, Search, Database, MoreVertical, Cloud, BookOpen } from 'lucide-react';
import { api, API_BASE } from '../api';

interface SidebarProps {
  onSelectNode: (nodeId: string) => void;
  activeNodeId?: string;
  onCloudExplorer?: () => void;
  onPlaybookEditor?: () => void;
  width?: number;
}

interface TreeItem {
  id: string;
  name: string;
  type: 'node' | 'folder';
  children: TreeItem[];
}

const TreeNode: React.FC<{
  item: TreeItem;
  level: number;
  onSelectNode: (id: string) => void;
  activeNodeId?: string;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (id: string) => void;
  searchTerm: string;
  singleMatchNodeId?: string | null;
}> = ({ item, level, onSelectNode, activeNodeId, expandedFolders, toggleFolder, searchTerm, singleMatchNodeId }) => {
  if (item.type === 'node') {
    const isActive = activeNodeId === item.id;
    const isSingleMatch = singleMatchNodeId === item.id;
    return (
      <div
        onClick={() => onSelectNode(item.id)}
        className={`group flex items-center gap-3 px-5 py-2 cursor-pointer transition-all duration-150 border-l-2 ${
          isActive 
            ? 'bg-[#88c0d0]/10 border-[#88c0d0] text-[#88c0d0]' 
            : isSingleMatch
              ? 'bg-[#a3be8c]/20 border-[#a3be8c] text-[#a3be8c] shadow-[inset_2px_0_10px_rgba(163,190,140,0.1)]'
              : 'border-transparent text-[#d8dee9]/60 hover:bg-[#3b4252]/50 hover:text-[#d8dee9]'
        }`}
        style={{ paddingLeft: `${20 + level * 12}px` }}
      >
        <Terminal size={14} className={`${isActive ? 'text-[#88c0d0]' : isSingleMatch ? 'text-[#a3be8c]' : 'text-[#81a1c1] group-hover:text-[#88c0d0]/50'}`} />
        <span className={`text-xs font-bold tracking-wide truncate ${isActive || isSingleMatch ? 'tracking-normal' : ''}`}>{item.name}</span>
        {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-[#88c0d0] shadow-[0_0_5px_#88c0d0]" />}
        {!isActive && isSingleMatch && <div className="ml-auto text-[9px] font-black uppercase text-[#a3be8c] animate-pulse">Press Enter</div>}
      </div>
    );
  }

  const isExpanded = expandedFolders[item.id] || (searchTerm !== '' && item.children.length > 0);
  
  return (
    <div className="mb-0.5">
      <div
        onClick={() => toggleFolder(item.id)}
        className="flex items-center gap-3 px-5 py-1.5 cursor-pointer hover:bg-[#3b4252]/30 text-[#d8dee9]/50 hover:text-[#d8dee9]/80 transition-all group"
        style={{ paddingLeft: `${20 + level * 12}px` }}
      >
        {isExpanded ? <ChevronDown size={14} className="text-[#88c0d0] shrink-0" /> : <ChevronRight size={14} className="text-[#81a1c1] shrink-0" />}
        <Folder size={14} className={`${isExpanded ? 'text-[#88c0d0] fill-[#88c0d0]/10 shrink-0' : 'text-[#81a1c1] shrink-0'}`} />
        <span className={`text-xs font-black uppercase tracking-widest truncate ${isExpanded ? 'text-[#d8dee9]' : ''}`}>{item.name}</span>
        <span className="ml-auto text-[9px] font-mono opacity-0 group-hover:opacity-100 bg-[#3b4252] px-1.5 py-0.5 rounded text-[#81a1c1]">
          {item.children.length}
        </span>
      </div>
      {isExpanded && (
        <div className="flex flex-col">
          {item.children.map(child => (
            <TreeNode 
              key={child.id} 
              item={child} 
              level={level + 1} 
              onSelectNode={onSelectNode} 
              activeNodeId={activeNodeId}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              searchTerm={searchTerm}
              singleMatchNodeId={singleMatchNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ onSelectNode, activeNodeId, onCloudExplorer, width = 260, onPlaybookEditor }) => {
  const [nodes, setNodes] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [expandedFolders, setFoldersExpanded] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchText] = useState('');
  const [isAwsEnabled, setIsAwsEnabled] = useState(false);
  const [version, setVersion] = useState<string>('...');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.getInventory();
        if (data && Array.isArray(data.nodes)) setNodes(data.nodes);
        if (data && Array.isArray(data.folders)) setFolders(data.folders);
      } catch (e) {
        console.error("Failed to fetch inventory", e);
      }

      try {
        const awsData = await api.awsInfo();
        // If it doesn't return an error, the plugin is loaded and responding
        if (awsData && !awsData.error) {
          setIsAwsEnabled(true);
        }
      } catch (e) {
        // AWS plugin not available or network error
      }

      try {
        const res = await fetch(`${API_BASE}/api/version`);
        if (res.ok) {
          const data = await res.json();
          if (data.version) setVersion('v' + data.version);
        }
      } catch (e) {
        // version endpoint not available
      }
    };
    fetchData();
  }, []);

  const toggleFolder = (f: string) => setFoldersExpanded(prev => ({ ...prev, [f]: !prev[f] }));

  const tree = useMemo(() => {
    const map: Record<string, TreeItem> = {};
    const root: TreeItem[] = [];

    const getOrCreateFolder = (path: string): TreeItem => {
      if (map[path]) return map[path];
      
      const parts = path.split('@').filter(p => p !== '');
      const name = parts[0];
      if (!name) return { id: 'temp', name: 'temp', type: 'folder', children: [] };

      // Use the original folder ID format if possible, otherwise create one
      const folderId = '/' + path;
      const folder: TreeItem = { id: folderId, name, type: 'folder', children: [] };
      map[path] = folder;
      
      if (parts.length > 1) {
        const parentPath = parts.slice(1).join('@');
        const parent = getOrCreateFolder(parentPath);
        parent.children.push(folder);
      } else {
        root.push(folder);
      }
      return folder;
    };

    // 1. Initialize folders from the provided list
    folders.forEach(f => {
      let path = f;
      if (path.startsWith('/')) path = path.substring(1);
      if (path.startsWith('@')) path = path.substring(1);
      if (!path) return;
      getOrCreateFolder(path);
    });

    // 2. Add nodes to their respective folders or root
    nodes.forEach(n => {
      const parts = n.split('@').filter(p => p !== '');
      if (parts.length === 0) return;
      
      const name = parts[0];
      const parentPath = parts.slice(1).join('@');
      const node: TreeItem = { id: n, name, type: 'node', children: [] };
      
      if (parentPath) {
        const parent = getOrCreateFolder(parentPath);
        parent.children.push(node);
      } else {
        root.push(node);
      }
    });

    // 3. Recursive filter function
    const matchNode = (name: string, term: string) => {
      // Try Regex if term looks like a pattern
      if (/[.*+?^${}()|[\]\\]/.test(term)) {
        try {
          if (new RegExp(term, 'i').test(name)) return true;
        } catch { /* ignore */ }
      } else {
        // Fast exact substring
        if (name.toLowerCase().includes(term.toLowerCase())) return true;
      }
      
      // Fuzzy subsequence match (e.g. "rtr1" matches "router-1")
      let sIdx = 0;
      let tIdx = 0;
      const t = name.toLowerCase();
      const s = term.toLowerCase();
      while (tIdx < t.length && sIdx < s.length) {
        if (t[tIdx] === s[sIdx]) sIdx++;
        tIdx++;
      }
      return sIdx === s.length;
    };

    const filterTree = (items: TreeItem[], nodeTerm: string, folderTerm: string | null): TreeItem[] => {
      if (!nodeTerm && !folderTerm) return items;
      
      return items.map(item => {
        if (item.type === 'node') {
          if (folderTerm) return null; // If folder constraint is active, this node is not under a matching folder (yet)
          return matchNode(item.name, nodeTerm) ? item : null;
        }

        // It's a folder
        let nextFolderTerm = folderTerm;
        const folderMatches = folderTerm ? matchNode(item.name, folderTerm) : false;
        
        if (folderMatches) {
          nextFolderTerm = null; // Constraint met for this branch
        }

        const filteredChildren = filterTree(item.children, nodeTerm, nextFolderTerm);
        
        if (filteredChildren.length > 0) {
          return { ...item, children: filteredChildren };
        }
        
        // Special case: If we ARE NOT filtering by folder and the folder itself matches the nodeTerm
        if (!folderTerm && matchNode(item.name, nodeTerm)) {
          return { ...item, children: item.children }; 
        }

        return null;
      }).filter((i): i is TreeItem => i !== null);
    };

    if (searchTerm.includes('@')) {
      const parts = searchTerm.split('@');
      const nodePart = parts[0];
      const folderPart = parts.slice(1).join('@'); 
      return filterTree(root, nodePart, folderPart);
    }

    return filterTree(root, searchTerm, null);
  }, [nodes, folders, searchTerm]);

  const filteredNodes = useMemo(() => {
    const flatNodesMap = new Map<string, TreeItem>();
    const flatten = (items: TreeItem[]) => {
      for (const item of items) {
        if (item.type === 'node') {
          flatNodesMap.set(item.id, item);
        }
        if (item.children) flatten(item.children);
      }
    };
    flatten(tree);
    return Array.from(flatNodesMap.values());
  }, [tree]);

  const singleMatchNodeId = searchTerm && filteredNodes.length === 1 ? filteredNodes[0].id : null;

  return (
    <div 
      style={{ width: `${width}px` }} 
      className="bg-[#2e3440] border-r border-[#3b4252] flex flex-col h-full shrink-0 z-40 shadow-xl overflow-hidden"
    >
      <div className="p-8 flex flex-col items-center border-b border-[#3b4252]/30 bg-[#3b4252]/10 shrink-0">
        <div className="mb-4 transition-transform hover:scale-110 duration-300">
          <Network className="text-[#88c0d0] fill-[#88c0d0]/10" size={48} />
        </div>
        <div className="flex flex-col items-center text-center">
          <h1 className="text-base font-black tracking-[0.4em] text-[#eceff4] uppercase italic leading-none ml-1">Connpy</h1>
          <h1 className="text-[10px] font-black tracking-[0.2em] text-[#81a1c1] uppercase italic mt-2.5 leading-none">Command Center</h1>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="flex items-center gap-3 bg-[#3b4252]/40 border border-[#434c5e] rounded-xl px-4 py-3 group focus-within:border-[#88c0d0] focus-within:bg-[#3b4252]/60 transition-all shadow-inner">
          <Search className="text-[#81a1c1] group-focus-within:text-[#88c0d0] transition-colors shrink-0" size={18} />
          <input
            type="text"
            placeholder="FILTER ASSETS..."
            value={searchTerm}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && singleMatchNodeId) {
                onSelectNode(singleMatchNodeId);
                setSearchText(''); // Clear search to reset view after opening
              }
            }}
            className="w-full bg-transparent border-none p-0 text-xs font-black text-[#d8dee9] placeholder:text-[#81a1c1] focus:outline-none uppercase tracking-[0.15em]"
          />
        </div>
      </div>

      {/* Inventory Section */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
        <div className="px-5 mb-4 mt-2 flex items-center group">
          <div className="flex items-center gap-3">
             <Network size={14} className="text-[#ebcb8b] fill-[#ebcb8b]/10 shrink-0" />
             <span className="text-[11px] font-black text-[#d8dee9]/40 uppercase tracking-[0.2em] group-hover:text-[#d8dee9]/60 transition-colors">Inventory</span>
          </div>
          <div className="ml-auto flex gap-2">
            {onCloudExplorer && isAwsEnabled && (
              <button
                onClick={onCloudExplorer}
                className="flex items-center gap-1.5 text-[#d08770] bg-[#d08770]/10 hover:bg-[#d08770]/20 border border-[#d08770]/30 px-2 py-1 rounded-md transition-all active:scale-95 outline-none focus:outline-none focus:ring-1 focus:ring-[#d08770]/20"
                title="AWS Cloud Explorer"
              >
                <Cloud size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Discover</span>
              </button>
            )} 
            {onPlaybookEditor && (
              <button
                onClick={onPlaybookEditor}
                className="flex items-center gap-1.5 text-[#b48ead] bg-[#b48ead]/10 hover:bg-[#b48ead]/20 border border-[#b48ead]/30 px-2 py-1 rounded-md transition-all active:scale-95 outline-none focus:outline-none"
                title="Playbook Editor"
              >
                <BookOpen size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Build</span>
              </button>
            )}
          </div>
        </div>


        <div className="flex flex-col">
          {tree.map(item => (
            <TreeNode 
              key={item.id} 
              item={item} 
              level={0} 
              onSelectNode={onSelectNode} 
              activeNodeId={activeNodeId}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              searchTerm={searchTerm}
              singleMatchNodeId={singleMatchNodeId}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-[#3b4252]/30 bg-[#3b4252]/10 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#a3be8c] animate-pulse shadow-[0_0_8px_#a3be8c]" />
            <span className="text-[10px] font-bold text-[#a3be8c] uppercase tracking-[0.1em]">Engine Online</span>
          </div>
          <span className="text-[10px] font-mono text-[#81a1c1]">{version}</span>
        </div>
        
        <div className="flex items-center justify-between px-4 py-3 bg-[#2e3440]/50 rounded-xl border border-[#3b4252]/50 transition-all">
          <div className="flex items-center gap-3">
            <Database size={16} className="text-[#88c0d0]" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-[#eceff4] tracking-tight">{nodes.length} Managed Nodes</span>
              <span className="text-[9px] font-bold text-[#81a1c1] uppercase tracking-widest">Inventory Synced</span>
            </div>
          </div>
          <MoreVertical size={14} className="text-[#81a1c1] transition-colors" />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
