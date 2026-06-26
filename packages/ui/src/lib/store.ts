import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  timestamp: string;
}

export interface ToolCall {
  callId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  isError?: boolean;
  durationMs?: number;
  status: 'running' | 'complete' | 'error';
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface SessionState {
  sessionId: string | null;
  status: string;
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCall>;
  todos: TodoItem[];
  isAgentWorking: boolean;
  browserScreenshot: string | null;
  browserUrl: string;

  // Actions
  setSessionId: (id: string | null) => void;
  setStatus: (status: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  updateLastMessage: (content: string) => void;
  setToolCall: (call: ToolCall) => void;
  updateToolCall: (callId: string, update: Partial<ToolCall>) => void;
  setTodos: (todos: TodoItem[]) => void;
  setAgentWorking: (working: boolean) => void;
  setBrowserScreenshot: (screenshot: string | null, url?: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: 'idle',
  messages: [],
  toolCalls: new Map(),
  todos: [],
  isAgentWorking: false,
  browserScreenshot: null,
  browserUrl: '',

  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx]!.role === 'assistant') {
        messages[lastIdx] = { ...messages[lastIdx]!, content, streaming: false };
      }
      return { messages };
    }),

  setToolCall: (call) =>
    set((state) => {
      const toolCalls = new Map(state.toolCalls);
      toolCalls.set(call.callId, call);
      return { toolCalls };
    }),

  updateToolCall: (callId, update) =>
    set((state) => {
      const toolCalls = new Map(state.toolCalls);
      const existing = toolCalls.get(callId);
      if (existing) {
        toolCalls.set(callId, { ...existing, ...update });
      }
      return { toolCalls };
    }),

  setTodos: (todos) => set({ todos }),
  setAgentWorking: (working) => set({ isAgentWorking: working }),

  setBrowserScreenshot: (screenshot, url) =>
    set((state) => ({
      browserScreenshot: screenshot,
      browserUrl: url ?? state.browserUrl,
    })),

  clearSession: () =>
    set({
      sessionId: null,
      status: 'idle',
      messages: [],
      toolCalls: new Map(),
      todos: [],
      isAgentWorking: false,
      browserScreenshot: null,
      browserUrl: '',
    }),
}));
