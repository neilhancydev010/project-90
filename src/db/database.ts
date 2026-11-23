import Dexie, { Table } from 'dexie';
import {
  ChapterItem,
  ScheduleBlock,
  HomeworkItem,
  PeaLecture,
  WorkoutSession,
  DailyHealthLog,
  FormulaOrMistake,
  TestRecord,
  JournalEntry,
  BackupSchema,
} from '../types/project90';
import {
  INITIAL_CHAPTERS,
  INITIAL_SCHEDULE,
  INITIAL_HOMEWORK,
  INITIAL_PEA,
  INITIAL_WORKOUTS,
  INITIAL_VAULT,
} from './seedData';

export class Project90DB extends Dexie {
  chapters!: Table<ChapterItem, string>;
  schedule!: Table<ScheduleBlock, string>;
  homework!: Table<HomeworkItem, string>;
  peaLectures!: Table<PeaLecture, string>;
  workouts!: Table<WorkoutSession, string>;
  healthLogs!: Table<DailyHealthLog, string>;
  vault!: Table<FormulaOrMistake, string>;
  tests!: Table<TestRecord, string>;
  journals!: Table<JournalEntry, string>;

  constructor() {
    super('Project90CommandCenterDB');
    this.version(1).stores({
      chapters: 'id, subject, grade, status, priority',
      schedule: 'id, day, category, subject, status',
      homework: 'id, subject, dueDate, status, priority',
      peaLectures: 'id, subject, status',
      workouts: 'id, date, completed',
      healthLogs: 'date',
      vault: 'id, type, subject, chapter',
      tests: 'id, date, subject',
      journals: 'date',
    });
  }
}

export const db = new Project90DB();

export async function ensureSeeded() {
  const chapterCount = await db.chapters.count();
  if (chapterCount === 0) {
    await db.transaction('rw', [db.chapters, db.schedule, db.homework, db.peaLectures, db.workouts, db.vault], async () => {
      await db.chapters.bulkAdd(INITIAL_CHAPTERS);
      await db.schedule.bulkAdd(INITIAL_SCHEDULE);
      await db.homework.bulkAdd(INITIAL_HOMEWORK);
      await db.peaLectures.bulkAdd(INITIAL_PEA);
      await db.workouts.bulkAdd(INITIAL_WORKOUTS);
      await db.vault.bulkAdd(INITIAL_VAULT);
    });
  }
}

export async function exportFullDatabaseJSON(): Promise<string> {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    chapters: await db.chapters.toArray(),
    schedule: await db.schedule.toArray(),
    homework: await db.homework.toArray(),
    peaLectures: await db.peaLectures.toArray(),
    workouts: await db.workouts.toArray(),
    healthLogs: await db.healthLogs.toArray(),
    vault: await db.vault.toArray(),
    tests: await db.tests.toArray(),
    journals: await db.journals.toArray(),
  };
  return JSON.stringify(payload, null, 2);
}

export async function importFullDatabaseJSON(rawJson: string): Promise<void> {
  const parsed = BackupSchema.parse(JSON.parse(rawJson));
  await db.transaction(
    'rw',
    [db.chapters, db.schedule, db.homework, db.peaLectures, db.workouts, db.healthLogs, db.vault, db.tests, db.journals],
    async () => {
      await Promise.all([
        db.chapters.clear(),
        db.schedule.clear(),
        db.homework.clear(),
        db.peaLectures.clear(),
        db.workouts.clear(),
        db.healthLogs.clear(),
        db.vault.clear(),
        db.tests.clear(),
        db.journals.clear(),
      ]);
      if (parsed.chapters.length) await db.chapters.bulkAdd(parsed.chapters);
      if (parsed.schedule.length) await db.schedule.bulkAdd(parsed.schedule);
      if (parsed.homework.length) await db.homework.bulkAdd(parsed.homework);
      if (parsed.peaLectures.length) await db.peaLectures.bulkAdd(parsed.peaLectures);
      if (parsed.workouts.length) await db.workouts.bulkAdd(parsed.workouts);
      if (parsed.healthLogs.length) await db.healthLogs.bulkAdd(parsed.healthLogs);
      if (parsed.vault.length) await db.vault.bulkAdd(parsed.vault);
      if (parsed.tests.length) await db.tests.bulkAdd(parsed.tests);
      if (parsed.journals.length) await db.journals.bulkAdd(parsed.journals);
    }
  );
}
