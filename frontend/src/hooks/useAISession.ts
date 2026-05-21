import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';
import type { AiThought } from '../types';

export function cleanAiText(text: string): string {
  if (!text) return '';
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\[\/?\w[\w\s#=]*\]/g, '')
    .trim();
}

export function useAISession(workspaceId: string | null) {
  const [thoughts, setThoughts] = useState<AiThought[]>([]);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const currentResponderRef = useRef<'engineer' | 'architect'>('engineer');
  const socketRef = useRef<WebSocket | null>(null);

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
      } else if (payload.type === 'copilot_question_local') {
        // User sent a question from terminal phantom input
        setIsAiProcessing(true);
        if (payload.persona === 'architect' || payload.persona === 'engineer') {
          currentResponderRef.current = payload.persona;
        }
        setThoughts(prev => [...prev, { 
          id: Math.random().toString(36), 
          type: 'text', 
          content: payload.question, 
          timestamp: new Date(), 
          nodeId 
        }]);
      } else if (payload.type === 'copilot_response_json') {
        setIsAiProcessing(false);
        const result = payload.data;
        
        // If no commands, notify terminal to "continue" and reopen input
        const hasCommands = result.commands && result.commands.length > 0;
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
              content: result.guide || last.content
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
  }, [workspaceId]);

  const sendPrompt = useCallback((input: string, sessionId: string) => {
    if (!input.trim() || isAiProcessing) return false;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return false;

    setThoughts(prev => [...prev, { id: Math.random().toString(36), type: 'text', content: input, timestamp: new Date() }]);
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
    setThoughts(prev => prev.map(t => t.id === thoughtId ? { ...t, requires_confirmation: false, status: answer === 'y' ? 'authorized' : 'denied' } : t));
  }, []);

  const abort = useCallback(() => {
    setIsAiProcessing(false);
    socketRef.current?.send(JSON.stringify({ interrupt: true }));
  }, []);

  const clearThoughts = useCallback(() => setThoughts([]), []);

  const toggleThought = useCallback((id: string) => {
    setThoughts(prev => prev.map(t => t.id === id ? { ...t, isExpanded: !t.isExpanded } : t));
  }, []);

  const isConnected = socketRef.current?.readyState === WebSocket.OPEN;

  return { thoughts, isAiProcessing, isConnected, setThoughts, sendPrompt, sendConfirmation, abort, clearThoughts, toggleThought };
}
