import { tr, type StringKey } from '@/lib/i18n';
import type { SurveyAnswer, SurveyQuestion, SurveyResponse } from '@/lib/types';

export type QuestionTypeInfo = {
  /** Stored in the survey's questions; never translated. */
  id: SurveyQuestion['type'];
  /** Translation key: inside components prefer t(qt.labelKey). */
  labelKey: StringKey;
  /** The label in the current language (read at call time). */
  readonly label: string;
};

function questionType(id: SurveyQuestion['type'], labelKey: StringKey): QuestionTypeInfo {
  return {
    id,
    labelKey,
    get label() {
      return tr(labelKey);
    },
  };
}

export const QUESTION_TYPES: QuestionTypeInfo[] = [
  questionType('single', 's_qtSingle'),
  questionType('multi', 's_qtMulti'),
  questionType('scale', 's_qtScale'),
  questionType('text', 's_qtText'),
];

export const SCALE = [1, 2, 3, 4, 5];

export function isAnswered(q: SurveyQuestion, a: SurveyAnswer | undefined) {
  if (a == null) return false;
  if (q.type === 'multi') return Array.isArray(a) && a.length > 0;
  if (q.type === 'scale') return typeof a === 'number' && SCALE.includes(a);
  return typeof a === 'string' && a.trim().length > 0;
}

/** The first required question left blank, if any. */
export function missingRequired(questions: SurveyQuestion[], answers: Record<string, SurveyAnswer>) {
  return questions.find((q) => q.required && !isAnswered(q, answers[q.id]));
}

export type QuestionSummary =
  | { q: SurveyQuestion; kind: 'counts'; answered: number; counts: { label: string; n: number }[] }
  | { q: SurveyQuestion; kind: 'scale'; answered: number; average: number | null; counts: { label: string; n: number }[] }
  | { q: SurveyQuestion; kind: 'text'; answered: number; quotes: string[]; withheld: number };

/**
 * Totals for each question. Written answers are only listed when the member agreed they may be quoted;
 * the rest are counted but not shown.
 */
export function summarize(questions: SurveyQuestion[], responses: SurveyResponse[]): QuestionSummary[] {
  return questions.map((q) => {
    const given = responses.filter((r) => isAnswered(q, r.answers[q.id]));
    if (q.type === 'text') {
      const quotes = given.filter((r) => r.consent_share).map((r) => String(r.answers[q.id]).trim());
      return { q, kind: 'text', answered: given.length, quotes, withheld: given.length - quotes.length };
    }
    if (q.type === 'scale') {
      const values = given.map((r) => r.answers[q.id] as number);
      const average = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
      return { q, kind: 'scale', answered: given.length, average, counts: SCALE.map((n) => ({ label: String(n), n: values.filter((v) => v === n).length })) };
    }
    const picks = given.flatMap((r) => {
      const a = r.answers[q.id];
      return Array.isArray(a) ? a : [String(a)];
    });
    return { q, kind: 'counts', answered: given.length, counts: (q.options ?? []).map((label) => ({ label, n: picks.filter((p) => p === label).length })) };
  });
}

function cell(raw: string) {
  // A written answer starting with = + - @ would run as a formula in Excel or Sheets: make it plain text.
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * One row per response, no names or member ids. Column names and the "(not shared)" marker stay in English
 * on purpose: this is a data file for spreadsheets and BFI's reports, and it should read the same whoever exports it. Written answers from members who did not agree
 * to be quoted are left out.
 */
export function toCsv(questions: SurveyQuestion[], responses: SurveyResponse[]) {
  const header = ['response', 'answered_on', 'may_quote', ...questions.map((q) => q.prompt)];
  const rows = responses.map((r, i) => [
    String(i + 1),
    r.updated_at.slice(0, 10),
    r.consent_share ? 'yes' : 'no',
    ...questions.map((q) => {
      const a = r.answers[q.id];
      if (a == null) return '';
      if (q.type === 'text' && !r.consent_share) return '(not shared)';
      return Array.isArray(a) ? a.join('; ') : String(a);
    }),
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
}
