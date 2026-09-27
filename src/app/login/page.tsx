'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/api/auth/login', { email, password });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAccess = async () => {
    setError('');
    setLoading(true);

    try {
      await api.post('/api/auth/login', {
        email: 'admin@signalguard.local',
        password: 'SignalGuard@2026',
      });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzFmMjkzNyIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L2c+PC9zdmc+')] opacity-20"></div>

      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-gradient-to-br from-cyan-400 to-blue-500 p-3 rounded-2xl shadow-lg shadow-cyan-500/50">
              <Shield className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">SignalGuard AI</h1>
          <p className="text-cyan-400 text-sm font-semibold tracking-wide mb-4">
            VERIFY. PRIORITIZE. RESPOND.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <span>DETECT</span>
            <span className="text-cyan-400">—</span>
            <span>VERIFY</span>
            <span className="text-cyan-400">—</span>
            <span>RECOMMEND</span>
            <span className="text-cyan-400">—</span>
            <span>MEASURE</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  placeholder="Enter your email"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-10 pr-12 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 rounded-lg hover:from-cyan-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/25"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-slate-800/50 text-slate-400">OR</span>
              </div>
            </div>

            {/* Demo Access Button */}
            <button
              type="button"
              onClick={handleDemoAccess}
              disabled={loading}
              className="w-full bg-slate-700/50 border border-slate-600 text-slate-300 font-semibold py-3 rounded-lg hover:bg-slate-700 hover:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Demo Access — Operator Account
            </button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-xs text-slate-400 text-center">
              Demo credentials: <span className="text-cyan-400">admin@signalguard.local</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Intelligent Traffic Emergency Response Platform</p>
        </div>
      </div>
    </div>
  );
}
