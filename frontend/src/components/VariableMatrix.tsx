import React, { useMemo, useState } from 'react';
import { usePlaybookStore } from '../store/usePlaybookStore';
import { Database, Plus } from 'lucide-react';

export const VariableMatrix: React.FC = () => {
  const tasks = usePlaybookStore(state => state.tasks);
  const storedVariables = usePlaybookStore(state => state.variables);
  const updateVariable = usePlaybookStore(state => state.updateVariable);
  const [manualNodes, setManualNodes] = useState<string[]>([]);
  const [newTarget, setNewTarget] = useState('');

  // Extract unique variables and unique nodes from all tasks, stored variables, and manual entries
  const { variables, nodes } = useMemo(() => {
    const varSet = new Set<string>();
    const nodeSet = new Set<string>();

    tasks.forEach(task => {
      // Extract nodes
      task.nodes.forEach(n => nodeSet.add(n));

      // Extract variables from commands
      task.commands.forEach(cmd => {
        const matches = cmd.match(/\{([^}]+)\}/g);
        if (matches) {
          matches.forEach(m => {
            const cleanVar = m.replace(/[{}]/g, '');
            varSet.add(cleanVar);
          });
        }
      });
    });

    // Also include any targets that already have stored variables (useful for imported playbooks)
    Object.keys(storedVariables).forEach(target => {
      if (target !== '__global__') {
        nodeSet.add(target);
      }
    });

    // Include manually added nodes
    manualNodes.forEach(n => nodeSet.add(n));

    return {
      variables: Array.from(varSet).sort(),
      nodes: Array.from(nodeSet).sort()
    };
  }, [tasks, storedVariables, manualNodes]);

  if (variables.length === 0) {
    return null;
  }

  const rows = ['__global__', ...nodes];
  const ROW_H = 'h-[44px]';
  const HEADER_H = 'h-[42px]';

  return (
    <div className="mt-8 border-t border-[#4c566a]/50 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <Database size={16} className="text-[#b48ead]" />
        <h3 className="text-base font-black text-[#d8dee9] uppercase tracking-[0.15em]">Variable Matrix</h3>
      </div>

      <div className="flex border border-[#4c566a]/50 rounded-lg shadow-md overflow-hidden bg-[#2e3440]">
        {/* Fixed Target Column */}
        <div className="shrink-0 border-r border-[#4c566a]/40">
          <div className={`${HEADER_H} px-4 flex items-center bg-[#3b4252] border-b border-[#4c566a]/50`}>
            <span className="text-[#81a1c1] font-black text-xs uppercase tracking-widest">Target</span>
          </div>
          {rows.map((row) => (
            <div key={row} className={`${ROW_H} px-4 flex items-center border-b border-[#4c566a]/20`}>
              {row === '__global__' ? (
                <span className="text-[#b48ead] font-mono text-xs">Defaults</span>
              ) : (
                <span className="text-[#88c0d0] font-mono text-xs">{row}</span>
              )}
            </div>
          ))}
          {/* Add Manual Target Row (Fixed Column) */}
          <div className={`${ROW_H} px-4 flex items-center border-b border-[#4c566a]/20 bg-[#3b4252]/30`}>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const target = newTarget.trim();
                if (target && !nodes.includes(target) && target !== '__global__') {
                  setManualNodes([...manualNodes, target]);
                }
                setNewTarget('');
              }}
              className="flex items-center w-full"
            >
              <input 
                type="text"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder="Add manual target..."
                className="bg-transparent border-none outline-none w-full min-w-0 text-xs font-mono text-[#eceff4] placeholder:text-[#d8dee9]/30"
              />
              <button type="submit" disabled={!newTarget.trim()} className="text-[#a3be8c] opacity-70 hover:opacity-100 disabled:opacity-30">
                <Plus size={14} />
              </button>
            </form>
          </div>
        </div>

        {/* Scrollable Variable Columns */}
        <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
          <div className="inline-flex min-w-full">
            {variables.map(v => (
              <div key={v} className="min-w-[160px] flex-1">
                <div className={`${HEADER_H} px-4 flex items-center bg-[#3b4252]/80 border-b border-[#4c566a]/50 border-r border-r-[#4c566a]/20`}>
                  <span className="bg-[#a3be8c]/20 text-[#a3be8c] font-black text-xs uppercase tracking-widest px-1.5 py-0.5 rounded border border-[#a3be8c]/30 font-mono">&#123;{v}&#125;</span>
                </div>
                {rows.map((row) => {
                  const val = storedVariables[row]?.[v] || '';
                  return (
                    <div key={row} className={`${ROW_H} px-4 flex items-center border-b border-[#4c566a]/20 border-r border-r-[#4c566a]/20`}>
                      <input
                        type="text"
                        size={1}
                        value={val}
                        onChange={(e) => updateVariable(row, v, e.target.value)}
                        placeholder="<undefined>"
                        className="bg-transparent border-b border-transparent focus:border-[#81a1c1] focus:bg-[#3b4252]/50 outline-none w-full min-w-0 text-xs font-mono text-[#eceff4] px-2 py-1 transition-all rounded-sm placeholder-[#d8dee9]/20"
                      />
                    </div>
                  );
                })}
                {/* Empty cells for the Add Target row */}
                <div className={`${ROW_H} px-4 flex items-center border-b border-[#4c566a]/20 border-r border-r-[#4c566a]/20 bg-[#3b4252]/10`}>
                  <div className="w-full text-center text-[#d8dee9]/10 text-xs font-mono">-</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[#d8dee9]/40 mt-2 uppercase tracking-widest font-bold">
        Values entered here will be injected during playbook execution (not saved to inventory).
      </p>
    </div>
  );
};
