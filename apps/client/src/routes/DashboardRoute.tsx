import { AppShell } from '../components/layout/AppShell';
import Dashboard from '../pages/Dashboard/Dashboard';

export default function DashboardRoute(): JSX.Element {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
