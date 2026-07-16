import { RouterProvider } from 'react-router-dom';
import { Providers } from '@/app/providers';
import { AuthBootstrap } from '@/app/auth-bootstrap';
import { router } from '@/app/router';

export function App(): React.JSX.Element {
  return (
    <Providers>
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>
    </Providers>
  );
}
