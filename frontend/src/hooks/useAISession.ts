import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';
import type { AiThought, CopilotMissionState } from '../types';

export function cleanAiText(text: string): string {
  if (!text) return '';
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\[\/?\w[\w\s#=]*\]/g, '')
    .trim();
}

export function useAISession(workspaceId: string | null, sessionToken: string | null = null) {
  const [thoughts, setThoughts] = useState<AiThought[]>([]);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [missionState, setMissionState] = useState<CopilotMissionState | null>(null);
  const missionStateRef = useRef<CopilotMissionState | null>(null);
  missionStateRef.current = missionState;

  const currentResponderRef = useRef<'engineer' | 'architect'>('engineer');
  const socketRef = useRef<WebSocket | null>(null);

  const [aiSessionId, setAiSessionId] = useState<string>(workspaceId || api.getActiveSessionId());

  useEffect(() => {
    setAiSessionId(workspaceId || api.getActiveSessionId());
  }, [workspaceId]);

  useEffect(() => {
    // Expose dispatcher for Terminal Copilot events (bridged from Terminal WebSocket)
    (window as any).terminalCopilotDispatcher = (payload: any) => {
      const nodeId = payload.nodeId;

      if (payload.type === 'copilot_stream_chunk') {
        setThoughts(prev => {
          const last = prev[prev.length - 1];
          const isAi = (last?.type === 'engineer' || last?.type === 'architect') && last.nodeId === nodeId;
          if (isAi) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, content: (last.content || '') + payload.chunk };
            return updated;
          }
          return [...prev, { id: Math.random().toString(36), type: currentResponderRef.current, content: payload.chunk, timestamp: new Date(), nodeId }];
        });
      } else if (payload.type === 'copilot_question_local' || payload.type === 'copilot_question_remote') {
        // User sent a question from terminal phantom input (local or broadcasted remote)
        setIsAiProcessing(true);
        if (payload.persona === 'architect' || payload.persona === 'engineer') {
          currentResponderRef.current = payload.persona;
        }

        const q = (payload.question || '').trim();
        if (q.startsWith('/mission')) {
          const goal = q.replace(/^\/mission\s*/, '').trim() || 'General investigation';
          const newMission: CopilotMissionState = {
            active: true,
            goal,
            step: 1,
            maxSteps: 10,
            scratchpadNotes: [],
            nodeId,
            status: 'running'
          };
          setMissionState(newMission);
          missionStateRef.current = newMission;
        } else if (q === '/cancel' || q === '/abort') {
          if (missionStateRef.current?.active) {
            const aborted = { ...missionStateRef.current, active: false, status: 'aborted' as const };
            setMissionState(aborted);
            missionStateRef.current = aborted;
          }
        }

        setThoughts(prev => [
          ...prev.map(t => (t.nodeId === nodeId && t.type === 'confirm' && !t.status) ? { ...t, requires_confirmation: false, status: 'denied' as const } : t),
          { 
            id: Math.random().toString(36), 
            type: 'text', 
            content: payload.question, 
            timestamp: new Date(), 
            nodeId 
          }
        ]);
      } else if (payload.type === 'copilot_response_json') {
        setIsAiProcessing(false);
        const result = payload.data;
        console.log('Phase 2 Hook: AI Copilot Response Received ->', result);
        
        const hasCommands = result.commands && result.commands.length > 0;
        const currentMission = missionStateRef.current;

        if (currentMission?.active) {
          if (result.notes) {
            currentMission.scratchpadNotes.push(result.notes);
          }
          if (hasCommands) {
            const updatedMission = { ...currentMission, status: 'waiting_approval' as const };
            setMissionState(updatedMission);
            missionStateRef.current = updatedMission;
          } else {
            // Mission completed because AI has no further commands
            const completedMission = { ...currentMission, active: false, status: 'completed' as const };
            setMissionState(completedMission);
            missionStateRef.current = completedMission;
          }
        }

        // If no commands, notify terminal to "continue" and reopen input
        if (!hasCommands) {
            window.dispatchEvent(new CustomEvent('copilot-continue-loop', { 
                detail: { nodeId: nodeId } 
            }));
        }

        setThoughts(prev => {
          // Optimization: If the last thought was a streamed guide for this node, 
          // we update it with the final guide text, but keep it as a normal AI message.
          const last = prev[prev.length - 1];
          const isLastStreamed = last && last.nodeId === nodeId && (last.type === 'engineer' || last.type === 'architect');

          if (isLastStreamed) {
            const updated = [...prev];
            // Update the guide message
            updated[updated.length - 1] = { 
              ...last, 
              content: result.guide || last.content,
              notes: result.notes || last.notes
            };
            
            // If there are commands, append the Action Card as a separate NEW thought
            if (hasCommands) {
              const actionCard: AiThought = {
                id: Math.random().toString(36),
                type: 'confirm',
                content: JSON.stringify({ ...result, guide: undefined }), // Remove guide from card data as it's shown above
                timestamp: new Date(),
                status: payload.auto_authorized ? 'authorized' : undefined,
                nodeId
              };
              updated.push(actionCard);
            }
            return updated;
          }

          // Fallback: Add as new thoughts
          const newThoughts = [...prev];
          if (result.guide) {
            newThoughts.push({
              id: Math.random().toString(36),
              type: (currentResponderRef.current || 'engineer') as any,
              content: result.guide,
              notes: result.notes,
              timestamp: new Date(),
              nodeId
            });
          }
          if (hasCommands) {
            newThoughts.push({ 
              id: Math.random().toString(36), 
              type: 'confirm', 
              content: JSON.stringify({ ...result, guide: undefined }),
              timestamp: new Date(),
              status: payload.auto_authorized ? 'authorized' : undefined,
              nodeId
            });
          }
          return newThoughts;
        });
      } else if (payload.type === 'copilot_prompt') {
         setIsAiProcessing(false);
         const currentMission = missionStateRef.current;
         console.log('🤖 [useAISession] copilot_prompt received:', {
           nodeId,
           missionActive: currentMission?.active,
           missionStep: currentMission?.step,
           missionStatus: currentMission?.status,
           payload
         });

         // Mark executing thoughts as authorized when prompt settles
         setThoughts(prev => prev.map(t => (t.nodeId === nodeId && t.status === 'executing') ? { ...t, status: 'authorized' } : t));

         if (currentMission?.active && currentMission.status !== 'aborted') {
           if (currentMission.step < currentMission.maxSteps) {
             const nextStep = currentMission.step + 1;
             const updatedMission = { ...currentMission, step: nextStep, status: 'running' as const };
             setMissionState(updatedMission);
             missionStateRef.current = updatedMission;

             console.log(`🚀 [useAISession] Advancing Autonomous Mission to Step ${nextStep}/${currentMission.maxSteps}`);

             // Dispatch next step trigger to Terminal
             window.dispatchEvent(new CustomEvent('copilot-trigger-mission-step', {
               detail: {
                 nodeId,
                 step: nextStep,
                 maxSteps: currentMission.maxSteps,
                 goal: currentMission.goal,
                 notes: currentMission.scratchpadNotes
               }
             }));
           } else {
             console.log('🏁 [useAISession] Mission completed (max steps reached)');
             const completedMission = { ...currentMission, active: false, status: 'completed' as const };
             setMissionState(completedMission);
             missionStateRef.current = completedMission;
             window.dispatchEvent(new CustomEvent('copilot-prompt-settled', {
               detail: { nodeId }
             }));
           }
         } else {
           console.log('ℹ️ [useAISession] Normal mode prompt settled, notifying terminal');
           // Normal mode (non-mission): signal terminal that device prompt has settled
           window.dispatchEvent(new CustomEvent('copilot-prompt-settled', {
             detail: { nodeId }
           }));
         }
      }
    };

    if (socketRef.current) {
      socketRef.current.close();
    }

    const connectAi = () => {
      const url = api.getAiWsUrl(workspaceId);
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onerror = () => {
        setIsAiProcessing(false);
      };

      socket.onclose = () => {
        setIsAiProcessing(false);
        socketRef.current = null;
        setTimeout(connectAi, 3000);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.responder === 'engineer' || data.responder === 'architect') {
          currentResponderRef.current = data.responder;
        }

        if (data.is_operator) {
          setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'text', content: data.content, timestamp: new Date() }]);
          return;
        }

        if (data.confirmation_resolved) {
          // Another user in the shared session resolved the confirmation — dismiss all pending locally.
          // Covers both: global AI (requires_confirmation=true) and terminal copilot action cards (type='confirm', no status)
          const resolvedStatus = data.answer === 'y' ? 'authorized' : 'denied';
          setThoughts(prev => prev.map(t => {
            if (t.requires_confirmation || (t.type === 'confirm' && !t.status)) {
              return { ...t, requires_confirmation: false, status: resolvedStatus };
            }
            return t;
          }));
          return;
        }

        if (data.requires_confirmation) {
          setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'confirm', content: cleanAiText(data.status_update), timestamp: new Date(), requires_confirmation: true }]);
          return;
        }

        if (data.important_message) {
          setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'important', content: cleanAiText(data.important_message), timestamp: new Date() }]);
        }

        if (data.status_update) {
          if (data.status_update.toLowerCase().includes('is thinking')) return;
          if (data.status_update.startsWith('__RESPONDER__:') && data.status_update.includes(':')) {
            const responder = data.status_update.split(':')[1] as 'engineer' | 'architect';
            if (responder === 'engineer' || responder === 'architect') currentResponderRef.current = responder;
            return;
          }
          setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'status', content: cleanAiText(data.status_update), timestamp: new Date() }]);
        }

        if (data.debug_message) {
          const rawText = data.debug_message;
          if (rawText.includes('Decision:')) {
            const match = rawText.match(/Decision:\s*([a-zA-Z0-9_]+)/);
            setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'tool', content: cleanAiText(rawText), timestamp: new Date(), tool_name: match ? match[1].toUpperCase() : 'TASK', isExpanded: false }]);
          } else if (rawText.includes('Observation:')) {
            setThoughts(prev => {
              const updated = [...prev];
              const cleanObs = cleanAiText(rawText);
              let foundTool = false;
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].type === 'tool') {
                  if (!updated[i].content.includes(cleanObs)) updated[i].content += '\n\n' + cleanObs;
                  foundTool = true;
                  break;
                }
              }
              if (!foundTool) updated.push({ id: Math.random().toString(36), type: 'debug', content: cleanObs, timestamp: new Date(), isExpanded: false });
              return updated;
            });
          } else {
            setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'debug', content: cleanAiText(rawText), timestamp: new Date(), isExpanded: false }]);
          }
        }

        if (data.text_chunk) {
          setThoughts(prev => {
            const targetType = data.responder || currentResponderRef.current || 'engineer';
            if (prev.length === 0) return [{ id: Math.random().toString(36), type: targetType, content: data.text_chunk, timestamp: new Date() }];
            const last = prev[prev.length - 1];
            const isLastAi = last.type === 'engineer' || last.type === 'architect';
            const isCurrentAi = targetType === 'engineer' || targetType === 'architect';
            if (isLastAi && isCurrentAi) {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: (last.content || '') + data.text_chunk, type: targetType };
              return updated;
            }
            return [...prev, { id: Math.random().toString(36), type: targetType, content: data.text_chunk, timestamp: new Date() }];
          });
        }

        if (data.is_final) {
          setIsAiProcessing(false);
          if (data.full_result?.responder) {
            const responder = data.full_result.responder.toLowerCase() as 'engineer' | 'architect';
            currentResponderRef.current = responder;
            setThoughts(prev => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].type === 'engineer' || updated[i].type === 'architect') { updated[i].type = responder; break; }
              }
              return updated;
            });
          }
        }
      };
    };

    connectAi();

    return () => {
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
    };
  }, [aiSessionId, workspaceId, sessionToken]);

  const sendPrompt = useCallback((input: string, sessionId: string, displayText?: string) => {
    if (!input.trim() || isAiProcessing) return false;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return false;

    const visualText = displayText || input;
    setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'text', content: visualText, timestamp: new Date() }]);
    setIsAiProcessing(true);
    try {
      socketRef.current.send(JSON.stringify({ input_text: input, session_id: sessionId, debug: true }));
      return true;
    } catch {
      setIsAiProcessing(false);
      return false;
    }
  }, [isAiProcessing]);

  const sendConfirmation = useCallback((thoughtId: string, answer: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ confirmation_answer: answer }));
    }
    const statusMap: Record<string, 'authorized' | 'denied' | 'executing'> = {
      'y': 'authorized',
      'authorized': 'authorized',
      'executing': 'executing',
      'n': 'denied',
      'denied': 'denied'
    };
    const newStatus = statusMap[answer] || (answer === 'y' ? 'authorized' : 'denied');
    if (newStatus === 'executing') {
      setMissionState(prev => {
        if (!prev) return null;
        const updated = { ...prev, status: 'executing' as const };
        missionStateRef.current = updated;
        return updated;
      });
    } else if (newStatus === 'denied') {
      setMissionState(prev => {
        if (!prev) return null;
        const updated = { ...prev, status: 'running' as const };
        missionStateRef.current = updated;
        return updated;
      });
    }
    setThoughts(prev => prev.map(t => (t.id === thoughtId || (t.type === 'confirm' && !t.status && (answer === 'denied' || answer === 'n'))) ? { ...t, requires_confirmation: false, status: newStatus } : t));
  }, []);

  const abort = useCallback(() => {
    setIsAiProcessing(false);
    socketRef.current?.send(JSON.stringify({ interrupt: true }));
  }, []);

  const abortMission = useCallback(() => {
    const current = missionStateRef.current;
    if (current) {
      const aborted = { ...current, active: false, status: 'aborted' as const };
      setMissionState(aborted);
      missionStateRef.current = aborted;
      if (current.nodeId) {
        window.dispatchEvent(new CustomEvent('copilot-external-cancel', {
          detail: { nodeId: current.nodeId }
        }));
      }
    }
  }, []);

  const clearThoughts = useCallback(() => setThoughts([]), []);

  const toggleThought = useCallback((id: string) => {
    setThoughts(prev => prev.map(t => t.id === id ? { ...t, isExpanded: !t.isExpanded } : t));
  }, []);

  const startNewSession = useCallback(() => {
    if (workspaceId) return;
    localStorage.removeItem('active_ai_session');
    const newSessionId = api.getActiveSessionId();
    setAiSessionId(newSessionId);
    setThoughts([]);
    setIsAiProcessing(false);
    setMissionState(null);
    missionStateRef.current = null;
  }, [workspaceId]);

  const isConnected = socketRef.current?.readyState === WebSocket.OPEN;

  return { 
    thoughts, 
    isAiProcessing, 
    isConnected, 
    missionState,
    setThoughts, 
    setIsAiProcessing, 
    sendPrompt, 
    sendConfirmation, 
    abort, 
    clearThoughts, 
    toggleThought, 
    startNewSession,
    abortMission
  };
}

