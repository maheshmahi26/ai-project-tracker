import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layouts/app-shell';
import { AuthLayout } from './layouts/auth-layout';
import { RouteErrorBoundary } from '@/components/error-boundary/route-error-boundary';
import NotFoundPage from '@/features/misc/not-found-page';

// Route-level code splitting: each page is a separate chunk, loaded on demand and
// shown behind the layout's <Suspense> skeleton.
const DashboardPage = lazy(() => import('@/features/dashboard/routes/dashboard-page'));
const ProjectsPage = lazy(() => import('@/features/projects/routes/projects-page'));
const TasksPage = lazy(() => import('@/features/tasks/routes/tasks-page'));
const SettingsPage = lazy(() => import('@/features/settings/routes/settings-page'));
const LoginPage = lazy(() => import('@/features/auth/routes/login-page'));

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [{ path: 'login', element: <LoginPage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
]);
