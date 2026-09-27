'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield,
  LayoutDashboard,
  Video,
  AlertTriangle,
  TrafficCone,
  Network,
  BarChart3,
  FileText,
  List,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { api } from '@/lib/api-client';

const navigation = [
  { name: 'Command Center', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Live Monitoring', href: '/live-monitoring', icon: Video },
  { name: 'Emergency Verification', href: '/emergency-verification', icon: AlertTriangle },
  { name: 'Signal Priority', href: '/signal-priority', icon: TrafficCone },
  { name: 'Digital Twin', href: '/digital-twin', icon: Network },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Decision Log', href: '/decision-log', icon: List },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await api.get('/api/auth/me');
        setUser(data.user);
      } catch (error) {
        console.error('Failed to fetch user:', error);
        router.push('/login');
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/80 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-800 border-r border-slate-700 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-cyan-400 to-blue-500 p-2 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-lg">SignalGuard AI</h1>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                        isActive
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User info and logout */}
          <div className="p-4 border-t border-slate-700">
            {user && (
              <div className="mb-3 px-3 py-2 bg-slate-700/50 rounded-lg">
                <p className="text-xs text-slate-400">Signed in as</p>
                <p className="text-sm text-white font-medium truncate">{user.email}</p>
                <p className="text-xs text-cyan-400 capitalize">{user.role}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700">
          <div className="flex items-center justify-between h-full px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-400 hover:text-white"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-400">
                <span className="text-cyan-400 font-semibold">VERIFY</span> • PRIORITIZE • RESPOND
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
