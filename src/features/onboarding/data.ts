export const EDUCATION_LEVELS = [
  'High School',
  'Associate Degree',
  "Bachelor's",
  "Master's",
  'PhD',
  'Other',
];

export const GPA_SCALES = ['4.0 scale', '5.0 scale', '10.0 scale', 'Percentage'];

// Keep as a data-driven list so new countries can be added without code changes.
// "Other" is excluded here and appended in the UI to allow free-text entry.
export const DESTINATIONS = [
  'USA',
  'UK',
  'Canada',
  'Australia',
  'Germany',
  'Netherlands',
  'Sweden',
  'Finland',
];

export const DEGREE_LEVELS = ['Bachelor', 'Master', 'PhD'];

export const INTEREST_OPTIONS = [
  { value: 'universities', label: 'Universities', description: 'Programmes & courses' },
  { value: 'scholarships', label: 'Scholarships', description: 'Funding opportunities' },
  { value: 'both', label: 'Both', description: 'Programmes with funding' },
];

export const FUNDING_OPTIONS = [
  { value: 'fully_funded', label: 'Fully funded', description: 'Tuition + living stipend' },
  { value: 'partially_funded', label: 'Partially funded', description: 'Covers part of the costs' },
  { value: 'tuition_fee_waiver', label: 'Tuition fee waiver', description: 'Fees waived, living costs on you' },
  { value: 'any', label: 'Any funding', description: 'Open to everything' },
];

export const TUITION_PREFERENCES = [
  { value: 'fully_funded_only', label: 'Fully funded only' },
  { value: 'low_tuition', label: 'Low tuition' },
  { value: 'any', label: 'Any tuition range' },
];

export const IELT_STATUSES = [
  { value: 'not_required', label: 'Not required' },
  { value: 'not_started', label: 'Not started yet' },
  { value: 'preparing', label: 'Currently preparing' },
  { value: 'completed', label: 'Already taken' },
];

export const IELT_BANDS = ['5.5', '6.0', '6.5', '7.0', '7.5', '8.0'];

export const INTAKES = ['Fall 2027', 'Spring 2028', 'Fall 2028'];

export const GRADUATION_YEARS = (() => {
  const start = new Date().getFullYear() - 2;
  return Array.from({ length: 10 }, (_, i) => start + i);
})();