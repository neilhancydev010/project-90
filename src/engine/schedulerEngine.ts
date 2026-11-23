import { ScheduleBlock, ChapterItem, DayOfWeek, RescheduleProposal, SubjectId } from '../types/project90';

export const PROJECT_START = new Date('2026-11-23T00:00:00');
export const NEB_BOARD_DATE = new Date('2027-04-14T00:00:00');
export const SENDUP_END_DATE = new Date('2027-03-17T00:00:00');

export function getMissionClock(now = new Date()) {
  const diffDays = Math.max(1, Math.floor((now.getTime() - PROJECT_START.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const daysToBoards = Math.max(0, Math.ceil((NEB_BOARD_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const daysToSendup = Math.max(0, Math.ceil((SENDUP_END_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  let phase: { number: number; name: string; range: string; focus: string } = {
    number: 1,
    name: 'Phase 1 — Grade 12 Comeback',
    range: 'Days 1–70',
    focus: 'Exam-oriented 1st pass of entire G12 syllabus + G11 Chem/Math foundations.',
  };

  if (diffDays > 70 && diffDays <= 90) {
    phase = {
      number: 2,
      name: 'Phase 2 — Consolidation',
      range: 'Days 71–90',
      focus: 'Close conceptual gaps, chapter tests, and NEB past-question verification.',
    };
  } else if (diffDays > 90 && diffDays <= 140) {
    phase = {
      number: 3,
      name: 'Phase 3 — NEB Board Sprint',
      range: 'Days 91–140',
      focus: 'Full-length board mock papers, timed derivations, and mistake elimination.',
    };
  } else if (diffDays > 140) {
    phase = {
      number: 4,
      name: 'Phase 4 — IOE Entrance Prep',
      range: 'Days 141–230',
      focus: 'Pulchowk Computer Engineering MCQ speed drills & full entrance mocks.',
    };
  }

  return { missionDay: diffDays, daysToBoards, daysToSendup, phase };
}

export function getTodayDayName(now = new Date()): DayOfWeek {
  const map: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return map[now.getDay()];
}

export function getCurrentAndNextBlock(todayBlocks: ScheduleBlock[], now = new Date()) {
  const sorted = [...todayBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  let current: ScheduleBlock | null = null;
  let next: ScheduleBlock | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const start = toMins(sorted[i].startTime);
    const end = toMins(sorted[i].endTime);
    if (end < start) {
      if (currentMins >= start || currentMins < end) {
        current = sorted[i];
        next = sorted[0];
        break;
      }
    } else if (currentMins >= start && currentMins < end) {
      current = sorted[i];
      next = sorted[i + 1] || sorted[0];
      break;
    } else if (start > currentMins && !next) {
      next = sorted[i];
    }
  }

  return { current, next };
}

export function evaluateIntelligentReschedule(
  missedBlock: ScheduleBlock,
  allBlocks: ScheduleBlock[],
  chapters: ChapterItem[]
): RescheduleProposal {
  const subjectPriority: Record<SubjectId, 'Critical' | 'High' | 'Normal'> = {
    chemistry: 'Critical',
    physics: 'Critical',
    mathematics: 'High',
    computer: 'Normal',
    english: 'Normal',
    nepali: 'Normal',
  };

  const importance = missedBlock.subject ? subjectPriority[missedBlock.subject] : 'Normal';
  const sundayCapacity = allBlocks.filter((b) => b.day === 'Sunday' && b.category === 'DeepStudy');
  const isCritical = importance === 'Critical';

  return {
    blockId: missedBlock.id,
    blockTitle: missedBlock.title,
    originalDay: missedBlock.day,
    reason: `Marked as ${missedBlock.status}. Protected 8h sleep and 5:30 AM–2:30 PM college blocks preserved.`,
    importance,
    suggestedDay: isCritical ? 'Sunday' : 'Saturday',
    suggestedSlot: isCritical ? '02:15 – 04:30 AM (Sunday Triage Queue)' : '05:30 – 08:00 AM (Saturday Consolidation)',
    impactNote: isCritical
      ? `High-deficit subject (${missedBlock.subject?.toUpperCase()}). ${sundayCapacity.length} triage slots available without causing weekday burnout.`
      : 'Lower urgency—absorbed into weekend buffer without disrupting weekday Physics/Chemistry deep work.',
  };
}
