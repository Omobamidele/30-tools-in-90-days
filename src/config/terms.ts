import type { OrgConfig } from "./schema";

export type TermKey = keyof OrgConfig["terminology"];

// Domain nouns come from the organisation's terminology (spec §14), never hard-coded.
export function term(config: OrgConfig, key: TermKey, opts: { plural?: boolean; lower?: boolean } = {}): string {
  const noun = config.terminology[key];
  const word = opts.plural ? noun.plural : noun.singular;
  return opts.lower ? word.toLowerCase() : word;
}
