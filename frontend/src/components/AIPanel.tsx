import React, { useRef, useState, useEffect } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx } from 'clsx';
import { Cpu, X, Zap, Send, Square, RotateCcw, Check, Ban, Activity, ChevronDown, ChevronUp, Bot, User, Settings, Globe, Terminal } from 'lucide-react';
import { SmartText } from './SmartText';
import type { AiThought } from '../types';

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
  selectedProfile: string;
  selectedRegion: string;
  availableNodes: string[];
  activeTab: 'global' | 'terminal';
  onTabChange: (tab: 'global' | 'terminal') => void;
  onSendPrompt: (input: string, sessionId: string) => boolean;
  onSendConfirmation: (thoughtId: string, answer: string) => void;
  onAbort: () => void;
  onClearThoughts: () => void;
  onToggleThought: (id: string) => void;
  onClose: () => void;
  onOpenInspect: (assetId: string, profile: string, region: string) => void;
  onOpenNode: (node: string) => void;
  onOpenTopology: (content: string) => void;
  onConnpyLink: (url: string) => void;
}

export default function AIPanel({
  thoughts, isAiProcessing, workspaceId, selectedProfile, selectedRegion, availableNodes,
  activeTab, onTabChange,
  onSendPrompt, onSendConfirmation, onAbort, onClearThoughts, onToggleThought, onClose,
  onOpenInspect, onOpenNode, onOpenTopology, onConnpyLink
}: AIPanelProps) {
  const [aiInput, setAiInput] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(300);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new thoughts or processing state change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, isAiProcessing, activeTab]);

  const handleSend = () => {
    const sessionId = workspaceId || 'web-session';
    const sent = onSendPrompt(aiInput.trim(), sessionId);
    if (sent) setAiInput('');
  };

  const smartTextProps = {
    selectedProfile,
    selectedRegion,
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
          <button onClick={onClearThoughts} className="p-2 bg-transparent border-none outline-none hover:bg-white/5 hover:text-[#d8dee9] text-[#d8dee9]/60 transition-colors rounded-md"><RotateCcw size={14} /></button>
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
          <Terminal size={14} /> Copilot
        </button>
      </div>

      {/* Thoughts Feed */}
      <div ref={scrollRef} className="flex-1 px-8 py-6 overflow-y-auto space-y-8 scrollbar-hide bg-[#3b4252]/5">
        {thoughts.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4 text-center">
            <Cpu size={32} className="text-[#81a1c1]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#d8dee9]">Neural stream idle</p>
          </div>
        )}
        {thoughts.map((thought) => (
          <div key={thought.id} className="px-1 transition-all duration-300">
            {/* Filter thoughts based on active tab for Phase 1 - 2. 
                In a real scenario, we might need a flag in AiThought to distinguish terminal context. 
                For now, we just show them all. */}
            {thought.type === 'tool' ? (
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
            ) : (thought.type === 'engineer' || thought.type === 'architect') ? (
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
                  <div className="text-[13px] text-[#d8dee9] leading-[1.4] font-mono whitespace-pre-wrap tracking-tight markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={markdownUrlTransform}>
                      {thought.content || ''}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : thought.type === 'text' ? (
              <div className="flex p-6 rounded-xl bg-[#3b4252]/40 border border-[#434c5e]">
                <div className="shrink-0 w-8 h-8 rounded-md bg-[#434c5e] flex items-center justify-center text-[#d8dee9]/50 mr-6"><User size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#81a1c1]">Operator</span>
                    <span className="text-[10px] text-[#d8dee9]/50 font-mono">{thought.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-sm text-[#d8dee9]/80 leading-relaxed">
                    <SmartText text={thought.content} {...smartTextProps} />
                  </p>
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
        ))}
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

      {/* Input Footer */}
      <div className="p-4 border-t border-[#3b4252] bg-[#3b4252]/40 shrink-0">
        <div className="relative group">
          <textarea
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={activeTab === 'global' ? "Direct access to tactical insights..." : "Ask Terminal Copilot (Ctrl+Space)..."}
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
    </div>
  );
}
