export interface TaskStep {
  text: string;
  completed: boolean;
  estimatedMinutes?: number;
}

export interface Task {
  id: string;
  taskName: string;
  estimatedMinutes: number;
  bufferedMinutes: number;
  flowActivationMinutes?: number;
  urgencyTier?: 'MUST_DO' | 'SHOULD_DO' | 'CAN_WAIT';
  tierDowngraded?: boolean;
  microsteps: TaskStep[];
  isMacroGoalTask?: boolean;
  category: 'focus' | 'quick' | 'deferred';
  status: 'active' | 'upcoming' | 'deferred' | 'completed' | 'vaulted';
  date?: string;
  deadline?: string;
  deadlineSource?: 'explicit' | 'auto_scheduled';
  softTimer?: {
    calibratedDurationMinutes: number;
    overtimeMode: string;
  };
}
