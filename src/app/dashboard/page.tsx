'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Car, CheckCircle, Clock, TrafficCone, Upload } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api-client';

interface Insights {
  latestSession: { id: number; status: string; progress: number; originalName: string; selectedTrackId?: number | null; simulationActive?: boolean } | null;
  metrics: { vehiclesDetected: number; activeTracks: number; emergencyCandidates: number; verifiedEmergencies: number; priorityEvents: number; timeSaved: number };
  priorityEvents: Array<{ trackId: number; recommendedAction: string; estimatedTimeSaved: number; reason: string }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<Insights | null>(null);

  useEffect(() => {
    const load = async () => {
      try { setData(await api.get<Insights>('/api/insights')); } catch { setData(null); }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  const metrics = data?.metrics ?? { vehiclesDetected: 0, activeTracks: 0, emergencyCandidates: 0, verifiedEmergencies: 0, priorityEvents: 0, timeSaved: 0 };
  const session = data?.latestSession;

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold text-white mb-2">Command Center</h1><p className="text-slate-400">Traffic emergency intelligence and signal priority outcomes</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard icon={Car} label="Vehicles Detected" value={metrics.vehiclesDetected} color="blue" />
        <MetricCard icon={Activity} label="Active Tracks" value={metrics.activeTracks} color="cyan" />
        <MetricCard icon={AlertTriangle} label="Emergency Candidates" value={metrics.emergencyCandidates} color="yellow" />
        <MetricCard icon={CheckCircle} label="Verified Emergencies" value={metrics.verifiedEmergencies} color="green" />
        <MetricCard icon={TrafficCone} label="Priority Events" value={metrics.priorityEvents} color="orange" />
        <MetricCard icon={Clock} label="Estimated Time Saved" value={`${metrics.timeSaved}s`} color="emerald" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Processing State</h2>
          {session ? <><p className="text-white font-medium truncate">{session.originalName}</p><div className="flex justify-between text-sm text-slate-400 mt-4"><span>{session.status}</span><span>{session.progress}%</span></div><div className="h-2 bg-slate-700 rounded-full mt-2 overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${session.progress}%` }} /></div></> : <p className="text-slate-400">No video session yet.</p>}
        </section>
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Signal State</h2>
          {data?.priorityEvents[0] ? <><p className="text-2xl font-bold text-green-400">{data.priorityEvents[0].recommendedAction}</p><p className="text-slate-400 text-sm mt-2">Session {session?.id} · Track {data.priorityEvents[0].trackId} · {data.priorityEvents[0].reason}</p></> : <p className="text-slate-400">No verified priority event. Signal remains normal.</p>}
        </section>
      </div>
      {session && <section className="bg-slate-800 border border-slate-700 rounded-xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Active Session Outcome</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm"><Info label="Session" value={`${session.id} · ${session.originalName}`} /><Info label="Selected track" value={session.selectedTrackId ? `TRACK-${session.selectedTrackId}` : 'None selected'} /><Info label="Digital Twin" value={session.simulationActive ? 'VIDEO-DERIVED SIMULATION ACTIVE' : 'NORMAL TRAFFIC'} /></div></section>}
      <Link href="/live-monitoring" className="inline-flex items-center gap-2 px-4 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition"><Upload className="w-4 h-4" />Upload Traffic Video</Link>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = { blue: 'text-blue-400', cyan: 'text-cyan-400', yellow: 'text-yellow-400', green: 'text-green-400', orange: 'text-orange-400', emerald: 'text-emerald-400' };
  return <div className="bg-slate-800 border border-slate-700 rounded-xl p-4"><Icon className={`w-5 h-5 ${colors[color]} mb-3`} /><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-bold text-white">{value}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 truncate font-semibold text-white">{value}</p></div>; }
