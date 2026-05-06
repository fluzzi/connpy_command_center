import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type TaskAction = 'run' | 'test';

export interface PlaybookTask {
  id: string;
  name: string;
  action: TaskAction;
  nodes: string[];
  commands: string[];
  expected?: string[];
  
  // Advanced options (folder is intentionally omitted)
  timeout?: number;
  parallel?: number;
  prompt?: string;
}

export interface PlaybookState {
  name: string;
  tasks: PlaybookTask[];
  variables: Record<string, Record<string, string>>; // target -> variable -> value
  
  // Actions
  updatePlaybookName: (name: string) => void;
  addTask: (task?: Partial<PlaybookTask>) => void;
  updateTask: (id: string, updates: Partial<PlaybookTask>) => void;
  removeTask: (id: string) => void;
  reorderTasks: (startIndex: number, endIndex: number) => void;
  updateVariable: (target: string, key: string, value: string) => void;
  getPlaybookJSON: () => any; 
  loadPlaybookFromJSON: (data: any) => void; // Used for importing YAML
}

export const usePlaybookStore = create<PlaybookState>((set, get) => ({
  name: 'My New Playbook',
  tasks: [],
  variables: {},

  updatePlaybookName: (name) => set({ name }),

  addTask: (taskParams) => set((state) => {
    const newTask: PlaybookTask = {
      id: uuidv4(),
      name: taskParams?.name || 'New Task',
      action: taskParams?.action || 'run',
      nodes: taskParams?.nodes || [],
      commands: taskParams?.commands || [],
      ...taskParams,
    };
    return { tasks: [...state.tasks, newTask] };
  }),

  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === id ? { ...task, ...updates } : task
    ),
  })),

  removeTask: (id) => set((state) => ({
    tasks: state.tasks.filter((task) => task.id !== id),
  })),

  reorderTasks: (startIndex, endIndex) => set((state) => {
    const newTasks = Array.from(state.tasks);
    const [reorderedItem] = newTasks.splice(startIndex, 1);
    newTasks.splice(endIndex, 0, reorderedItem);
    return { tasks: newTasks };
  }),

  updateVariable: (target, key, value) => set((state) => {
    const targetVars = { ...(state.variables[target] || {}) };
    if (value) {
        targetVars[key] = value;
    } else {
        delete targetVars[key]; 
    }
    
    const newVariables = { ...state.variables, [target]: targetVars };
    if (Object.keys(targetVars).length === 0) {
        delete newVariables[target];
    }
    
    return { variables: newVariables };
  }),

  getPlaybookJSON: () => {
    const { name, tasks, variables } = get();
    const cleanTasks = tasks.map((t) => {
      const taskObj: any = {
        name: t.name,
        action: t.action,
        nodes: t.nodes,
        commands: t.commands,
      };
      
      if (t.action === 'test' && t.expected && t.expected.length > 0) {
        taskObj.expected = t.expected;
      }
      
      // Inject advanced options
      if (t.timeout !== undefined) taskObj.timeout = t.timeout;
      if (t.parallel !== undefined) taskObj.parallel = t.parallel;
      if (t.prompt !== undefined && t.prompt !== '') taskObj.prompt = t.prompt;

      if (Object.keys(variables).length > 0) {
          taskObj.variables = variables;
      }
      return taskObj;
    });

    return {
      playbook: name,
      tasks: cleanTasks,
    };
  },

  loadPlaybookFromJSON: (data: any) => {
    if (!data || typeof data !== 'object') return;

    const newTasks: PlaybookTask[] = [];
    let newVariables: Record<string, Record<string, string>> = {};

    if (Array.isArray(data.tasks)) {
      data.tasks.forEach((t: any) => {
        if (!t.name || !t.nodes || !t.commands) return; 

        const action: TaskAction = t.action === 'test' ? 'test' : 'run';
        
        const task: PlaybookTask = {
          id: uuidv4(),
          name: t.name,
          action: action,
          nodes: Array.isArray(t.nodes) ? t.nodes : [t.nodes],
          commands: Array.isArray(t.commands) ? t.commands : [t.commands],
        };

        if (action === 'test' && t.expected) {
          task.expected = Array.isArray(t.expected) ? t.expected : [t.expected];
        }

        if (t.timeout !== undefined) task.timeout = parseInt(t.timeout, 10);
        if (t.parallel !== undefined) task.parallel = parseInt(t.parallel, 10);
        if (t.prompt !== undefined) task.prompt = String(t.prompt);
        // Folder option is explicitly ignored to force web UI rendering

        if (t.variables && typeof t.variables === 'object') {
           newVariables = { ...newVariables, ...t.variables };
        }

        newTasks.push(task);
      });
    }

    set({
      name: data.playbook || 'Imported Playbook',
      tasks: newTasks,
      variables: newVariables
    });
  }
}));
