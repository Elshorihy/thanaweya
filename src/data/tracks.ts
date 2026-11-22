export const TRACKS = ['علمي علوم', 'علمي رياضة', 'أدبي'] as const;
export type Track = typeof TRACKS[number];

// Keep profile.section as an Arabic string for backups, sync and older clients.
export function resolveTrack(value: string | undefined): Track | undefined {
  const key = (value || '').normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[\sـ_-]+/g, '').toLowerCase();
  const aliases: Record<string, Track> = {
    'علميعلوم': 'علمي علوم', 'علمىعلوم': 'علمي علوم', 'علوم': 'علمي علوم',
    'علميرياضه': 'علمي رياضة', 'علمىرياضه': 'علمي رياضة', 'رياضه': 'علمي رياضة', 'علميرياضيات': 'علمي رياضة',
    'ادبي': 'أدبي', 'ادبى': 'أدبي',
  };
  return aliases[key];
}
