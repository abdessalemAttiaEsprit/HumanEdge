/**
 * Translates a skill label if it's a known catalog key (see backend SkillCatalog.java) — e.g.
 * "TEAMWORK" → "Travail d'équipe"/"Teamwork". A custom, freely-typed skill (not in the catalog)
 * has no translation available and is shown as-is, in whichever language it was typed.
 */
export function translateSkillLabel(label: string, skillCatalog: Record<string, string>): string {
  return skillCatalog[label] ?? label;
}
