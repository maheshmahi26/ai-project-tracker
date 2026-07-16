import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layouts/app-shell';
import { AuthLayout } from './layouts/auth-layout';
import { RequireAuth } from './guards/require-auth';
import { RequireOrg } from './guards/require-org';
import { RedirectIfAuthed } from './guards/redirect-if-authed';
import { RouteErrorBoundary } from '@/components/error-boundary/route-error-boundary';
import NotFoundPage from '@/features/misc/not-found-page';

// Route-level code splitting: each page is a separate chunk, loaded on demand and
// shown behind the layout's <Suspense> skeleton.
const DashboardPage = lazy(() => import('@/features/dashboard/routes/dashboard-page'));
const ProjectsPage = lazy(() => import('@/features/projects/routes/projects-page'));
const ProjectDetailPage = lazy(() => import('@/features/projects/routes/project-detail-page'));
const TasksPage = lazy(() => import('@/features/tasks/routes/tasks-page'));
const TaskDetailPage = lazy(() => import('@/features/tasks/routes/task-detail-page'));
const SettingsPage = lazy(() => import('@/features/settings/routes/settings-page'));
const OnboardingPage = lazy(() => import('@/features/organizations/routes/onboarding-page'));

const LoginPage = lazy(() => import('@/features/auth/routes/login-page'));
const RegisterPage = lazy(() => import('@/features/auth/routes/register-page'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/routes/forgot-password-page'));
const ResetPasswordPage = lazy(() => import('@/features/auth/routes/reset-password-page'));
const AuthCallbackPage = lazy(() => import('@/features/auth/routes/auth-callback-page'));

export const router = createBrowserRouter([
  {
    // Everything here requires a session.
    element: <RequireAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      // Authenticated but org-context not required (no shell chrome).
      { path: 'onboarding', element: <OnboardingPage /> },
      {
        // Requires an active organization, then renders the app shell.
        element: <RequireOrg />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'projects', element: <ProjectsPage /> },
              { path: 'projects/:projectId', element: <ProjectDetailPage /> },
              { path: 'tasks', element: <TasksPage /> },
              { path: 'tasks/:taskId', element: <TaskDetailPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    // Auth screens — signed-in users are bounced back into the app.
    element: <RedirectIfAuthed />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
  {
    // OAuth return: refresh cookie is already set; AuthBootstrap resolves the session.
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [{ path: 'auth/callback', element: <AuthCallbackPage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
]);
