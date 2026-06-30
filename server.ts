import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import dotenv from "dotenv";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TODAY = new Date().toISOString().split("T")[0];

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use(cors({ origin: ["http://localhost:5173", "http://localhost:3000"] }));

  const dataStore = {
    userProfile: {
      archetype: null as string | null,
      taskVelocityScore: 0.72,
      velocityDelta: "+8%",
    },
    dailyPlanner: [] as any[],
    dopamineBank: [
      {
        id: uuid(),
        task_title: "Wipe the desk",
        cognitive_load: "MICRO",
        calibrated_duration_minutes: 5,
        destination: "DOPAMINE_BANK",
        completed: false,
        scheduled_date: TODAY,
      },
      {
        id: uuid(),
        task_title: "Drink a full glass of water",
        cognitive_load: "MICRO",
        calibrated_duration_minutes: 2,
        destination: "DOPAMINE_BANK",
        completed: false,
        scheduled_date: TODAY,
      },
      {
        id: uuid(),
        task_title: "Do 10 slow neck rolls",
        cognitive_load: "MICRO",
        calibrated_duration_minutes: 3,
        destination: "DOPAMINE_BANK",
        completed: false,
        scheduled_date: TODAY,
      },
    ],
  };

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  app.post("/api/brain-dump", async (req, res) => {
    try {
      // 1. VERIFY PAYLOAD EXTRACTION: macroGoal is successfully destructured here.
      const { raw_input, todayStr, localTime, macroGoal } = req.body;
      if (!raw_input) {
        return res.status(400).json({ error: "MISSING_FIELD", field: "raw_input" });
      }

      // 2. TIGHTEN THE PROMPT INJECTION: Conditional context line and updated Rule 5
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: raw_input,
        config: {
          systemInstruction: `You are the core intelligence engine for Kinetic, an execution assistant built to mitigate executive dysfunction.

Current Context:
Local Time: ${localTime || new Date().toLocaleTimeString()}${
macroGoal && macroGoal.trim() !== "" ? `\nUser's Monthly Macro Goal: ${macroGoal}` : ""
}

Analyze the input text and perform these transformations:

    CRITICAL: You must extract EVERY distinct task or intention mentioned by the user. Do not summarize multiple actions into a single task. If the user mentions 5 different activities, you MUST return a JSON array containing exactly 5 separate task objects. Never drop or ignore tasks.

    Extract & Classify: Extract distinct tasks. Label Cognitive Load as HIGH, MEDIUM, or MICRO.

    Reality-Calibrated Scheduling: Multiply HIGH load task durations by 1.45. EXCEPTION: If a hard deadline or strict time constraint is stated, cap the time and do not apply the buffer.

    Flow Activation: Determine flow_activation_minutes (10-25 mins) for HIGH/MEDIUM tasks.

    Microsteps: Decompose HIGH/MEDIUM tasks into 3 to 4 sequential, untimed 'microsteps' to break task paralysis.

    Macro Goal Injection: If a Monthly Macro Goal is provided in the context, prioritize alignment by generating exactly ONE additional task (30-60 mins) that specifically advances it, unless they explicitly stated they are too busy today.

    Soft Timer Assignment: For each task, create a soft_timer object with calibrated_duration_minutes (equal to the task's calibrated_duration_minutes) and overtime_mode. Set overtime_mode to "GENTLE" for MICRO or MEDIUM cognitive load tasks, and "STRICT" for HIGH cognitive load tasks.

    Dynamic Shutdown Time: Based on the Local Time and the total duration of all tasks, calculate a logical estimated_shutdown_time (e.g., "22:30") when the user should trigger their Zeigarnik Shutdown Ritual.

    Context Profile: Deduce a 1-sentence user_context_profile summarizing their current lifestyle/constraints.
    
    Urgency Tier Classification: Evaluate the time-sensitivity and consequences of each task based on the user's input, and assign one of the following urgency_tier tags:
    MUST_DO: Use this for hard, external deadlines (e.g., "due at 5 PM", "flight at 8 AM"), critical financial actions (paying bills), or tasks the user explicitly states they cannot fail at.
    SHOULD_DO: Use this for important tasks that maintain the user's life or career but do not have a catastrophic consequence if delayed by 24 hours (e.g., "study for next week's exam", "do laundry").
    CAN_WAIT: Use this for hobbies, vague goals, or tasks with no timeline (e.g., "read a book", "organize desktop").
    
    The Cap Rule: You may assign MUST_DO to a maximum of 2 tasks per session, regardless of how many tasks appear urgent. If more than 2 tasks qualify: Rank them by consequence severity and proximity of deadline. Assign MUST_DO to the top 2. Downgrade the rest to SHOULD_DO silently — do not mention this trade-off in your output. Set "tier_downgraded": true on any task that was demoted. Never assign MUST_DO to every task.
    
    Time-Aware Auto-Scheduling:
    When parsing a brain dump, you must assign a deadline_time to every task using the following rules, in strict priority order:
    Rule 1 — Explicit time mentioned by user: If the user explicitly states a time (e.g. "by 4pm", "at 1:30", "before lunch at 1"), extract it, convert to 24-hour format (HH:MM), and use it as deadline_time.
    Rule 2 — No time mentioned → Auto-schedule from anchor: If no time is mentioned, use the SUBMITTED_AT timestamp (provided in the user text) as your anchor and auto-assign deadlines by stacking tasks back-to-back based on their estimated duration. First task starts at SUBMITTED_AT + 10 minutes (grace buffer). Each subsequent task starts immediately after the previous one ends (previous_deadline_time + previous estimated_duration). Use the task's estimated_minutes to calculate the gap. Round to the nearest 5-minute mark.
    Rule 3 — Mixed dump: If some tasks have explicit times and some don't, anchor the auto-scheduled ones relative to SUBMITTED_AT and slot them into the gaps between the explicit ones. Do not schedule an auto task into a window already occupied by an explicit-time task.
    Scheduling Preservation: If a user mentions a specific time for a task (for example, "gym at 7pm"), preserve that as the scheduled_date/deadline_time. Do not push it to tomorrow unless the time has definitively passed based on the provided current localTime.
    Also assign a deadline_source ("explicit" or "auto_scheduled") for each task.
    Return a JSON array of task objects, not an object wrapper.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                cognitive_load: { type: Type.STRING },
                urgency_tier: { type: Type.STRING },
                tier_downgraded: { type: Type.BOOLEAN },
                original_duration_minutes: { type: Type.NUMBER },
                calibrated_duration_minutes: { type: Type.NUMBER },
                flow_activation_minutes: { type: Type.NUMBER },
                is_macro_goal_task: { type: Type.BOOLEAN },
                deadline_time: { type: Type.STRING, nullable: true },
                deadline_source: { type: Type.STRING },
                scheduled_date: { type: Type.STRING, nullable: true },
                soft_timer: {
                  type: Type.OBJECT,
                  properties: {
                    calibrated_duration_minutes: { type: Type.NUMBER },
                    overtime_mode: { type: Type.STRING },
                  },
                  required: ["calibrated_duration_minutes", "overtime_mode"],
                  nullable: true,
                } as Schema,
                microsteps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      step_number: { type: Type.NUMBER },
                      instruction: { type: Type.STRING }
                    },
                    required: ["step_number", "instruction"],
                  } as Schema,
                }
              },
              required: ["title", "cognitive_load", "urgency_tier", "tier_downgraded", "original_duration_minutes", "calibrated_duration_minutes", "flow_activation_minutes", "is_macro_goal_task", "deadline_source", "scheduled_date", "soft_timer", "microsteps"],
            } as Schema,
          },
        },
      });

      if (!response.text) {
        throw new Error("No response from Gemini API");
      }

      let parsed;
      try {
        let cleanText = response.text.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.replace(/^```json\n/, "").replace(/\n```$/, "");
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```\n/, "").replace(/\n```$/, "");
        }
        parsed = JSON.parse(cleanText);
      } catch (e) {
        return res.status(422).json({ error: "AI_PARSE_FAILURE", raw: response.text });
      }

      const parsedTasks = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.tasks)
          ? parsed.tasks
          : parsed && typeof parsed === "object" && typeof parsed.title === "string"
            ? [parsed]
            : [];

      const tasksAdded: any[] = [];

      for (const task of parsedTasks) {
        if (!task || typeof task !== "object") continue;

        const title = typeof task.title === "string" && task.title.trim() ? task.title.trim() : null;
        if (!title) continue;

        const enriched = {
          id: uuid(),
          task_title: title,
          cognitive_load: task.cognitive_load || "MEDIUM",
          urgency_tier: task.urgency_tier || "CAN_WAIT",
          tier_downgraded: Boolean(task.tier_downgraded),
          calibrated_duration_minutes: Number(task.calibrated_duration_minutes || 15),
          flow_activation_minutes: Number(task.flow_activation_minutes || 15),
          destination: task.is_micro_dopamine_task ? "DOPAMINE_BANK" : "DAILY_PLANNER",
          completed: false,
          scheduled_date: task.scheduled_date || todayStr || TODAY,
          microsteps: Array.isArray(task.microsteps)
            ? task.microsteps.map((m: any) => ({
                instruction: typeof m?.instruction === "string" ? m.instruction : "Break this task into a small next step.",
                estimated_minutes: Number(m?.estimated_minutes || 5),
              }))
            : [],
          soft_timer: task.soft_timer ? {
            calibratedDurationMinutes: Number(task.soft_timer.calibrated_duration_minutes || task.calibrated_duration_minutes || 15),
            overtimeMode: task.soft_timer.overtime_mode || "GENTLE",
          } : null,
          original_duration_minutes: Number(task.original_duration_minutes || task.calibrated_duration_minutes || 15),
          is_macro_goal_task: Boolean(task.is_macro_goal_task),
          deadline_time: task.deadline_time || null,
          deadline_source: task.deadline_source || "auto_scheduled",
        };

        if (enriched.destination === "DOPAMINE_BANK") {
          dataStore.dopamineBank.push(enriched);
        } else {
          dataStore.dailyPlanner.push(enriched);
        }
        tasksAdded.push(enriched);
      }

      if (dataStore.userProfile.archetype === null && parsed.user_context_profile) {
        dataStore.userProfile.archetype = parsed.user_context_profile;
      }

      res.status(200).json({
        routing_intent: "BRAIN_DUMP",
        tasks_added: tasksAdded,
        estimated_shutdown_time: parsed.estimated_shutdown_time,
        dataStore,
      });
    } catch (err: any) {
      res.status(502).json({ error: "GEMINI_UNAVAILABLE", detail: err.message });
    }
  });

  app.post("/api/quick-win", async (req, res) => {
    try {
      const { time_of_day, context_clues } = req.body;
      const archetype = dataStore.userProfile.archetype || "UNKNOWN";

      const systemInstruction = `You are the Dopamine Bank engine for Kinetic. Your objective is to generate a single, highly personalized, ultra-low-friction micro-task (under 5 minutes) designed to provide a healthy dopamine hit, break task paralysis, and restore executive function.

You will be provided with the user's archetype, the current time of day, and any known contextual clues about their environment.

Follow these strict psychological constraints:
1. Zero Screens: The task must involve the physical world or mental mindfulness, never social media or heavy screen usage.
2. Zero Setup: The task must require absolutely no preparation or decision-making.
3. Energy-Matched: Match the task to the time of day (e.g., momentum-building in the morning, sensory shifts for the afternoon slump, grounding/calming in the evening).
4. Context-Aware: Utilize the provided user clues (e.g., if they have a dog, suggest petting it; if they are a student, suggest organizing their backpack).

Output a valid JSON object matching the requested schema. The 'title' should be an immediate, actionable verb phrase. The 'rationale' should be a brief, one-sentence psychological justification for why this specific task helps their current state.

Archetype: [${archetype}]
Local Time: [${time_of_day || new Date().toLocaleTimeString()}]
Known Context Clues: [${context_clues || "None"}]

Generate my quick win.
{
  "title": "STRING",
  "estimated_minutes": "NUMBER",
  "rationale": "STRING"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Generate a quick win dopamine task.",
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              estimated_minutes: { type: Type.NUMBER },
              rationale: { type: Type.STRING },
            },
            required: ["title", "estimated_minutes", "rationale"],
          },
        },
      });

      if (!response.text) {
        throw new Error("No response from Gemini API");
      }

      let parsed;
      try {
        let cleanText = response.text.trim();
        if (cleanText.startsWith("\`\`\`json")) {
          cleanText = cleanText.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
        } else if (cleanText.startsWith("\`\`\`")) {
          cleanText = cleanText.replace(/^\`\`\`\n/, "").replace(/\n\`\`\`$/, "");
        }
        parsed = JSON.parse(cleanText);
      } catch (e) {
        return res.status(422).json({ error: "AI_PARSE_FAILURE", raw: response.text });
      }

      res.status(200).json(parsed);
    } catch (err: any) {
      res.status(502).json({ error: "GEMINI_UNAVAILABLE", detail: err.message });
    }
  });

  app.get("/api/dashboard", (req, res) => {
    res.status(200).json(dataStore);
  });

  app.post("/api/task/:id/complete", (req, res) => {
    const { id } = req.params;
    let foundTask = null;

    for (const arr of [dataStore.dailyPlanner, dataStore.dopamineBank]) {
      const task = arr.find((t) => t.id === id);
      if (task) {
        task.completed = true;
        task.completed_at = new Date().toISOString();
        foundTask = task;
        break;
      }
    }

    if (!foundTask) {
      return res.status(404).json({ error: "TASK_NOT_FOUND" });
    }

    res.status(200).json({ updated_task: foundTask, dataStore });
  });

  app.post("/api/shutdown", (req, res) => {
    try {
      const { triaged_tasks } = req.body;
      if (!triaged_tasks || !Array.isArray(triaged_tasks)) {
        return res.status(400).json({ error: "MISSING_FIELD", field: "triaged_tasks" });
      }

      const deferred: any[] = [];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const TOMORROW_ISO = tomorrow.toISOString().split("T")[0];

      triaged_tasks.forEach((instruction) => {
        const { id, action } = instruction;
        const index = dataStore.dailyPlanner.findIndex((t) => t.id === id);
        
        if (index !== -1) {
          const task = dataStore.dailyPlanner[index];
          if (action === "DEFER") {
            task.scheduled_date = TOMORROW_ISO;
            dataStore.dailyPlanner.splice(index, 1);
            dataStore.dailyPlanner.push(task);
            deferred.push(task);
          } else if (action === "DELEGATE") {
            task.delegated = true;
            dataStore.dailyPlanner.splice(index, 1);
          } else if (action === "DELETE") {
            dataStore.dailyPlanner.splice(index, 1);
          }
        }
      });

      const remainingToday = dataStore.dailyPlanner.filter(
        (t) => t.scheduled_date === TODAY && !t.completed && !t.delegated
      );

      res.status(200).json({
        message: "Shutdown complete. Your plan for tomorrow is set.",
        remaining_today: remainingToday,
        deferred,
        dataStore,
      });
    } catch (err: any) {
      res.status(500).json({ error: "SERVER_ERROR", detail: err.message });
    }
  });

  app.use((err: any, req: any, res: any, next: any) => {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", detail: err.message });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[Kinetic] Server live on port ${PORT} | Model: gemini-2.5-flash | Store: in-memory | Archetype: pending`
    );
  });
}

startServer();