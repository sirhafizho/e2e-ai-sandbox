import { Outlet, NavLink } from 'react-router-dom';
import { MessageSquare, Settings, Hammer } from 'lucide-react';

export function AppLayout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-14 flex-col items-center border-r border-zinc-800 bg-zinc-900 py-4">
        <div className="mb-6 flex items-center justify-center">
          <Hammer className="h-6 w-6 text-blue-500" />
        </div>

        <nav className="flex flex-1 flex-col items-center gap-2">
          <SidebarLink to="/sessions" icon={MessageSquare} label="Sessions" />
          <SidebarLink to="/settings" icon={Settings} label="Settings" />
        </nav>

        <div className="mt-auto text-[10px] text-zinc-600">v0.1</div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          isActive
            ? 'bg-zinc-800 text-blue-400'
            : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
        }`
      }
      title={label}
    >
      <Icon className="h-5 w-5" />
    </NavLink>
  );
}
