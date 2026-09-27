import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { getSession, getStore, updateStore, type Candidate, type Track, type VideoSession } from './local-store';

const FRAME_WIDTH = 160;
const FRAME_HEIGHT = 90;
const BYTES_PER_FRAME = FRAME_WIDTH * FRAME_HEIGHT * 3;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function decodeFrames(filePath: string, fps: number): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

    const frames: Buffer[] = [];
    let pending = Buffer.alloc(0);
    const decoder = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', filePath,
      '-vf', `fps=${fps},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    ]);

    decoder.stdout.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= BYTES_PER_FRAME) {
        frames.push(pending.subarray(0, BYTES_PER_FRAME));
        pending = pending.subarray(BYTES_PER_FRAME);
      }
    });
    decoder.once('error', reject);
    decoder.once('close', (code) => {
      if (code === 0 && frames.length > 0) resolve(frames);
      else reject(new Error('Unable to decode video frames. Confirm the file is a playable MP4, AVI, or MOV.'));
    });
  });
}

function measureFrame(frame: Buffer, previous: Buffer | undefined) {
  if (!previous) return null;
  let changed = 0;
  let redBluePixels = 0;
  let minX = FRAME_WIDTH;
  let minY = FRAME_HEIGHT;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < FRAME_HEIGHT; y += 2) {
    for (let x = 0; x < FRAME_WIDTH; x += 2) {
      const offset = (y * FRAME_WIDTH + x) * 3;
      const difference = Math.abs(frame[offset] - previous[offset]) + Math.abs(frame[offset + 1] - previous[offset + 1]) + Math.abs(frame[offset + 2] - previous[offset + 2]);
      const isEmergencyColor = (frame[offset] > frame[offset + 1] * 1.35 && frame[offset] > frame[offset + 2] * 1.2) || (frame[offset + 2] > frame[offset] * 1.35 && frame[offset + 2] > frame[offset + 1] * 1.2);
      if (isEmergencyColor) redBluePixels++;
      if (difference > 75) {
        changed++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (changed < 8) return null;
  const sampledPixels = (FRAME_WIDTH / 2) * (FRAME_HEIGHT / 2);
  const area = Math.max(1, (maxX - minX) * (maxY - minY));
  return {
    bbox: [minX / FRAME_WIDTH, minY / FRAME_HEIGHT, (maxX - minX) / FRAME_WIDTH, (maxY - minY) / FRAME_HEIGHT] as [number, number, number, number],
    center: { x: (minX + maxX) / 2 / FRAME_WIDTH, y: (minY + maxY) / 2 / FRAME_HEIGHT },
    confidence: clamp(0.35 + changed / sampledPixels * 2 + Math.min(area / (FRAME_WIDTH * FRAME_HEIGHT), 0.25)),
    colorScore: clamp(redBluePixels / sampledPixels * 8),
  };
}

async function processSession(sessionId: number) {
  const session = await getSession(sessionId);
  if (!session) return;

  try {
    await updateStore((store) => {
      const current = store.sessions.find((item) => item.id === sessionId);
      if (current) {
        current.status = 'PROCESSING';
        current.startedAt = new Date().toISOString();
        current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'PROCESSING STARTED', details: 'Frame analysis started' });
      }
    });

    const settings = (await getStore()).settings;
    const frames = await decodeFrames(session.filePath, settings.processingFps);
    const tracks: Track[] = [];
    const detections = [] as VideoSession['detections'];
    const candidates: Candidate[] = [];
    let previous: Buffer | undefined;

    for (let index = 0; index < frames.length; index++) {
      const measure = measureFrame(frames[index], previous);
      previous = frames[index];
      if (measure && measure.confidence >= settings.confidenceThreshold) {
        let track = tracks.find((item) => {
          const last = item.trajectory[item.trajectory.length - 1];
          return Math.hypot(last.x - measure.center.x, last.y - measure.center.y) < 0.18;
        });
        if (!track) {
          track = { id: tracks.length + 1, className: 'vehicle-like motion', firstFrame: index + 1, lastFrame: index + 1, framesSeen: 0, isActive: true, isEmergencyCandidate: false, trajectory: [] };
          tracks.push(track);
        }
        track.lastFrame = index + 1;
        track.framesSeen++;
        track.trajectory.push(measure.center);
        const detection = { id: detections.length + 1, frameNumber: index + 1, timestamp: index / 2, className: track.className, confidence: measure.confidence, bbox: measure.bbox, trackId: track.id, };
        detections.push(detection);

        const temporalScore = clamp(track.framesSeen / 8);
        const behaviouralScore = clamp(track.framesSeen / 12 + (track.trajectory.length > 1 ? 0.25 : 0));
        const overallConfidence = clamp(measure.colorScore * 0.35 + behaviouralScore * 0.3 + temporalScore * 0.2 + 0.15);
        const verificationThreshold = settings.verificationSensitivity === 'High' ? 0.52 : settings.verificationSensitivity === 'Low' ? 0.72 : 0.62;
        if (session.emergencyType !== 'NONE' && measure.colorScore > 0.2 && track.framesSeen >= 4 && overallConfidence >= verificationThreshold && !track.isEmergencyCandidate) {
          track.isEmergencyCandidate = true;
          candidates.push({
            id: candidates.length + 1,
            trackId: track.id,
            frameNumber: index + 1,
            visualScore: measure.colorScore,
            behaviouralScore,
            temporalScore,
            contextScore: 0.6,
            overallConfidence,
            status: overallConfidence >= 0.62 ? 'VERIFIED' : 'SUSPICIOUS',
            decision: overallConfidence >= 0.62 ? 'Verified multi-cue emergency candidate' : 'Insufficient multi-cue evidence',
            reason: `Measured color cue ${(measure.colorScore * 100).toFixed(0)}%, persistent motion across ${track.framesSeen} sampled frames, and trajectory evidence.`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (index % 3 === 0 || index === frames.length - 1) {
        await updateStore((store) => {
          const current = store.sessions.find((item) => item.id === sessionId);
          if (!current) return;
          current.progress = Math.round(((index + 1) / frames.length) * 100);
          current.processedFrames = index + 1;
          current.totalFrames = frames.length;
          current.detections = detections;
          current.tracks = tracks;
          current.candidates = candidates;
          if (detections.length && !current.decisionEvents.some((event) => event.event === 'VEHICLES DETECTED')) current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'VEHICLES DETECTED', details: `${detections.length} measured detections` });
          if (tracks.length && !current.decisionEvents.some((event) => event.event === 'TRACK CREATED')) current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'TRACK CREATED', trackId: tracks[0].id, details: `${tracks.length} active track(s)` });
          if (candidates.length && !current.decisionEvents.some((event) => event.event === 'EMERGENCY CANDIDATE IDENTIFIED')) current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'EMERGENCY CANDIDATE IDENTIFIED', trackId: candidates[0].trackId, details: `Track ${candidates[0].trackId} identified from available video evidence` });
        });
      }
    }

    await updateStore((store) => {
      const current = store.sessions.find((item) => item.id === sessionId);
      if (!current) return;
      current.status = 'COMPLETED';
      current.progress = 100;
      current.completedAt = new Date().toISOString();
      current.detections = detections;
      current.tracks = tracks;
      current.candidates = candidates;
      if (current.emergencyType !== 'NONE' && tracks.length > 0) {
        const demoTrack = [...tracks].sort((a, b) => b.framesSeen - a.framesSeen)[0];
        current.selectedTrackId = demoTrack.id;
        current.demoScenario = true;

        const existingCandidate = current.candidates.find((candidate) => candidate.isDemo && candidate.trackId === demoTrack.id);
        const candidate = existingCandidate ?? {
          id: current.candidates.length + 1,
          trackId: demoTrack.id,
          frameNumber: demoTrack.lastFrame,
          visualScore: 0.92,
          behaviouralScore: 0.88,
          temporalScore: 0.90,
          contextScore: 0.84,
          overallConfidence: 0.89,
          status: 'VERIFIED' as const,
          decision: `${current.emergencyType === 'AMBULANCE' ? 'Ambulance' : 'Fire brigade'} emergency-priority scenario verified for Digital Twin demonstration`,
          reason: 'Controlled video scenario selected for the prototype. This is a simulation classification, not proof of a real-world emergency vehicle.',
          createdAt: new Date().toISOString(),
          isDemo: true,
        };
        if (!existingCandidate) current.candidates.push(candidate);

        const existingPriority = current.priorityEvents.find((event) => event.isDemo && event.trackId === demoTrack.id);
        if (!existingPriority) current.priorityEvents.push({
          id: current.priorityEvents.length + 1,
          candidateId: candidate.id,
          trackId: demoTrack.id,
          recommendedAction: 'PRIORITY',
          confidence: candidate.overallConfidence,
          safetyStatus: 'SAFE',
          estimatedTimeSaved: 18,
          queueImpact: 3,
          reason: `DEMO / SIMULATION: ${current.emergencyType === 'AMBULANCE' ? 'ambulance' : 'fire brigade'} scenario requests green priority on the selected approach, then restores normal operation.`,
          createdAt: new Date().toISOString(),
          isDemo: true,
        });

        current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'EMERGENCY SCENARIO READY', trackId: demoTrack.id, details: `${current.emergencyType === 'AMBULANCE' ? 'Ambulance' : 'Fire brigade'} scenario selected; Digital Twin priority is enabled.` });
      } else {
        current.selectedTrackId = undefined;
        current.demoScenario = false;
        current.candidates = current.candidates.filter((candidate) => !candidate.isDemo);
        current.priorityEvents = [];
        current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'NORMAL TRAFFIC CONFIRMED', details: 'No emergency scenario selected; Digital Twin will keep the normal signal cycle unchanged.' });
      }
      if (tracks.length) current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'TRACKING COMPLETED', details: `${tracks.length} track(s) maintained across processed frames` });
      current.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'PROCESSING COMPLETED', details: `${detections.length} detections, ${tracks.length} tracks` });
    });
  } catch (error) {
    await updateStore((store) => {
      const current = store.sessions.find((item) => item.id === sessionId);
      if (current) {
        current.status = 'FAILED';
        current.error = error instanceof Error ? error.message : 'Video processing failed';
      }
    });
  }
}

export function startVideoProcessing(sessionId: number) {
  void processSession(sessionId);
}

export async function getVideoFileInfo(filePath: string) {
  const file = await stat(filePath);
  return { size: file.size };
}

export function getVideoFileStream(filePath: string) {
  return createReadStream(filePath);
}
