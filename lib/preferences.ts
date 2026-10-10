// Shared by profile editing, item onboarding and research. Keep this module browser-safe.
export const priorityPresets = [
  'Performance', 'Value for money', 'Durability', 'Ease of use', 'Low maintenance',
  'Warranty & support', 'Sustainability', 'Design & comfort',
] as const;
export const MAX_CUSTOM_TAGS = 16;
export const MAX_TAG_LENGTH = 80;
export type Preferences = { priorities: string[]; customTags: string[] };
const legacyPriorities: Record<string, string> = {
  'smooth & fast': 'Performance', 'long life': 'Durability', 'simple software': 'Ease of use',
};
const presetNames = new Map<string, string>(priorityPresets.map(name => [name.toLowerCase(), name]));

function strings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > priorityPresets.length + MAX_CUSTOM_TAGS || value.some(tag => typeof tag !== 'string')) {
    throw new Error(`${label} must be a list of text labels.`);
  }
  return value.map(tag => {
    const trimmed = tag.trim();
    if (trimmed.length > MAX_TAG_LENGTH) throw new Error(`Preference labels must be ${MAX_TAG_LENGTH} characters or fewer.`);
    return trimmed;
  }).filter(Boolean);
}

export function normalizePreferences(profile: unknown = {}): Preferences {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Invalid preferences.');
  const input = profile as Record<string, unknown>;
  const priorities: string[] = [];
  const customTags: string[] = [];
  const unknownPriorities: string[] = [];
  const seen = new Set<string>();
  for (const name of strings(input.priorities, 'Priorities')) {
    const canonical = presetNames.get(name.toLowerCase()) || legacyPriorities[name.toLowerCase()];
    if (!canonical) { unknownPriorities.push(name); continue; }
    if (!seen.has(canonical.toLowerCase())) { priorities.push(canonical); seen.add(canonical.toLowerCase()); }
  }
  for (const tag of [...unknownPriorities, ...strings(input.customTags, 'Custom tags')]) {
    if (seen.has(tag.toLowerCase())) continue;
    customTags.push(tag); seen.add(tag.toLowerCase());
  }
  if (customTags.length > MAX_CUSTOM_TAGS) throw new Error(`Choose up to ${MAX_CUSTOM_TAGS} custom preference tags.`);
  return { priorities, customTags };
}
