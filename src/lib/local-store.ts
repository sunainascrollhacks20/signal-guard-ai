import { mkdirSync, readFileSync } from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export interface Detection {
  id: number;
  frameNumber: number;
  timestamp: number;
  className: string;
  confidence: number;
  bbox: [number, number, number, number];
  trackId: number;
}

export interface Track {
  id: number;
  className: string;
  firstFrame: number;
  lastFrame: number;
  framesSeen: number;
  isActive: boolean;
  isEmergencyCandidate: boolean;
  trajectory: Array<{ x: number; y: number }>;
}

export interface Candidate {
  id: number;
  trackId: number;
  frameNumber: number;
  visualScore: number;
  behaviouralScore: number;
  temporalScore: number;
  contextScore: number;
  overallConfidence: number;
  status: 'ANALYZING' | 'VERIFIED' | 'SUSPICIOUS' | 'WITHHELD';
  decision: string;
  reason: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface PriorityEvent {
  id: number;
  candidateId: number;
  trackId: number;
  recommendedAction: 'HOLD' | 'PREPARE' | 'PRIORITY' | 'WITHHOLD';
  confidence: number;
  safetyStatus: 'SAFE' | 'CAUTION' | 'WITHHELD';
  estimatedTimeSaved: number;
  queueImpact: number;
  reason: string;
  createdAt: string;
  isDemo?: boolean;
}

export type EmergencyType = 'NONE' | 'AMBULANCE' | 'FIRE_BRIGADE';

export interface VideoSession {
  id: number;
  userId: number;
  originalName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  emergencyType: EmergencyType;
  status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  processedFrames: number;
  totalFrames: number;
  fps: number;
  duration: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  detections: Detection[];
  tracks: Track[];
  candidates: Candidate[];
  priorityEvents: PriorityEvent[];
  demoScenario?: boolean;
  selectedTrackId?: number;
  simulationActive?: boolean;
  simulationState?: 'NORMAL' | 'REQUESTED' | 'ACTIVE' | 'PASSING' | 'RESTORED' | 'COMPLETED';
  simulationStartedAt?: string;
  simulationCompletedAt?: string;
  decisionEvents: Array<{ timestamp: string; event: string; trackId?: number; details: string }>;
}

export interface AppSettings {
  processingFps: number;
  confidenceThreshold: number;
  verificationSensitivity: 'Low' | 'Medium' | 'High';
  privacyMode: boolean;
}

interface StoreData {
  nextSessionId: number;
  nextDetectionId: number;
  nextTrackId: number;
  nextCandidateId: number;
  nextPriorityId: number;
  sessions: VideoSession[];
  authSessions: Array<{ token: string; userId: number; expiresAt: number }>;
  settings: AppSettings;
  activeSessionIds: Record<number, number>;
}

const dataDirectory = path.join(process.cwd(), 'data');
const databasePath = path.join(dataDirectory, 'signalguard.db');
const legacyStorePath = path.join(dataDirectory, 'signalguard.json');
mkdirSync(dataDirectory, { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.exec('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
let writeQueue = Promise.resolve();

const defaultStore = (): StoreData => ({
  nextSessionId: 1,
  nextDetectionId: 1,
  nextTrackId: 1,
  nextCandidateId: 1,
  nextPriorityId: 1,
  sessions: [],
  authSessions: [],
  settings: {
    processingFps: 2,
    confidenceThreshold: 0.35,
    verificationSensitivity: 'Medium',
    privacyMode: false,
  },
  activeSessionIds: {},
});

async function readStore(): Promise<StoreData> {
  const row = database.prepare('SELECT data FROM app_state WHERE id = 1').get() as { data: string } | undefined;
  if (row) {
    const parsed = JSON.parse(row.data) as Partial<StoreData>;
    const migrated = { ...defaultStore(), ...parsed, authSessions: parsed.authSessions ?? [], activeSessionIds: parsed.activeSessionIds ?? {} };
    migrated.sessions = (parsed.sessions ?? []).map((session) => ({ ...session, decisionEvents: session.decisionEvents ?? [] }));
    return migrated;
  }

  let initial = defaultStore();
  try {
    const parsed = JSON.parse(readFileSync(legacyStorePath, 'utf8')) as Partial<StoreData>;
    initial = { ...initial, ...parsed, authSessions: parsed.authSessions ?? [], activeSessionIds: parsed.activeSessionIds ?? {} };
    initial.sessions = (parsed.sessions ?? []).map((session) => ({ ...session, decisionEvents: session.decisionEvents ?? [] }));
  } catch {
    // No legacy state exists on a clean install.
  }
  database.prepare('INSERT INTO app_state (id, data) VALUES (1, ?)').run(JSON.stringify(initial));
  return initial;
}

export async function getStore(): Promise<StoreData> {
  await writeQueue;
  return readStore();
}

export async function updateStore<T>(mutator: (store: StoreData) => T | Promise<T>): Promise<T> {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    database.prepare('UPDATE app_state SET data = ? WHERE id = 1').run(JSON.stringify(store));
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function getSession(id: number): Promise<VideoSession | null> {
  const store = await getStore();
  return store.sessions.find((session) => session.id === id) ?? null;
}

export function getUploadsDirectory() {
  return path.join(process.cwd(), 'uploads');
}

export function serializeSession(session: VideoSession) {
  return {
    ...session,
    videoUrl: `/api/videos/${session.id}/file`,
    detectionCount: session.detections.length,
    activeTracks: session.tracks.filter((track) => track.isActive).length,
    candidateCount: session.candidates.length,
    verifiedCount: session.candidates.filter((candidate) => candidate.status === 'VERIFIED').length,
    priorityCount: session.priorityEvents.length,
    timeSaved: session.priorityEvents.reduce((sum, event) => sum + event.estimatedTimeSaved, 0),
    selectedTrackId: session.selectedTrackId ?? null,
    simulationActive: session.simulationActive ?? false,
    simulationState: session.simulationState ?? 'NORMAL',
    simulationStartedAt: session.simulationStartedAt ?? null,
    simulationCompletedAt: session.simulationCompletedAt ?? null,
  };
}
