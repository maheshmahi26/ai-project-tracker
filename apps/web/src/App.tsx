import { RouterProvider } from 'react-router-dom';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';

export function App(): React.JSX.Element {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
