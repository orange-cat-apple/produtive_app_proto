import React, { useState, useEffect, createContext } from 'react';

export const CircuitBreakerContext = createContext({
  recordStrike: () => {},
  resetStrike: () => {}
});

const BurnoutCircuitBreaker = ({ children }: { children: React.ReactNode }) => {
  const [abandonedStarts, setAbandonedStarts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0);

  const recordStrike = () => setAbandonedStarts(s => s + 1);
  const resetStrike = () => setAbandonedStarts(0);

  // Trigger lockout if failures hit 3
  useEffect(() => {
    if (abandonedStarts >= 3) {
      setIsLockedOut(true);
      setLockoutTimeLeft(120 * 60); // 2 hours in seconds
      setAbandonedStarts(0); // Reset for next time
    }
  }, [abandonedStarts]);

  // Handle the countdown timer during lockout
  useEffect(() => {
    let interval: any;
    if (isLockedOut && lockoutTimeLeft > 0) {
      interval = setInterval(() => {
        setLockoutTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (lockoutTimeLeft === 0) {
      setIsLockedOut(false);
    }
    return () => clearInterval(interval);
  }, [isLockedOut, lockoutTimeLeft]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  if (isLockedOut) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 animate-in zoom-in duration-500">
          <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">🔋</span>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">Circuit Breaker Tripped</h2>
          
          <p className="text-slate-400 mb-8 leading-relaxed">
            You've struggled to start your tasks a few times in a row. Forcing it right now will only increase your cognitive fatigue. We are pausing your dashboard.
          </p>

          <div className="bg-slate-700/50 rounded-xl p-6 mb-8 border border-slate-600">
            <h3 className="text-xs uppercase tracking-widest text-teal-400 font-bold mb-3">
              Energy-Aware Side Quest
            </h3>
            <p className="text-white font-medium">
              Step away from all screens. Go sit by a window or walk outside without your phone for 15 minutes. 
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <span className="text-slate-500 font-medium text-sm">
              Dashboard unlocks in {formatTime(lockoutTimeLeft)}
            </span>
            
            {/* Locus of Control: Always give them an emergency override */}
            <button 
              onClick={() => setIsLockedOut(false)}
              className="text-xs text-slate-500 underline hover:text-slate-300 transition-colors"
            >
              Emergency Override (I absolutely must work)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CircuitBreakerContext.Provider value={{ recordStrike, resetStrike }}>
      <div className="relative">
        {/* Render the normal dashboard */}
        {children}
      </div>
    </CircuitBreakerContext.Provider>
  );
};

export default BurnoutCircuitBreaker;
