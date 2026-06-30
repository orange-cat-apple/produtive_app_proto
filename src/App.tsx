import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Reorder } from 'motion/react';
import { useUserSession } from './hooks/useUserSession';
import { loginWithGoogle, logout, db } from './lib/firebase';
import { collection, query, where, onSnapshot, addDoc, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { Task } from './types';
import TaskBankruptcyProtocol from './components/TaskBankruptcyProtocol';
import BurnoutCircuitBreaker, { CircuitBreakerContext } from './components/BurnoutCircuitBreaker';
import Vault from './components/Vault';

const SvgMoon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SvgArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const SvgMotion = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 6 A 6 6 0 0 0 14 18" />
    <path d="M10 6 A 6 6 0 0 1 10 18" />
  </svg>
);

const SvgMic = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="22"></line>
  </svg>
);

const SvgCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const SvgCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const SvgClose = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const VAULT_CHORES = [
  "Empty the dishwasher",
  "Wipe your desk down",
  "Fold 3 items of clothing",
  "Take the trash out",
  "Refill your water bottle",
  "Make your bed",
  "Clear your browser tabs",
  "Put away 5 things on the floor",
  "Wash one mug",
  "Tidy your desktop icons"
];

const TIER_RANK: Record<string, number> = { MUST_DO: 0, SHOULD_DO: 1, CAN_WAIT: 2 };

// System notification helper for browser-native alerts
const sendSystemNotification = (title: string, body: string) => {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") new Notification(title, { body });
    });
  }
};

const FlowStateTaskCard = ({ 
  task, 
  toggleMicrostep, 
  completeActiveTask, 
  deferActiveTask, 
  isCompleting, 
  onToggleTimer 
}: { 
  task: any, 
  toggleMicrostep: any, 
  completeActiveTask: any, 
  deferActiveTask: () => void, 
  isCompleting: boolean, 
  onToggleTimer: (taskId: string, currentStatus: string | undefined, currentElapsed: number) => void 
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const { recordStrike, resetStrike } = React.useContext(CircuitBreakerContext);

  useEffect(() => {
    let seconds = task.accumulatedSeconds || 0;
    if (task.timerStatus === 'running' && task.lastStartedAt) {
      seconds += Math.floor((Date.now() - task.lastStartedAt) / 1000);
    }
    setElapsedSeconds(seconds);
  }, [task.id, task.timerStatus, task.lastStartedAt, task.accumulatedSeconds]);

  useEffect(() => {
    if (elapsedSeconds >= 300) {
      resetStrike();
    }
  }, [elapsedSeconds, resetStrike]);

  useEffect(() => {
    const fas = (task.flowActivationMinutes || 15) * 60;
    if (elapsedSeconds === fas && elapsedSeconds > 0) {
      try {
        sendSystemNotification("Flow State Achieved 🌊", "You've hit your focus threshold. You are locked in.");
      } catch (e) {
        // ignore
      }
    }
  }, [elapsedSeconds, task.flowActivationMinutes]);

  useEffect(() => {
    if (task.timerStatus !== 'running') return;
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [task.timerStatus]);

  const onToggleMicrostep = (taskId: string, index: number) => {
    resetStrike();
    toggleMicrostep(taskId, index);
  };

  const toggleTimer = () => {
    if (task.timerStatus === 'running') {
      if (elapsedSeconds < 180 && task.microsteps.every((m: any) => !m.completed)) {
        recordStrike();
      }
    }
    onToggleTimer(task.id, task.timerStatus, elapsedSeconds);
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const flowActivationSeconds = (task.flowActivationMinutes || 15) * 60;
  const isFlowState = elapsedSeconds >= flowActivationSeconds;
  const progressPercentage = Math.min(100, (elapsedSeconds / flowActivationSeconds) * 100);

  return (
    <div className="flex flex-col p-5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-4 items-start">
          <button 
            onClick={completeActiveTask}
            disabled={isCompleting}
            className="w-5 h-5 mt-1 rounded-full border-[1.5px] border-indigo-600 flex items-center justify-center hover:bg-indigo-50 transition-colors group disabled:opacity-50"
          >
            <div className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <SvgCheck />
            </div>
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{task.taskName}</h2>
            <div className="flex items-center gap-2 mt-1">
              {task.bufferedMinutes && task.bufferedMinutes > task.estimatedMinutes ? (
                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-md">
                  Target: {task.estimatedMinutes}m. Buffered: {task.bufferedMinutes}m.
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-md">
                  Target: {task.estimatedMinutes}m.
                </span>
              )}
              {task.isMacroGoalTask && <span className="inline-block px-2 py-0.5 font-medium text-amber-600 bg-amber-50 text-xs rounded-md">Macro Goal</span>}
              {task.urgencyTier === 'MUST_DO' && <span className="inline-block px-2 py-0.5 font-medium text-rose-600 bg-rose-50 text-xs rounded-md">Must Do</span>}
              {task.urgencyTier === 'SHOULD_DO' && <span className="inline-block px-2 py-0.5 font-medium text-blue-600 bg-blue-50 text-xs rounded-md">Should Do</span>}
              {task.deadline && (
                <span className={`inline-block px-2 py-0.5 font-medium text-xs rounded-md ${
                  task.deadlineSource === 'explicit' 
                    ? 'text-indigo-700 bg-indigo-50' 
                    : 'text-slate-500 bg-slate-100'
                }`}>
                  {task.deadlineSource === 'auto_scheduled' ? 'Scheduled: ' : 'Due: '}
                  {task.deadline}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTimer}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
              task.timerStatus === 'running'
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {task.timerStatus === 'running' ? 'Pause' : 'Start Focus'}
          </button>
          <button
            onClick={deferActiveTask}
            className="px-4 py-2 rounded-full text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Defer
          </button>
        </div>
      </div>

      {(task.timerStatus === 'running' || elapsedSeconds > 0) && (
        <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex justify-between items-end mb-2">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {isFlowState ? 'Flow State Achieved' : 'Inducing Flow'}
              </span>
              <span className={`text-2xl font-bold font-mono ${isFlowState ? 'text-indigo-600' : 'text-slate-700'}`}>
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            {!isFlowState && (
              <span className="text-xs font-medium text-slate-400">
                Threshold: {task.flowActivationMinutes || 15} min
              </span>
            )}
          </div>

          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 transition-all duration-1000 ease-linear ${
                isFlowState ? 'bg-indigo-500 animate-pulse' : 'bg-slate-400'
              }`}
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>
      )}

      {task.microsteps && task.microsteps.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Activation Checklist
          </h3>
          {task.microsteps.map((step: any, idx: number) => (
            <label
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                step.completed
                  ? 'bg-slate-50 border-transparent opacity-60'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                checked={step.completed}
                onChange={() => onToggleMicrostep(task.id, idx)}
                className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <span
                className={`text-sm font-medium ${
                  step.completed
                    ? 'text-slate-400 line-through'
                    : 'text-slate-700'
                }`}
              >
                {step.text}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
export default function App() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { user, loading } = useUserSession();
  const [isRecording, setIsRecording] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [brainDump, setBrainDump] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [inlineQuickWin, setInlineQuickWin] = useState<string | null>(null);
  const [showQuickWin, setShowQuickWin] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showShutdown, setShowShutdown] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [shutdownIndex, setShutdownIndex] = useState(0);
  const [shutdownComplete, setShutdownComplete] = useState(false);

  const [estimatedShutdownTime, setEstimatedShutdownTime] = useState<string | null>(null);

  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [deadlineModalTask, setDeadlineModalTask] = useState<Task | null>(null);

  const [consecutiveMisses, setConsecutiveMisses] = useState(0);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [fatigueToast, setFatigueToast] = useState<string | null>(null);


  const [monthlyGoalTitle, setMonthlyGoalTitle] = useState("");
  const [monthlyGoalDescription, setMonthlyGoalDescription] = useState("");
  const [isEditingGoal, setIsEditingGoal] = useState(false);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const activeTask = useMemo(() => tasks.find(t => t.status === 'active' && t.date === selectedDateStr), [tasks, selectedDateStr]);
  
  const upcomingTasks = useMemo(() => {
    return tasks
      .filter(t => t.status === 'upcoming' && t.date === selectedDateStr)
      .sort((a, b) => {
        const rankA = TIER_RANK[a.urgencyTier as string] ?? 3;
        const rankB = TIER_RANK[b.urgencyTier as string] ?? 3;
        
        if (rankA !== rankB) return rankA - rankB;
        
        // Secondary sort: Deadline
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return 0;
      });
  }, [tasks, selectedDateStr]);

  const deferredTasks = tasks.filter(t => t.status === 'deferred' && t.date === selectedDateStr);
  const completedTasks = tasks.filter(t => t.status === 'completed' && t.date === selectedDateStr);
  const shutdownTasks = tasks.filter(t => t.status !== 'completed' && t.date === selectedDateStr);

  

  const triggerFatigueToast = () => {
    setFatigueToast(`Take a breath. Notifications paused. 🔋\n\nIt looks like your day isn't going exactly as planned, and that is completely okay. You might be experiencing executive fatigue.\n\nI have muted all reminders for the next 2 hours. Take a guilt-free break to recharge. The tasks will be here whenever you are ready.`);
  };

  const velocity = useMemo(() => {
    const tasksForDate = tasks.filter(t => t.date === selectedDateStr);
    const totalTasks = tasksForDate.length;
    const completedTasksCount = tasksForDate.filter(t => t.status === 'completed').length;
    return totalTasks === 0 ? 0 : Math.round((completedTasksCount / totalTasks) * 100);
  }, [tasks, selectedDateStr]);

  const { totalTasksCount, completedTasksCount } = useMemo(() => {
    const tasksForDate = tasks.filter(t => t.date === selectedDateStr);
    const total = tasksForDate.length;
    const completed = tasksForDate.filter(t => t.status === 'completed').length;
    return { totalTasksCount: total, completedTasksCount: completed };
  }, [tasks, selectedDateStr]);

  useEffect(() => {
    if (user?.uid && !loading) {
      const hasSeen = localStorage.getItem(`kinetic_onboarding_${user.uid}`);
      if (!hasSeen) setShowOnboarding(true);
    }
  }, [user, loading]);

  useEffect(() => {
    if (!user?.uid) {
      setTasks([]);
      return;
    }

    const tasksQuery = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
      where('date', '==', selectedDateStr)
    );

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const fetchedTasks: Task[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id
        } as Task;
      });
      setTasks(fetchedTasks);
    });

    const fetchMonthlyGoal = async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.monthlyGoalTitle) setMonthlyGoalTitle(data.monthlyGoalTitle);
          if (data.monthlyGoalDescription) setMonthlyGoalDescription(data.monthlyGoalDescription);
        }
      } catch (error) {
        console.error('Error fetching monthly goal:', error);
      }
    };
    
    fetchMonthlyGoal();

    return () => unsubscribe();
  }, [user, selectedDateStr]);

  useEffect(() => {
    const watcher = setInterval(() => {
      if (notificationsMuted && mutedUntil && Date.now() > mutedUntil) {
        setNotificationsMuted(false);
        setMutedUntil(null);
      }
    }, 60 * 1000);
    return () => clearInterval(watcher);
  }, [notificationsMuted, mutedUntil]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const active = tasks.find(t => t.status === 'active' && t.date === selectedDateStr);
      if (document.hidden && active) {
        const nextMicrostep = active.microsteps.find(m => !m.completed);
        document.title = nextMicrostep ? `(${active.microsteps.filter(m => m.completed).length + 1}) ${nextMicrostep.text}` : `[Active] ${active.taskName}`;
      } else {
        document.title = "Kinetic";
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const checkDeadlines = setInterval(() => {
      const now = new Date();
      const timeInMinutes = now.getHours() * 60 + now.getMinutes();

      const upcomingWithDeadlines = tasks.filter(t => (t.status === 'active' || t.status === 'upcoming') && t.date === selectedDateStr && t.deadline);
      const overdueCount = upcomingWithDeadlines.reduce((count, task) => {
        if (!task.deadline) return count;
        const [deadlineHour, deadlineMin] = task.deadline.split(':').map(Number);
        const deadlineInMinutes = deadlineHour * 60 + deadlineMin;
        return deadlineInMinutes < timeInMinutes ? count + 1 : count;
      }, 0);

      if (!notificationsMuted && overdueCount >= 4) {
        sendSystemNotification(
          "Executive Fatigue Detected 🔋",
          "You have 4 overdue tasks. Let's triage these guilt-free and protect your energy."
        );
        triggerFatigueToast();
        setNotificationsMuted(true);
        setMutedUntil(Date.now() + 2 * 60 * 60 * 1000);
        setShowShutdown(true);
        setShutdownIndex(0);
        setShutdownComplete(false);
      }

      for (const task of upcomingWithDeadlines) {
        if (!task.deadline) continue;
        const [deadlineHour, deadlineMin] = task.deadline.split(':').map(Number);
        const deadlineInMinutes = deadlineHour * 60 + deadlineMin;
        
        if (deadlineInMinutes - timeInMinutes <= 15 && deadlineInMinutes - timeInMinutes > 0) {
           if (!showDeadlineModal && deadlineModalTask?.id !== task.id) {
             setDeadlineModalTask(task);
             setShowDeadlineModal(true);
             try {
               const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
               const oscillator = audioCtx.createOscillator();
               const gainNode = audioCtx.createGain();
               oscillator.connect(gainNode);
               gainNode.connect(audioCtx.destination);
               oscillator.type = 'sine';
               oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
               gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
               oscillator.start();
               gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 1.5);
               oscillator.stop(audioCtx.currentTime + 1.5);
             } catch (e) {
               console.error(e);
             }
           }
        }
      }
    }, 10000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(checkDeadlines);
      document.title = "Kinetic";
    };
  }, [tasks, selectedDateStr, showDeadlineModal, deadlineModalTask, notificationsMuted, triggerFatigueToast]);
  
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const brainDumpRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendarPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleReorderTasks = (newUpcoming: Task[]) => {
    setTasks(prev => {
      const otherTasks = prev.filter(t => t.status !== 'upcoming' || t.date !== selectedDateStr);
      return [...otherTasks, ...newUpcoming];
    });
  };

  const handleSaveMonthlyGoal = async () => {
    if (!user?.uid) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { monthlyGoalTitle, monthlyGoalDescription }, { merge: true });
    } catch (error) {
      console.error('Failed to save monthly goal', user.uid, error);
    }
    setIsEditingGoal(false);
  };

  const handleCapture = async () => {
    if (!user?.uid || !brainDump.trim() || isProcessing) return;
    setIsProcessing(true);
    // Prompt for notification permission early so flow/fatigue alerts can appear
    try { sendSystemNotification('Kinetic', 'Enabling focus and fatigue notifications'); } catch (e) {}
    try {
      const todayStr = selectedDateStr;
      const localTime = new Date().toLocaleTimeString();
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const timestampedText = `[SUBMITTED_AT: ${hours}:${mins}] ${brainDump}`;
      
      const res = await fetch('https://kinetic-api-dt12.onrender.com/api/brain-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_input: timestampedText, todayStr, localTime, macroGoal: monthlyGoalTitle })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to process task');
      
      if (data.routing_intent === 'NON_ACTIONABLE' || !data.tasks_added || data.tasks_added.length === 0) {
        setBrainDump('');
        setIsProcessing(false);
        return;
      }

      if (data.estimated_shutdown_time) setEstimatedShutdownTime(data.estimated_shutdown_time);

      let hasActiveTask = !!activeTask;
      const newTasks: Task[] = data.tasks_added.map((task: any) => {
        let assignedStatus: Task['status'] = 'upcoming';
        if (!hasActiveTask) {
          assignedStatus = 'active';
          hasActiveTask = true;
        }

        return {
          id: task.id || Math.random().toString(36).substring(7),
          userId: user.uid, // Explicitly stamped
          taskName: task.task_title || 'New Task',
          estimatedMinutes: task.original_duration_minutes || task.calibrated_duration_minutes || 15,
          bufferedMinutes: task.calibrated_duration_minutes || 15,
          flowActivationMinutes: task.flow_activation_minutes,
          urgencyTier: task.urgency_tier,
          tierDowngraded: task.tier_downgraded || false,
          isMacroGoalTask: task.is_macro_goal_task || false,
          deadline: task.deadline_time || undefined,
          deadlineSource: task.deadline_source,
          microsteps: task.microsteps ? task.microsteps.map((m: any) => ({
            text: typeof m === 'string' ? m : m.instruction,
            completed: false,
            estimatedMinutes: m.estimated_minutes || 5
          })) : [],
          softTimer: task.soft_timer,
          category: task.destination === 'DOPAMINE_BANK' ? 'quick' : 'focus',
          status: assignedStatus,
          date: task.scheduled_date || selectedDateStr
        };
      });

      await Promise.all(newTasks.map(async (task) => {
        try {
          const { id, ...taskDataToSave } = task;
          await addDoc(collection(db, 'tasks'), {
            ...taskDataToSave,
            userId: user.uid
          });
        } catch (err) {
          console.error('Failed to create task', task.id, err);
        }
      }));

      setBrainDump('');
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'An error occurred while processing your task.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitializeWorkspace = async () => {
    if (!user?.uid) return;
    localStorage.setItem(`kinetic_onboarding_${user.uid}`, 'true');
    setShowOnboarding(false);

    if (tasks.length === 0) {
      const ghostTasks = [
        { taskName: "Welcome to Kinetic. Click 'Start Focus' to lock in.", status: 'active' as Task['status'], estimatedMinutes: 15, urgencyTier: 'MUST_DO' as Task['urgencyTier'] },
        { taskName: "Messy brain dump: Use the capture box above to dump your thoughts.", status: 'upcoming' as Task['status'], estimatedMinutes: 5, urgencyTier: 'SHOULD_DO' as Task['urgencyTier'] },
        { taskName: "Not doing this today? Click 'Defer' to push it away.", status: 'upcoming' as Task['status'], estimatedMinutes: 10, urgencyTier: 'CAN_WAIT' as Task['urgencyTier'] }
      ];

      await Promise.all(ghostTasks.map(task =>
        addDoc(collection(db, 'tasks'), {
          ...task,
          userId: user.uid,
          date: selectedDateStr,
          microsteps: [],
          timerStatus: 'paused',
          accumulatedSeconds: 0
        })
      ));
    }
  };

  const handleQuickWin = async () => {
    setShowQuickWin(true);
    setInlineQuickWin("Consulting Dopamine Bank...");
    try {
      const res = await fetch("https://kinetic-api-dt12.onrender.com/api/quick-win", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          time_of_day: new Date().toLocaleTimeString(),
          context_clues: "Desktop interface"
        })
      });
      if (!res.ok) throw new Error("Failed to generate quick win");
      const data = await res.json();
      setInlineQuickWin(`${data.title} (${data.estimated_minutes}m) - ${data.rationale}`);
    } catch (e) {
      setInlineQuickWin(VAULT_CHORES[Math.floor(Math.random() * VAULT_CHORES.length)]);
    }
  };

  const [isCompleting, setIsCompleting] = useState(false);
  const [vaultedCount, setVaultedCount] = useState(0);

  const handleBankruptcyComplete = (survivingTasks: Task[], newVaultedCount: number) => {
    setVaultedCount(prev => prev + newVaultedCount);
    // Note: Protocol handles Firestore writes; onSnapshot will sync back.
  };

  const completeTask = async (taskId: string) => {
    if (!user?.uid) return;
    if (!taskId) return;

    // Optimistic local update for inline completion controls.
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' as Task['status'] } : t));

    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: 'completed' as Task['status'], timerStatus: 'paused' as any });
    } catch (err) {
      console.error('Failed to update task (complete)', taskId, err);
    }
  };

  const handleToggleTimer = async (taskId: string, currentStatus: string | undefined, currentElapsed: number) => {
    if (!user?.uid || !taskId) return;
    const isStarting = currentStatus !== 'running';
    const payload = isStarting
      ? { timerStatus: 'running', lastStartedAt: Date.now(), accumulatedSeconds: currentElapsed }
      : { timerStatus: 'paused', accumulatedSeconds: currentElapsed };
    try {
      await updateDoc(doc(db, 'tasks', taskId), payload);
    } catch (err) {
      console.error('Timer toggle failed:', err);
    }
  };

  const completeActiveTask = async () => {
    if (!user?.uid) return;
    if (isCompleting || !activeTask) return;
    
    const activeTaskId = activeTask.id;
    if (!activeTaskId) return;

    setIsCompleting(true);
    setConsecutiveMisses(0);
    
    try {
      await completeTask(activeTaskId);
      
      // Optimistic transition
      setTimeout(() => {
        setTasks(prev => {
          const mappedOnce = prev.map(t => t.id === activeTaskId ? { ...t, status: 'completed' as Task['status'] } : t);
          const nextUpcomingIndex = mappedOnce.findIndex(t => t.status === 'upcoming' && t.date === selectedDateStr);
          return mappedOnce.map((t, idx) => idx === nextUpcomingIndex ? { ...t, status: 'active' as Task['status'] } : t);
        });
        setIsCompleting(false);
      }, 150);
    } catch (err) {
      console.error('Failed to resolve active task completion', activeTaskId, err);
      setIsCompleting(false);
    }
  };

  const toggleMicrostep = async (taskId: string, stepIndex: number) => {
    if (!user?.uid) return;
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedMicrosteps = [...task.microsteps];
    updatedMicrosteps[stepIndex] = { 
      ...updatedMicrosteps[stepIndex], 
      completed: !updatedMicrosteps[stepIndex].completed 
    };

    // Optimistic local update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, microsteps: updatedMicrosteps } : t));

    try {
      await updateDoc(doc(db, 'tasks', taskId), { microsteps: updatedMicrosteps });
    } catch (err) {
      console.error("Failed to update task microsteps", taskId, err);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Voice not supported.');

    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setBrainDump(prev => `${prev}${prev ? ' ' : ''}${transcript.trim()}`);
    };
    recognition.start();
  };

  const deferActiveTask = async () => {
    if (!user?.uid) return;
    if (!activeTask?.id) return;

    setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: 'deferred' as Task['status'] } : t));

    try {
      await updateDoc(doc(db, 'tasks', activeTask.id), { status: 'deferred' as Task['status'], timerStatus: 'paused' as any });
    } catch (err) {
      console.error('Failed to update task (defer)', activeTask.id, err);
    }
  };

  const restoreDeferredTask = async (taskId: string) => {
    if (!user?.uid || !taskId) return;
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: 'upcoming' as Task['status'] });
    } catch (err) {
      console.error('Failed to restore deferred task', taskId, err);
    }
  };

  const promoteToActive = async (taskId: string) => {
    if (!user?.uid) return;
    if (!taskId) return;

    const activeTaskToDemote = tasks.find((task) => task.status === 'active' && task.date === selectedDateStr);

    setTasks(prev => prev.map((task) => {
      if (task.id === activeTaskToDemote?.id) return { ...task, status: 'upcoming' as Task['status'] };
      if (task.id === taskId) return { ...task, status: 'active' as Task['status'] };
      return task;
    }));

    try {
      if (activeTaskToDemote?.id) {
        await updateDoc(doc(db, 'tasks', activeTaskToDemote.id), { status: 'upcoming' as Task['status'] });
      }
      await updateDoc(doc(db, 'tasks', taskId), { status: 'active' as Task['status'] });
    } catch (err) {
      console.error('Failed to update task (promote)', taskId, err);
    }
  };

  const upgradeTier = async (taskId: string, newTier: 'MUST_DO' | 'SHOULD_DO' | 'CAN_WAIT') => {
    if (!user?.uid) return;
    if (!taskId) return;

    try {
      await updateDoc(doc(db, 'tasks', taskId), { urgencyTier: newTier, tierDowngraded: false });
    } catch (err) { 
      console.error('Failed to update task (upgrade tier)', taskId, err);
    }
  };

  const handleShutdownAction = async (action: 'defer' | 'delegate' | 'delete') => {
    if (!user?.uid) return;
    
    const currentTask = shutdownTasks[shutdownIndex];

    if (currentTask?.id) {
      try {
        if (action === 'defer') {
          await updateDoc(doc(db, 'tasks', currentTask.id), { status: 'deferred' as Task['status'] });
        }
      } catch (err) {
        console.error('Failed to update task during shutdown', currentTask.id, err);
      }
    }

    if (shutdownIndex < shutdownTasks.length - 1) {
      setShutdownIndex(prev => prev + 1);
    } else {
      setShutdownComplete(true);
    }
  };

  const currentDayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(selectedDate);
  const dateLabel = isSameDay(selectedDate, new Date()) ? `Today, ${currentDayDate}` : currentDayDate;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F8F7] text-slate-600">Initializing...</div>;
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F8F7] p-4">
      <div className="max-w-md w-full bg-white rounded-[24px] p-10 text-center shadow-sm">
        <h1 className="text-[32px] font-bold text-[#1A1A1A] mb-4">Kinetic</h1>
        <button onClick={loginWithGoogle} className="px-6 py-3 rounded-full bg-[#7F77DD] text-white font-semibold">Sign in with Google</button>
      </div>
    </div>
  );

  return (
    <BurnoutCircuitBreaker>
      <div className="min-h-screen flex w-full" style={{ backgroundColor: '#F8F8F7' }}>
      <aside className="w-[260px] h-screen fixed left-0 top-0 bg-[#FFFFFF] border-r border-[#F0F0EE] p-6 flex flex-col z-10 overflow-y-auto">
        <div className="flex items-center gap-2 mb-8">
          <SvgMotion />
          <span className="font-medium text-[15px] text-[#1A1A1A]">Kinetic</span>
        </div>

        <div className="flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#A0A0A0] uppercase">Velocity</span>
              <span className="text-[13px] font-medium text-[#2D2D2D]">{velocity}%</span>
            </div>
            <div className="h-[4px] w-full bg-[#F0F0EE] rounded-full overflow-hidden">
              <div className="h-full bg-[#7F77DD]" style={{ width: `${velocity}%` }}></div>
            </div>
            <span className="text-[11px] text-[#A0A0A0]">{completedTasksCount} of {totalTasksCount} tasks today</span>
          </div>

          <div className="bg-[#FFFFFF] shadow-sm border border-slate-100 rounded-[12px] p-4 flex flex-col gap-2">
            <span className="text-[11px] font-medium text-[#A0A0A0] uppercase">Macro Goal</span>
            {isEditingGoal ? (
              <div className="flex flex-col gap-2">
                <input value={monthlyGoalTitle} onChange={(e) => setMonthlyGoalTitle(e.target.value)} className="text-[14px] outline-none border-b border-[#7F77DD]" />
                <textarea value={monthlyGoalDescription} onChange={(e) => setMonthlyGoalDescription(e.target.value)} className="text-[13px] outline-none border rounded p-1 min-h-[60px]" />
                <button onClick={handleSaveMonthlyGoal} className="bg-[#7F77DD] text-white text-[12px] py-1 rounded">Save</button>
              </div>
            ) : (
              <div onClick={() => setIsEditingGoal(true)} className="cursor-pointer">
                <span className={`text-[14px] font-medium block ${monthlyGoalTitle ? 'text-[#2D2D2D]' : 'text-gray-400'}`}>
                  {monthlyGoalTitle || 'Set your Macro Goal for the month...'}
                </span>
                <span className="text-[13px] text-[#2D2D2D] opacity-80 block mt-1">{monthlyGoalDescription || 'Define the one big outcome that makes this month a success. Click to edit.'}</span>
              </div>
            )}
          </div>
          
          <button onClick={handleQuickWin} className="w-full h-[36px] bg-[#F0EEF8] rounded-[8px] flex items-center justify-between px-3 text-[#7F77DD]">
            <span className="text-[12px] font-medium">Quick win</span>
            <SvgArrow />
          </button>
          {showQuickWin && inlineQuickWin && (
            <div className="bg-[#FFFFFF] border border-slate-100 rounded-[12px] p-3 flex flex-col gap-3">
              <span className="text-[14px] text-[#2D2D2D]">{inlineQuickWin}</span>
              <button onClick={() => setShowQuickWin(false)} className="bg-[#7F77DD] text-white text-[12px] py-1.5 rounded">Dismiss</button>
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <button onClick={() => setShowVault(true)} className="flex items-center gap-2 text-[13px] text-[#A0A0A0] hover:text-[#2D2D2D]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            The Vault
          </button>
          <button onClick={() => { setShowShutdown(true); setShutdownIndex(0); setShutdownComplete(false); }} className="flex items-center gap-2 text-[13px] text-[#A0A0A0] hover:text-[#2D2D2D]">
            <SvgMoon />
            End session {estimatedShutdownTime ? `(${estimatedShutdownTime})` : ''}
          </button>
          {user && (
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] flex items-center justify-between gap-3">
              <span className="text-[12px] text-[#6B7280] truncate">{user.email}</span>
              <button onClick={logout} className="text-[12px] font-medium text-[#7F77DD]">Logout</button>
            </div>
          )}
        </div>
      </aside>

      <main className="ml-[260px] flex-1 p-10 max-w-3xl">
        <div className="mb-8">
          <div className="text-[12px] font-medium text-[#A0A0A0] uppercase tracking-wider mb-2">{dateLabel}</div>
          <h1 className="text-[28px] text-[#1A1A1A] font-normal tracking-tight">What are we executing today?</h1>
        </div>

        <div className="bg-[#FFFFFF] shadow-sm border border-slate-100 rounded-[12px] p-4 flex flex-col gap-3 mb-10 relative">
          <textarea
            ref={brainDumpRef}
            value={brainDump}
            onChange={(e) => setBrainDump(e.target.value)}
            placeholder="What's on your mind? Capture it messy..."
            className="w-full min-h-[80px] outline-none text-base"
            disabled={isProcessing}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3 text-[#A0A0A0]" ref={calendarRef}>
              <button onClick={handleVoiceInput} className={`p-1 rounded ${isRecording ? 'text-rose-600 animate-pulse' : ''}`}><SvgMic /></button>
              <button onClick={() => setShowCalendarPopover(!showCalendarPopover)} className="p-1"><SvgCalendar /></button>

              {showCalendarPopover && (
                <>
                  <div className="fixed inset-0 z-[50]" onClick={() => setShowCalendarPopover(false)} />
                  <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white shadow-xl rounded-xl w-[320px] z-[60] border border-slate-100 p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-medium text-[13px]">{format(currentMonth, 'MMMM yyyy')}</span>
                      <div className="flex gap-2">
                        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>←</button>
                        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>→</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {(() => {
                        const monthStart = startOfMonth(currentMonth);
                        const monthEnd = endOfMonth(currentMonth);
                        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
                        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
                        const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

                        return calendarDays.map((day) => {
                          const isCurrentMonth = isSameMonth(day, currentMonth);
                          const isSelectedDay = format(day, 'yyyy-MM-dd') === selectedDateStr;

                          return (
                            <button
                              key={format(day, 'yyyy-MM-dd')}
                              onClick={() => setSelectedDate(day)}
                              className={`w-8 h-8 rounded-full text-[12px] ${
                                isSelectedDay
                                  ? 'bg-[#EEEDFE] text-[#7F77DD]'
                                  : isCurrentMonth
                                    ? 'text-[#2D2D2D] hover:bg-slate-100'
                                    : 'text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {format(day, 'd')}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button onClick={handleCapture} disabled={isProcessing || !brainDump.trim()} className="bg-[#7F77DD] text-white text-[13px] px-4 py-1.5 rounded-full disabled:opacity-50">
              {isProcessing ? 'Capturing...' : 'Capture'}
            </button>
          </div>
        </div>

        {vaultedCount > 0 && (
          <div className="mb-6 p-4 bg-teal-50 text-teal-800 rounded-xl border border-teal-200">
            <span className="font-bold">Reset complete.</span> {vaultedCount} tasks were vaulted.
          </div>
        )}

        <div className="text-[11px] font-medium text-[#A0A0A0] uppercase tracking-wider mb-4">Current</div>

        <div className="flex flex-col gap-3">
          {activeTask ? (
            <FlowStateTaskCard 
              key={activeTask.id}
              task={activeTask} 
              toggleMicrostep={toggleMicrostep} 
              completeActiveTask={completeActiveTask}
              deferActiveTask={deferActiveTask}
              isCompleting={isCompleting}
              onToggleTimer={handleToggleTimer}
            />
          ) : (
            <div className="border border-dashed border-[#E0E0DC] rounded-[12px] p-5 text-center text-[#A0A0A0] text-[14px]">Capture to begin focus</div>
          )}

          {upcomingTasks.length > 0 && (
            <Reorder.Group axis="y" values={upcomingTasks} onReorder={handleReorderTasks} className="flex flex-col gap-3">
              {upcomingTasks.map(task => (
                <Reorder.Item key={task.id} value={task} className="bg-white border border-slate-100 rounded-[12px] p-4 flex items-center justify-between cursor-grab">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        completeTask(task.id);
                      }}
                      className="w-5 h-5 rounded-full border border-[#E0E0DC] flex items-center justify-center hover:bg-indigo-50 transition-colors"
                      aria-label={`Mark ${task.taskName} complete`}
                    >
                      <SvgCheck />
                    </button>
                    <span className="text-[14px] text-[#2D2D2D]">{task.taskName}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          promoteToActive(task.id);
                        }}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                        aria-label={`Focus on ${task.taskName}`}
                      >
                        ↑ Focus
                      </button>
                      <span className="text-[12px] text-[#A0A0A0]">{task.estimatedMinutes}m</span>
                      {task.deadline && <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{task.deadline}</span>}
                      {task.urgencyTier === 'MUST_DO' && <span className="text-[11px] font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded">Must Do</span>}
                    </div>
                    {task.tierDowngraded && (
                      <span className="text-[10px] text-slate-400 italic cursor-pointer hover:text-indigo-600" onClick={() => upgradeTier(task.id, 'MUST_DO')}>Gemini downgraded this — Promote?</span>
                    )}
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}

          {deferredTasks.map(task => (
            <div key={task.id} className="bg-white/60 border border-slate-100 rounded-[12px] p-4 flex items-center justify-between opacity-80">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium text-[#A0A0A0] uppercase">Deferred</span>
                <span className="text-[#A0A0A0] text-[14px]">{task.taskName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => restoreDeferredTask(task.id)}
                  className="text-slate-400 hover:text-indigo-600 font-medium text-[11px]"
                  aria-label={`Restore ${task.taskName}`}
                >
                  ⟲ Restore
                </button>
              </div>
            </div>
          ))}

          {completedTasks.length > 0 && (
            <>
              <div className="text-[11px] font-medium text-[#A0A0A0] uppercase mt-2 mb-1">Completed</div>
              {completedTasks.map(task => (
                <div key={task.id} className="bg-white/40 border border-slate-100 rounded-[12px] p-4 flex items-center justify-between opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#F0EEF8] border border-[#7F77DD] flex items-center justify-center"><SvgCheck /></div>
                    <span className="text-[14px] text-[#2D2D2D] line-through">{task.taskName}</span>
                  </div>
                  <span className="text-[12px] text-[#A0A0A0]">{task.estimatedMinutes}m</span>
                </div>
              ))}
            </>
          )}
          
          <TaskBankruptcyProtocol 
            tasks={tasks.filter(t => t.date === selectedDateStr && t.status !== 'completed')} 
            onBankruptcyComplete={handleBankruptcyComplete} 
          />
        </div>
      </main>

      {showVault && (
        <Vault 
          tasks={tasks}
          closeVault={() => setShowVault(false)}
          restoreTask={async (id) => {
            if (!user?.uid || !id) return;
            try {
              await updateDoc(doc(db, 'tasks', id), { status: 'upcoming' });
            } catch (err) {
              console.error('Failed to update task (restore)', id, err);
            }
          }}
          deleteTask={async (id) => {
            // Usually delete the doc or status: 'deleted'
          }}
        />
      )}

      {showDeadlineModal && deadlineModalTask && (
        <div className="fixed inset-0 z-[100] bg-rose-500/10 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-2xl border-2 border-rose-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Deadline Alert</h2>
            <p className="text-center text-slate-600 mb-8">"{deadlineModalTask.taskName}" is due at {deadlineModalTask.deadline}.</p>
            <div className="flex gap-4">
              <button onClick={() => setShowDeadlineModal(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">Dismiss</button>
              <button onClick={() => setShowDeadlineModal(false)} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold">Start Now</button>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 z-[200] bg-[#F8F8F7]/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white max-w-2xl w-full p-10 rounded-3xl shadow-2xl border border-slate-100 flex flex-col gap-8">
            <div>
              <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">Welcome to Kinetic.</h2>
              <p className="text-slate-500 text-lg">This isn't a to-do list. It's an executive function engine designed to prevent burnout.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100">
                <div className="text-indigo-600 font-bold mb-2 flex items-center gap-2"><SvgMotion/> Quick Win</div>
                <p className="text-sm text-slate-600">Need momentum? Generate a 5-minute frictionless task to get dopamine flowing.</p>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-slate-700 font-bold mb-2 flex items-center gap-2"><SvgClose/> The Vault</div>
                <p className="text-sm text-slate-600">Overwhelmed? Send non-essential tasks here to instantly clear your visual field.</p>
              </div>
              <div className="p-5 bg-slate-800 rounded-2xl border border-slate-700">
                <div className="text-white font-bold mb-2 flex items-center gap-2"><SvgMoon/> End Session</div>
                <p className="text-sm text-slate-300">Done for the day? Triage what's left and officially log off guilt-free.</p>
              </div>
            </div>

            <button 
              onClick={handleInitializeWorkspace} 
              className="w-full py-4 bg-[#7F77DD] hover:bg-[#6b62c7] text-white font-bold rounded-xl text-lg transition-colors"
            >
              Initialize Workspace
            </button>
          </div>
        </div>
      )}

      {showShutdown && (
        <div className="fixed inset-0 z-50 bg-[#F8F8F7]/90 backdrop-blur-md flex items-center justify-center">
          <button onClick={() => setShowShutdown(false)} className="absolute top-6 right-6"><SvgClose /></button>
          <div className="max-w-md w-full text-center">
            {shutdownComplete || shutdownTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-6">
                <SvgMoon />
                <h2 className="text-[28px] font-normal text-[#1A1A1A]">Session completed.<br/>Rest is productivity.</h2>
                <button onClick={() => setShowShutdown(false)} className="bg-white shadow px-6 py-2 rounded-full">Close</button>
              </div>
            ) : (
              <div className="w-full flex flex-col gap-8">
                <span className="text-[11px] text-[#A0A0A0] uppercase">Triage ({shutdownIndex + 1}/{shutdownTasks.length})</span>
                <h2 className="text-[28px] text-[#1A1A1A]">{shutdownTasks[shutdownIndex].taskName}</h2>
                <div className="flex flex-col gap-3">
                  <button onClick={() => handleShutdownAction('defer')} className="w-full py-4 rounded-[12px] bg-[#7F77DD] text-white">Defer to tomorrow</button>
                  <button onClick={() => handleShutdownAction('delete')} className="w-full py-4 rounded-[12px] bg-white text-red-500">Drop task</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      

      {fatigueToast && (
        <div className="fixed bottom-6 right-6 max-w-sm bg-white rounded-xl shadow-lg border border-slate-200 p-4 z-50">
          <button onClick={() => setFatigueToast(null)} className="absolute top-2 right-2"><SvgClose /></button>
          <div className="text-[14px] text-slate-700 whitespace-pre-wrap">{fatigueToast}</div>
        </div>
      )}
    </div>
    </BurnoutCircuitBreaker>
  );
}
