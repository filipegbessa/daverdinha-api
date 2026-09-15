export const CATEGORY_COLORS = [
  '#185928',
  '#7a3247',
  '#a15c38',
  '#b8862c',
  '#2c6e6b',
  '#5b3a6b',
  '#3a5a7a',
  '#8a7f4f',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];
