import React, { useState } from 'react';

const TaskBankruptcyProtocol = ({ tasks, onBankruptcyComplete }: { tasks: any[], onBankruptcyComplete: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Determine which tasks survive based on Cognitive Load and Priority
  const survivingTasks = tasks
    .filter(t => t.cognitive_load === 'HIGH' || t.priority_score > 80 || t.category === 'focus') // Adding fallback logic for existing mock tasks
    .slice(0, 5); // Keep a maximum of 5 tasks
  
  const vaultedTaskCount = tasks.length - survivingTasks.length;

  const handleExecute = async () => {
    setIsExecuting(true);
    
    // Simulate database batch update (Archiving the rest)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Pass the surviving tasks back up to the main state to re-render the clean list
    onBankruptcyComplete(survivingTasks, vaultedTaskCount);
    setIsExecuting(false);
    setIsOpen(false);
  };

  if (tasks.length < 15) return null; // Only show if they are actually overwhelmed

  return (
    <>
      <div className="mt-8 pt-6 border-t border-rose-100 text-center">
        <p className="text-sm text-slate-500 mb-3">
          List bankruptcy detected. Is the backlog causing task paralysis?
        </p>
        <button
          onClick={() => setIsOpen(true)}
          className="px-6 py-2.5 bg-rose-50 text-rose-600 font-bold text-sm rounded-lg border border-rose-200 hover:bg-rose-100 hover:border-rose-300 transition-all shadow-sm"
        >
          Declare Task Bankruptcy
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
            
            <div className="p-8 text-center flex-grow">
              {!isExecuting ? (
                <>
                  <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">🚨</span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-3">Declare Bankruptcy?</h2>
                  <p className="text-slate-600 leading-relaxed mb-6">
                    You have <span className="font-bold text-rose-500">{tasks.length} tasks</span> sitting in your queue. We will rescue your top {survivingTasks.length} highest-priority items and securely archive the remaining {vaultedTaskCount} into your Vault. 
                  </p>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-500 italic mb-6">
                    "Sometimes the most productive thing you can do is start over. Zero guilt."
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 animate-in fade-in duration-500">
                  <div className="w-16 h-16 rounded-full border-4 border-rose-100 border-t-rose-500 animate-spin mb-6"></div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Executing Reset...</h3>
                  <p className="text-slate-500 font-medium">Securing {survivingTasks.length} tasks. Vaulting the rest.</p>
                </div>
              )}
            </div>

            {!isExecuting && (
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleExecute}
                  className="flex-1 py-3 text-sm font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 shadow-md transition-colors"
                >
                  Wipe the Slate Clean
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default TaskBankruptcyProtocol;
