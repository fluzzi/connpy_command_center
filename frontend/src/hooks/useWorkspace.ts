import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Tab } from '../types';

export function useWorkspace(_tabs: Tab[], setTabs: React.Dispatch<React.SetStateAction<Tab[]>>) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return;
    }

    const ws = new WebSocket(api.getWorkspaceWsUrl(workspaceId));
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if ((data.type === 'tabs_sync' || data.type === 'update_tabs') && Array.isArray(data.tabs)) {
          setTabs(prev => {
            return data.tabs.map((tab: Tab) => {
              const existing = prev.find(t => t.id === tab.id || t.nodeId === tab.nodeId);
              return existing ? { ...existing, ...tab } : tab;
            });
          });
        }
      } catch { /* ignore */ }
    };

    return () => {
      ws.close();
    };
  }, [workspaceId, setTabs]);

  const pushTabsUpdate = (newTabs: Tab[]) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'update_tabs', tabs: newTabs }));
    }
  };

  const updateTabsAndPush = (newTabs: Tab[]) => {
    setTabs(newTabs);
    if (workspaceId) pushTabsUpdate(newTabs);
  };

  const toggleWorkspace = (currentTabs: Tab[], setThoughts: () => void) => {
    if (workspaceId) {
      setWorkspaceId(null);
      setTabs([]);
      setThoughts();
    } else {
      const input = window.prompt('Join an existing session ID, or leave blank to host a new session:');
      if (input === null) return;
      setThoughts();
      if (input.trim() === '') {
        const newId = 'WS-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        setWorkspaceId(newId);
        setTimeout(() => pushTabsUpdate(currentTabs), 500);
      } else {
        setTabs([]);
        setWorkspaceId(input.trim().toUpperCase());
      }
    }
  };

  return { workspaceId, socketRef, updateTabsAndPush, toggleWorkspace };
}
