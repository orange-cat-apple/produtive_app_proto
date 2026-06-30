import React from 'react';
import { Power, Target, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn("w-64 border-r border-zinc-800 p-6 flex flex-col gap-8 bg-[#09090b]", className)}>
      <div>
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-4 font-mono">Behavioral Dashboard</h3>
        <div className="bg-black/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full rotate-[-90deg]">
              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-zinc-800" />
              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-zinc-300" strokeDasharray="251.2" strokeDashoffset="40" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-zinc-200">84</span>
              <span className="text-[8px] text-zinc-500 uppercase tracking-tighter font-mono">Velocity</span>
            </div>
          </div>
          <div className="mt-4 w-full">
            <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-mono">
              <span>CURRENT SPRINT</span>
              <span>80%</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-zinc-300 w-[80%]"></div>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-2">
        <button className="flex items-center gap-3 px-4 py-2 bg-zinc-800/50 text-zinc-200 border border-zinc-700/50 rounded-lg text-sm">
          <Target className="w-4 h-4" />
          Execution Hub
        </button>
        <button className="flex items-center gap-3 px-4 py-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
          <Zap className="w-4 h-4" />
          Cognitive Journal
        </button>
      </nav>

      <div className="mt-auto">
        <button className="w-full flex items-center gap-3 px-4 py-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
          <Power className="w-4 h-4" />
          <span>Start shutdown ritual</span>
        </button>
      </div>
    </aside>
  );
}
