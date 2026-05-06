export interface Tab {
  id: string;
  nodeId: string;
  type?: 'terminal' | 'cloud_explorer' | 'cloud_inspect' | 'cloud_flowlog' | 'playbook_editor' | 'playbook_result' | 'topology' | 'cloud_graph';
  customName?: string;
  meta?: Record<string, string>;
}

export interface AiThought {
  id: string;
  type: 'status' | 'debug' | 'text' | 'confirm' | 'tool' | 'engineer' | 'architect' | 'important';
  content: string;
  timestamp: Date;
  requires_confirmation?: boolean;
  tool_name?: string;
  isExpanded?: boolean;
  status?: 'authorized' | 'denied';
}
