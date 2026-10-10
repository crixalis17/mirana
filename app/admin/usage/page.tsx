import type {Metadata} from 'next';
import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import {config, user} from '@/lib/auth';
import {canViewUsage} from '@/lib/admin/access';
import AdminUsageDashboard from '@/components/admin-usage-dashboard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {title: 'API usage · Mirana', robots: {index: false, follow: false}};

export default async function UsagePage() {
  const cookieStore = await cookies();
  const identity = await user(new Request(config().APP_ORIGIN || 'http://localhost', {
    headers: {cookie: cookieStore.toString()},
  }));
  // Authorization precedes rendering, fetching balances, or serializing any provider data.
  if (!canViewUsage(identity)) notFound();
  return <AdminUsageDashboard/>;
}
