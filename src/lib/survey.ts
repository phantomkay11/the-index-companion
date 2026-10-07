import type { SurveyAnswer, SurveyQuestion, SurveyResponse } from '@/lib/types';

export const QUESTION_TYPES: { id: SurveyQuestion['type']; label: string }[] = [
  { id: 'single', label: 'Pick one' },
  { id: 'multi', label: 'Pick any' },
  { id: 'scale', label: '1 to 5' },
  { id: 'text', label: 'Written answer' },
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

/**
 * One CSV cell. Text that starts like a formula (= + - @, tab or return) gets a leading apostrophe so
 * Excel and Sheets show it instead of running it; quotes, commas and line breaks are quoted.
 */
function cell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * One row per response, no names or member ids. Written answers from members who did not agree
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
  // The byte-order mark tells Excel the file is UTF-8, so Kreyòl, español and français open correctly.
  return '\uFEFF' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}
