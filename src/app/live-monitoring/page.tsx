'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, CircleDot, Play, ShieldAlert, Target, Upload, Video } from 'lucide-react';
import { api } from '@/lib/api-client';

interface Track { id: number; className: string; firstFrame: number; lastFrame: number; framesSeen: number; isActive: boolean; trajectory: Array<{ x: number; y: number }>; }
interface Detection { frameNumber: number; timestamp: number; confidence: number; bbox: [number, number, number, number]; trackId: number; }
interface Session { id: number; originalName: string; status: string; emergencyType?: 'NONE' | 'AMBULANCE' | 'FIRE_BRIGADE'; progress: number; processedFrames: number; totalFrames: number; detectionCount: number; activeTracks: number; candidateCount: number; verifiedCount: number; priorityCount: number; videoUrl: string; tracks: Track[]; detections: Detection[]; selectedTrackId?: number | null; simulationActive?: boolean; error?: string; }
interface Insights { latestSession: Session | null; candidates: Array<{ id: number; trackId: number; status: string; overallConfidence: number; reason: string; isDemo?: boolean }>; priorityEvents: Array<{ trackId: number; recommendedAction: string; safetyStatus: string; estimatedTimeSaved: number; isDemo?: boolean }>; }
const stages = ['UPLOAD', 'DETECT', 'TRACK', 'VERIFY', 'PRIORITIZE', 'MEASURE'];

export default function LiveMonitoringPage() {
  const [file, setFile] = useState<File | null>(null);
  const [emergencyType, setEmergencyType] = useState<'AUTO' | 'NONE' | 'AMBULANCE' | 'FIRE_BRIGADE'>('AUTO');
  const [session, setSession] = useState<Session | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [activatingDemo, setActivatingDemo] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get<Insights>('/api/insights');
        setInsights(data);
        if (data.latestSession) setSession(data.latestSession);
      } catch { /* dashboard auth handles expired sessions */ }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  const upload = async () => {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const form = new FormData(); form.append('video', file); form.append('emergencyType', emergencyType);
      const response = await fetch('/api/videos/upload', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error?.message ?? 'Upload failed');
      setSession(body.data.session); setFile(null);
      setInsights(await api.get<Insights>('/api/insights'));
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Upload failed'); }
    finally { setUploading(false); }
  };

  const selectTrack = async (trackId: number) => {
    setSelecting(true); setError('');
    try {
      const response = await fetch('/api/sessions/active/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error?.message ?? 'Track selection failed');
      setSession(body.data.session); setInsights(await api.get<Insights>('/api/insights'));
    } catch (selectionError) { setError(selectionError instanceof Error ? selectionError.message : 'Track selection failed'); }
    finally { setSelecting(false); }
  };

  const activateDemo = async () => {
    setActivatingDemo(true); setError('');
    try {
      const response = await fetch('/api/demo/activate', { method: 'POST' });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error?.message ?? 'Simulation could not be activated');
      setSession(body.data.session); setInsights(await api.get<Insights>('/api/insights'));
    } catch (demoError) { setError(demoError instanceof Error ? demoError.message : 'Simulation could not be activated'); }
    finally { setActivatingDemo(false); }
  };

  const currentCandidate = insights?.candidates.find((candidate) => candidate.trackId === session?.selectedTrackId) ?? insights?.candidates[0];
  const currentPriority = insights?.priorityEvents.find((event) => event.trackId === session?.selectedTrackId) ?? insights?.priorityEvents[0];
  const stageIndex = getStageIndex(session, currentCandidate, currentPriority);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas || !session) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = video.clientWidth;
    const height = video.clientHeight;
    if (!width || !height) return;
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    const detection = session.detections.reduce<Detection | null>((closest, candidate) => {
      if (!closest || Math.abs(candidate.timestamp - videoTime) < Math.abs(closest.timestamp - videoTime)) return candidate;
      return closest;
    }, null);
    if (!detection || Math.abs(detection.timestamp - videoTime) > 1.5) return;
    const [x, y, boxWidth, boxHeight] = detection.bbox;
    const isSelected = detection.trackId === session.selectedTrackId;
    context.strokeStyle = isSelected ? '#ef4444' : '#22c55e';
    context.lineWidth = 3;
    context.strokeRect(x * width, y * height, boxWidth * width, boxHeight * height);
    context.fillStyle = isSelected ? '#ef4444' : '#22c55e';
    const label = `${isSelected ? 'SIMULATION TRACK' : 'TRACK'}-${detection.trackId} ${Math.round(detection.confidence * 100)}%`;
    context.font = 'bold 12px sans-serif';
    const labelWidth = context.measureText(label).width + 10;
    context.fillRect(x * width, Math.max(0, y * height - 20), labelWidth, 20);
    context.fillStyle = '#ffffff';
    context.fillText(label, x * width + 5, Math.max(14, y * height - 6));
  }, [session, videoTime]);

  return <div className="space-y-6">
    <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold text-white">Live Monitoring</h1>{session && <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-300">SESSION {session.id}</span>}</div><p className="mt-2 text-slate-400">Video-derived detection, emergency scenario classification, and signal-priority simulation</p>{session && <p className="mt-1 text-sm text-slate-300">CURRENT VIDEO: <strong>{session.originalName}</strong> · SCENARIO: <strong>{session.emergencyType === 'AMBULANCE' ? 'AMBULANCE' : session.emergencyType === 'FIRE_BRIGADE' ? 'FIRE BRIGADE' : 'NORMAL TRAFFIC'}</strong></p>}</div>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-6">
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6"><div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="text-lg font-semibold text-white flex items-center gap-2"><Video className="w-5 h-5 text-cyan-400" />Video Feed + Detection Overlay</h2><span className="text-xs text-slate-400">{session?.status ?? 'READY'}</span></div>{session ? <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-950"><video ref={videoRef} key={session.videoUrl} src={session.videoUrl} controls onTimeUpdate={(event) => setVideoTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setVideoTime(event.currentTarget.currentTime)} className="h-full w-full object-contain" /><canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" /></div> : <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center text-slate-500"><Video className="w-12 h-12 mr-3" />No video loaded</div>}{session && <><div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500" />Other detected tracks</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500" />Selected simulation track</span><span>Frame time: {videoTime.toFixed(1)}s</span></div><div className="mt-4"><div className="flex justify-between text-sm text-slate-400"><span>Processing progress</span><span>{session.progress}% · {session.processedFrames}/{session.totalFrames} frames</span></div><div className="h-2 bg-slate-700 rounded-full mt-2 overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${session.progress}%` }} /></div></div></>}</section>
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Upload and Process</h2><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Video Scenario</label><select value={emergencyType} onChange={(event) => setEmergencyType(event.target.value as 'AUTO' | 'NONE' | 'AMBULANCE' | 'FIRE_BRIGADE')} className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"><option value="AUTO">Auto-detect from filename (demo)</option><option value="AMBULANCE">Ambulance</option><option value="FIRE_BRIGADE">Fire Brigade</option><option value="NONE">Normal Traffic</option></select><p className="mb-4 text-xs text-slate-500">For a reliable prototype demo, select Ambulance or Fire Brigade for the matching video. Normal Traffic keeps signal priority OFF.</p><input type="file" accept="video/mp4,video/avi,video/quicktime,video/x-msvideo" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:text-white" /><p className="text-xs text-slate-500 mt-3">MP4, AVI, or MOV. Maximum 500MB.</p><button onClick={upload} disabled={!file || uploading} className="mt-4 w-full px-4 py-3 bg-cyan-500 text-white rounded-lg disabled:opacity-50">{uploading ? 'Uploading...' : 'Upload & Process'}</button><div className="border-t border-slate-700 my-5" /><button onClick={activateDemo} disabled={!session?.selectedTrackId || session?.emergencyType === 'NONE' || activatingDemo} className="w-full px-4 py-3 border border-yellow-400/40 text-yellow-200 rounded-lg hover:bg-yellow-400/10 disabled:opacity-50"><ShieldAlert className="w-4 h-4 inline mr-2" />{activatingDemo ? 'Starting Simulation...' : session?.emergencyType === 'NONE' ? 'No Priority — Normal Traffic' : 'Start Emergency Simulation'}</button><p className="text-xs text-yellow-200/70 mt-2">Ambulance/Fire Brigade scenarios automatically prepare the selected track for signal priority. Normal Traffic never requests priority.</p>{error && <div className="mt-4 flex gap-2 text-red-400 text-sm"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}</section>
    </div>
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-6"><h2 className="text-lg font-semibold text-white mb-5">Processing Timeline</h2><div className="grid grid-cols-2 md:grid-cols-6 gap-3">{stages.map((stage, index) => <div key={stage} className={`rounded-lg border p-3 text-center ${index <= stageIndex ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : 'border-slate-700 text-slate-500'}`}><div className="text-xs font-semibold">{stage}</div><div className="text-[10px] mt-1">{index < stageIndex ? 'COMPLETE' : index === stageIndex ? 'CURRENT' : 'WAITING'}</div></div>)}</div></section>
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4"><StatCard label="State" value={session?.status ?? 'READY'} /><StatCard label="Scenario" value={session?.emergencyType === 'AMBULANCE' ? 'AMBULANCE' : session?.emergencyType === 'FIRE_BRIGADE' ? 'FIRE BRIGADE' : 'NORMAL'} /><StatCard label="Frames" value={`${session?.processedFrames ?? 0}/${session?.totalFrames ?? 0}`} /><StatCard label="Detections" value={session?.detectionCount ?? 0} /><StatCard label="Active Tracks" value={session?.activeTracks ?? 0} /><StatCard label="Candidates" value={session?.candidateCount ?? 0} /><StatCard label="Verified" value={session?.verifiedCount ?? 0} /><StatCard label="Priority" value={session?.priorityCount ?? 0} /><StatCard label="FPS" value={session ? '2' : '0'} /></div>
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-6"><h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-cyan-400" />Detected Tracks</h2>{session?.tracks.length ? <div className="grid gap-3 md:grid-cols-2">{session.tracks.map((track) => <div key={track.id} className={`rounded-lg border p-4 ${session.selectedTrackId === track.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700'}`}><div className="flex justify-between gap-3"><div><p className="font-semibold text-white">TRACK-{track.id}</p><p className="text-xs text-slate-400">{track.className} · {track.framesSeen} observations · frames {track.firstFrame}-{track.lastFrame}</p></div><button onClick={() => selectTrack(track.id)} disabled={selecting} className="rounded-lg bg-slate-700 px-3 py-2 text-xs text-white hover:bg-slate-600 disabled:opacity-50">{session.selectedTrackId === track.id ? 'Selected' : 'Use Track'}</button></div><p className="mt-3 text-xs text-slate-400">Trajectory points: {track.trajectory.length} · Direction: {getDirection(track)}</p></div>)}</div> : <p className="text-slate-400">Tracks appear after frame processing.</p>}</section>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><section className="bg-slate-800 border border-slate-700 rounded-xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Event Timeline</h2><div className="space-y-3"><EventRow icon={Upload} label="VIDEO UPLOADED" detail={session ? session.originalName : 'Waiting for video'} done={Boolean(session)} /><EventRow icon={CircleDot} label="DETECT / TRACK" detail={session ? `${session.detectionCount} detections across ${session.activeTracks} tracks` : 'Waiting for processing'} done={Boolean(session?.detectionCount)} /><EventRow icon={Target} label="TRACK SELECTED" detail={session?.selectedTrackId ? `Track ${session.selectedTrackId}` : 'Choose a measured track'} done={Boolean(session?.selectedTrackId)} /><EventRow icon={ShieldAlert} label="SIMULATION / VERIFY" detail={currentCandidate ? `${currentCandidate.status} · Track ${currentCandidate.trackId}` : 'Not activated'} done={Boolean(currentCandidate)} /><EventRow icon={Play} label="PRIORITIZE / MEASURE" detail={currentPriority ? `${currentPriority.recommendedAction} · ${currentPriority.safetyStatus}` : 'Waiting for simulation'} done={Boolean(currentPriority)} /></div></section><section className="bg-slate-800 border border-slate-700 rounded-xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Current Event</h2>{currentPriority ? <><div className="flex items-center gap-2 text-green-400 font-semibold"><CheckCircle className="w-5 h-5" />VIDEO-DERIVED EMERGENCY SIMULATION</div><p className="text-white mt-4">Track {currentPriority.trackId} · {currentPriority.recommendedAction}</p><p className="text-slate-400 text-sm mt-2">Safety: {currentPriority.safetyStatus} · Estimated time saved: {currentPriority.estimatedTimeSaved}s</p></> : <p className="text-slate-400">Select a real track to begin the transparent simulation flow.</p>}</section></div>
  </div>;
}
function getStageIndex(session: Session | null, candidate: Insights['candidates'][number] | undefined, priority: Insights['priorityEvents'][number] | undefined) { if (!session) return 0; if (priority) return 5; if (candidate) return 3; if (session.selectedTrackId) return 2; if (session.activeTracks) return 2; if (session.detectionCount) return 1; return 0; }
function getDirection(track: Track) { const first = track.trajectory[0]; const last = track.trajectory[track.trajectory.length - 1]; if (!first || !last) return 'Unavailable'; return Math.abs(last.x - first.x) >= Math.abs(last.y - first.y) ? last.x > first.x ? 'EASTBOUND' : 'WESTBOUND' : last.y > first.y ? 'SOUTHBOUND' : 'NORTHBOUND'; }
function StatCard({ label, value }: { label: string; value: string | number }) { return <div className="bg-slate-800 border border-slate-700 rounded-xl p-3"><p className="text-slate-400 text-xs mb-1">{label}</p><p className="text-lg font-bold text-white truncate">{value}</p></div>; }
function EventRow({ icon: Icon, label, detail, done }: { icon: any; label: string; detail: string; done: boolean }) { return <div className="flex gap-3 items-start"><Icon className={`w-5 h-5 shrink-0 ${done ? 'text-cyan-400' : 'text-slate-600'}`} /><div><div className={`text-sm font-semibold ${done ? 'text-white' : 'text-slate-500'}`}>{label}</div><div className="text-xs text-slate-400">{detail}</div></div></div>; }
