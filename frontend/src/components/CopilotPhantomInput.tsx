import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Shield, Search, Cpu, Layout, Command, Database } from 'lucide-react';
import { clsx } from 'clsx';

import type { CopilotMissionState } from '../types';

export type ContextMode = 'LINES' | 'SINGLE' | 'RANGE';
export type Persona = 'engineer' | 'architect';

interface CopilotPhantomInputProps {
  isVisible: boolean;
  onHide: () => void;
  onSubmit: (text: string, mode: ContextMode) => void;
  onContextModeChange: (mode: ContextMode) => void;
  onAdjustContext: (up: boolean) => void;
  activeContextMode: ContextMode;
  persona: Persona;
  trustMode: boolean;
  os: string;
  matchedPrompt: string;
  contextDetail: string;
  memoryCount: number;
  missionState?: CopilotMissionState | null;
}

const SLASH_COMMANDS = [
  { cmd: '/mission', desc: 'Start autonomous multi-step mission' },
  { cmd: '/cancel', desc: 'Abort active mission' },
  { cmd: '/abort', desc: 'Abort active mission' },
  { cmd: '/architect', desc: 'Switch to Architect persona' },
  { cmd: '/engineer', desc: 'Switch to Engineer persona' },
  { cmd: '/trust', desc: 'Enable Auto-Run for commands' },
  { cmd: '/untrust', desc: 'Disable Auto-Run' },
  { cmd: '/os', desc: 'Override device OS' },
  { cmd: '/prompt', desc: 'Override prompt regex' },
  { cmd: '/memorize', desc: 'Add fact to session memory' },
  { cmd: '/clear', desc: 'Clear session memory' },
];

const DEFAULT_PROMPT = '>$|#$|\\$$|>.$|#.$|\\$.$';

const CopilotPhantomInput: React.FC<CopilotPhantomInputProps> = ({
  isVisible, onHide, onSubmit, onContextModeChange, onAdjustContext, activeContextMode,
  persona, trustMode, os, matchedPrompt, contextDetail, memoryCount, missionState
}) => {
  const [input, setInput] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
      setHistoryIndex(-1);
    }
  }, [isVisible]);

  useEffect(() => {
    const parts = input.split(' ');
    // Only show autocomplete if we are on the first word and it starts with /
    if (parts.length === 1 && input.startsWith('/')) {
      const filtered = SLASH_COMMANDS.filter(s => s.cmd.startsWith(input));
      const exactMatch = SLASH_COMMANDS.some(s => s.cmd === input);

      if (filtered.length > 0 && !exactMatch) {
        setShowAutocomplete(true);
      } else {
        setShowAutocomplete(false);
      }
    } else {
      setShowAutocomplete(false);
    }
    setSelectedIndex(0);
  }, [input]);

  const filteredCommands = SLASH_COMMANDS.filter(s => s.cmd.startsWith(input.split(' ')[0]));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || (e.ctrlKey && e.key === 'c')) {
      e.preventDefault();
      onHide();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (showAutocomplete && filteredCommands.length > 0) {
        const cmd = filteredCommands[selectedIndex].cmd;
        setInput(cmd + ' ');
      } else {
        const modes: ContextMode[] = ['RANGE', 'SINGLE', 'LINES'];
        const nextIndex = (modes.indexOf(activeContextMode) + 1) % modes.length;
        onContextModeChange(modes[nextIndex]);
      }
    } else if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onAdjustContext(e.key === 'ArrowUp');
    } else if (e.key === 'ArrowUp') {
      if (showAutocomplete) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setInput(history[history.length - 1 - newIndex]);
        }
      }
    } else if (e.key === 'ArrowDown') {
      if (showAutocomplete) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInput(history[history.length - 1 - newIndex]);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setInput('');
        }
      }
    } else if (e.key === 'Enter') {
      if (showAutocomplete && filteredCommands.length > 0) {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex].cmd;
        setInput(cmd + ' ');
        setShowAutocomplete(false);
      } else if (input.trim()) {
        e.preventDefault();

        // Add to history if not same as last
        setHistory(prev => {
          const newHist = prev.filter(h => h !== input);
          return [...newHist, input].slice(-50);
        });
        onSubmit(input.trim(), activeContextMode);
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full bg-[#2e3440] border-t border-[#3b4252] z-[100] animate-in slide-in-from-bottom-2 duration-200">
      {/* Autocomplete Menu (Floating above the bar) */}
      {showAutocomplete && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-6 right-6 mb-4 bg-[#3b4252] border border-[#4c566a] rounded-lg shadow-2xl overflow-hidden">
          {filteredCommands.map((item, idx) => (
            <div
              key={item.cmd}
              className={clsx(
                "px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer",
                idx === selectedIndex ? "bg-[#81a1c1] text-[#2e3440]" : "text-[#d8dee9] hover:bg-[#434c5e]"
              )}
              onClick={() => {
                setInput(item.cmd + ' ');
                setShowAutocomplete(false);
                inputRef.current?.focus();
              }}
            >
              <div className="flex items-center gap-3">
                <Command size={14} className={clsx(idx === selectedIndex ? "text-[#2e3440]" : "text-[#81a1c1]")} />
                <span className="font-mono text-xs font-bold">{item.cmd}</span>
              </div>
              <span className={clsx("text-[10px] opacity-70", idx === selectedIndex ? "text-[#2e3440]" : "text-[#d8dee9]")}>
                {item.desc}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 1. Header & Instructions */}
      <div className="flex flex-col items-center pt-4 pb-2 px-8 bg-[#3b4252] border-b border-[#4c566a]/30 shadow-md">
        <div className="text-[#8fbcbb] font-bold text-[13px] tracking-widest mb-1 select-none">
          AI TERMINAL COPILOT
        </div>
        <div className="text-center text-[#d8dee9]/80 text-[11px] select-none leading-relaxed">
          Type your question. Enter to send, Escape/Ctrl+C to cancel. Type / for commands.<br/>
          Tab to change context mode. Ctrl+↑/↓ to adjust context. ↑↓ for question history.
        </div>
      </div>

      {/* 2. State Badges Bar (Pills) */}
      <div className="flex flex-col gap-2.5 bg-[#3b4252] py-3 shadow-sm z-10">
        <div className="flex items-center justify-center px-8 overflow-x-auto scrollbar-hide">
          <div 
            style={{ marginRight: '3px', paddingLeft: '2px', paddingRight: '2px' }}
            className={clsx(
              "py-1.5 rounded-md text-[11px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all shrink-0 select-none",
              persona === 'architect' 
                ? "bg-[#b48ead]/10 border-[#b48ead]/30 text-[#b48ead]" 
                : "bg-[#81a1c1]/10 border-[#81a1c1]/30 text-[#81a1c1]"
            )}
          >
            <Cpu size={14} /> {persona}
          </div>
          
          <div 
            style={{ marginRight: '3px', paddingLeft: '2px', paddingRight: '2px' }}
            className={clsx(
              "py-1.5 rounded-md text-[11px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all shrink-0 select-none bg-[#81a1c1]/10 border-[#81a1c1]/30 text-[#81a1c1]",
              trustMode && "shadow-[0_0_10px_rgba(129,161,193,0.1)]"
            )}
          >
            <Shield size={14} /> Trust: {trustMode ? 'ON' : 'OFF'}
          </div>

          <div 
            style={{ marginRight: '3px', paddingLeft: '2px', paddingRight: '2px' }}
            className="py-1.5 rounded-md bg-[#81a1c1]/10 border border-[#81a1c1]/30 text-[#81a1c1] text-[11px] font-black tracking-widest flex items-center gap-2 shrink-0 select-none"
          >
            <Terminal size={14} /> OS: {os}
          </div>

          <div 
            style={{ marginRight: '3px', paddingLeft: '2px', paddingRight: '2px' }}
            className="py-1.5 rounded-md bg-[#81a1c1]/10 border border-[#81a1c1]/30 text-[#81a1c1] text-[11px] font-black tracking-widest flex items-center gap-2 shrink-0 select-none"
          >
            <Database size={14} /> Memories: {memoryCount}
          </div>

          {missionState?.active && (
            <div 
              style={{ marginRight: '3px', paddingLeft: '4px', paddingRight: '4px' }}
              className="py-1.5 rounded-md text-[11px] font-black tracking-widest flex items-center gap-2 shrink-0 select-none border transition-all bg-[#a3be8c]/20 border-[#a3be8c]/40 text-[#a3be8c] animate-pulse"
            >
              🎯 Mission: Step {missionState.step}/{missionState.maxSteps}
            </div>
          )}

          {matchedPrompt && matchedPrompt !== DEFAULT_PROMPT && (
            <div 
              style={{ marginRight: '3px', paddingLeft: '2px', paddingRight: '2px' }}
              className="py-1.5 rounded-md bg-[#81a1c1]/10 border border-[#81a1c1]/30 text-[#81a1c1] text-[11px] font-black tracking-widest flex items-center gap-2 shrink-0 select-none"
            >
              <Search size={14} /> Prompt: {matchedPrompt}
            </div>
          )}
        </div>

        {contextDetail && (
          <div className="flex justify-center px-6 w-full">
            <button
              onClick={() => {
                 const modes: ContextMode[] = ['RANGE', 'SINGLE', 'LINES'];
                 const nextIndex = (modes.indexOf(activeContextMode) + 1) % modes.length;
                 onContextModeChange(modes[nextIndex]);
              }}
              className="py-1.5 px-3 rounded-md bg-[#ebcb8b]/10 border border-[#ebcb8b]/30 text-[#ebcb8b] text-[11px] font-black flex items-center gap-2 w-full justify-center hover:bg-[#ebcb8b]/20 transition-all active:scale-[0.98] cursor-pointer"
              title={`Click to cycle mode: ${contextDetail}`}
            >
              <Layout size={14} className="shrink-0" />
              <span className="uppercase tracking-widest mr-1 shrink-0 select-none">
                {activeContextMode === 'SINGLE' ? 'CMD' : activeContextMode}:
              </span>
              <span className="truncate">{contextDetail}</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Input Box */}
      <div className="p-4 pt-0 px-8 bg-[#2e3440]">
        <div className="w-full relative h-12">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Direct access to tactical insights..."
            className="w-full h-full bg-[#3b4252]/30 border border-[#4c566a]/40 rounded-xl outline-none text-[#d8dee9] text-base placeholder:text-[#4c566a] px-6 focus:border-[#81a1c1]/60 transition-all shadow-inner"
          />
        </div>
      </div>
    </div>
  );
};

export default CopilotPhantomInput;
