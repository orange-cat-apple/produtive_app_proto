import React from 'react';
import { Task } from '../types';

export default function Vault({ tasks, restoreTask, deleteTask, closeVault }: { tasks: Task[], restoreTask: (id: string) => void, deleteTask: (id: string) => void, closeVault: () => void }) {
  const vaultedTasks = tasks.filter(t => t.status === 'vaulted' || t.status === 'deferred'); // Assuming vaulted tasks are deferred or we add a new status

  return (
    <div className="fixed inset-0 bg-[#F8F8F7] z-50 overflow-y-auto no-scrollbar">
      <div className="max-w-3xl mx-auto py-12 px-8">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-normal text-[#1A1A1A] tracking-tight mb-2">The Vault</h1>
            <p className="text-[#A0A0A0] text-[14px]">
              Tasks that are safely out of sight. You can restore them when you have the energy, or delete them if they are no longer relevant.
            </p>
          </div>
          <button 
            onClick={closeVault}
            className="px-4 py-2 text-[13px] font-medium text-[#2D2D2D] bg-white border border-[#E0E0DC] rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-[#E0E0DC] shadow-sm overflow-hidden">
          {vaultedTasks.length === 0 ? (
            <div className="p-12 text-center text-[#A0A0A0] text-[14px]">
              The vault is empty. Keep up the momentum!
            </div>
          ) : (
            <div className="divide-y divide-[#E0E0DC]">
              {vaultedTasks.map(task => (
                <div key={task.id} className="p-5 flex items-center justify-between gap-4 group hover:bg-[#FAFAFA] transition-colors">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-medium text-[#2D2D2D]">{task.taskName}</span>
                    <span className="text-[12px] text-[#A0A0A0]">Added to vault</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => restoreTask(task.id)}
                      className="px-3 py-1.5 text-[12px] font-medium text-[#7F77DD] bg-[#EEEDFE] rounded-md hover:bg-[#7F77DD] hover:text-white transition-colors"
                    >
                      Restore
                    </button>
                    <button 
                      onClick={() => deleteTask(task.id)}
                      className="px-3 py-1.5 text-[12px] font-medium text-rose-600 bg-rose-50 rounded-md hover:bg-rose-600 hover:text-white transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
