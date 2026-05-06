import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api';

interface TerminalProps {
  nodeId: string;
  isActive: boolean;
  workspaceId?: string | null;
}

const Terminal: React.FC<TerminalProps> = ({ nodeId, isActive, workspaceId = null }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

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

    // 2. Intelligent Ctrl+C (Copy if selection, else SIGINT)
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.ctrlKey && e.keyCode === 67) { // Ctrl + C
        if (xterm.hasSelection()) {
          document.execCommand('copy');
          return false;
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

  return (
    <div style={{ width: '100%', height: '100%', background: '#2e3440', display: 'flex' }}>
      <div ref={terminalRef} style={{ flex: 1, minWidth: 0, minHeight: 0 }} />
    </div>
  );
};

export default Terminal;
