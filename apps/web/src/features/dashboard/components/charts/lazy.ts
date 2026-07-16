import { lazy } from 'react';

/**
 * Recharts is heavy, so every chart is a `React.lazy` chunk. Combined with the
 * lazily-loaded dashboard route, Recharts never ships in the initial bundle and
 * only downloads when a chart first mounts. `ChartFrame` provides the Suspense
 * fallback + error boundary around these.
 */
export const VelocityChart = lazy(() => import('./velocity-chart'));
export const BurndownChart = lazy(() => import('./burndown-chart'));
export const TasksPerUserChart = lazy(() => import('./tasks-per-user-chart'));
export const PriorityDistributionChart = lazy(() => import('./priority-distribution-chart'));
export const CompletionChart = lazy(() => import('./completion-chart'));
export const ProjectProgressChart = lazy(() => import('./project-progress-chart'));
