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
  isAiProcessing?: boolean;
  workspaceId?: string | null;
  onCopilotRequest?: (text: string, mode: ContextMode) => void;
  onAbort?: () => void;
}

const Terminal: React.FC<TerminalProps> = ({ nodeId, isActive, isAiProcessing, workspaceId = null, onCopilotRequest, onAbort }) => {
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

  const [isCopilotActive, setIsCopilotActive] = useState(false);
  const isCopilotActiveRef = useRef(isCopilotActive);
  useEffect(() => { isCopilotActiveRef.current = isCopilotActive; }, [isCopilotActive]);

  const [contextMode, setContextMode] = useState<ContextMode>('RANGE');
  const contextModeRef = useRef(contextMode);
  useEffect(() => { contextModeRef.current = contextMode; }, [contextMode]);

  const [persona, setPersona] = useState<Persona>('engineer');
  const [trustMode, setTrustMode] = useState(false);
  const [os, setOs] = useState('linux');
  const [matchedPrompt, setMatchedPrompt] = useState('>$|#$|\\$$|>.$|#.$|\\$.$');
  const [contextLines, setContextLines] = useState(50);
  const [contextBlocks, setContextBlocks] = useState(1);
  const [remoteBlocks, setRemoteBlocks] = useState<{startPos: number, endPos: number, startPreview: string}[]>([]);
  const [memories, setMemories] = useState<string[]>([]);
  const [interactionHistory, setInteractionHistory] = useState<string[]>([]);
  const [copilotSessionId, setCopilotSessionId] = useState<string | null>(null);

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

  const getEffectiveEnd = () => {
    if (!xtermRef.current) return 0;
    const buffer = xtermRef.current.buffer.active;
    const cursorAbs = buffer.baseY + buffer.cursorY;
    
    for (let i = cursorAbs; i >= 0; i--) {
      const line = buffer.getLine(i);
      if (line && line.translateToString(true).trim().length > 0) {
        return i + 1;
      }
    }
    return cursorAbs + 1;
  };

  const getBlockIndices = (): [number, number][] => {
    if (!xtermRef.current) return [];
    const buffer = xtermRef.current.buffer.active;
    const totalLines = buffer.length;

    let promptRegex: RegExp;
    try {
      promptRegex = new RegExp(matchedPrompt);
    } catch (e) {
      promptRegex = />$|#$|\$$|>.$|#.$|\$.$/;
    }

    // 1. If we have remote blocks from the server, map them to line ranges
    if (remoteBlocks.length > 0) {
      const mappedIndices: [number, number][] = [];
      let lastSearchLine = totalLines - 1;
      
      const reversedBlocks = [...remoteBlocks].reverse();
      for (const block of reversedBlocks) {
        let startLine = -1;
        let endLine = lastSearchLine + 1;

        // Find start line by searching for startPreview
        for (let i = lastSearchLine; i >= 0; i--) {
          const lineText = buffer.getLine(i)?.translateToString(true) || '';
          if (lineText.includes(block.startPreview)) {
            startLine = i;
            lastSearchLine = i - 1;
            break;
          }
        }

        if (startLine !== -1) {
          // Truncate endLine if we encounter an empty prompt
          let truncatedEndLine = endLine;
          for (let j = startLine + 1; j < endLine; j++) {
            const lText = buffer.getLine(j)?.translateToString(true) || '';
            const match = lText.match(promptRegex);
            if (match) {
              const cmdText = lText.slice(match.index! + match[0].length).trim();
              if (cmdText === '') {
                truncatedEndLine = j;
                break;
              }
            }
          }
          mappedIndices.unshift([startLine, truncatedEndLine]);
        }
      }
      if (mappedIndices.length > 0) return mappedIndices;
    }

    // 2. Fallback to regex (returns single-line ranges)
    const indices: [number, number][] = [];

    for (let i = 0; i < totalLines; i++) {
      const lineText = buffer.getLine(i)?.translateToString(true) || '';
      if (promptRegex.test(lineText)) {
        indices.push([i, i + 1]); 
      }
    }
    // Fix dummy ends for regex fallback
    const effectiveEndVal = getEffectiveEnd();
    for (let i = 0; i < indices.length; i++) {
        indices[i][1] = (i + 1 < indices.length) ? indices[i+1][0] : effectiveEndVal;
    }
    return indices;
  };

  const effectiveEnd = getEffectiveEnd();
  const blockIndices = getBlockIndices();
  const totalB = blockIndices.length || 1;

  const getBlockPreview = (idx: number) => {
    if (!xtermRef.current || blockIndices.length === 0) return '';
    const actualIdx = blockIndices.length - idx;
    if (actualIdx < 0 || actualIdx >= blockIndices.length) return '';
    const [startLine] = blockIndices[actualIdx];
    const text = xtermRef.current.buffer.active.getLine(startLine)?.translateToString(true).trim() || '';
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
      if (blockIndices.length === 0) {
        start = effectiveEnd;
        end = effectiveEnd;
      } else if (contextMode === 'SINGLE') {
        const blockIdx = Math.max(0, blockIndices.length - contextBlocks);
        [start, end] = blockIndices[blockIdx];
      } else {
        const startIdx = Math.max(0, blockIndices.length - contextBlocks);
        const lastIdx = blockIndices.length - 1;
        start = blockIndices[startIdx][0];
        end = blockIndices[lastIdx][1];
      }
    }
    return { ctxStart: start, ctxEnd: end };
  }, [contextMode, contextLines, contextBlocks, blockIndices, effectiveEnd]);

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
      const currentScroll = xterm.buffer.active.viewportY;
      const target = ctxStart;
      const diff = Math.floor(target - currentScroll);
      
      if (!isNaN(diff) && diff !== 0) {
        xterm.scrollLines(diff);
      }
    }
  }, [ctxStart, showCopilot]);

const contextDetail = contextMode === 'LINES' 
    ? `${Math.min(contextLines, effectiveEnd)} lines (${Math.min(100, Math.round((contextLines/(effectiveEnd||1))*100))}%)` 
    : contextMode === 'SINGLE' 
      ? `Cmd Block [${contextBlocks}]: ${currentBlockText}`
      : `Range [${contextBlocks} blocks]: ${currentBlockText}`;

  useEffect(() => {
    if (!terminalRef.current) return;

    if (xtermRef.current) {
        xtermRef.current.dispose();
    }

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

    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        if (e.ctrlKey && e.keyCode === 67) { 
          if (xterm.hasSelection()) {
            document.execCommand('copy');
            return false;
          }
          if (showCopilotRef.current || isCopilotActiveRef.current) {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'copilot_action',
                action: 'web_cancel',
                session_id: copilotSessionId
              }));
            }
            if (onAbort) onAbort();
            setShowCopilot(false);
            setIsCopilotActive(false);
            xterm.focus();
            return false;
          }
        }
        if (e.ctrlKey && e.keyCode === 32) {
          e.preventDefault();
          setShowCopilot(prev => !prev);
          return false;
        }

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
      if (typeof event.data === 'string') {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'copilot_prompt') {
            setIsCopilotActive(true);
            const info = payload.node_info;
            if (info.session_id) {
              setCopilotSessionId(info.session_id);
            }
            if (info.context_blocks) {
              setRemoteBlocks(info.context_blocks.map((b: any) => ({
                startPos: b[0],
                endPos: b[1],
                startPreview: b[2]
              })));
              setContextBlocks(1);
            }            if (info.prompt) setMatchedPrompt(info.prompt);
            if (info.os) setOs(info.os);
          }
          payload.nodeId = nodeId;
          const copilotEvent = new CustomEvent('copilot-message', { detail: payload });
          window.dispatchEvent(copilotEvent);
        } catch (e) {
          console.error("Error parsing WebSocket JSON:", e);
        }
        return;
      }
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

    const resizeObserver = new ResizeObserver(() => {
      if (xtermRef.current && fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch { /* ignore */ }
      }
    });

    resizeObserver.observe(terminalRef.current);

    const fitTimer = setTimeout(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    }, 200);

    const handleExternalCancel = (e: any) => {
      if (e.detail.nodeId === nodeId && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'copilot_action',
          action: 'web_cancel',
          session_id: copilotSessionId
        }));
        setShowCopilot(false);
        setIsCopilotActive(false);
        xterm.focus();
      }
    };
    window.addEventListener('copilot-external-cancel', handleExternalCancel);

    const handleContinueLoop = (e: any) => {
      if (e.detail.nodeId === nodeId && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'copilot_action',
          action: 'continue',
          session_id: copilotSessionId
        }));
        setShowCopilot(true);
      }
    };
    window.addEventListener('copilot-continue-loop', handleContinueLoop);

    return () => {
      window.removeEventListener('copilot-external-cancel', handleExternalCancel);
      window.removeEventListener('copilot-continue-loop', handleContinueLoop);
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
      socket.close();
      xterm.dispose();
    };
  }, [nodeId, workspaceId]);

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
    xtermRef.current?.scrollToBottom();

    let capturedContext = "";
    try {
      capturedContext = getCapturedContext();
    } catch (err) {
      console.error("Terminal: CRITICAL ERROR in getCapturedContext:", err);
    }

    let currentText = text;
    let overridePersona = persona;
    let overrideTrust = trustMode;

    if (currentText.startsWith('/')) {
      const parts = currentText.split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ').trim();
      const isOneShot = args.length > 0;
      const requiresArgs = (cmd === '/os' || cmd === '/prompt' || cmd === '/memorize');

      if (requiresArgs && !isOneShot) return;

      if (!isOneShot) {
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
        return; 
      } else {
        // Handle one-shot commands
        if (cmd === '/trust') overrideTrust = true;
        else if (cmd === '/untrust') overrideTrust = false;
        else if (cmd === '/architect') overridePersona = 'architect';
        else if (cmd === '/engineer') overridePersona = 'engineer';
        // Note: For one-shots, we don't currently override /os or /prompt transiently
        
        currentText = args;
      }
    }

    const memoryContext = memories.length > 0 ? `\n\n[MEMORIES]\n${memories.join('\n')}` : "";
    const loopContext = interactionHistory.length > 0 ? `\n\n[PREVIOUS INTERACTIONS]\n${interactionHistory.join('\n---\n')}` : "";

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const nodeInfo = {
        id: nodeId,
        os: os,
        prompt: matchedPrompt,
        persona: overridePersona,
        trust: overrideTrust
      };

      socketRef.current.send(JSON.stringify({
        type: 'copilot_question',
        question: `${currentText}${memoryContext}${loopContext}`,
        context_buffer: capturedContext,
        node_info_json: JSON.stringify(nodeInfo),
        session_id: copilotSessionId
      }));

      window.dispatchEvent(new CustomEvent('copilot-message', { 
        detail: { type: 'copilot_question_local', question: currentText, nodeId: nodeId, persona: overridePersona } 
      }));

      if (onCopilotRequest) onCopilotRequest(currentText, mode);
    }
    
    setInteractionHistory(prev => [...prev, `Q: ${currentText}`].slice(-5));
    setShowCopilot(false);
    xtermRef.current?.focus();
  };

  useEffect(() => {
    if (showCopilot && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(new Uint8Array([0]));
    }
  }, [showCopilot]);

  const handleAdjustContext = (up: boolean) => {
    if (contextMode === 'LINES') {
      setContextLines(prev => {
        const next = up ? prev + 50 : Math.max(50, prev - 50);
        return Math.min(next, Math.max(50, Math.ceil(effectiveEnd / 50) * 50));
      });
    } else {
      const currentIndices = getBlockIndices();
      const totalB = currentIndices.length || 1;
      setContextBlocks(prev => up ? Math.min(totalB, prev + 1) : Math.max(1, prev - 1));
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#2e3440', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div ref={terminalRef} style={{ flex: 1, minWidth: 0, minHeight: 0 }} />
      <div className="relative">
        <CopilotPhantomInput
          isVisible={showCopilot}
          onHide={() => {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'copilot_action', action: 'web_cancel' }));
            }
            if (onAbort) onAbort();
            setShowCopilot(false);
            setIsCopilotActive(false);
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
