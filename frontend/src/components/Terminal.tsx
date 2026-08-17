import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api';
import CopilotPhantomInput from './CopilotPhantomInput';
import type { ContextMode, Persona } from './CopilotPhantomInput';
import type { CopilotMissionState } from '../types';

interface TerminalProps {
  nodeId: string;
  isActive: boolean;
  isAiProcessing?: boolean;
  workspaceId?: string | null;
  missionState?: CopilotMissionState | null;
  onCopilotRequest?: (text: string, mode: ContextMode) => void;
  onAbort?: () => void;
}

const stripAnsi = (str: string) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

const Terminal: React.FC<TerminalProps> = ({ nodeId, isActive, workspaceId = null, missionState, onCopilotRequest, onAbort }) => {
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

  const [visualCommandMarkers, setVisualCommandMarkers] = useState<{ pos: number, marker: any }[]>([]);
  const lastEnterRef = useRef<{ line: number, time: number } | null>(null);

  const [persona, setPersona] = useState<Persona>('engineer');
  const personaRef = useRef(persona);
  useEffect(() => { personaRef.current = persona; }, [persona]);

  const [trustMode, setTrustMode] = useState(false);
  const trustModeRef = useRef(trustMode);
  useEffect(() => { trustModeRef.current = trustMode; }, [trustMode]);

  const [os, setOs] = useState('linux');
  const osRef = useRef(os);
  useEffect(() => { osRef.current = os; }, [os]);

  const [matchedPrompt, setMatchedPrompt] = useState('>$|#$|\\$$|>.$|#.$|\\$.$');
  const matchedPromptRef = useRef(matchedPrompt);
  useEffect(() => { matchedPromptRef.current = matchedPrompt; }, [matchedPrompt]);

  const getCapturedContextRef = useRef<() => string>(() => '');
  const [contextLines, setContextLines] = useState(50);
  const contextLinesRef = useRef(contextLines);
  useEffect(() => { contextLinesRef.current = contextLines; }, [contextLines]);

  const [contextBlocks, setContextBlocks] = useState(1);
  const contextBlocksRef = useRef(contextBlocks);
  useEffect(() => { contextBlocksRef.current = contextBlocks; }, [contextBlocks]);
  const [remoteBlocks, setRemoteBlocks] = useState<{ startPos: number, endPos: number, startPreview: string }[]>([]);
  const remoteBlocksRef = useRef<{ startPos: number, endPos: number, startPreview: string }[]>([]);
  const [memories, setMemories] = useState<string[]>([]);
  const [interactionHistory, setInteractionHistory] = useState<string[]>([]);
  const [copilotSessionId, setCopilotSessionId] = useState<string | null>(null);
  const copilotSessionIdRef = useRef<string | null>(copilotSessionId);
  useEffect(() => { copilotSessionIdRef.current = copilotSessionId; }, [copilotSessionId]);

  // Phase 5: Persistence & One-shot overrides
  const isUserOverridden = useRef(false);
  const oneShotTrustRef = useRef<boolean | null>(null);
  const missionStartBlockRef = useRef<number | null>(null);

  useEffect(() => {
    if (nodeId && !nodeId.includes(':') && !isUserOverridden.current) {
      api.getNodeDetails(nodeId)
        .then(details => {
          if (isUserOverridden.current) return; // Guard against race if user typed /os while fetching
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
      if (line) {
        const text = stripAnsi(line.translateToString(true)).trim();
        if (text.length > 0) return i + 1;
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
    const blocksToUse = remoteBlocksRef.current.length > 0 ? remoteBlocksRef.current : remoteBlocks;
    if (blocksToUse.length > 0) {
      const mappedIndices: [number, number][] = [];
      let lastSearchLine = totalLines - 1;

      const reversedBlocks = [...blocksToUse].reverse();
      for (const block of reversedBlocks) {
        let startLine = -1;
        let endLine = lastSearchLine + 1;

        // Try to find the line using our visual command markers first (OSC 133)
        const matchingMarker = visualCommandMarkers.find(m => m.pos === block.startPos);
        if (matchingMarker && matchingMarker.marker && !matchingMarker.marker.isDisposed && matchingMarker.marker.line !== -1) {
          startLine = matchingMarker.marker.line;
          lastSearchLine = startLine - 1;
        } else {
          // Fallback to text search
          const targetPreview = stripAnsi(block.startPreview).trim();
          const normalizedTarget = targetPreview.replace(/\s+/g, '');

          for (let i = lastSearchLine; i >= 0; i--) {
            const rawLine = buffer.getLine(i)?.translateToString(true) || '';
            const cleanLine = stripAnsi(rawLine).trim();

            // Fast path: Exact match on single line
            if (cleanLine.includes(targetPreview)) {
              startLine = i;
              lastSearchLine = i - 1;
              break;
            }

            // Slow path: Check if the preview spans across this line and the next line(s)
            // Combine up to 3 lines (current and 2 below) to catch wrapped text safely
            const line0 = stripAnsi(buffer.getLine(i)?.translateToString(true) || '');
            const line1 = i + 1 < buffer.length ? stripAnsi(buffer.getLine(i + 1)?.translateToString(true) || '') : '';
            const line2 = i + 2 < buffer.length ? stripAnsi(buffer.getLine(i + 2)?.translateToString(true) || '') : '';

            const combinedClean = (line0 + line1 + line2).replace(/\s+/g, '');

            if (combinedClean.includes(normalizedTarget)) {
              startLine = i;
              lastSearchLine = i - 1;
              break;
            }
          }
        }

        if (startLine !== -1) {
          // Truncate endLine if we encounter an empty prompt
          let truncatedEndLine = endLine;
          for (let j = startLine + 1; j < endLine; j++) {
            const lText = stripAnsi(buffer.getLine(j)?.translateToString(true) || '').trim();
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
      const lineText = stripAnsi(buffer.getLine(i)?.translateToString(true) || '').trim();
      if (promptRegex.test(lineText)) {
        indices.push([i, i + 1]);
      }
    }
    // Fix dummy ends for regex fallback
    const effectiveEndVal = getEffectiveEnd();
    for (let i = 0; i < indices.length; i++) {
      indices[i][1] = (i + 1 < indices.length) ? indices[i + 1][0] : effectiveEndVal;
    }
    return indices;
  };

  const effectiveEnd = getEffectiveEnd();
  const blockIndices = getBlockIndices();

  const getBlockPreview = (idx: number) => {
    if (!xtermRef.current || blockIndices.length === 0) return '';
    const actualIdx = blockIndices.length - idx;
    if (actualIdx < 0 || actualIdx >= blockIndices.length) return '';
    const [startLine] = blockIndices[actualIdx];
    const text = xtermRef.current.buffer.active.getLine(startLine)?.translateToString(true).trim() || '';
    return text;
  };

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

  const highlightKey = React.useMemo(() => {
    if (contextMode === 'RANGE' && blockIndices.length > 0) {
      const startIndex = Math.max(0, blockIndices.length - contextBlocks);
      const activeBlocks = blockIndices.slice(startIndex);
      return activeBlocks.map(([start, end]) => `${start}-${end}`).join(',');
    }
    return `${ctxStart}-${ctxEnd}`;
  }, [contextMode, contextBlocks, blockIndices, ctxStart, ctxEnd]);

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

    const cursorAbsLine = xterm.buffer.active.baseY + xterm.buffer.active.cursorY;

    const addHighlight = (lineIdx: number) => {
      if (lineIdx < 0 || lineIdx >= xterm.buffer.active.length) return;
      const marker = xterm.registerMarker(lineIdx - cursorAbsLine);
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
    };

    if (contextMode === 'RANGE' && blockIndices.length > 0) {
      const startIndex = Math.max(0, blockIndices.length - contextBlocks);
      const activeBlocks = blockIndices.slice(startIndex);
      for (const [start, end] of activeBlocks) {
        for (let i = start; i < end; i++) {
          addHighlight(i);
        }
      }
    } else {
      if (ctxStart < ctxEnd) {
        for (let i = ctxStart; i < ctxEnd; i++) {
          addHighlight(i);
        }
      }
    }
  }, [highlightKey, showCopilot]);

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

  const cleanPreview = (text: string) => {
    const original = text.trim().replace(/\r/g, '').replace(/\n/g, ' ');
    const cleaned = original.replace(/^.*?[#>\$]\s*/, '');
    return cleaned ? cleaned : original;
  };

  const getCombinedRangePreview = () => {
    if (!xtermRef.current || blockIndices.length === 0) return '';
    const startIndex = Math.max(0, blockIndices.length - contextBlocks);
    let slice = blockIndices.slice(startIndex);

    if (slice.length > 1) {
      slice = slice.slice(0, -1);
    }

    const previews: string[] = [];
    const buffer = xtermRef.current.buffer.active;

    for (const [startLine] of slice) {
      const lineText = buffer.getLine(startLine)?.translateToString(true).trim() || '';
      const cleaned = cleanPreview(lineText);
      if (cleaned) {
        const truncated = cleaned.length > 25 ? cleaned.substring(0, 22) + "..." : cleaned;
        previews.push(truncated);
      }
    }

    if (previews.length === 0) {
      return cleanPreview(getBlockPreview(contextBlocks));
    } else if (previews.length <= 3) {
      return previews.join(" + ");
    } else {
      return `${previews[0]} + ${previews[1]} + ${previews[2]} ... (+${previews.length - 3})`;
    }
  };

  const actualLineCount = React.useMemo(() => {
    if (contextMode === 'RANGE' && blockIndices.length > 0) {
      const startIndex = Math.max(0, blockIndices.length - contextBlocks);
      const activeBlocks = blockIndices.slice(startIndex);
      let count = 0;
      for (const [start, end] of activeBlocks) {
        count += (end - start);
      }
      return count;
    }
    return ctxEnd - ctxStart;
  }, [contextMode, contextBlocks, blockIndices, ctxStart, ctxEnd]);

  const contextDetail = contextMode === 'LINES'
    ? `${Math.min(contextLines, effectiveEnd)} (${Math.min(100, Math.round((contextLines / (effectiveEnd || 1)) * 100))}%)`
    : contextMode === 'SINGLE'
      ? `${contextBlocks} (${actualLineCount}L~): ${cleanPreview(getBlockPreview(contextBlocks))}`
      : `${contextBlocks} (${actualLineCount}L~): ${getCombinedRangePreview()}`;

  useEffect(() => {
    if (!terminalRef.current) return;

    if (xtermRef.current) {
      xtermRef.current.dispose();
    }

    setVisualCommandMarkers([]);

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

    const keyDisposable = xterm.onKey((e) => {
      if (e.domEvent.key === 'Enter') {
        lastEnterRef.current = {
          line: xterm.buffer.active.baseY + xterm.buffer.active.cursorY,
          time: Date.now()
        };
      }
    });

    // Register OSC 133 handler for command execution boundaries
    xterm.parser.registerOscHandler(133, (data) => {
      const parts = data.split(';');
      if (parts[0] === 'B') {
        const pos = parts[1] ? parseInt(parts[1], 10) : null;
        if (pos !== null && !isNaN(pos)) {
          const buffer = xterm.buffer.active;
          const absCursorLine = buffer.baseY + buffer.cursorY;
          let commandLine = absCursorLine;

          const now = Date.now();
          if (lastEnterRef.current !== null && (now - lastEnterRef.current.time) < 1000) {
            commandLine = lastEnterRef.current.line;
            lastEnterRef.current = null;
          } else {
            // Search upwards to find the non-empty line where the command prompt/text resides
            for (let i = absCursorLine; i >= 0; i--) {
              const lineText = buffer.getLine(i)?.translateToString(true).trim() || '';
              if (lineText !== '') {
                commandLine = i;
                break;
              }
            }
          }

          const marker = xterm.registerMarker(commandLine - absCursorLine);
          if (marker) {
            setVisualCommandMarkers(prev => {
              if (prev.some(m => m.pos === pos)) return prev;
              const next = [...prev, { pos, marker }];
              if (next.length > 100) {
                const oldest = next[0];
                try { oldest.marker.dispose(); } catch (e) { /* already disposed */ }
                return next.slice(1);
              }
              return next;
            });
          }
        }
      }
      return true;
    });

    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        const isCancelKey = (e.ctrlKey && e.keyCode === 67) || (e.keyCode === 27); // Ctrl+C or Escape
        const char = e.key.toLowerCase();

        // If Copilot Action Card is waiting for an action in terminal, intercept Y/N/E/Esc completely
        if (!showCopilotRef.current && isCopilotActiveRef.current) {
          if (char === 'y') {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('copilot-run-commands', { detail: { nodeId } }));
            return false;
          }
          if (char === 'n' || e.keyCode === 27) { // N or Escape
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('copilot-action-reject', { detail: { nodeId } }));
            return false;
          }
          if (char === 'e') {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('copilot-edit-commands', { detail: { nodeId } }));
            return false;
          }
        }

        if (isCancelKey) {
          if (xterm.hasSelection() && e.ctrlKey) {
            document.execCommand('copy');
            return false;
          }

          // Rejection logic: Unify Ctrl+C and Escape to kill copilot session if active in terminal (not in input bar)
          if (!showCopilotRef.current && isCopilotActiveRef.current) {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('copilot-external-cancel', { detail: { nodeId } }));
            return false; // Prevent Ctrl+C from going to terminal
          }
        }

        if (e.ctrlKey && e.keyCode === 32) {
          e.preventDefault();
          e.stopPropagation();

          if (showCopilotRef.current) {
            // Close copilot
            const cancelMsg = {
              type: 'copilot_action',
              action: 'web_cancel',
              session_id: copilotSessionIdRef.current
            };
            socketRef.current?.send(JSON.stringify(cancelMsg));
            setShowCopilot(false);
            setTimeout(() => {
              setIsCopilotActive(false);
              xterm.focus();
            }, 50);
          } else {
            // Open copilot: notify server PTY to start copilot interaction
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(new Uint8Array([0]));
            }
            setShowCopilot(true);
            setIsCopilotActive(true);
          }
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
            console.log('📩 [Terminal WS] copilot_prompt received from router:', payload);
            setIsCopilotActive(true);
            const info = payload.node_info;
            if (info.session_id) {
              setCopilotSessionId(info.session_id);
            }
            if (info.context_blocks) {
              const mapped = info.context_blocks.map((b: any) => ({
                startPos: b[0],
                endPos: b[1],
                startPreview: b[2]
              }));
              setRemoteBlocks(mapped);
              remoteBlocksRef.current = mapped;
            }
            // Apply persisted context state from server (accumulation)
            const serverModeMap: Record<number, ContextMode> = { 0: 'RANGE', 1: 'SINGLE', 2: 'LINES' };
            if (info.context_mode !== undefined) {
              const m = serverModeMap[info.context_mode] ?? 'RANGE';
              setContextMode(m);
              contextModeRef.current = m;
            }
            if (info.context_cmd !== undefined) {
              setContextBlocks(info.context_cmd);
              contextBlocksRef.current = info.context_cmd;
            }
            if (info.context_lines !== undefined) {
              setContextLines(info.context_lines);
              contextLinesRef.current = info.context_lines;
            }

            // Only update OS and Prompt from server if we haven't manually overridden them yet
            if (!isUserOverridden.current) {
              if (info.prompt) setMatchedPrompt(info.prompt);
              if (info.os) setOs(info.os);
            }
          }

          // Phase 5: Trust Mode Auto-Execution (Respects persistent mode OR one-shot override)
          if (payload.type === 'copilot_response_json') {
            const result = payload.data;
            console.log('📩 [Terminal WS] copilot_response_json received:', result);
            const effectiveTrust = oneShotTrustRef.current !== null ? oneShotTrustRef.current : trustModeRef.current;

            if (effectiveTrust && result.commands && result.commands.length > 0 && result.risk_level !== 'destructive') {
              console.log('⚡ [Terminal WS] Trust Mode Auto-Executing commands:', result.commands);
              socketRef.current?.send(JSON.stringify({
                type: 'copilot_action',
                action: 'send_all',
                session_id: copilotSessionIdRef.current
              }));
              setIsCopilotActive(false);
              // Mark as auto-authorized for UI
              payload.auto_authorized = true;
            }

            // Clear one-shot override after response
            oneShotTrustRef.current = null;
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
        const modeMap: Record<string, number> = { 'RANGE': 0, 'SINGLE': 1, 'LINES': 2 };
        const cancelMsg = {
          type: 'copilot_action',
          action: 'web_cancel',
          session_id: copilotSessionIdRef.current,
          node_info_json: JSON.stringify({
            context_mode: modeMap[contextModeRef.current] ?? 0,
            context_cmd: contextBlocksRef.current,
            context_lines: contextLinesRef.current
          })
        };
        socketRef.current.send(JSON.stringify(cancelMsg));
        setShowCopilot(false);
        // Delay re-enabling terminal input to prevent key leakage
        setTimeout(() => {
          setIsCopilotActive(false);
          xterm.focus();
        }, 50);
      }
    };
    window.addEventListener('copilot-external-cancel', handleExternalCancel);

    const handleRunCommands = (e: any) => {
      console.log('⚡ [Terminal] handleRunCommands received for node:', nodeId, e.detail);
      if (e.detail.nodeId === nodeId && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'copilot_action',
          action: 'send_all',
          session_id: copilotSessionIdRef.current
        }));
        setIsCopilotActive(true);
        xterm.focus();
      }
    };
    window.addEventListener('copilot-run-commands', handleRunCommands);

    const handleCustomRunCommands = (e: any) => {
      console.log('⚡ [Terminal] handleCustomRunCommands received for node:', nodeId, e.detail);
      if (e.detail.nodeId === nodeId && socketRef.current?.readyState === WebSocket.OPEN) {
        const commands = e.detail.commands;
        const commandsStr = Array.isArray(commands) ? commands.join('\n') : commands;
        socketRef.current.send(JSON.stringify({
          type: 'copilot_action',
          action: `custom:${commandsStr}`,
          session_id: copilotSessionIdRef.current
        }));
        setIsCopilotActive(true);
        xterm.focus();
      }
    };
    window.addEventListener('copilot-custom-run-commands', handleCustomRunCommands);

    const handleContinueLoop = (e: any) => {
      console.log('🔄 [Terminal] handleContinueLoop received for node:', nodeId);
      if (e.detail.nodeId === nodeId && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'copilot_action',
          action: 'continue',
          session_id: copilotSessionIdRef.current
        }));
        setShowCopilot(true);
        setIsCopilotActive(true);
      }
    };
    window.addEventListener('copilot-continue-loop', handleContinueLoop);

    const handleActionReject = (e: any) => {
      console.log('🛑 [Terminal] handleActionReject received for node:', nodeId);
      if (e.detail.nodeId === nodeId && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'copilot_action',
          action: 'continue',
          session_id: copilotSessionIdRef.current
        }));
        setShowCopilot(true);
        setIsCopilotActive(true);
      }
    };
    window.addEventListener('copilot-action-reject', handleActionReject);

    const handleTriggerMissionStep = (e: any) => {
      console.log('🎯 [Terminal] handleTriggerMissionStep received:', e.detail);
      if (e.detail.nodeId === nodeId && socketRef.current?.readyState === WebSocket.OPEN) {
        setShowCopilot(false);
        setIsCopilotActive(true);
        const { step, maxSteps, goal, notes, feedback } = e.detail;

        const allBlocks = getBlockIndices();
        const totalCmds = allBlocks.length || remoteBlocksRef.current.length;
        const startIdx = missionStartBlockRef.current ?? (totalCmds > 1 ? Math.max(0, totalCmds - (step * 2)) : 0);
        const missionBlocks = Math.max(1, (totalCmds - startIdx) + 1);
        const blocksCount = Math.max(contextBlocksRef.current, missionBlocks);

        setContextBlocks(blocksCount);
        contextBlocksRef.current = blocksCount;
        setContextMode('RANGE');
        contextModeRef.current = 'RANGE';

        let captured = "";
        if (xtermRef.current) {
          const buffer = xtermRef.current.buffer.active;
          const lines: string[] = [];
          if (allBlocks.length > 0) {
            const startIndex = Math.max(0, allBlocks.length - blocksCount);
            const activeBlocks = allBlocks.slice(startIndex);
            for (const [s, end] of activeBlocks) {
              for (let i = s; i < end; i++) {
                const line = buffer.getLine(i);
                if (line) lines.push(line.translateToString(true));
              }
            }
          }
          const joined = lines.join('\n').trim();
          if (joined.split('\n').length < 3) {
            // Safety fallback: grab last 150 lines from active buffer
            const total = buffer.length;
            const s = Math.max(0, total - 150);
            const fallbackLines: string[] = [];
            for (let i = s; i < total; i++) {
              const line = buffer.getLine(i);
              if (line) fallbackLines.push(line.translateToString(true));
            }
            captured = fallbackLines.join('\n').trim();
          } else {
            captured = joined;
          }
        }

        const nodeInfo = {
          id: nodeId,
          os: osRef.current,
          prompt: matchedPromptRef.current,
          persona: personaRef.current,
          trust: trustModeRef.current,
          context_mode: 0, // RANGE
          context_cmd: blocksCount,
          context_lines: contextLinesRef.current,
          mission: { active: true, step, goal }
        };

        const missionPrompt = `[AUTONOMOUS MISSION: "${goal}"]\n[MISSION STEP: ${step}/${maxSteps || 10}]${feedback ? `\n[OPERATOR FEEDBACK / GUIDANCE]: ${feedback}` : ''}\n[INTERNAL MISSION SCRATCHPAD / PREVIOUS FINDINGS]:\n${(notes || []).join('\n')}`;

        const aiPayload = {
          type: 'copilot_question',
          question: missionPrompt,
          context_buffer: captured,
          node_info_json: JSON.stringify(nodeInfo),
          session_id: copilotSessionIdRef.current
        };

        console.log(`📡 [Terminal] Dispatching Step ${step} payload to WebSocket:`, aiPayload);
        socketRef.current.send(JSON.stringify(aiPayload));

        window.dispatchEvent(new CustomEvent('copilot-message', {
          detail: { 
            type: 'copilot_question_local', 
            question: `[Mission Step ${step}/${maxSteps || 10}] ${goal}`, 
            nodeId: nodeId, 
            persona: personaRef.current 
          }
        }));
      }
    };
    window.addEventListener('copilot-trigger-mission-step', handleTriggerMissionStep);

    const handlePromptSettled = (e: any) => {
      console.log('✨ [Terminal] handlePromptSettled received (opening phantom input):', e.detail);
      if (e.detail.nodeId === nodeId) {
        setIsCopilotActive(true);
        setShowCopilot(true);
      }
    };
    window.addEventListener('copilot-prompt-settled', handlePromptSettled);

    return () => {
      window.removeEventListener('copilot-external-cancel', handleExternalCancel);
      window.removeEventListener('copilot-run-commands', handleRunCommands);
      window.removeEventListener('copilot-custom-run-commands', handleCustomRunCommands);
      window.removeEventListener('copilot-continue-loop', handleContinueLoop);
      window.removeEventListener('copilot-action-reject', handleActionReject);
      window.removeEventListener('copilot-trigger-mission-step', handleTriggerMissionStep);
      window.removeEventListener('copilot-prompt-settled', handlePromptSettled);
      keyDisposable.dispose();
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

    if (contextMode === 'RANGE' && blockIndices.length > 0) {
      const startIndex = Math.max(0, blockIndices.length - contextBlocks);
      const activeBlocks = blockIndices.slice(startIndex);
      for (const [start, end] of activeBlocks) {
        for (let i = start; i < end; i++) {
          const line = buffer.getLine(i);
          if (line) {
            const text = line.translateToString(true);
            lines.push(text);
          }
        }
      }
    } else {
      for (let i = ctxStart; i < ctxEnd; i++) {
        const line = buffer.getLine(i);
        if (line) {
          const text = line.translateToString(true);
          lines.push(text);
        }
      }
    }
    const res = lines.join('\n').trim();
    return res;
  };
  getCapturedContextRef.current = getCapturedContext;

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
      const hasArgs = args.length > 0;

      if (cmd === '/mission') {
        const allB = getBlockIndices();
        missionStartBlockRef.current = allB.length;
      } else if (cmd === '/cancel' || cmd === '/abort') {
        missionStartBlockRef.current = null;
      }

      // Group 1: State-only commands (Always update and return)
      if (['/os', '/prompt', '/memorize', '/clear'].includes(cmd)) {
        if (cmd === '/os' && hasArgs) { setOs(args); isUserOverridden.current = true; }
        else if (cmd === '/prompt' && hasArgs) { setMatchedPrompt(args); isUserOverridden.current = true; }
        else if (cmd === '/memorize' && hasArgs) setMemories(prev => [...prev, args]);
        else if (cmd === '/clear') {
          setMemories([]);
          setInteractionHistory([]);
        }
        return;
      }

      // Group 2: Toggle/Persona commands (State update OR One-shot override)
      if (['/trust', '/untrust', '/architect', '/engineer'].includes(cmd)) {
        if (!hasArgs) {
          // Toggle/Set state persistently
          if (cmd === '/trust') setTrustMode(true);
          else if (cmd === '/untrust') setTrustMode(false);
          else if (cmd === '/architect') setPersona('architect');
          else if (cmd === '/engineer') setPersona('engineer');
          return;
        } else {
          // One-shot: Override for this message and proceed
          if (cmd === '/trust') { overrideTrust = true; oneShotTrustRef.current = true; }
          else if (cmd === '/untrust') { overrideTrust = false; oneShotTrustRef.current = false; }
          else if (cmd === '/architect') overridePersona = 'architect';
          else if (cmd === '/engineer') overridePersona = 'engineer';
          currentText = args;
        }
      }
    }

    const memoryContext = memories.length > 0 ? `\n\n[MEMORIES]\n${memories.join('\n')}` : "";
    const loopContext = interactionHistory.length > 0 ? `\n\n[PREVIOUS INTERACTIONS]\n${interactionHistory.join('\n---\n')}` : "";

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const modeMap: Record<string, number> = { 'RANGE': 0, 'SINGLE': 1, 'LINES': 2 };
      const nodeInfo = {
        id: nodeId,
        os: os,
        prompt: matchedPrompt,
        persona: overridePersona,
        trust: overrideTrust,
        context_mode: modeMap[contextModeRef.current] ?? 0,
        context_cmd: contextBlocksRef.current,
        context_lines: contextLinesRef.current
      };

      const aiPayload = {
        type: 'copilot_question',
        question: `${currentText}${memoryContext}${loopContext}`,
        context_buffer: capturedContext,
        node_info_json: JSON.stringify(nodeInfo),
        session_id: copilotSessionIdRef.current
      };

      socketRef.current.send(JSON.stringify(aiPayload));

      window.dispatchEvent(new CustomEvent('copilot-message', {
        detail: { type: 'copilot_question_local', question: currentText, nodeId: nodeId, persona: overridePersona }
      }));

      if (onCopilotRequest) onCopilotRequest(currentText, mode);
    }

    setInteractionHistory(prev => [...prev, `Q: ${currentText}`].slice(-5));
    setShowCopilot(false);
    xtermRef.current?.focus();
  };

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
              const modeMap: Record<string, number> = { 'RANGE': 0, 'SINGLE': 1, 'LINES': 2 };
              const cancelMsg = {
                type: 'copilot_action',
                action: 'web_cancel',
                session_id: copilotSessionIdRef.current,
                node_info_json: JSON.stringify({
                  context_mode: modeMap[contextModeRef.current] ?? 0,
                  context_cmd: contextBlocksRef.current,
                  context_lines: contextLinesRef.current
                })
              };
              socketRef.current.send(JSON.stringify(cancelMsg));
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
          missionState={missionState}
        />
      </div>
    </div>
  );
};

export default Terminal;
