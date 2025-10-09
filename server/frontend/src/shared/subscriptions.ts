export const PLAN_TITLES = {
  simple: 'Простой выбор',
  medium: 'Спокойствие в деталях',
  premium: 'Жизнь без забот',
} as const;

export const PERIOD_TITLES = {
  month: 'месячная',
  year: 'годовая',
} as const;

export type PlanCode = keyof typeof PLAN_TITLES;
export type PeriodCode = keyof typeof PERIOD_TITLES;

