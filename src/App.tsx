import React, { useEffect, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  LayoutDashboard,
  CalendarClock,
  BookOpen,
  ClipboardCheck,
  Video,
  Dumbbell,
  Sparkles,
  BrainCircuit,
  BarChart3,
  BookMarked,
  Database,
  AlertTriangle,
  Flame,
  ShieldCheck,
  Plus,
  Download,
  Upload,
  Github,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  db,
  ensureSeeded,
  exportFullDatabaseJSON,
  importFullDatabaseJSON,
} from './db/database';
import { UNITED_ACADEMY_EVENTS } from './db/seedData';
import {
  getMissionClock,
  getTodayDayName,
  getCurrentAndNextBlock,
  evaluateIntelligentReschedule,
} from './engine/schedulerEngine';
import {
  loadGitHubConfig,
  saveGitHubConfig,
  pushDatabaseToGitHub,
  pullDatabaseFromGitHub,
} from './engine/githubSync';
import {
  SubjectId,
  MasteryStatus,
  TaskStatus,
  DayOfWeek,
  ScheduleBlock,
  RescheduleProposal,
  GitHubSyncConfig,
} from './types/project90';
import { MathText } from './components/MathText';

type TabKey =
  | 'dashboard'
  | 'timetable'
  | 'academics'
  | 'homework'
  | 'pea'
  | 'workout'
  | 'skincare'
  | 'revision'
  | 'analytics'
  | 'journal'
  | 'sync';

const SUBJECT_META: Record<SubjectId, { label: string; color: string; targetGpaNote: string }> = {
  chemistry: { label: 'Chemistry', color: 'bg-rose-500', targetGpaNote: 'Critical Deficit (<3% G12 | 20% G11)' },
  physics: { label: 'Physics', color: 'bg-amber-500', targetGpaNote: 'Critical Deficit (<10% G12 | 50% G11)' },
  mathematics: { label: 'Mathematics', color: 'bg-indigo-500', targetGpaNote: '40% G12 | Repair G11 Calculus' },
  computer: { label: 'Computer Science', color: 'bg-emerald-500', targetGpaNote: 'Core Strength (30% G12)' },
  english: { label: 'English', color: 'bg-sky-500', targetGpaNote: '25% G12 | Classroom + Weekend' },
  nepali: { label: 'Nepali', color: 'bg-purple-500', targetGpaNote: '25% G12 | Classroom + Weekend' },
};

const MASTERY_STEPS: MasteryStatus[] = [
  'Not started',
  'Learning',
  'Concept understood',
  'Practising',
  'NEB questions completed',
  'Revision required',
  'Mastered through testing',
];

export function App() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getTodayDayName());
  const [selectedSubject, setSelectedSubject] = useState<SubjectId>('chemistry');
  const [proposal, setProposal] = useState<RescheduleProposal | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);

  useEffect(() => {
    ensureSeeded().then(() => setReady(true));
  }, []);

  const chapters = useLiveQuery(() => db.chapters.toArray(), []) || [];
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) || [];
  const homework = useLiveQuery(() => db.homework.toArray(), []) || [];
  const peaLectures = useLiveQuery(() => db.peaLectures.toArray(), []) || [];
  const workouts = useLiveQuery(() => db.workouts.toArray(), []) || [];
  const healthLogs = useLiveQuery(() => db.healthLogs.toArray(), []) || [];
  const vault = useLiveQuery(() => db.vault.toArray(), []) || [];
  const tests = useLiveQuery(() => db.tests.toArray(), []) || [];
  const journals = useLiveQuery(() => db.journals.toArray(), []) || [];

  const todayISO = new Date().toISOString().slice(0, 10);
  const todayDayName = getTodayDayName();
  const mission = useMemo(() => getMissionClock(new Date()), []);

  const todayBlocks = useMemo(
    () => schedule.filter((b) => b.day === todayDayName).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedule, todayDayName]
  );

  const { current: currentBlock, next: nextBlock } = useMemo(
    () => getCurrentAndNextBlock(todayBlocks, new Date()),
    [todayBlocks]
  );

  const todayHealth = healthLogs.find((h) => h.date === todayISO) || {
    date: todayISO,
    sleepHours: 8,
    bedTime: '18:00',
    wakeTime: '02:00',
    amSkincare: false,
    sunscreenApplied: false,
    pmSkincare: false,
    groomingNotes: '',
    workoutDone: false,
  };

  const todayJournal = journals.find((j) => j.date === todayISO) || {
    date: todayISO,
    accomplishments: '',
    problems: '',
    unfinishedTasks: '',
    tomorrowPriorities: '',
    productivityRating: 8,
    weeklyWin: '',
    weeklyFailure: '',
    weeklyAdjustment: '',
  };

  const handleUpdateBlockStatus = async (block: ScheduleBlock, status: TaskStatus) => {
    const actualMinutes = status === 'Completed' ? block.plannedMinutes : status === 'Partially completed' ? Math.round(block.plannedMinutes / 2) : 0;
    await db.schedule.update(block.id, { status, actualMinutes });
    if (status === 'Missed' || status === 'Postponed') {
      const suggestion = evaluateIntelligentReschedule({ ...block, status }, schedule, chapters);
      setProposal(suggestion);
    }
  };

  const approveReschedule = async () => {
    if (!proposal) return;
    const orig = schedule.find((s) => s.id === proposal.blockId);
    if (orig) {
      await db.schedule.add({
        ...orig,
        id: `${orig.id}-resched-${Date.now()}`,
        day: proposal.suggestedDay,
        startTime: proposal.suggestedDay === 'Sunday' ? '02:15' : '05:30',
        endTime: proposal.suggestedDay === 'Sunday' ? '03:45' : '07:00',
        title: `[Triage] ${orig.title}`,
        status: 'Not started',
        actualMinutes: 0,
      });
    }
    setProposal(null);
  };

  const handleDropOnDay = async (targetDay: DayOfWeek) => {
    if (!draggedBlockId) return;
    const block = schedule.find((b) => b.id === draggedBlockId);
    if (block && !block.isFixed) {
      await db.schedule.update(draggedBlockId, { day: targetDay });
    }
    setDraggedBlockId(null);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300">
        Initializing Project 90 Command Centre...
      </div>
    );
  }

  const navItems: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Command Centre', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'timetable', label: 'Intelligent Timetable', icon: <CalendarClock className="w-4 h-4" /> },
    { key: 'academics', label: 'Subjects & Syllabus', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'homework', label: 'Homework & Practicals', icon: <ClipboardCheck className="w-4 h-4" /> },
    { key: 'pea', label: 'PEA Digital Tracker', icon: <Video className="w-4 h-4" /> },
    { key: 'workout', label: '6-Day Workout', icon: <Dumbbell className="w-4 h-4" /> },
    { key: 'skincare', label: 'Skincare & Sleep', icon: <Sparkles className="w-4 h-4" /> },
    { key: 'revision', label: 'Revision & Mistake Vault', icon: <BrainCircuit className="w-4 h-4" /> },
    { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'journal', label: 'Daily & Weekly Review', icon: <BookMarked className="w-4 h-4" /> },
    { key: 'sync', label: 'GitHub & Backup', icon: <Database className="w-4 h-4" /> },
  ];

  const completedToday = todayBlocks.filter((b) => b.status === 'Completed').length;
  const completionPct = todayBlocks.length ? Math.round((completedToday / todayBlocks.length) * 100) : 0;
  const plannedStudyMins = todayBlocks.filter((b) => b.category === 'DeepStudy' || b.category === 'Homework').reduce((acc, b) => acc + b.plannedMinutes, 0);
  const actualStudyMins = todayBlocks.filter((b) => b.category === 'DeepStudy' || b.category === 'Homework').reduce((acc, b) => acc + b.actualMinutes, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      <aside className="w-full lg:w-64 bg-slate-900/80 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center justify-between lg:block mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-mono uppercase tracking-widest text-indigo-400">United Academy • G12</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white mt-1">PROJECT 90</h1>
              <p className="text-xs text-slate-400">Pulchowk Computer Eng. OS</p>
            </div>
            <div className="lg:mt-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs">
              <div className="text-slate-400">Target GPA</div>
              <div className="font-mono font-semibold text-emerald-400">&gt; 3.92 → 4.00</div>
            </div>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  activeTab === item.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="hidden lg:block mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
          <div className="flex justify-between">
            <span>NEB Boards</span>
            <span className="font-mono text-amber-400">{mission.daysToBoards}d left</span>
          </div>
          <div className="flex justify-between">
            <span>Send-Up Cutoff</span>
            <span className="font-mono text-indigo-400">{mission.daysToSendup}d left</span>
          </div>
          <div className="flex justify-between">
            <span>Sleep Guard</span>
            <span className="font-mono text-emerald-400">18:00–02:00 (8h)</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {proposal && (
          <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Intelligent Reschedule Proposal ({proposal.importance} Priority)</span>
              </div>
              <p className="text-sm text-slate-200">
                <strong>{proposal.blockTitle}</strong> ({proposal.originalDay}) → Suggested: <strong>{proposal.suggestedSlot}</strong>
              </p>
              <p className="text-xs text-slate-400">{proposal.impactNote}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setProposal(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
              >
                Dismiss (Keep Backlog)
              </button>
              <button
                onClick={approveReschedule}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
              >
                Approve Move
              </button>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 bg-gradient-to-br from-indigo-950/90 to-slate-900 border border-indigo-500/30 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-indigo-300">
                    Day {mission.missionDay} of 230 • {todayDayName}, {todayISO}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {mission.phase.range}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white mt-2">{mission.phase.name}</h2>
                <p className="text-sm text-slate-300 mt-1">{mission.phase.focus}</p>
                <div className="mt-4 pt-3 border-t border-indigo-500/20 flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Now: </span>
                    <span className="font-semibold text-white">{currentBlock ? currentBlock.title : 'Transition Window'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Next: </span>
                    <span className="font-semibold text-indigo-300">
                      {nextBlock ? `${nextBlock.startTime} ${nextBlock.title}` : '02:00 AM Reset'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>TODAY'S EXECUTION</span>
                  <Flame className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="my-2">
                  <div className="text-3xl font-bold font-mono text-white">{completionPct}%</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {completedToday}/{todayBlocks.length} blocks • {(actualStudyMins / 60).toFixed(1)}h / {(plannedStudyMins / 60).toFixed(1)}h study
                  </div>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full transition-all" style={{ width: `${completionPct}%` }} />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>RECOVERY & DISCIPLINE</span>
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                </div>
                <div className="space-y-2 my-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Night Sleep</span>
                    <span className={`font-mono font-semibold ${todayHealth.sleepHours >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {todayHealth.sleepHours} hrs (Target 8–10h)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Home Workout</span>
                    <span className={todayHealth.workoutDone ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                      {todayHealth.workoutDone ? 'Completed' : todayDayName === 'Sunday' ? 'Rest Day' : 'Scheduled 16:20'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">AM/PM Skincare + SPF</span>
                    <span className="font-mono text-sky-400">
                      {[todayHealth.amSkincare, todayHealth.sunscreenApplied, todayHealth.pmSkincare].filter(Boolean).length}/3
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Today's Command Timeline ({todayDayName})</h3>
                  <button onClick={() => setActiveTab('timetable')} className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
                    Full Weekly Grid <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {todayBlocks.map((b) => (
                    <div
                      key={b.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        b.status === 'Completed'
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : b.status === 'Missed'
                          ? 'bg-rose-950/20 border-rose-500/30'
                          : 'bg-slate-950/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="font-mono text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800 shrink-0">
                          {b.startTime}–{b.endTime}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-slate-100">{b.title}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{b.category}</span>
                            {b.subject && <span className="uppercase text-indigo-400">• {b.subject}</span>}
                            <span>• {b.plannedMinutes}m</span>
                          </div>
                        </div>
                      </div>
                      <select
                        value={b.status}
                        onChange={(e) => handleUpdateBlockStatus(b, e.target.value as TaskStatus)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Not started">Not started</option>
                        <option value="In progress">In progress</option>
                        <option value="Partially completed">Partially completed</option>
                        <option value="Completed">Completed</option>
                        <option value="Missed">Missed</option>
                        <option value="Postponed">Postponed</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="font-semibold text-white">Subject Mastery Progress</h3>
                  {(Object.keys(SUBJECT_META) as SubjectId[]).map((sub) => {
                    const subChaps = chapters.filter((c) => c.subject === sub);
                    const done = subChaps.filter((c) =>
                      ['Concept understood', 'Practising', 'NEB questions completed', 'Mastered through testing'].includes(c.status)
                    ).length;
                    const pct = subChaps.length ? Math.round((done / subChaps.length) * 100) : 0;
                    return (
                      <div key={sub} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-200">{SUBJECT_META[sub].label}</span>
                          <span className="font-mono text-slate-400">
                            {done}/{subChaps.length} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`${SUBJECT_META[sub].color} h-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="font-semibold text-white">United Academy 2083 Milestones</h3>
                  <div className="space-y-2.5 text-xs">
                    {UNITED_ACADEMY_EVENTS.map((ev, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="flex justify-between text-indigo-400 font-mono">
                          <span>{ev.nepali}</span>
                          <span>{ev.date}</span>
                        </div>
                        <div className="text-slate-200 font-medium mt-0.5">{ev.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timetable' && (
          <TimetableModule
            schedule={schedule}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            onUpdateStatus={handleUpdateBlockStatus}
            onDragStart={setDraggedBlockId}
            onDropDay={handleDropOnDay}
          />
        )}

        {activeTab === 'academics' && (
          <AcademicsModule
            chapters={chapters}
            selectedSubject={selectedSubject}
            setSelectedSubject={setSelectedSubject}
          />
        )}

        {activeTab === 'homework' && <HomeworkModule homework={homework} />}
        {activeTab === 'pea' && <PeaModule lectures={peaLectures} />}
        {activeTab === 'workout' && <WorkoutModule workouts={workouts} todayHealth={todayHealth} />}
        {activeTab === 'skincare' && <HealthModule todayHealth={todayHealth} />}
        {activeTab === 'revision' && <RevisionModule vault={vault} />}
        {activeTab === 'analytics' && (
          <AnalyticsModule chapters={chapters} schedule={schedule} healthLogs={healthLogs} homework={homework} />
        )}
        {activeTab === 'journal' && <JournalModule todayJournal={todayJournal} />}
        {activeTab === 'sync' && <SyncModule />}
      </main>
    </div>
  );
}

function TimetableModule({
  schedule,
  selectedDay,
  setSelectedDay,
  onUpdateStatus,
  onDragStart,
  onDropDay,
}: {
  schedule: ScheduleBlock[];
  selectedDay: DayOfWeek;
  setSelectedDay: (d: DayOfWeek) => void;
  onUpdateStatus: (b: ScheduleBlock, s: TaskStatus) => void;
  onDragStart: (id: string) => void;
  onDropDay: (d: DayOfWeek) => void;
}) {
  const days: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const [newTitle, setNewTitle] = useState('');
  const [newStart, setNewStart] = useState('15:00');
  const [newEnd, setNewEnd] = useState('16:00');
  const [newSub, setNewSub] = useState<SubjectId>('chemistry');

  const addFlexibleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await db.schedule.add({
      id: `custom-${Date.now()}`,
      day: selectedDay,
      startTime: newStart,
      endTime: newEnd,
      title: newTitle.trim(),
      category: 'DeepStudy',
      subject: newSub,
      isFixed: false,
      plannedMinutes: 60,
      actualMinutes: 0,
      status: 'Not started',
    });
    setNewTitle('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Sunday–Saturday Intelligent Timetable</h2>
          <p className="text-xs text-slate-400">
            Drag flexible study blocks between days. Fixed 5:30 AM–2:30 PM College & 6:00 PM–2:00 AM Sleep blocks are locked.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button
              key={d}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropDay(d)}
              onClick={() => setSelectedDay(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                selectedDay === d
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={addFlexibleBlock} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-400 mb-1">Add Flexible Block to {selectedDay}</label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g., GOC Isomerism Practice Set"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Subject</label>
          <select
            value={newSub}
            onChange={(e) => setNewSub(e.target.value as SubjectId)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(SUBJECT_META) as SubjectId[]).map((s) => (
              <option key={s} value={s}>{SUBJECT_META[s].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start</label>
          <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">End</label>
          <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white" />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Block
        </button>
      </form>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2.5">
        {schedule
          .filter((b) => b.day === selectedDay)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((block) => (
            <div
              key={block.id}
              draggable={!block.isFixed}
              onDragStart={() => onDragStart(block.id)}
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                block.isFixed ? 'bg-slate-950/50 border-slate-800/80' : 'bg-slate-950 border-indigo-500/30 cursor-grab'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                  {block.startTime} – {block.endTime}
                </span>
                <div>
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    <span>{block.title}</span>
                    {block.isFixed ? (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Fixed</span>
                    ) : (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">Flexible</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Planned: {block.plannedMinutes}m • Actual: {block.actualMinutes}m
                  </div>
                </div>
              </div>
              <select
                value={block.status}
                onChange={(e) => onUpdateStatus(block, e.target.value as TaskStatus)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value="Not started">Not started</option>
                <option value="In progress">In progress</option>
                <option value="Partially completed">Partially completed</option>
                <option value="Completed">Completed</option>
                <option value="Missed">Missed</option>
                <option value="Postponed">Postponed</option>
              </select>
            </div>
          ))}
      </div>
    </div>
  );
}

function AcademicsModule({
  chapters,
  selectedSubject,
  setSelectedSubject,
}: {
  chapters: any[];
  selectedSubject: SubjectId;
  setSelectedSubject: (s: SubjectId) => void;
}) {
  const [gradeFilter, setGradeFilter] = useState<'ALL' | 11 | 12>('ALL');
  const filtered = chapters.filter(
    (c) => c.subject === selectedSubject && (gradeFilter === 'ALL' || c.grade === gradeFilter)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Subject Workspaces & G11 Prerequisite Tracker</h2>
          <p className="text-xs text-slate-400">{SUBJECT_META[selectedSubject].targetGpaNote}</p>
        </div>
        <div className="flex gap-2">
          {(['ALL', 11, 12] as const).map((g) => (
            <button
              key={String(g)}
              onClick={() => setGradeFilter(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                gradeFilter === g ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              {g === 'ALL' ? 'All Grades' : `Grade ${g}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {(Object.keys(SUBJECT_META) as SubjectId[]).map((sub) => (
          <button
            key={sub}
            onClick={() => setSelectedSubject(sub)}
            className={`p-3 rounded-xl border text-left transition ${
              selectedSubject === sub
                ? 'bg-slate-900 border-indigo-500 text-white'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-xs font-semibold">{SUBJECT_META[sub].label}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {chapters.filter((c) => c.subject === sub).length} units
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((ch) => (
          <div key={ch.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${ch.grade === 11 ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                    Grade {ch.grade} • {ch.unit}
                  </span>
                  <span className="text-xs text-slate-400">{ch.priority} Priority</span>
                </div>
                <h4 className="text-base font-semibold text-white mt-1">{ch.title}</h4>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={ch.actualHours}
                  onChange={(e) => db.chapters.update(ch.id, { actualHours: parseFloat(e.target.value) || 0 })}
                  className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white"
                  title="Actual hours studied"
                />
                <span className="text-xs text-slate-400">/ {ch.estimatedHours}h</span>
                <select
                  value={ch.status}
                  onChange={(e) =>
                    db.chapters.update(ch.id, {
                      status: e.target.value as MasteryStatus,
                      lastRevised: new Date().toISOString().slice(0, 10),
                    })
                  }
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  {MASTERY_STEPS.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ch.topics.map((t: string, idx: number) => (
                <span key={idx} className="text-xs px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-300">
                  {t}
                </span>
              ))}
            </div>

            <input
              value={ch.notes}
              onChange={(e) => db.chapters.update(ch.id, { notes: e.target.value })}
              placeholder="Chapter key formulas, teacher emphasis, or prerequisite notes..."
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeworkModule({ homework }: { homework: any[] }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [dueDate, setDueDate] = useState('2026-11-30');

  const addHw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await db.homework.add({
      id: `hw-${Date.now()}`,
      subject,
      title: title.trim(),
      type: 'Homework',
      dueDate,
      priority: 'High',
      estimatedMinutes: 45,
      actualMinutes: 0,
      status: 'Not started',
    });
    setTitle('');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">College Homework, Practical Records & Notes</h2>
      <form onSubmit={addHw} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-slate-400 mb-1">Assignment / Lab Record</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Chemistry Salt Analysis Practical Copy" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Subject</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
            {(Object.keys(SUBJECT_META) as SubjectId[]).map((s) => (
              <option key={s} value={s}>{SUBJECT_META[s].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Deadline</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white">Add Task</button>
      </form>

      <div className="space-y-2.5">
        {homework.map((h) => (
          <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-indigo-400 font-mono uppercase">{h.subject} • Due {h.dueDate} • {h.type}</div>
              <div className="text-sm font-semibold text-white mt-0.5">{h.title}</div>
            </div>
            <select
              value={h.status}
              onChange={(e) => db.homework.update(h.id, { status: e.target.value as TaskStatus })}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value="Not started">Not started</option>
              <option value="In progress">In progress</option>
              <option value="Completed">Completed</option>
              <option value="Missed">Missed</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeaModule({ lectures }: { lectures: any[] }) {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState<'Physics' | 'Chemistry' | 'Mathematics' | 'English'>('Physics');

  const addLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    await db.peaLectures.add({
      id: `pea-${Date.now()}`,
      subject,
      topic: topic.trim(),
      lectureDate: new Date().toISOString().slice(0, 10),
      durationMinutes: 90,
      watchedMinutes: 0,
      timestamps: '',
      doubts: '',
      understood: false,
      status: 'Recorded',
    });
    setTopic('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">PEA Digital Recording & Catch-Up Queue</h2>
        <p className="text-xs text-slate-400">
          Days 1–90 Policy: Do not disrupt your 6:00 PM bedtime for live PEA classes. Log recordings here and watch selectively on Sunday triage or Phase 4.
        </p>
      </div>

      <form onSubmit={addLecture} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-slate-400 mb-1">Recorded Lecture Topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., Electrostatics Gauss Law MCQ Tricks" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Subject</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value as any)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
            <option>Physics</option>
            <option>Chemistry</option>
            <option>Mathematics</option>
            <option>English</option>
          </select>
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white">Queue Recording</button>
      </form>

      <div className="space-y-3">
        {lectures.map((l) => (
          <div key={l.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-mono text-indigo-400">{l.subject} • {l.lectureDate}</span>
                <h4 className="text-sm font-semibold text-white">{l.topic}</h4>
              </div>
              <select
                value={l.status}
                onChange={(e) => db.peaLectures.update(l.id, { status: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
              >
                <option value="Pending Recording">Pending Recording</option>
                <option value="Recorded">Recorded</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={l.timestamps}
                onChange={(e) => db.peaLectures.update(l.id, { timestamps: e.target.value })}
                placeholder="Key timestamps (e.g., 24:10 Shortcut formula)"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300"
              />
              <input
                value={l.doubts}
                onChange={(e) => db.peaLectures.update(l.id, { doubts: e.target.value })}
                placeholder="Unresolved doubts..."
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkoutModule({ workouts, todayHealth }: { workouts: any[]; todayHealth: any }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">6-Day Home Strength & Mobility Split (Sunday Rest)</h2>
          <p className="text-xs text-slate-400">Scheduled daily 16:20 – 17:05 PM (Mon–Sat). Progressive overload bodyweight & posture focus.</p>
        </div>
        <button
          onClick={() => db.healthLogs.put({ ...todayHealth, workoutDone: !todayHealth.workoutDone })}
          className={`px-4 py-2 rounded-xl text-xs font-semibold border ${
            todayHealth.workoutDone
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
              : 'bg-indigo-600 border-indigo-500 text-white'
          }`}
        >
          {todayHealth.workoutDone ? '✓ Today’s Session Logged' : 'Mark Today’s Workout Done'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {workouts.map((w) => (
          <div key={w.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-indigo-400 font-mono">{w.durationMinutes} MIN • HOME</div>
                <h4 className="font-semibold text-white text-sm mt-0.5">{w.dayLabel}</h4>
              </div>
              <input
                type="checkbox"
                checked={w.completed}
                onChange={(e) => db.workouts.update(w.id, { completed: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
            </div>
            <p className="text-xs text-slate-400">{w.focus}</p>
            <div className="space-y-2 pt-2 border-t border-slate-800">
              {w.exercises.map((ex: any, i: number) => (
                <div key={i} className="text-xs flex justify-between text-slate-200">
                  <span>{ex.name}</span>
                  <span className="font-mono text-slate-400">{ex.sets}×{ex.reps}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthModule({ todayHealth }: { todayHealth: any }) {
  const saveHealth = (patch: any) => db.healthLogs.put({ ...todayHealth, ...patch });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Sleep Recovery (8–10h Target) & Skincare Consistency</h2>
        <p className="text-xs text-slate-400">
          Classroom rest is never counted as sleep. Protect your 18:00–02:00 window and daily SPF 50 sun protection.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white">Night Sleep Log ({todayHealth.date})</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Bedtime</label>
              <input type="time" value={todayHealth.bedTime} onChange={(e) => saveHealth({ bedTime: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Wake Time</label>
              <input type="time" value={todayHealth.wakeTime} onChange={(e) => saveHealth({ wakeTime: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Actual Sleep (h)</label>
              <input type="number" step="0.5" value={todayHealth.sleepHours} onChange={(e) => saveHealth({ sleepHours: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono" />
            </div>
          </div>
          {todayHealth.sleepHours < 7.5 && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
              Sleep deficit detected ({todayHealth.sleepHours}h). At 16, aim for 8–10 hours nightly; avoid cutting bedtime past 18:15.
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white">AM/PM Skincare & Sun-Tan Recovery</h3>
          <div className="space-y-2.5 text-sm">
            <label className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
              <input type="checkbox" checked={todayHealth.amSkincare} onChange={(e) => saveHealth({ amSkincare: e.target.checked })} className="accent-sky-500" />
              <span>Morning Gentle Cleanse + Hydrating Moisturizer (04:50 AM)</span>
            </label>
            <label className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
              <input type="checkbox" checked={todayHealth.sunscreenApplied} onChange={(e) => saveHealth({ sunscreenApplied: e.target.checked })} className="accent-sky-500" />
              <span>Broad-Spectrum SPF 50 Sunscreen Applied Before 05:30 AM Commute</span>
            </label>
            <label className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
              <input type="checkbox" checked={todayHealth.pmSkincare} onChange={(e) => saveHealth({ pmSkincare: e.target.checked })} className="accent-sky-500" />
              <span>Evening Shower, Cleanse & Barrier Repair (17:05 PM)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function RevisionModule({ vault }: { vault: any[] }) {
  const [title, setTitle] = useState('');
  const [latex, setLatex] = useState('');
  const [type, setType] = useState<'Formula' | 'Mistake'>('Formula');
  const [subject, setSubject] = useState<SubjectId>('physics');

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await db.vault.add({
      id: `v-${Date.now()}`,
      type,
      subject,
      chapter: 'General',
      title: title.trim(),
      latexOrContent: latex.trim(),
      rootCause: type === 'Mistake' ? 'Concept Gap' : undefined,
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setTitle('');
    setLatex('');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">KaTeX Formula Vault & Mistake Notebook</h2>
      <form onSubmit={addItem} className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Entry Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
            <option value="Formula">Formula Vault</option>
            <option value="Mistake">Mistake Notebook</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Subject</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
            {(Object.keys(SUBJECT_META) as SubjectId[]).map((s) => (
              <option key={s} value={s}>{SUBJECT_META[s].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Concept / Error Summary</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Nernst Equation at 298K" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div className="flex gap-2">
          <input value={latex} onChange={(e) => setLatex(e.target.value)} placeholder="LaTeX: E = E^0 - \\frac{0.0591}{n}\\log Q" className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono" />
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white">Save</button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vault.map((item) => (
          <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className={`font-mono uppercase ${item.type === 'Mistake' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {item.type} • {item.subject}
              </span>
              <span className="text-slate-500">{item.createdAt}</span>
            </div>
            <div className="font-semibold text-sm text-white">{item.title}</div>
            {item.latexOrContent && (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto text-sm text-indigo-200">
                <MathText expression={item.latexOrContent} block />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsModule({ chapters, schedule, healthLogs, homework }: any) {
  const totalPlanned = schedule.reduce((a: number, b: any) => a + b.plannedMinutes, 0) / 60;
  const totalActual = schedule.reduce((a: number, b: any) => a + b.actualMinutes, 0) / 60;
  const masteredCount = chapters.filter((c: any) =>
    ['NEB questions completed', 'Mastered through testing'].includes(c.status)
  ).length;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Academic Comeback Readiness & Execution Analytics</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">WEEKLY PLANNED VS ACTUAL</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {totalActual.toFixed(1)}h <span className="text-sm text-slate-500">/ {totalPlanned.toFixed(1)}h</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">NEB-VERIFIED CHAPTERS</div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {masteredCount} / {chapters.length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">PENDING HOMEWORK</div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {homework.filter((h: any) => h.status !== 'Completed').length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">SLEEP LOGGED DAYS</div>
          <div className="text-2xl font-bold font-mono text-sky-400 mt-1">{healthLogs.length}</div>
        </div>
      </div>
    </div>
  );
}

function JournalModule({ todayJournal }: { todayJournal: any }) {
  const save = (patch: any) => db.journals.put({ ...todayJournal, ...patch });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Daily Reflection & Weekly Execution Review ({todayJournal.date})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-emerald-400">What did I accomplish today?</label>
          <textarea rows={3} value={todayJournal.accomplishments} onChange={(e) => save({ accomplishments: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white" />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-rose-400">Problems / Distractions Encountered</label>
          <textarea rows={3} value={todayJournal.problems} onChange={(e) => save({ problems: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white" />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-indigo-400">Top 3 Priorities for Tomorrow (02:15 AM Start)</label>
          <textarea rows={3} value={todayJournal.tomorrowPriorities} onChange={(e) => save({ tomorrowPriorities: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white" />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-amber-400">Weekly Review: What Failed & Next Adjustment</label>
          <textarea rows={3} value={todayJournal.weeklyAdjustment || ''} onChange={(e) => save({ weeklyAdjustment: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white" />
        </div>
      </div>
    </div>
  );
}

function SyncModule() {
  const [cfg, setCfg] = useState<GitHubSyncConfig>(
    () =>
      loadGitHubConfig() || {
        token: '',
        owner: '',
        repo: 'project90-data',
        branch: 'main',
        filePath: 'project90-backup.json',
      }
  );
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const handleDownloadBackup = async () => {
    const json = await exportFullDatabaseJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project90-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importFullDatabaseJSON(text);
      setStatusMsg('Local JSON backup restored and validated successfully.');
    } catch (err: any) {
      setStatusMsg(`Restore error: ${err.message}`);
    }
  };

  const handleGitHubPush = async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      saveGitHubConfig(cfg);
      const ts = await pushDatabaseToGitHub(cfg);
      setCfg({ ...cfg, lastSyncedAt: ts });
      setStatusMsg(`Committed & pushed database snapshot to GitHub (${ts}).`);
    } catch (err: any) {
      setStatusMsg(`GitHub Push Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleGitHubPull = async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      saveGitHubConfig(cfg);
      await pullDatabaseFromGitHub(cfg);
      setStatusMsg('Pulled and restored latest snapshot from your private GitHub repository.');
    } catch (err: any) {
      setStatusMsg(`GitHub Pull Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-white">GitHub-Only Persistence & Disaster Recovery</h2>
        <p className="text-xs text-slate-400">
          All changes auto-save immediately to your browser’s IndexedDB. Use Private GitHub Repo Sync below to commit private JSON snapshots directly to GitHub without any third-party backend.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Github className="w-5 h-5" />
          <span>Private GitHub Repository Sync</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">GitHub Username / Owner</label>
            <input value={cfg.owner} onChange={(e) => setCfg({ ...cfg, owner: e.target.value })} placeholder="your-github-username" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Private Data Repo Name</label>
            <input value={cfg.repo} onChange={(e) => setCfg({ ...cfg, repo: e.target.value })} placeholder="project90-data" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-400 mb-1">Fine-Grained Personal Access Token (Contents: Read & Write)</label>
            <input type="password" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} placeholder="github_pat_..." className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} onClick={handleGitHubPush} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Commit & Push to GitHub
          </button>
          <button disabled={busy} onClick={handleGitHubPull} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white">
            Pull Latest from GitHub
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-white text-sm">Local File Backup & Restore (Zod Validated)</h3>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleDownloadBackup} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export JSON Snapshot
          </button>
          <label className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Import JSON Snapshot
            <input type="file" accept=".json" onChange={handleUploadBackup} className="hidden" />
          </label>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-xs text-indigo-200">
          {statusMsg}
        </div>
      )}
    </div>
  );
}
