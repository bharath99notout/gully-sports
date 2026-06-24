import AdminShell from '@/features/admin/AdminShell';
import { requireAdmin } from '@/features/admin/server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
