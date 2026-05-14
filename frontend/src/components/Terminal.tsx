import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api';
import CopilotPhantomInput from './CopilotPhantomInput';
import type { ContextMode, Persona } from './CopilotPhantomInput';

interface TerminalProps {
  nodeId: string;
  isActive: boolean;
  workspaceId?: string | null;
  onCopilotRequest?: (text: string, mode: ContextMode) => void;
}

const Terminal: React.FC<TerminalProps> = ({ nodeId, isActive, workspaceId = null, onCopilotRequest }) => {
  console.warn(`Terminal Render: ${nodeId}`);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const decorationsRef = useRef<{ decoration: any, marker: any }[]>([]);

  // Copilot State
  const [showCopilot, setShowCopilot] = useState(false);
  const showCopilotRef = useRef(showCopilot);
  useEffect(() => { showCopilotRef.current = showCopilot; }, [showCopilot]);

  const [contextMode, setContextMode] = useState<ContextMode>('RANGE');
  const contextModeRef = useRef(contextMode);
  useEffect(() => { contextModeRef.current = contextMode; }, [contextMode]);

  const [persona, setPersona] = useState<Persona>('engineer');
  const [trustMode, setTrustMode] = useState(false);
  const [os, setOs] = useState('linux');
  const [matchedPrompt, setMatchedPrompt] = useState('>$|#$|\\$$|>.$|#.$|\\$.$');
  const [contextLines, setContextLines] = useState(50);
  const [contextBlocks, setContextBlocks] = useState(1);
  const [memories, setMemories] = useState<string[]>([]);
  const [interactionHistory, setInteractionHistory] = useState<string[]>([]);

  useEffect(() => {
    if (nodeId && !nodeId.includes(':')) {
      api.getNodeDetails(nodeId)
        .then(details => {
          if (details.prompt) setMatchedPrompt(details.prompt);
          if (details.os) setOs(details.os);
        })
        .catch(err => console.error('Failed to load node details for prompt/os', err));
    }
  }, [nodeId]);

  const getPromptIndices = () => {
    if (!xtermRef.current) return [];
    const buffer = xtermRef.current.buffer.active;
    const totalLines = buffer.length;
    const indices: number[] = [];
    
    let promptRegex: RegExp;
    try {
      promptRegex = new RegExp(matchedPrompt);
    } catch (e) {
      // Fallback if the regex is invalid
      promptRegex = />$|#$|\$$|>.$|#.$|\$.$/;
    }

    for (let i = 0; i < totalLines; i++) {
      const lineText = buffer.getLine(i)?.translateToString(true) || '';
      if (promptRegex.test(lineText)) {
        indices.push(i);
      }
    }
    return indices;
  };

  const getEffectiveEnd = () => {
    if (!xtermRef.current) return 0;
    const buffer = xtermRef.current.buffer.active;
    
    // We look for the last line with actual text, but capped at the cursor position
    // to avoid highlighting "future" reserved lines
    const cursorAbs = buffer.baseY + buffer.cursorY;
    
    for (let i = cursorAbs; i >= 0; i--) {
      const line = buffer.getLine(i);
      if (line && line.translateToString(true).trim().length > 0) {
        return i + 1;
      }
    }
    return cursorAbs + 1;
  };

  const effectiveEnd = getEffectiveEnd();
  const pIndices = getPromptIndices();
  const totalB = pIndices.length || 1;

  const getBlockPreview = (idx: number) => {
    if (!xtermRef.current || pIndices.length === 0) return '';
    const actualIdx = pIndices.length - idx;
    if (actualIdx < 0 || actualIdx >= pIndices.length) return '';
    const lineNum = pIndices[actualIdx];
    const text = xtermRef.current.buffer.active.getLine(lineNum)?.translateToString(true).trim() || '';
    return text;
  };

  const currentBlockText = (contextMode === 'SINGLE' || contextMode === 'RANGE') 
    ? getBlockPreview(contextBlocks) 
    : '';

  const { ctxStart, ctxEnd } = React.useMemo(() => {
    if (!xtermRef.current) return { ctxStart: 0, ctxEnd: 0 };
    
    let start = 0;
    let end = 0;

    if (contextMode === 'LINES') {
      const cappedLines = Math.min(contextLines, effectiveEnd);
      start = Math.max(0, effectiveEnd - cappedLines);
      end = effectiveEnd;
    } else {
      if (pIndices.length === 0) {
        start = effectiveEnd;
        end = effectiveEnd;
      } else if (contextMode === 'SINGLE') {
        const blockIdx = Math.max(0, pIndices.length - contextBlocks);
        start = pIndices[blockIdx];
        end = (blockIdx + 1 < pIndices.length) ? pIndices[blockIdx + 1] : effectiveEnd;
      } else {
        const startIdx = Math.max(0, pIndices.length - contextBlocks);
        start = pIndices[startIdx];
        end = effectiveEnd;
      }
    }
    console.log("DEBUG Context Range:", { contextMode, contextLines, effectiveEnd, start, end });
    return { ctxStart: start, ctxEnd: end };
  }, [contextMode, contextLines, contextBlocks, pIndices, effectiveEnd]);

  const ctxLineCount = ctxEnd - ctxStart;

  // Visual Highlighting: Update decorations when range changes
  useEffect(() => {
    if (!xtermRef.current || !showCopilot) {
      decorationsRef.current.forEach(obj => {
          obj.decoration.dispose();
          obj.marker.dispose();
      });
      decorationsRef.current = [];
      return;
    }

    const xterm = xtermRef.current;
    
    // Clear old decorations and markers
    decorationsRef.current.forEach(obj => {
        obj.decoration.dispose();
        obj.marker.dispose();
    });
    decorationsRef.current = [];

    // Add new decorations for the context range
    if (ctxStart < ctxEnd) {
        // registerMarker() takes a CURSOR-RELATIVE offset, not an absolute line number.
        // We need: offset = targetLine - cursorAbsoluteLine
        const cursorAbsLine = xterm.buffer.active.baseY + xterm.buffer.active.cursorY;

        for (let i = ctxStart; i < ctxEnd; i++) {
            if (i < 0 || i >= xterm.buffer.active.length) continue;

            const marker = xterm.registerMarker(i - cursorAbsLine);
            if (marker) {
                const decoration = xterm.registerDecoration({
                    marker,
                    backgroundColor: '#81a1c133', // Subtle blue highlight
                    width: xterm.cols
                });
                if (decoration) {
                    decorationsRef.current.push({ decoration, marker });
                } else {
                    marker.dispose();
                }
            }
        }
    }
  }, [ctxStart, ctxEnd, showCopilot]);

  // Auto-scroll when range changes
  useEffect(() => {
    if (showCopilot && xtermRef.current && ctxStart !== ctxEnd) {
      const xterm = xtermRef.current;
      // Scroll so that 'ctxStart' is at the top of the viewport
      xterm.scrollLines(ctxStart - xterm.buffer.active.viewportY);
    }
  }, [ctxStart, showCopilot]);

const contextDetail = contextMode === 'LINES' 
    ? `${Math.min(contextLines, effectiveEnd)} lines (${Math.min(100, Math.round((contextLines/(effectiveEnd||1))*100))}%)` 
    : contextMode === 'SINGLE' 
      ? `Cmd Block [${contextBlocks}]: ${currentBlockText}`
      : `Range [${contextBlocks} blocks]: ${currentBlockText}`;

  useEffect(() => {
    if (!terminalRef.current) return;

    // Dispose old terminal if exists to prevent duplicates on remount
    if (xtermRef.current) {
        xtermRef.current.dispose();
    }

    // 1. Initialize xterm
    const xterm = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#2e3440',
        foreground: '#d8dee9',
        cursor: '#81a1c1',
        selectionBackground: '#4c566a',
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
        brightBlack: '#4c566a',
        brightRed: '#bf616a',
        brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b',
        brightBlue: '#81a1c1',
        brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb',
        brightWhite: '#eceff4',
      },
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminalRef.current);
    
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 2. Intelligent Ctrl+C and Ctrl+Space (Copilot)
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        // Ctrl + C: Copy if selection
        if (e.ctrlKey && e.keyCode === 67) { 
          if (xterm.hasSelection()) {
            document.execCommand('copy');
            return false;
          }
        }
        // Ctrl + Space: Toggle Copilot
        if (e.ctrlKey && e.keyCode === 32) {
          e.preventDefault();
          setShowCopilot(prev => !prev);
          return false;
        }

        // Ctrl + ArrowUp / ArrowDown: Adjust Context
        if (e.ctrlKey && (e.keyCode === 38 || e.keyCode === 40)) {
          if (showCopilotRef.current) {
            e.preventDefault();
            const isUp = e.keyCode === 38;
            if (contextModeRef.current === 'LINES') {
              setContextLines(prev => {
                const curEnd = getEffectiveEnd();
                const next = isUp ? prev + 50 : Math.max(50, prev - 50);
                return Math.min(next, Math.max(50, Math.ceil(curEnd / 50) * 50));
              });
            } else {
              setContextBlocks(prev => isUp ? prev + 1 : Math.max(1, prev - 1));
            }
            return false;
          }
        }
      }
      return true;
    });

    // 3. Setup WebSocket
    const wsUrl = api.getTerminalWsUrl(nodeId, workspaceId || null);
    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.onopen = () => {
      if (workspaceId) {
         xterm.write('\r\n\x1b[38;2;163;190;140m[MULTIPLAYER LINK ESTABLISHED]\x1b[0m\r\n');
      } else {
         xterm.write('\r\n\x1b[38;2;136;192;208m[SECURE LINK ESTABLISHED]\x1b[0m\r\n');
      }
      setTimeout(() => fitAddon.fit(), 100);
      xterm.focus();
    };

    socket.onmessage = (event) => {
      xterm.write(new Uint8Array(event.data));
    };

    socket.onclose = () => {
      xterm.write('\r\n\x1b[38;2;191;97;106m[LINK TERMINATED]\x1b[0m\r\n');
    };

    xterm.onData(data => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(new TextEncoder().encode(data));
      }
    });

    // 3. Robust Resize Handling
    const resizeObserver = new ResizeObserver(() => {
      if (xtermRef.current && fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch { /* ignore */ }
      }
    });

    resizeObserver.observe(terminalRef.current);

    // Initial fit attempts
    const fitTimer = setTimeout(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    }, 200);

    return () => {
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
      socket.close();
      xterm.dispose();
    };
  }, [nodeId, workspaceId]);

  // Handle activation/switching
  useEffect(() => {
    if (isActive && xtermRef.current && fitAddonRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          xtermRef.current?.focus();
        } catch { /* ignore */ }
      }, 50);
    }
  }, [isActive]);

  const getCapturedContext = () => {
    if (!xtermRef.current) return '';
    const buffer = xtermRef.current.buffer.active;
    const lines: string[] = [];

    for (let i = ctxStart; i < ctxEnd; i++) {
      const line = buffer.getLine(i);
      if (line) {
        const text = line.translateToString(true);
        lines.push(text);
      }
    }
    return lines.join('\n').trim();
  };

  const handleCopilotSubmit = (text: string, mode: ContextMode) => {
    console.warn("Terminal: handleCopilotSubmit START", { text, mode });
    
    // Scroll to bottom before finishing
    xtermRef.current?.scrollToBottom();

    let capturedContext = "";
    try {
      capturedContext = getCapturedContext();
      console.warn("Terminal: Context captured, length:", capturedContext.length);
    } catch (err) {
      console.error("Terminal: CRITICAL ERROR in getCapturedContext:", err);
    }
    
    console.warn("%c AI COPILOT PAYLOAD ", "background: #81a1c1; color: #2e3440; font-weight: bold; padding: 2px 4px; border-radius: 3px;");
    console.warn("Final Mode:", mode);
    console.warn("Final Question:", text);
    console.warn("Captured Context Content:\n", capturedContext);

    // Handle Slash Commands
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ').trim();
      
      const isOneShot = args.length > 0;
      const requiresArgs = (cmd === '/os' || cmd === '/prompt' || cmd === '/memorize');

      if (requiresArgs && !isOneShot) {
          return;
      }

      // ONE-SHOT: Execute and Close, but DON'T change the official mode badges
      if (isOneShot && !requiresArgs) {
        if (onCopilotRequest) {
          onCopilotRequest(`${text}\n\n[CONTEXT]\n${capturedContext}`, mode);
        }
        setShowCopilot(false);
        xtermRef.current?.focus();
        return;
      }

      // PERSISTENT STATE CHANGE (Only if no text was provided)
      if (cmd === '/trust') setTrustMode(true);
      else if (cmd === '/untrust') setTrustMode(false);
      else if (cmd === '/architect') setPersona('architect');
      else if (cmd === '/engineer') setPersona('engineer');
      else if (cmd === '/os') setOs(args);
      else if (cmd === '/prompt') setMatchedPrompt(args);
      else if (cmd === '/memorize' && args) setMemories(prev => [...prev, args]);
      else if (cmd === '/clear') {
        setMemories([]);
        setInteractionHistory([]);
      }

      return; // Keep open for state changes
    }

    const memoryContext = memories.length > 0 
      ? `\n\n[MEMORIES]\n${memories.join('\n')}`
      : "";
      
    const loopContext = interactionHistory.length > 0
      ? `\n\n[PREVIOUS INTERACTIONS]\n${interactionHistory.join('\n---\n')}`
      : "";

    if (onCopilotRequest) {
      // Pass node info to the panel (wrapped in a special block or metadata)
      const metaInfo = `\n\n[NODE_INFO]\nID: ${nodeId}\nOS: ${os}\nPROMPT: ${matchedPrompt}`;
      onCopilotRequest(`${text}${memoryContext}${loopContext}${metaInfo}\n\n[CONTEXT]\n${capturedContext}`, mode);
    }
    
    // Update interaction history (keep last 5)
    setInteractionHistory(prev => {
        const newEntry = `Q: ${text}`;
        return [...prev, newEntry].slice(-5);
    });

    setShowCopilot(false);
    xtermRef.current?.focus();
  };

  const handleAdjustContext = (up: boolean) => {
    if (contextMode === 'LINES') {
      setContextLines(prev => {
        const next = up ? prev + 50 : Math.max(50, prev - 50);
        // Cap contextLines at effectiveEnd (but at least 50)
        return Math.min(next, Math.max(50, Math.ceil(effectiveEnd / 50) * 50));
      });
    } else {
      const currentPIndices = getPromptIndices();
      const totalB = currentPIndices.length || 1;
      setContextBlocks(prev => {
        const next = up ? Math.min(totalB, prev + 1) : Math.max(1, prev - 1);
        return next;
      });
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#2e3440', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div ref={terminalRef} style={{ flex: 1, minWidth: 0, minHeight: 0 }} />
      
      <div className="relative">
        <CopilotPhantomInput
          isVisible={showCopilot}
          onHide={() => {
            setShowCopilot(false);
            xtermRef.current?.focus();
          }}
          onSubmit={handleCopilotSubmit}
          onContextModeChange={setContextMode}
          onAdjustContext={handleAdjustContext}
          activeContextMode={contextMode}
          persona={persona}
          trustMode={trustMode}
          os={os}
          matchedPrompt={matchedPrompt}
          contextDetail={contextDetail}
          memoryCount={memories.length}
        />
      </div>
    </div>
  );
};

export default Terminal;
