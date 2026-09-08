import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, X, Flame, Trophy, Loader2, ChevronLeft, ChevronRight,
  ListChecks, BarChart3, Check, Target, Settings, Download, Share,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart as RBarChart, Bar, Cell,
} from "recharts";

const STORAGE_KEY = "growth-tracker-mobile-v2";
const NAME_KEY = "growth-tracker-name-v1";

// pulled from the user's uploaded workbook
const DEFAULT_HABITS = [
  { id: "h1", name: "Wake Up At 5 AM" },
  { id: "h2", name: "Running for 30 Min" },
  { id: "h3", name: "30 Pushups" },
  { id: "h4", name: "2-3 Liter's Water" },
  { id: "h5", name: "3 Mala" },
  { id: "h6", name: "No Masturbation" },
];

const INK = "#232A1F";
const PAPER = "#EFEAE0";
const CARD = "#FAF7F0";
const GOLD = "#B8862B";
const GREEN = "#4B6C4F";
const RUST = "#9A4A34";
const MUTED = "#6E6656";

const pad = (n) => (n < 10 ? "0" + n : "" + n);
const dateStr = (year, month0, day) => `${year}-${pad(month0 + 1)}-${pad(day)}`;
const parseDateStr = (ds) => {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const todayObj = new Date();
const TODAY_STR = dateStr(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
const TODAY_MIDNIGHT = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());

function daysIn(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}
function monthLabel(year, month0) {
  return new Date(year, month0, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function weekdayLabel(year, month0, day) {
  return new Date(year, month0, day).toLocaleDateString(undefined, { weekday: "short" });
}

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => ctx.close(), 600);
  } catch (e) {
    // audio not available — fail silently
  }
}

export default function GrowthTrackerMobile() {
  const [habits, setHabits] = useState(DEFAULT_HABITS);
  const [data, setData] = useState(() => {
    const init = {};
    DEFAULT_HABITS.forEach((h) => (init[h.id] = {}));
    return init;
  });
  const [extraTasks, setExtraTasks] = useState({}); // { "2026-09-08": [{id,name,done}] }
  const [goal, setGoal] = useState(null); // { title, deadline: "YYYY-MM-DD", createdAt: "YYYY-MM-DD" }

  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [tab, setTab] = useState("today");
  const [newHabit, setNewHabit] = useState("");
  const [newTask, setNewTask] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [userName, setUserName] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [goalTitleInput, setGoalTitleInput] = useState("");
  const [goalDeadlineInput, setGoalDeadlineInput] = useState("");
  const [showQuotePopup, setShowQuotePopup] = useState(false);

  // --- install prompt (PWA) ---
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const alreadyDismissed = window.localStorage.getItem("install-banner-dismissed");
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isStandalone || alreadyDismissed) return;

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
    setIsIOS(ios);
    if (ios) {
      setShowInstallBanner(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    window.localStorage.setItem("install-banner-dismissed", "true");
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallBanner(false);
    window.localStorage.setItem("install-banner-dismissed", "true");
  };

  const [viewYear, setViewYear] = useState(todayObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayObj.getMonth());
  const [selectedDay, setSelectedDay] = useState(todayObj.getDate());

  const isCurrentMonth = viewYear === todayObj.getFullYear() && viewMonth === todayObj.getMonth();
  const daysInMonth = daysIn(viewYear, viewMonth);
  const dayRefs = useRef({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.habits && parsed.data) {
          setHabits(parsed.habits);
          setData(parsed.data);
        }
        if (parsed.extraTasks) setExtraTasks(parsed.extraTasks);
        if (parsed.goal) setGoal(parsed.goal);
      }
    } catch (e) {
      // first run — keep defaults from the uploaded sheet
    }
    try {
      const name = window.localStorage.getItem(NAME_KEY);
      if (name) setUserName(name);
    } catch (e) {
      // no name saved yet
    } finally {
      setLoaded(true);
    }
  }, []);

  // keep the highlighted date scrolled into view — fixes arrow taps looking "stuck"
  useEffect(() => {
    const el = dayRefs.current[selectedDay];
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDay, viewMonth, viewYear]);

  const persistAll = useCallback(
    (overrides = {}) => {
      const payload = {
        habits: overrides.habits ?? habits,
        data: overrides.data ?? data,
        extraTasks: overrides.extraTasks ?? extraTasks,
        goal: overrides.goal !== undefined ? overrides.goal : goal,
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    },
    [habits, data, extraTasks, goal]
  );

  const saveName = () => {
    const name = nameInput.trim();
    if (!name) return;
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch (e) {
      // continue anyway — not critical
    }
    setUserName(name);
  };

  const toggleDate = (habitId, ds) => {
    setData((prev) => {
      const wasChecked = !!(prev[habitId] || {})[ds];
      const next = { ...prev, [habitId]: { ...prev[habitId] } };
      next[habitId][ds] = !wasChecked;
      persistAll({ data: next });
      if (!wasChecked) playChime();
      return next;
    });
  };

  const addHabit = () => {
    const name = newHabit.trim();
    if (!name) return;
    const id = "h" + Date.now();
    const nextHabits = [...habits, { id, name }];
    const nextData = { ...data, [id]: {} };
    setHabits(nextHabits);
    setData(nextData);
    persistAll({ habits: nextHabits, data: nextData });
    setNewHabit("");
  };

  const removeHabit = (id) => {
    const nextHabits = habits.filter((h) => h.id !== id);
    const nextData = { ...data };
    delete nextData[id];
    setHabits(nextHabits);
    setData(nextData);
    persistAll({ habits: nextHabits, data: nextData });
  };

  // --- one-off "extra tasks", scoped to the exact date they were added for ---
  const addExtraTask = (ds) => {
    const name = newTask.trim();
    if (!name) return;
    const id = "t" + Date.now();
    setExtraTasks((prev) => {
      const list = prev[ds] ? [...prev[ds]] : [];
      list.push({ id, name, done: false });
      const next = { ...prev, [ds]: list };
      persistAll({ extraTasks: next });
      return next;
    });
    setNewTask("");
  };

  const toggleExtraTask = (ds, taskId) => {
    setExtraTasks((prev) => {
      const list = (prev[ds] || []).map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
      const next = { ...prev, [ds]: list };
      persistAll({ extraTasks: next });
      const t = list.find((x) => x.id === taskId);
      if (t && t.done) playChime();
      return next;
    });
  };

  const removeExtraTask = (ds, taskId) => {
    setExtraTasks((prev) => {
      const list = (prev[ds] || []).filter((t) => t.id !== taskId);
      const next = { ...prev, [ds]: list };
      persistAll({ extraTasks: next });
      return next;
    });
  };

  // --- goal with deadline ---
  const openGoalEditor = () => {
    setGoalTitleInput(goal?.title || "");
    setGoalDeadlineInput(goal?.deadline || "");
    setShowGoalEditor(true);
  };
  const saveGoal = () => {
    const title = goalTitleInput.trim();
    if (!title || !goalDeadlineInput) return;
    const g = { title, deadline: goalDeadlineInput, createdAt: goal?.createdAt || TODAY_STR };
    setGoal(g);
    persistAll({ goal: g });
    setShowGoalEditor(false);
  };
  const clearGoal = () => {
    setGoal(null);
    persistAll({ goal: null });
    setShowGoalEditor(false);
  };
  const markGoalDone = () => {
    if (!goal) return;
    const g = { ...goal, completed: true };
    setGoal(g);
    persistAll({ goal: g });
    playChime();
    setShowQuotePopup(true);
  };
  const reopenGoal = () => {
    if (!goal) return;
    const g = { ...goal, completed: false };
    setGoal(g);
    persistAll({ goal: g });
  };

  const goDay = (delta) => {
    let day = selectedDay + delta;
    let m = viewMonth;
    let y = viewYear;
    const dim = daysIn(y, m);
    if (day < 1) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
      day = daysIn(y, m);
    } else if (day > dim) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      day = 1;
    }
    setViewYear(y);
    setViewMonth(m);
    setSelectedDay(day);
  };

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewYear(y);
    setViewMonth(m);
    setSelectedDay(1);
  };

  const jumpToday = () => {
    setViewYear(todayObj.getFullYear());
    setViewMonth(todayObj.getMonth());
    setSelectedDay(todayObj.getDate());
  };

  const trueDates = useMemo(() => {
    const set = new Set();
    habits.forEach((h) => {
      const rec = data[h.id] || {};
      Object.keys(rec).forEach((d) => {
        if (rec[d]) set.add(d);
      });
    });
    return set;
  }, [habits, data]);

  const currentStreak = useMemo(() => {
    let count = 0;
    let cursor = new Date();
    while (true) {
      const ds = dateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (trueDates.has(ds)) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
    return count;
  }, [trueDates]);

  const bestStreak = useMemo(() => {
    const sorted = Array.from(trueDates).sort();
    let best = 0, run = 0, prev = null;
    for (const d of sorted) {
      if (prev) {
        const diff = (new Date(d) - new Date(prev)) / 86400000;
        run = diff === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      prev = d;
      if (run > best) best = run;
    }
    return Math.max(best, currentStreak);
  }, [trueDates, currentStreak]);

  const getStreakAt = (ds) => {
    if (!trueDates.has(ds)) return 0;
    let count = 0;
    let cursor = new Date(ds);
    while (true) {
      const cs = dateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (trueDates.has(cs)) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
    return count;
  };

  const streakChartData = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const ds = dateStr(viewYear, viewMonth, day);
        return { day, streak: getStreakAt(ds) };
      }),
    [daysInMonth, viewYear, viewMonth, trueDates]
  );

  const habitStats = useMemo(
    () =>
      habits.map((h) => {
        const rec = data[h.id] || {};
        let total = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          if (rec[dateStr(viewYear, viewMonth, d)]) total += 1;
        }
        const pct = daysInMonth ? Math.round((total / daysInMonth) * 100) : 0;
        return { ...h, total, pct };
      }),
    [habits, data, daysInMonth, viewYear, viewMonth]
  );

  const goalStats = useMemo(() => {
    if (!goal) return null;
    const start = parseDateStr(goal.createdAt);
    const deadline = parseDateStr(goal.deadline);
    const daysElapsed = Math.max(1, Math.round((TODAY_MIDNIGHT - start) / 86400000) + 1);
    let consistentDays = 0;
    for (let i = 0; i < daysElapsed; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (trueDates.has(dateStr(d.getFullYear(), d.getMonth(), d.getDate()))) consistentDays++;
    }
    const consistencyPct = Math.round((consistentDays / daysElapsed) * 100);
    const daysLeft = Math.ceil((deadline - TODAY_MIDNIGHT) / 86400000);
    return { consistencyPct, daysLeft, consistentDays, daysElapsed };
  }, [goal, trueDates]);

  const selectedDateStr = dateStr(viewYear, viewMonth, selectedDay);
  const doneToday = habits.filter((h) => (data[h.id] || {})[selectedDateStr]).length;
  const todaysExtraTasks = extraTasks[selectedDateStr] || [];

  const remainingActualToday = habits.length - habits.filter((h) => (data[h.id] || {})[TODAY_STR]).length;
  const showReminder =
    !bannerDismissed && todayObj.getHours() >= 5 && remainingActualToday > 0 && habits.length > 0;

  if (!loaded) {
    return (
      <div style={{ background: PAPER, minHeight: 500 }} className="flex items-center justify-center">
        <Loader2 className="animate-spin" size={22} color={MUTED} />
      </div>
    );
  }

  if (!userName) {
    return (
      <div
        style={{ background: PAPER, fontFamily: "'IBM Plex Sans', sans-serif", color: INK }}
        className="w-full min-h-screen sm:min-h-0 sm:max-w-[420px] sm:mx-auto sm:my-6 sm:rounded-[28px] overflow-hidden flex flex-col items-center justify-center px-8 text-center"
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        `}</style>
        <Flame size={26} color={GOLD} className="mb-3" />
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-2xl mb-2">
          Welcome to your growth log
        </h1>
        <p style={{ color: MUTED }} className="text-sm mb-6">What should we call you?</p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveName()}
          placeholder="Your name"
          autoFocus
          style={{ background: CARD, border: `1px solid ${INK}22`, color: INK }}
          className="w-full rounded-2xl px-4 py-3 text-center text-sm outline-none mb-3"
        />
        <button onClick={saveName} style={{ background: INK, color: PAPER }} className="w-full rounded-2xl py-3 text-sm font-medium">
          Start tracking
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ background: PAPER, fontFamily: "'IBM Plex Sans', sans-serif", color: INK }}
      className="w-full min-h-screen sm:min-h-0 sm:max-w-[420px] sm:mx-auto sm:my-6 sm:rounded-[28px] overflow-hidden flex flex-col"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
      `}</style>

      {showQuotePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(35,42,31,0.85)" }}
          onClick={() => setShowQuotePopup(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: CARD, border: `1px solid ${GOLD}55` }}
            className="w-full max-w-sm rounded-3xl px-6 py-8 text-center"
          >
            <Flame size={28} color={GOLD} className="mx-auto mb-4" />
            <p style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-lg leading-snug mb-4">
              "Fuck Motivation. Just Do It For Yourself And Your Parents, And Achieve Whatever You Imagined."
            </p>
            <p style={{ color: MUTED }} className="text-xs mb-6">— Your Best Version</p>
            <button onClick={() => setShowQuotePopup(false)} style={{ background: INK, color: PAPER }} className="w-full rounded-2xl py-3 text-sm font-medium">
              Let's go
            </button>
          </div>
        </div>
      )}

      {/* header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => goMonth(-1)} aria-label="Previous month" className="p-1">
            <ChevronLeft size={16} color={MUTED} />
          </button>
          <button onClick={jumpToday} style={{ color: isCurrentMonth ? MUTED : GOLD }} className="text-xs">
            {monthLabel(viewYear, viewMonth)}{!isCurrentMonth && " · jump to today"}
          </button>
          <button onClick={() => goMonth(1)} aria-label="Next month" className="p-1">
            <ChevronRight size={16} color={MUTED} />
          </button>
        </div>
        <div className="flex items-end justify-between">
          <div>
            {userName && <p style={{ color: MUTED }} className="text-xs mb-0.5">Hey, {userName}</p>}
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-2xl">
              Growth log
            </h1>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end">
                <Flame size={16} color={GOLD} />
                <span style={{ fontFamily: "'Fraunces', serif" }} className="text-2xl font-semibold">{currentStreak}</span>
              </div>
              <p style={{ color: MUTED }} className="text-[10px]">streak</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end">
                <Trophy size={14} color={INK} />
                <span style={{ fontFamily: "'Fraunces', serif" }} className="text-2xl font-semibold">{bestStreak}</span>
              </div>
              <p style={{ color: MUTED }} className="text-[10px]">best</p>
            </div>
          </div>
        </div>

        {/* goal panel */}
        {!showGoalEditor ? (
          goal && goalStats ? (
            goal.completed ? (
              <div style={{ background: GREEN + "1a", border: `1px solid ${GREEN}55` }} className="w-full mt-3 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Trophy size={12} color={GREEN} /> {goal.title} — achieved 🎉
                  </span>
                </div>
                <div className="flex gap-3 mt-1.5">
                  <button onClick={openGoalEditor} style={{ color: MUTED }} className="text-[10px] underline">Edit</button>
                  <button onClick={reopenGoal} style={{ color: MUTED }} className="text-[10px] underline">Not done yet</button>
                </div>
              </div>
            ) : (
              <div style={{ background: CARD, border: `1px solid ${INK}1a` }} className="w-full mt-3 rounded-xl px-3 py-2.5">
                <button onClick={openGoalEditor} className="w-full text-left">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <Target size={12} color={GOLD} /> {goal.title}
                    </span>
                    <span style={{ color: goalStats.daysLeft < 0 ? RUST : MUTED }} className="text-[10px] shrink-0">
                      {goalStats.daysLeft < 0 ? "Deadline passed" : goalStats.daysLeft === 0 ? "Due today" : `${goalStats.daysLeft}d left`}
                    </span>
                  </div>
                  <div style={{ background: INK + "14" }} className="h-1.5 rounded-full overflow-hidden">
                    <div style={{ width: `${goalStats.consistencyPct}%`, background: GREEN }} className="h-full rounded-full transition-all" />
                  </div>
                  <p style={{ color: MUTED }} className="text-[10px] mt-1">{goalStats.consistencyPct}% consistent since you started</p>
                </button>
                <button
                  onClick={markGoalDone}
                  style={{ background: INK, color: PAPER }}
                  className="w-full mt-2.5 text-xs font-medium py-2 rounded-lg"
                >
                  Mark as done
                </button>
              </div>
            )
          ) : (
            <button
              onClick={openGoalEditor}
              style={{ border: `1px dashed ${INK}33`, color: MUTED }}
              className="w-full mt-3 rounded-xl px-3 py-2.5 text-xs flex items-center gap-1.5 justify-center"
            >
              <Target size={12} /> Set a goal & deadline
            </button>
          )
        ) : (
          <div style={{ background: CARD, border: `1px solid ${INK}1a` }} className="w-full mt-3 rounded-xl p-3">
            <input
              value={goalTitleInput}
              onChange={(e) => setGoalTitleInput(e.target.value)}
              placeholder="Goal title (e.g. Run a 10K)"
              style={{ background: PAPER, color: INK, border: `1px solid ${INK}1a` }}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2"
            />
            <input
              type="date"
              value={goalDeadlineInput}
              onChange={(e) => setGoalDeadlineInput(e.target.value)}
              style={{ background: PAPER, color: INK, border: `1px solid ${INK}1a` }}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2"
            />
            <div className="flex gap-2">
              <button onClick={saveGoal} style={{ background: INK, color: PAPER }} className="flex-1 text-xs font-medium py-2 rounded-lg">
                Save
              </button>
              <button onClick={() => setShowGoalEditor(false)} style={{ color: MUTED }} className="text-xs px-3 py-2">
                Cancel
              </button>
              {goal && (
                <button onClick={clearGoal} style={{ color: RUST }} className="text-xs px-3 py-2">
                  Remove
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {showInstallBanner && (
          <div style={{ background: INK, color: PAPER }} className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
            {isIOS ? (
              <>
                <Share size={16} color={GOLD} className="shrink-0" />
                <p className="text-xs flex-1">Install this app: tap the Share icon, then "Add to Home Screen".</p>
              </>
            ) : (
              <>
                <Download size={16} color={GOLD} className="shrink-0" />
                <p className="text-xs flex-1">Install this app for quick access, right from your home screen.</p>
                <button onClick={handleInstallClick} style={{ background: GOLD, color: INK }} className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg">
                  Install
                </button>
              </>
            )}
            <button onClick={dismissInstallBanner} aria-label="Dismiss install prompt" className="shrink-0">
              <X size={14} color={PAPER} />
            </button>
          </div>
        )}
        {showReminder && (
          <div style={{ background: GOLD + "1f", border: `1px solid ${GOLD}55` }} className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
            <Flame size={16} color={GOLD} className="shrink-0" />
            <p className="text-xs flex-1">
              {remainingActualToday} habit{remainingActualToday > 1 ? "s" : ""} left today — keep the streak going.
            </p>
            <button onClick={() => setBannerDismissed(true)} aria-label="Dismiss reminder" className="shrink-0">
              <X size={14} color={MUTED} />
            </button>
          </div>
        )}

        {tab === "today" ? (
          <>
            {/* date strip */}
            <div className="flex items-center gap-1 mb-4">
              <button onClick={() => goDay(-1)} className="p-1 shrink-0" aria-label="Previous day">
                <ChevronLeft size={18} color={MUTED} />
              </button>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 scroll-smooth" style={{ scrollbarWidth: "none" }}>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const isToday = isCurrentMonth && day === todayObj.getDate();
                  const isSelected = day === selectedDay;
                  return (
                    <button
                      key={day}
                      ref={(el) => { dayRefs.current[day] = el; }}
                      onClick={() => setSelectedDay(day)}
                      style={{
                        background: isSelected ? INK : "transparent",
                        color: isSelected ? PAPER : isToday ? GOLD : MUTED,
                        border: isToday && !isSelected ? `1px solid ${GOLD}` : "1px solid transparent",
                      }}
                      className="shrink-0 rounded-xl px-2.5 py-1.5 text-center min-w-[42px] transition-colors"
                    >
                      <div className="text-[9px] opacity-80">{weekdayLabel(viewYear, viewMonth, day)}</div>
                      <div className="text-sm font-medium">{day}</div>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => goDay(1)} className="p-1 shrink-0" aria-label="Next day">
                <ChevronRight size={18} color={MUTED} />
              </button>
            </div>

            {/* progress */}
            <div style={{ background: CARD, border: `1px solid ${INK}1a` }} className="rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p style={{ color: MUTED }} className="text-xs">
                  {selectedDateStr === TODAY_STR ? "Today" : `${monthLabel(viewYear, viewMonth)} · Day ${selectedDay}`}
                </p>
                <p className="text-xs font-medium">{doneToday}/{habits.length}</p>
              </div>
              <div style={{ background: INK + "14" }} className="h-1.5 rounded-full overflow-hidden mb-2">
                <div style={{ width: `${habits.length ? (doneToday / habits.length) * 100 : 0}%`, background: GREEN }} className="h-full rounded-full transition-all" />
              </div>
              <p style={{ color: habits.length - doneToday === 0 ? GREEN : MUTED }} className="text-xs">
                {habits.length - doneToday === 0 ? "All done for this day" : `${habits.length - doneToday} remaining`}
              </p>
            </div>

            {/* habit checklist */}
            <div className="flex flex-col gap-2">
              {habits.map((h) => {
                const checked = (data[h.id] || {})[selectedDateStr];
                return (
                  <button
                    key={h.id}
                    onClick={() => toggleDate(h.id, selectedDateStr)}
                    style={{ background: checked ? GREEN + "1a" : CARD, border: `1px solid ${checked ? GREEN + "55" : INK + "1a"}` }}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors"
                  >
                    <div
                      style={{ width: 24, height: 24, borderRadius: 8, background: checked ? GREEN : "transparent", border: `1.5px solid ${checked ? GREEN : INK + "40"}` }}
                      className="shrink-0 flex items-center justify-center"
                    >
                      {checked && <Check size={15} color={PAPER} strokeWidth={3} />}
                    </div>
                    <span style={{ opacity: checked ? 0.7 : 1, textDecoration: checked ? "line-through" : "none" }} className="text-sm">
                      {h.name}
                    </span>
                  </button>
                );
              })}
              {habits.length === 0 && (
                <p style={{ color: MUTED }} className="text-sm text-center py-6">No habits yet — add one in Overview.</p>
              )}
            </div>

            {/* extra, one-off tasks — only ever shown on the day they were added for */}
            <div className="mt-5">
              <p style={{ fontFamily: "'Fraunces', serif" }} className="text-sm mb-2">
                Extra for {selectedDateStr === TODAY_STR ? "today" : "this day"}
              </p>
              <div className="flex flex-col gap-2 mb-2">
                {todaysExtraTasks.map((t) => (
                  <div
                    key={t.id}
                    style={{ background: t.done ? GREEN + "1a" : CARD, border: `1px solid ${t.done ? GREEN + "55" : GOLD + "44"}` }}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
                  >
                    <button onClick={() => toggleExtraTask(selectedDateStr, t.id)} className="flex items-center gap-3 flex-1">
                      <div
                        style={{ width: 22, height: 22, borderRadius: 7, background: t.done ? GREEN : "transparent", border: `1.5px solid ${t.done ? GREEN : GOLD}` }}
                        className="shrink-0 flex items-center justify-center"
                      >
                        {t.done && <Check size={13} color={PAPER} strokeWidth={3} />}
                      </div>
                      <span style={{ opacity: t.done ? 0.7 : 1, textDecoration: t.done ? "line-through" : "none" }} className="text-sm">
                        {t.name}
                      </span>
                    </button>
                    <button onClick={() => removeExtraTask(selectedDateStr, t.id)} aria-label={`Remove ${t.name}`}>
                      <X size={13} color={MUTED} />
                    </button>
                  </div>
                ))}
                {todaysExtraTasks.length === 0 && (
                  <p style={{ color: MUTED }} className="text-xs">Nothing extra added for this day.</p>
                )}
              </div>
              <div style={{ background: CARD, border: `1px solid ${INK}1a` }} className="flex items-center gap-2 rounded-2xl px-3 py-2">
                <Plus size={14} color={MUTED} />
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExtraTask(selectedDateStr)}
                  placeholder="Add a one-time task for this day"
                  style={{ color: INK }}
                  className="bg-transparent outline-none text-sm flex-1 placeholder:opacity-50"
                />
                <button onClick={() => addExtraTask(selectedDateStr)} style={{ background: INK, color: PAPER }} className="text-xs px-3 py-1.5 rounded-lg shrink-0">
                  Add
                </button>
              </div>
            </div>
          </>
        ) : tab === "overview" ? (
          <>
            {/* charts */}
            <div style={{ background: CARD, border: `1px solid ${INK}1a` }} className="rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p style={{ fontFamily: "'Fraunces', serif" }} className="text-sm">Momentum · {monthLabel(viewYear, viewMonth)}</p>
                {currentStreak > 0 && (
                  <span className="text-sm" title={`${currentStreak}-day streak`}>
                    {"🔥".repeat(Math.min(5, Math.max(1, Math.ceil(currentStreak / 3))))}
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={streakChartData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                  <CartesianGrid stroke={INK + "12"} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: MUTED }} axisLine={{ stroke: INK + "22" }} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} width={20} />
                  <Tooltip contentStyle={{ background: CARD, border: `1px solid ${INK}22`, borderRadius: 6, fontSize: 11 }} labelFormatter={(d) => `Day ${d}`} formatter={(v) => [`${v} streak`, ""]} />
                  <Line type="monotone" dataKey="streak" stroke={GOLD} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: CARD, border: `1px solid ${INK}1a` }} className="rounded-2xl p-4 mb-4">
              <p style={{ fontFamily: "'Fraunces', serif" }} className="text-sm mb-3">Growth Rate · {monthLabel(viewYear, viewMonth)}</p>
              <ResponsiveContainer width="100%" height={habitStats.length * 34 + 10}>
                <RBarChart data={habitStats} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: CARD, border: `1px solid ${INK}22`, borderRadius: 6, fontSize: 11 }} formatter={(v) => [`${v}%`, "Growth"]} />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={14}>
                    {habitStats.map((h) => (
                      <Cell key={h.id} fill={h.pct >= 60 ? GREEN : h.pct >= 30 ? GOLD : RUST} />
                    ))}
                  </Bar>
                </RBarChart>
              </ResponsiveContainer>
            </div>

            {saveError && (
              <p style={{ color: RUST }} className="text-xs mt-3">
                Couldn't save your last change — check your connection and try again.
              </p>
            )}
          </>
        ) : (
          <>
            {/* manage habits */}
            <div style={{ background: CARD, border: `1px solid ${INK}1a` }} className="rounded-2xl p-4">
              <p style={{ fontFamily: "'Fraunces', serif" }} className="text-sm mb-3">Manage habits</p>
              <div className="flex flex-col gap-2 mb-3">
                {habits.map((h) => (
                  <div key={h.id} className="flex items-center justify-between">
                    <span className="text-sm">{h.name}</span>
                    <button onClick={() => removeHabit(h.id)} aria-label={`Remove ${h.name}`}>
                      <X size={14} color={MUTED} />
                    </button>
                  </div>
                ))}
                {habits.length === 0 && (
                  <p style={{ color: MUTED }} className="text-xs">No habits yet — add one below.</p>
                )}
              </div>
              <div style={{ borderTop: `1px solid ${INK}1a` }} className="flex items-center gap-2 pt-3">
                <Plus size={14} color={MUTED} />
                <input
                  value={newHabit}
                  onChange={(e) => setNewHabit(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addHabit()}
                  placeholder="Add a habit"
                  style={{ color: INK }}
                  className="bg-transparent outline-none text-sm flex-1 placeholder:opacity-50"
                />
                <button onClick={addHabit} style={{ background: INK, color: PAPER }} className="text-xs px-3 py-1.5 rounded-lg">
                  Add
                </button>
              </div>
            </div>

            {saveError && (
              <p style={{ color: RUST }} className="text-xs mt-3">
                Couldn't save your last change — check your connection and try again.
              </p>
            )}
          </>
        )}
      </div>

      {/* bottom tab bar */}
      <div style={{ borderTop: `1px solid ${INK}1a`, background: CARD, paddingBottom: "env(safe-area-inset-bottom)" }} className="flex px-2 py-2">
        <button onClick={() => setTab("today")} style={{ color: tab === "today" ? INK : MUTED }} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl">
          <ListChecks size={19} />
          <span className="text-[10px] font-medium">Today</span>
        </button>
        <button onClick={() => setTab("overview")} style={{ color: tab === "overview" ? INK : MUTED }} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl">
          <BarChart3 size={19} />
          <span className="text-[10px] font-medium">Overview</span>
        </button>
        <button onClick={() => setTab("manage")} style={{ color: tab === "manage" ? INK : MUTED }} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl">
          <Settings size={19} />
          <span className="text-[10px] font-medium">Manage</span>
        </button>
      </div>
    </div>
  );
}
