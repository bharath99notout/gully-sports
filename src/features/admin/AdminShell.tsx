import Link from 'next/link';
import { Activity, BarChart3, ShieldCheck, Users, ListChecks } from 'lucide-react';

const adminLinks = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/matches', label: 'Matches', icon: ListChecks },
  { href: '/admin/audit', label: 'Audit', icon: Activity },
] as const;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 border-b border-gray-900 pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-amber-300" />
          <div>
            <h1 className="text-xl font-bold text-white">Admin</h1>
            <p className="text-xs text-gray-500">Operational visibility for users, matches, and audit events.</p>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {adminLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-700 hover:text-white"
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </div>
  );
}
