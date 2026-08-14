import React, { useRef, useState, useEffect } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx } from 'clsx';
import { Cpu, X, Zap, Send, Square, RotateCcw, Check, Ban, Activity, ChevronDown, ChevronUp, Bot, User, Settings, Globe, Terminal as TerminalIcon, Play, Edit, CheckSquare, List } from 'lucide-react';
import { SmartText } from './SmartText';
import { api } from '../api';
import type { AiThought } from '../types';

// --- SUB-COMPONENTS FOR PHASE 5 ---

interface ActionCardProps {
  thought: AiThought;
  onRun: (commands: string[]) => void;
  onRunCustom: (commands: string[]) => void;
  onCancel: () => void;
  onEdit: (commands: string[]) => void;
  isLatest: boolean;
}

function CopilotActionCard({ thought, onRun, onRunCustom, onCancel, onEdit, isLatest }: ActionCardProps) {
  let data: any = {};
  try {
    data = JSON.parse(thought.content);
  } catch (e) {
    return (
      <div className="p-4 rounded-xl bg-[#bf616a]/10 border border-[#bf616a]/30 text-[#bf616a] text-xs italic">
        Error parsing action card data.
      </div>
    );
  }

  const commands: string[] = data.commands || [];
  const risk: string = data.risk_level || "low";
  
  const [selectedIndices, setSelectedIndices] = useState<number[]>(commands.map((_, i) => i));

  // Handle keyboard shortcuts for the LATEST action card
  useEffect(() => {
    if (!isLatest || thought.status) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;

      const key = e.key.toLowerCase();
      if (key === 'y') {
        e.preventDefault();
        handleRun();
      } else if (key === 'n' || key === 'escape') {
        e.preventDefault();
        onCancel();
      } else if (key === 'e') {
        e.preventDefault();
        onEdit(commands.filter((_, i) => selectedIndices.includes(i)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLatest, thought.status, selectedIndices, commands]);

  const toggleIndex = (idx: number) => {
    setSelectedIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleRun = () => {
    if (selectedIndices.length === 0) return;
    if (selectedIndices.length === commands.length) {
      onRun(commands);
    } else {
      onRunCustom(commands.filter((_, i) => selectedIndices.includes(i)));
    }
  };

  const riskColors = {
    low: "border-[#a3be8c] bg-[#a3be8c]/5 text-[#a3be8c]",
    high: "border-[#ebcb8b] bg-[#ebcb8b]/5 text-[#ebcb8b]",
    destructive: "border-[#bf616a] bg-[#bf616a]/5 text-[#bf616a]",
  };

  const riskBadge = {
    low: "bg-[#a3be8c]/20 text-[#a3be8c] border-[#a3be8c]/30",
    high: "bg-[#ebcb8b]/20 text-[#ebcb8b] border-[#ebcb8b]/30",
    destructive: "bg-[#bf616a]/20 text-[#bf616a] border-[#bf616a]/30",
  };

  const riskIcon = {
    low: <Check size={12} />,
    high: <Zap size={12} />,
    destructive: <Ban size={12} />,
  };

  if (thought.status) {
    const isSuccess = thought.status === 'authorized';
    return (
      <div className={clsx(
        "rounded-xl border p-4 flex items-center justify-between opacity-60 grayscale-[0.5]",
        isSuccess ? "bg-[#a3be8c]/10 border-[#a3be8c]/20" : "bg-[#bf616a]/10 border-[#bf616a]/20"
      )}>
        <div className="flex items-center gap-3">
          {isSuccess ? <Check size={16} className="text-[#a3be8c]" /> : <Ban size={16} className="text-[#bf616a]" />}
          <span className={clsx("text-[10px] font-black uppercase tracking-[0.2em]", isSuccess ? "text-[#a3be8c]" : "text-[#bf616a]")}>
            {isSuccess ? "Mission Executed" : "Mission Aborted"}
          </span>
        </div>
        <span className="text-[9px] font-mono text-[#d8dee9]/40">{commands.length} Commands</span>
      </div>
    );
  }

  return (
    <div className={clsx("rounded-xl border shadow-lg overflow-hidden flex flex-col transition-all", riskColors[risk as keyof typeof riskColors] || riskColors.low)}>
      {/* Risk Header */}
      <div className={clsx("px-5 py-3 border-b flex items-center justify-between", (riskColors[risk as keyof typeof riskColors] || riskColors.low).split(' ')[1])}>
        <div className="flex items-center gap-3">
          {riskIcon[risk as keyof typeof riskIcon] || <Activity size={12} />}
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Tactical Action Suggested</span>
        </div>
        <div className={clsx("px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider", riskBadge[risk as keyof typeof riskBadge] || riskBadge.low)}>
          {risk} risk
        </div>
      </div>

      {/* Command List with Checkboxes */}
      <div className="p-5 space-y-2">
        {commands.map((cmd, i) => (
          <div 
            key={i} 
            onClick={() => toggleIndex(i)}
            className={clsx(
              "group flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
              selectedIndices.includes(i) 
                ? "bg-[#81a1c1]/10 border-[#81a1c1]/30 text-[#88c0d0]" 
                : "bg-black/10 border-transparent text-[#d8dee9]/30 hover:bg-black/20"
            )}
          >
            {selectedIndices.includes(i) ? <CheckSquare size={14} className="shrink-0" /> : <Square size={14} className="shrink-0" />}
            <code className="text-[11px] font-mono truncate flex-1">{cmd}</code>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="p-4 px-5 bg-black/20 flex gap-2">
        <button 
          onClick={handleRun}
          disabled={selectedIndices.length === 0}
          className="flex-[2] bg-[#a3be8c] hover:bg-[#a3be8c]/80 disabled:opacity-30 text-[#2e3440] text-[10px] font-black py-2.5 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Play size={14} fill="currentColor" /> RUN SELECTED (Y)
        </button>
        <button 
          onClick={() => onEdit(commands.filter((_, i) => selectedIndices.includes(i)))}
          disabled={selectedIndices.length === 0}
          className="flex-1 bg-[#434c5e] hover:bg-[#81a1c1] disabled:opacity-30 text-[#d8dee9] text-[10px] font-black py-2.5 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Edit size={14} /> EDIT (E)
        </button>
        <button 
          onClick={onCancel}
          className="p-2.5 bg-[#434c5e] hover:bg-[#bf616a] text-[#d8dee9] rounded-lg transition-all active:scale-95 flex items-center justify-center"
          title="Cancel (N)"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

interface EditModalProps {
  initialCommands: string[];
  onSave: (commands: string[]) => void;
  onCancel: () => void;
}

function CopilotEditModal({ initialCommands, onSave, onCancel }: EditModalProps) {
  const [text, setText] = useState(initialCommands.join('\n'));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#2e3440] border border-[#81a1c1]/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-[#3b4252]/50 border-b border-[#3b4252] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Edit size={16} className="text-[#81a1c1]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#81a1c1]">Tactical Modification Mode</span>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-white/10 rounded-md transition-colors"><X size={16} /></button>
        </div>
        
        <div className="p-6">
          <div className="mb-4 text-[10px] text-[#d8dee9]/50 font-mono flex items-center gap-2">
             <List size={12} /> ONE COMMAND PER LINE
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                onSave(text.split('\n').filter(l => l.trim()));
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            className="w-full h-64 bg-[#1e222a] border border-[#3b4252] rounded-xl p-6 text-xs font-mono text-[#d8dee9] focus:outline-none focus:border-[#81a1c1] transition-all resize-none shadow-inner leading-relaxed"
            placeholder="Enter commands to execute..."
          />
        </div>

        <div className="px-6 py-4 bg-[#3b4252]/30 border-t border-[#3b4252] flex justify-end gap-3">
          <button onClick={onCancel} className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-[#d8dee9]/60 hover:text-[#d8dee9] transition-colors">Abort</button>
          <button 
            onClick={() => onSave(text.split('\n').filter(l => l.trim()))}
            className="bg-[#81a1c1] hover:bg-[#88c0d0] text-[#2e3440] px-8 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-[#81a1c1]/20"
          >
            <Check size={14} /> Commit Changes (Ctrl+Enter)
          </button>
        </div>
      </div>
    </div>
  );
}


type MarkdownCodeProps = React.HTMLAttributes<HTMLElement> & {
  className?: string;
  children?: React.ReactNode;
  node?: unknown;
};

type MarkdownAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  children?: React.ReactNode;
  node?: unknown;
};

type MarkdownChildrenProps = {
  children?: React.ReactNode;
};

const getMarkdownNodeText = (node?: unknown): string => {
  if (!node || typeof node !== 'object' || !('children' in node)) return '';

  const children = (node as { children?: unknown }).children;
  if (!Array.isArray(children)) return '';

  return children.map(child => {
    if (!child || typeof child !== 'object' || !('value' in child)) return '';
    const value = (child as { value?: unknown }).value;
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }).join('');
};

const extractText = (node: unknown): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement<{ children?: unknown; text?: unknown; value?: unknown }>(node)) {
    if (node.props.children !== undefined) return extractText(node.props.children);
    if (node.props.text !== undefined) return String(node.props.text);
    if (node.props.value !== undefined) return String(node.props.value);
  }
  if (typeof node === 'object' && node !== null && 'value' in node) {
    const value = (node as { value?: unknown }).value;
    if (value !== undefined) return String(value);
  }
  return '';
};

const markdownUrlTransform = (url: string) => {
  if (url.startsWith('connpy://')) return url;
  return defaultUrlTransform(url);
};

interface AIPanelProps {
  thoughts: AiThought[];
  isAiProcessing: boolean;
  isConnected: boolean;
  workspaceId: string | null;
  availableNodes: string[];
  activeTab: 'global' | 'terminal';
  activeNodeId?: string;
  onTabChange: (tab: 'global' | 'terminal') => void;
  onSendPrompt: (input: string, sessionId: string, displayText?: string) => boolean;
  onSendConfirmation: (thoughtId: string, answer: string) => void;
  onAbort: () => void;
  onClearThoughts: (tab: 'global' | 'terminal') => void;
  onNewSession: () => void;
  onToggleThought: (id: string) => void;
  onClose: () => void;
  onOpenInspect: (assetId: string, profile: string, region: string) => void;
  onOpenNode: (node: string) => void;
  onOpenTopology: (content: string) => void;
  onConnpyLink: (url: string) => void;
  width?: number;
  onWidthChange?: (w: number) => void;
}

export default function AIPanel({
  thoughts, isAiProcessing, workspaceId, availableNodes,
  activeTab, activeNodeId, onTabChange,
  onSendPrompt, onSendConfirmation, onAbort, onClearThoughts, onNewSession, onToggleThought, onClose,
  onOpenInspect, onOpenNode, onOpenTopology, onConnpyLink,
  width, onWidthChange
}: AIPanelProps) {
  const [aiInput, setAiInput] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [localWidth, setLocalWidth] = useState(350);
  const panelWidth = width !== undefined ? width : localWidth;
  const setPanelWidth = onWidthChange || setLocalWidth;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Phase 5: Copilot Action Flow State
  const [editModal, setEditModal] = useState<{ commands: string[], thoughtId: string } | null>(null);

  // Auto-scroll on new thoughts or processing state change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, isAiProcessing, activeTab]);

  const handleActionRun = (thoughtId: string, commands: string[]) => {
    if (activeNodeId) {
      window.dispatchEvent(new CustomEvent('copilot-run-commands', { 
        detail: { nodeId: activeNodeId, commands } 
      }));
      onSendConfirmation(thoughtId, 'y'); // Transition to static state
    }
  };

  const handleActionRunCustom = (thoughtId: string, commands: string[]) => {
    if (activeNodeId) {
      window.dispatchEvent(new CustomEvent('copilot-custom-run-commands', { 
        detail: { nodeId: activeNodeId, commands } 
      }));
      onSendConfirmation(thoughtId, 'y'); // Transition to static state
    }
  };

  const handleActionCancel = (thoughtId: string) => {
    if (activeNodeId) {
      window.dispatchEvent(new CustomEvent('copilot-external-cancel', { 
        detail: { nodeId: activeNodeId } 
      }));
      onSendConfirmation(thoughtId, 'n'); // Transition to static state
    }
  };

    const handleEditSave = (commands: string[]) => {
      if (editModal) {
        handleActionRunCustom(editModal.thoughtId, commands);
        setEditModal(null);
      }
    };

    // Phase 5: Bridging Terminal Events to UI
    useEffect(() => {
      const handleEditRequest = (e: any) => {
        if (e.detail.nodeId === activeNodeId) {
          // Find the latest action card for this node
          const latestCard = [...thoughts].reverse().find(t => t.nodeId === activeNodeId && t.type === 'confirm' && t.content.startsWith('{') && !t.status);
          if (latestCard) {
            try {
              const data = JSON.parse(latestCard.content);
              setEditModal({ commands: data.commands || [], thoughtId: latestCard.id });
            } catch (e) { /* ignore */ }
          }
        }
      };

      window.addEventListener('copilot-edit-commands', handleEditRequest);
      return () => window.removeEventListener('copilot-edit-commands', handleEditRequest);
    }, [activeNodeId, thoughts]);

    const handleSend = () => {
    const sessionId = workspaceId || api.getActiveSessionId();
    const sent = onSendPrompt(aiInput.trim(), sessionId);
    if (sent) setAiInput('');
  };

  const handleReload = () => {
    if (activeTab === 'global' && !workspaceId) {
      if (confirm('Are you sure you want to start a new chat? This will clear the current session.')) {
        onNewSession();
      }
    } else {
      onClearThoughts(activeTab);
    }
  };

  const smartTextProps = {
    selectedProfile: '',
    selectedRegion: '',
    availableNodes,
    onOpenInspect,
    onOpenNode,
  };

  const renderSmart = (children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, child => {
      if (typeof child === 'string') {
        return <SmartText text={child} {...smartTextProps} />;
      }
      if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children !== undefined) {
        return React.cloneElement(child, {
          children: renderSmart(child.props.children)
        });
      }
      return child;
    });
  };

  const markdownComponents = React.useMemo(() => ({
    p: ({ children }: MarkdownChildrenProps) => <p className="mb-4">{renderSmart(children)}</p>,
    li: ({ children }: MarkdownChildrenProps) => <li className="mb-1">{renderSmart(children)}</li>,
    pre: ({ children }: MarkdownChildrenProps) => <>{children}</>,
    code: ({ className, children, node, ...props }: MarkdownCodeProps) => {
      let content = extractText(children);
      if (!content) {
        content = getMarkdownNodeText(node);
      }
      content = content.replace(/\n$/, '');

      const match = /language-(\w+)/.exec(className || '');
      const isBlock = match || content.includes('\n');
      
      if (!isBlock) {
        return (
          <code className="bg-[#434c5e]/50 px-1.5 py-0.5 rounded text-[#88c0d0] font-mono text-[11px] inline border border-[#434c5e]/30 align-baseline mx-0.5" {...props}>
            {content ? <SmartText text={content} {...smartTextProps} /> : children}
          </code>
        );
      }

      // Diagram Detection Heuristics
      const hasBoxDrawing = /[│┌┐└┘├┤┬┴┼─]/.test(content);
      const hasArrows = /(?:<--+|--+>)/.test(content);
      const hasAsciiBranches = /^\s*[|/\\][\s|/\\]*$/m.test(content) && content.split('\n').length > 3;
      
      const isDiagram = match?.[1] === 'mermaid' || match?.[1] === 'diagram' || hasBoxDrawing || hasArrows || hasAsciiBranches;
      
      if (isDiagram) {
        return (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenTopology(content);
            }}
            className="w-full bg-[#2e3440]/80 p-4 rounded-lg border border-[#81a1c1]/30 my-3 shadow-inner flex flex-col items-center justify-center space-y-3 cursor-pointer hover:bg-[#3b4252] text-center transition-all active:scale-[0.98] group"
          >
            <Activity size={24} className="text-[#81a1c1] group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#81a1c1]">Network Topology Detected</span>
            <span className="bg-[#81a1c1]/20 text-[#88c0d0] text-xs font-bold px-4 py-2 rounded transition-colors group-hover:bg-[#81a1c1]/40">
              View Workspace Diagram
            </span>
          </div>
        );
      }

      return (
        <div className="bg-[#2e3440]/80 p-4 rounded-lg border border-[#3b4252] overflow-x-auto my-3 shadow-inner group relative w-full">
          <pre className="m-0 p-0"><code className={`font-mono text-xs block text-[#d8dee9] leading-relaxed ${className || ''}`} {...props}>{content ? <SmartText text={content} {...smartTextProps} /> : children}</code></pre>
        </div>
      );
    },
    a: ({ href, children, node }: MarkdownAnchorProps) => {
      let textContent = extractText(children);
      if (!textContent) {
        textContent = getMarkdownNodeText(node);
      }

      const safeChildren = textContent || children;

      if (href?.startsWith('connpy://')) {
        return (
          <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConnpyLink(href); }} title={href} className="text-[#88c0d0] hover:text-[#8fbcbb] cursor-pointer underline decoration-[#88c0d0]/40 underline-offset-4 font-bold transition-all px-1 rounded hover:bg-[#88c0d0]/10">
            {safeChildren}
          </span>
        );
      }
      return <a href={href || '#'} target="_blank" rel="noopener noreferrer" title={href} className="text-[#88c0d0] hover:underline">{safeChildren}</a>;
    }
  }), [smartTextProps, onConnpyLink, onOpenTopology]);

  return (
    <div
      style={{ width: `${panelWidth}px` }}
      className="border-l border-[#3b4252] bg-[#2e3440] flex flex-col shrink-0 relative transition-all duration-300 shadow-[-10px_0_30px_rgba(0,0,0,0.2)]"
    >
      {/* Resize Handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
          const handleMouseMove = (ev: MouseEvent) => {
            const newWidth = window.innerWidth - ev.clientX;
            if (newWidth >= 300 && newWidth <= 1200) setPanelWidth(newWidth);
          };
          const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
          };
          document.body.style.cursor = 'ew-resize';
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
        }}
        className="absolute left-[-2px] top-0 w-1 h-full cursor-ew-resize z-50 group"
      >
        <div className={`w-[2px] h-full transition-all ${isResizing ? 'bg-[#88c0d0]' : 'bg-transparent group-hover:bg-[#88c0d0]/50'}`} />
      </div>

      {/* Header */}
      <div className="p-4 px-6 border-b border-[#3b4252] flex items-center justify-between bg-[#3b4252]/20 h-14 shrink-0">
        <div className="flex items-center">
          <div className="p-1 rounded text-[#81a1c1] mr-6"><Cpu size={16} /></div>
          <span className="font-black text-[10px] uppercase tracking-[0.2em] text-[#81a1c1]">Tactical Insight</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleReload} className="p-2 bg-transparent border-none outline-none hover:bg-white/5 hover:text-[#d8dee9] text-[#d8dee9]/60 transition-colors rounded-md"><RotateCcw size={14} /></button>
          <button onClick={onClose} className="p-2 bg-transparent border-none outline-none hover:bg-white/5 hover:text-[#d8dee9] text-[#d8dee9]/60 transition-colors rounded-md"><X size={16} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 px-6 border-b border-[#3b4252] bg-[#3b4252]/10 h-14 shrink-0">
        <button
          onClick={() => onTabChange('global')}
          className={clsx(
            "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border transition-all text-[10px] font-black uppercase tracking-widest outline-none",
            activeTab === 'global' 
              ? "bg-[#81a1c1]/20 border-[#81a1c1]/50 text-[#81a1c1] shadow-[0_0_10px_rgba(129,161,193,0.1)]" 
              : "bg-[#3b4252] border-[#3b4252] text-[#4c566a] hover:border-[#81a1c1]/30 hover:text-[#81a1c1]"
          )}
        >
          <Globe size={14} /> Global
        </button>
        <button
          onClick={() => onTabChange('terminal')}
          className={clsx(
            "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border transition-all text-[10px] font-black uppercase tracking-widest outline-none",
            activeTab === 'terminal' 
              ? "bg-[#81a1c1]/20 border-[#81a1c1]/50 text-[#81a1c1] shadow-[0_0_10px_rgba(129,161,193,0.1)]" 
              : "bg-[#3b4252] border-[#3b4252] text-[#4c566a] hover:border-[#81a1c1]/30 hover:text-[#81a1c1]"
          )}
        >
          <TerminalIcon size={14} /> Copilot
        </button>
      </div>

      {/* Thoughts Feed Container */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#3b4252]/5 overflow-hidden relative">
        {/* Sticky Header for Terminal Tab */}
        {activeTab === 'terminal' && activeNodeId && (
          <div className="shrink-0 px-8 py-4 bg-[#2e3440] border-b border-[#3b4252] shadow-sm space-y-3 z-10">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#81a1c1]/10 border border-[#81a1c1]/30">
              <TerminalIcon size={14} className="text-[#81a1c1]" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#81a1c1]/70">Active Context</span>
                <span className="text-xs font-mono font-bold text-[#81a1c1]">{activeNodeId}</span>
              </div>
            </div>
            <button
              onClick={onAbort}
              className="w-full bg-[#bf616a]/10 hover:bg-[#bf616a]/20 border border-[#bf616a]/20 text-[#bf616a] text-[10px] font-black py-2.5 rounded-lg uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 group"
            >
              <Square size={12} className="fill-current group-hover:scale-110 transition-transform" />
              TERMINATE MISSION
            </button>
          </div>
        )}

        {/* Scrollable Area */}
        <div ref={scrollRef} className="flex-1 px-8 py-6 overflow-y-auto space-y-8 scrollbar-hide">
          {activeTab === 'terminal' && !activeNodeId && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 space-y-4 text-center">
              <TerminalIcon size={48} className="text-[#81a1c1]" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#d8dee9]">No Terminal Active</p>
                <p className="text-[9px] text-[#d8dee9]/60 max-w-[180px]">Select a node terminal to enable context-aware Copilot assistance.</p>
              </div>
            </div>
          )}

          {activeTab === 'global' && thoughts.filter(t => !t.nodeId).length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4 text-center">
              <Cpu size={32} className="text-[#81a1c1]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#d8dee9]">Neural stream idle</p>
            </div>
          )}

          {activeTab === 'terminal' && activeNodeId && thoughts.filter(t => t.nodeId === activeNodeId).length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4 text-center">
              <Bot size={32} className="text-[#81a1c1]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#d8dee9]">Copilot ready for {activeNodeId}</p>
            </div>
          )}

          {thoughts.filter(t => {
            if (activeTab === 'global') {
              return !t.nodeId;
            } else {
              return activeNodeId ? t.nodeId === activeNodeId : false;
            }
          }).map((thought, index, filtered) => {
            const isLatest = index === filtered.length - 1;
            const isActionCard = thought.type === 'confirm' && thought.nodeId && thought.content.startsWith('{');
            const isAiResponder = thought.type === 'engineer' || thought.type === 'architect' || isActionCard;

            return (
              <div key={thought.id} className="px-1 transition-all duration-300">
                {isAiResponder ? (
                  <div className={`p-6 rounded-xl border flex gap-6 ${thought.type === 'architect' ? 'bg-[#b48ead]/10 border-[#b48ead]/30' : 'bg-[#5e81ac]/10 border-[#5e81ac]/30'}`}>
                    <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center mr-6 ${thought.type === 'architect' ? 'bg-[#b48ead]/20 text-[#b48ead]' : 'bg-[#5e81ac]/20 text-[#5e81ac]'}`}>
                      <Bot size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${thought.type === 'architect' ? 'text-[#b48ead]' : 'text-[#5e81ac]'}`}>
                          {thought.type === 'architect' ? 'Network Architect' : 'Network Engineer'}
                        </span>
                        <span className="text-[10px] text-[#d8dee9]/50 font-mono">{thought.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      
                      {isActionCard ? (
                        <CopilotActionCard 
                          thought={thought} 
                          isLatest={isLatest}
                          onRun={(cmds) => handleActionRun(thought.id, cmds)}
                          onRunCustom={(cmds) => handleActionRunCustom(thought.id, cmds)}
                          onCancel={() => handleActionCancel(thought.id)}
                          onEdit={(cmds) => setEditModal({ commands: cmds, thoughtId: thought.id })}
                        />
                      ) : (
                        <div className="text-[13px] text-[#d8dee9] leading-[1.4] font-mono whitespace-pre-wrap tracking-tight markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={markdownUrlTransform}>
                            {thought.content || ''}
                          </ReactMarkdown>

                          {thought.notes && (
                            <details className="mt-3 mb-2 text-[11px] font-mono text-[#d8dee9]/80 bg-[#1e222a]/70 p-3 rounded-lg border border-[#3b4252] group">
                              <summary className="cursor-pointer font-bold text-[#81a1c1] hover:text-[#88c0d0] select-none flex items-center gap-2 text-[10px] uppercase tracking-wider">
                                <span>🧠 Internal Agent Notes / Memory</span>
                              </summary>
                              <div className="mt-2 pt-2 border-t border-[#3b4252]/60 whitespace-pre-wrap leading-relaxed text-[#d8dee9]/70">
                                {thought.notes}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : thought.type === 'tool' ? (
                  <div className="rounded-xl border bg-[#81a1c1]/5 border-[#81a1c1]/20 overflow-hidden shadow-sm">
                    <div onClick={() => onToggleThought(thought.id)} className="flex items-center justify-between p-5 cursor-pointer hover:bg-[#81a1c1]/10 transition-colors">
                      <div className="flex items-center"><Activity size={14} className="text-[#81a1c1] mr-6" /><span className="text-[10px] font-black uppercase tracking-widest text-[#81a1c1] italic">EXECUTE | {thought.tool_name}</span></div>
                      {thought.isExpanded ? <ChevronUp size={14} className="text-[#81a1c1]/50" /> : <ChevronDown size={14} className="text-[#81a1c1]/50" />}
                    </div>
                    {thought.isExpanded && (
                      <div className="p-5 pt-0 border-t border-[#81a1c1]/10">
                        <pre className="text-[10px] font-mono text-[#d8dee9]/80 bg-[#2e3440]/80 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap mt-2 border border-[#3b4252] shadow-inner">
                          <SmartText text={thought.content} {...smartTextProps} />
                        </pre>
                      </div>
                    )}
                  </div>
                ) : thought.type === 'important' ? (
                  <div className="rounded-xl border bg-[#bf616a]/10 border-[#bf616a]/30 overflow-hidden shadow-sm mb-2">
                    <div className="p-4 bg-[#bf616a]/20 flex items-center">
                      <Zap size={14} className="text-[#bf616a] mr-6" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#bf616a]">UNSAFE COMMANDS DETECTED</span>
                    </div>
                    <pre className="text-[11px] font-mono text-[#d8dee9] p-5 whitespace-pre-wrap">
                      <SmartText text={thought.content} {...smartTextProps} />
                    </pre>
                  </div>
                ) : thought.type === 'text' ? (
                  <div className="flex p-6 rounded-xl bg-[#3b4252]/40 border border-[#434c5e]">
                    <div className="shrink-0 w-8 h-8 rounded-md bg-[#434c5e] flex items-center justify-center text-[#d8dee9]/50 mr-6"><User size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#81a1c1]">Operator</span>
                        <span className="text-[10px] text-[#d8dee9]/50 font-mono">{thought.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-[13px] text-[#d8dee9]/80 leading-relaxed font-mono whitespace-pre-wrap tracking-tight markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={markdownUrlTransform}>
                          {thought.content || ''}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`rounded-xl border p-5 ${thought.type === 'status' ? 'bg-[#81a1c1]/5 border-[#81a1c1]/10' : thought.type === 'confirm' ? 'bg-[#bf616a]/10 border-[#bf616a]/30 p-5' : 'bg-[#81a1c1]/10 border-[#81a1c1]/20 opacity-50'}`}>
                    <div onClick={() => thought.type === 'debug' && onToggleThought(thought.id)} className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center">
                        {thought.type === 'debug' ? <Settings size={10} className="text-[#81a1c1]/60 mr-6" /> : <Zap size={10} className={thought.type === 'confirm' ? 'text-[#bf616a] mr-6' : 'text-[#81a1c1] mr-6'} />}
                        <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${thought.type === 'status' ? 'text-[#81a1c1]' : thought.type === 'confirm' ? 'text-[#bf616a]' : 'text-[#81a1c1]/60'}`}>{thought.type}</span>
                      </div>
                      {thought.type === 'debug' && (thought.isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                    </div>
                    {(thought.type !== 'debug' || thought.isExpanded) && (
                      <div className="mt-2">
                        <p className={`text-xs leading-relaxed whitespace-pre-wrap ${thought.type === 'confirm' ? 'text-[#d8dee9]/90 font-mono bg-black/20 p-3 rounded-lg border border-[#bf616a]/20' : 'text-[#81a1c1] italic'}`}>
                          <SmartText 
                            text={thought.type === 'confirm'
                              ? thought.content.replace(/Execute\? \(y: yes \/ n: no \/ a: allow all this session \/ <text>: feedback\)/g, '').trim() || 'Waiting for tactical authorization...'
                              : thought.content} 
                            {...smartTextProps} 
                          />
                        </p>
                      </div>
                    )}
                    {thought.type === 'confirm' && (
                      <>
                        {thought.requires_confirmation ? (
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => onSendConfirmation(thought.id, 'y')} className="flex-1 bg-[#a3be8c] hover:bg-[#a3be8c]/80 text-[#2e3440] text-[10px] font-black py-2.5 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1"><Check size={14} /> CONFIRM</button>
                            <button onClick={() => onSendConfirmation(thought.id, 'n')} className="flex-1 bg-[#434c5e] hover:bg-[#81a1c1] text-[#d8dee9] text-[10px] font-black py-2.5 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1"><Ban size={14} /> CANCEL</button>
                          </div>
                        ) : thought.status && (
                          <div className={`mt-4 py-2 px-3 rounded-lg border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] ${thought.status === 'authorized' ? 'bg-[#a3be8c]/10 border-[#a3be8c]/30 text-[#a3be8c]' : 'bg-[#bf616a]/10 border-[#bf616a]/30 text-[#bf616a]'}`}>
                            {thought.status === 'authorized' ? <><Check size={12} /> MISSION AUTHORIZED</> : <><Ban size={12} /> MISSION ABORTED</>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {isAiProcessing && (
            <div className="flex items-center gap-3 p-4 text-[#81a1c1]/60 animate-pulse font-black text-[10px] uppercase tracking-[0.2em]">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
              NEURAL PROCESSING...
            </div>
          )}
        </div>
      </div>

      {/* Input Footer */}
      {activeTab === 'global' && (
        <div className="p-4 border-t border-[#3b4252] bg-[#3b4252]/40 shrink-0">
          <div className="relative group">
            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Direct access to tactical insights..."
              className="w-full bg-[#2e3440] border border-[#434c5e] rounded-xl p-4 pr-12 text-xs text-[#d8dee9] focus:outline-none focus:border-[#81a1c1] transition-all resize-none h-20 scrollbar-hide shadow-inner placeholder:text-[#81a1c1]/40"
            />
            <button
              onClick={handleSend}
              disabled={!aiInput.trim() || isAiProcessing}
              className="absolute bottom-3 right-3 p-2 bg-[#5e81ac] hover:bg-[#81a1c1] text-[#eceff4] rounded-lg transition-all disabled:opacity-30 shadow-lg shadow-[#5e81ac]/20 active:scale-90"
            >
              <Send size={16} />
            </button>
          </div>
          <button
            onClick={onAbort}
            className="w-full mt-3 bg-[#bf616a]/10 hover:bg-[#bf616a]/20 border border-[#bf616a]/20 text-[#bf616a] text-[10px] font-black py-2.5 rounded-lg uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 group"
          >
            <Square size={12} className="fill-current group-hover:scale-110 transition-transform" />
            ABORT MISSION
          </button>
        </div>
      )}

      {/* Edit Modal Overlay */}
      {editModal && (
        <CopilotEditModal 
          initialCommands={editModal.commands}
          onSave={handleEditSave}
          onCancel={() => setEditModal(null)}
        />
      )}
    </div>
  );
}
