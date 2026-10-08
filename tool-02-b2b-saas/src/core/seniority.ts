// Seniority from a job title (spec FR-3), editable afterwards. Unknown titles stay null, and the
// new-executive rule never fires on null (spec edge case 14).

export type Seniority = "EXEC" | "VP" | "DIRECTOR" | "MANAGER" | "IC";

const PATTERNS: Array<[RegExp, Seniority]> = [
  [/\b(chief|ceo|cfo|coo|cto|cio|cro|cmo|cpo|president|founder|owner|partner)\b|\bc[a-z]o\b/i, "EXEC"],
  [/\b(vp|svp|evp|vice president|head of)\b/i, "VP"],
  [/\b(director|controller)\b/i, "DIRECTOR"],
  [/\b(manager|lead|supervisor)\b/i, "MANAGER"],
  [/\b(analyst|specialist|associate|accountant|engineer|coordinator|clerk|administrator)\b/i, "IC"],
];

export function seniorityFromTitle(title: string | null | undefined): Seniority | null {
  if (!title?.trim()) return null;
  for (const [re, s] of PATTERNS) if (re.test(title)) return s;
  return null;
}
