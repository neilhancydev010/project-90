import { z } from 'zod';

export type SubjectId = 'physics' | 'chemistry' | 'mathematics' | 'english' | 'nepali' | 'computer';

export type MasteryStatus =
  | 'Not started'
  | 'Learning'
  | 'Concept understood'
  | 'Practising'
  | 'NEB questions completed'
  | 'Revision required'
  | 'Mastered through testing';

export type TaskStatus =
  | 'Not started'
  | 'In progress'
  | 'Partially completed'
  | 'Completed'
  | 'Missed'
  | 'Postponed';

export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface ChapterItem {
  id: string;
  subject: SubjectId;
  grade: 11 | 12;
  unit: string;
  title: string;
  topics: string[];
  status: MasteryStatus;
  priority: 'Critical' | 'High' | 'Normal';
  estimatedHours: number;
  actualHours: number;
  notes: string;
  lastRevised?: string;
  nextRevisionDue?: string;
}

export interface ScheduleBlock {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  title: string;
  category: 'Sleep' | 'College' | 'DeepStudy' | 'Homework' | 'Workout' | 'Skincare' | 'PEA' | 'Rest';
  subject?: SubjectId;
  isFixed: boolean;
  plannedMinutes: number;
  actualMinutes: number;
  status: TaskStatus;
  notes?: string;
}

export interface HomeworkItem {
  id: string;
  subject: SubjectId;
  title: string;
  type: 'Homework' | 'Practical Record' | 'Written Assignment' | 'College Notes';
  dueDate: string;
  priority: 'High' | 'Medium' | 'Low';
  estimatedMinutes: number;
  actualMinutes: number;
  status: TaskStatus;
}

export interface PeaLecture {
  id: string;
  subject: 'Physics' | 'Chemistry' | 'Mathematics' | 'English';
  topic: string;
  lectureDate: string;
  durationMinutes: number;
  watchedMinutes: number;
  timestamps: string;
  doubts: string;
  understood: boolean;
  status: 'Pending Recording' | 'Recorded' | 'In Progress' | 'Completed';
}

export interface WorkoutSession {
  id: string;
  date: string;
  dayLabel: string;
  focus: string;
  exercises: { name: string; sets: number; reps: string; notes?: string }[];
  durationMinutes: number;
  completed: boolean;
  recoveryScore: number;
}

export interface DailyHealthLog {
  date: string;
  sleepHours: number;
  bedTime: string;
  wakeTime: string;
  amSkincare: boolean;
  sunscreenApplied: boolean;
  pmSkincare: boolean;
  groomingNotes: string;
  workoutDone: boolean;
}

export interface FormulaOrMistake {
  id: string;
  type: 'Formula' | 'Mistake';
  subject: SubjectId;
  chapter: string;
  title: string;
  latexOrContent: string;
  rootCause?: 'Concept Gap' | 'Formula Error' | 'Calculation Slip' | 'Careless Read';
  createdAt: string;
}

export interface TestRecord {
  id: string;
  date: string;
  title: string;
  subject: SubjectId | 'Full Mock';
  totalMarks: number;
  scoredMarks: number;
  weakTopics: string;
}

export interface JournalEntry {
  date: string;
  accomplishments: string;
  problems: string;
  unfinishedTasks: string;
  tomorrowPriorities: string;
  productivityRating: number;
  weeklyWin?: string;
  weeklyFailure?: string;
  weeklyAdjustment?: string;
}

export interface GitHubSyncConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  lastSyncedAt?: string;
}

export interface RescheduleProposal {
  blockId: string;
  blockTitle: string;
  originalDay: DayOfWeek;
  reason: string;
  importance: 'Critical' | 'High' | 'Normal';
  suggestedDay: DayOfWeek;
  suggestedSlot: string;
  impactNote: string;
}

export const BackupSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  chapters: z.array(z.any()),
  schedule: z.array(z.any()),
  homework: z.array(z.any()),
  peaLectures: z.array(z.any()),
  workouts: z.array(z.any()),
  healthLogs: z.array(z.any()),
  vault: z.array(z.any()),
  tests: z.array(z.any()),
  journals: z.array(z.any()),
});
