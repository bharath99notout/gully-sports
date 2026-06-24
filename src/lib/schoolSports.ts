export type SchoolGender = 'boys' | 'girls' | 'mixed';
export type SchoolEventType = 'track' | 'field';
export type SchoolResultMetric = 'time_seconds' | 'distance_cm' | 'height_cm';

export type SchoolEventTemplate = {
  key: string;
  name: string;
  eventType: SchoolEventType;
  resultMetric: SchoolResultMetric;
};

export const SCHOOL_EVENT_TEMPLATES: SchoolEventTemplate[] = [
  { key: '100m', name: '100m', eventType: 'track', resultMetric: 'time_seconds' },
  { key: '200m', name: '200m', eventType: 'track', resultMetric: 'time_seconds' },
  { key: '400m', name: '400m', eventType: 'track', resultMetric: 'time_seconds' },
  { key: 'long_jump', name: 'Long jump', eventType: 'field', resultMetric: 'distance_cm' },
  { key: 'high_jump', name: 'High jump', eventType: 'field', resultMetric: 'height_cm' },
  { key: 'shot_put', name: 'Shot put', eventType: 'field', resultMetric: 'distance_cm' },
];

export const SCHOOL_DEFAULT_HOUSES = ['Red', 'Blue', 'Green', 'Yellow'];

export const SCHOOL_DEFAULT_CLASSES = [
  'Nursery',
  'LKG',
  'UKG',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
];

export function schoolMetricLabel(metric: SchoolResultMetric) {
  if (metric === 'time_seconds') return 'Time';
  if (metric === 'height_cm') return 'Height';
  return 'Distance';
}

export function schoolMetricUnit(metric: SchoolResultMetric) {
  return metric === 'time_seconds' ? 'sec' : 'cm';
}

export function schoolGenderLabel(gender: SchoolGender) {
  if (gender === 'boys') return 'Boys';
  if (gender === 'girls') return 'Girls';
  return 'Combined';
}

export function schoolGenderChipClass(gender: SchoolGender) {
  if (gender === 'boys') {
    return 'border-sky-700/70 bg-sky-950/40 text-sky-300';
  }
  if (gender === 'girls') {
    return 'border-fuchsia-700/70 bg-fuchsia-950/40 text-fuchsia-300';
  }
  return 'border-emerald-900/70 bg-emerald-950/40 text-emerald-300';
}

export function studentCanJoinEvent(studentGender: SchoolGender, eventGender: SchoolGender) {
  return studentGender === eventGender;
}

export function formatSchoolResult(value: number | null | undefined, metric: SchoolResultMetric) {
  if (value == null || Number.isNaN(value)) return '-';
  if (metric === 'time_seconds') return `${Number(value).toFixed(2)}s`;
  const metres = Number(value) / 100;
  return `${metres.toFixed(2)}m`;
}

export function pointsForRank(rank: number | null | undefined) {
  if (rank === 1) return 5;
  if (rank === 2) return 3;
  if (rank === 3) return 1;
  return 0;
}

export function medalForRank(rank: number | null | undefined): 'gold' | 'silver' | 'bronze' | null {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}
