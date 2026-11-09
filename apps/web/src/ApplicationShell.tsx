import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api';
import ApplicationRoutes from './ApplicationRoutes';

// Auth, forms and protected queries are not part of the first public-homepage request.
export default function ApplicationShell() {
  return <QueryClientProvider client={queryClient}><ApplicationRoutes/></QueryClientProvider>;
}
