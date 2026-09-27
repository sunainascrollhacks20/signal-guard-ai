"use client";

import {
  Activity,
  Car,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  TrafficCone,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";

type Phase =
  | "NORMAL"
  | "REQUESTED"
  | "ACTIVE"
  | "PASSING"
  | "RESTORED"
  | "COMPLETED";

type Signal = "RED" | "YELLOW" | "GREEN";

type Point = {
  x: number;
  y: number;
};

type Track = {
  id?: string | number;
  trackId?: string | number;
  label?: string;
  confidence?: number;
  trajectory?: Point[];
  points?: Point[];
  className?: string;
  vehicleType?: string;
};

type Session = {
  id?: string;
  sessionId?: string;
  sourceVideo?: string;
  videoName?: string;
  emergencyType?: 'NONE' | 'AMBULANCE' | 'FIRE_BRIGADE';
  tracks?: Track[];
  detectedVehicles?: number;
};

type Insights = {
  latestSession?: Session | null;
  sessions?: Session[];
};

const TOTAL_TIME = 18;

const PHASE_INFO: Record<
  Phase,
  {
    start: number;
    end: number;
    label: string;
    description: string;
  }
> = {
  NORMAL: {
    start: 0,
    end: 3,
    label: "NORMAL TRAFFIC",
    description: "Traffic is operating normally.",
  },

  REQUESTED: {
    start: 3,
    end: 5,
    label: "PRIORITY REQUESTED",
    description: "Emergency priority request detected.",
  },

  ACTIVE: {
    start: 5,
    end: 7,
    label: "PRIORITY ACTIVE",
    description: "Signal priority is being prepared.",
  },

  PASSING: {
    start: 7,
    end: 15,
    label: "EMERGENCY VEHICLE PASSING",
    description: "Emergency vehicle is passing through.",
  },

  RESTORED: {
    start: 15,
    end: 18,
    label: "NORMAL SIGNAL RESTORED",
    description: "Normal traffic signal operation is restored.",
  },

  COMPLETED: {
    start: 18,
    end: 18,
    label: "SIMULATION COMPLETED",
    description: "Simulation has completed.",
  },
};

function getPhase(time: number, emergencyType: Session['emergencyType']): Phase {
  if (emergencyType === 'NONE') return 'NORMAL';
  if (time < 3) return "NORMAL";
  if (time < 5) return "REQUESTED";
  if (time < 7) return "ACTIVE";
  if (time < 15) return "PASSING";
  if (time < 18) return "RESTORED";
  return "COMPLETED";
}

function getSignal(phase: Phase, emergencyType: Session['emergencyType']): Signal {
  if (emergencyType === 'NONE') return 'RED';
  if (phase === "NORMAL") return "RED";

  if (phase === "REQUESTED") {
    return "YELLOW";
  }

  if (phase === "ACTIVE" || phase === "PASSING") {
    return "GREEN";
  }

  if (phase === "RESTORED") {
    return "YELLOW";
  }

  return "RED";
}

/*
 * IMPORTANT:
 * Digital Twin visual movement is intentionally kept deterministic.
 *
 * Uploaded video affects:
 * - session
 * - detected vehicle count
 * - selected track
 *
 * But it does NOT directly overwrite the Digital Twin road coordinates.
 *
 * This prevents:
 * - circular movement
 * - collapsed coordinates
 * - random jumps
 * - distorted vehicle positions
 */
function getNormalVehicle(
  index: number,
  time: number,
): {
  position: Point;
  heading: number;
} {
  const speed = 0.035;

  const laneOffset = index * 0.18;

  const progress =
    (time * speed + laneOffset) % 1;

  const paths = [
    {
      start: { x: 4, y: 42 },
      end: { x: 96, y: 42 },
      heading: 0,
    },

    {
      start: { x: 96, y: 58 },
      end: { x: 4, y: 58 },
      heading: 180,
    },

    {
      start: { x: 42, y: 4 },
      end: { x: 42, y: 96 },
      heading: 90,
    },

    {
      start: { x: 58, y: 96 },
      end: { x: 58, y: 4 },
      heading: -90,
    },
  ];

  const path =
    paths[index % paths.length];

  return {
    position: {
      x:
        path.start.x +
        (path.end.x - path.start.x) *
          progress,

      y:
        path.start.y +
        (path.end.y - path.start.y) *
          progress,
    },

    heading: path.heading,
  };
}

/*
 * Emergency vehicle deliberately uses the SAME
 * straight movement system as normal traffic.
 *
 * This prevents curved/circular movement during PASSING.
 */
function getEmergencyPosition(
  _track: Track,
  time: number,
): {
  position: Point;
  heading: number;
} {
  return getNormalVehicle(0, time);
}

export default function DigitalTwinPage() {
  const [data, setData] =
    useState<Insights | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [selectedTrackId, setSelectedTrackId] =
    useState<string | number | null>(null);

  const [time, setTime] =
    useState(0);

  const [running, setRunning] =
    useState(false);

  const animationFrame =
    useRef<number | null>(null);

  const lastTime =
    useRef<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response =
        await api.get("/api/insights");

      const parsed =
        typeof response === "string"
          ? JSON.parse(response)
          : response;

      setData(parsed);

      const latestSession =
        parsed?.latestSession;

      const firstTrack =
        latestSession?.tracks?.[0];

      const firstTrackId =
        firstTrack?.trackId ??
        firstTrack?.id ??
        null;

      setSelectedTrackId(firstTrackId);

      setTime(0);
      setRunning(false);
    } catch (err) {
      console.error(err);

      setError(
        "Unable to load Digital Twin session.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /*
   * Initial data loading.
   *
   * ESLint rule is intentionally suppressed for this
   * initial fetch because loadData updates page state.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(
          animationFrame.current,
        );

        animationFrame.current = null;
      }
    };
  }, [loadData]);

  const session =
    data?.latestSession ?? null;

  /*
   * Always use only the latest session's tracks.
   */
  const tracks = useMemo<Track[]>(() => {
    return Array.isArray(session?.tracks)
      ? session.tracks
      : [];
  }, [session]);

  /*
   * Keep the selected track valid when a new
   * video/session is loaded.
   */
  const effectiveSelectedTrackId =
    useMemo<string | number | null>(() => {
      if (!tracks.length) {
        return null;
      }

      const selectedExists =
        tracks.some(
          (track) =>
            (track.trackId ?? track.id) ===
            selectedTrackId,
        );

      if (selectedExists) {
        return selectedTrackId;
      }

      return (
        tracks[0].trackId ??
        tracks[0].id ??
        null
      );
    }, [tracks, selectedTrackId]);

  const selectedTrack = useMemo(() => {
    return (
      tracks.find(
        (track) =>
          (track.trackId ?? track.id) ===
          effectiveSelectedTrackId,
      ) ??
      tracks[0] ??
      null
    );
  }, [
    tracks,
    effectiveSelectedTrackId,
  ]);

  /*
   * Simulation animation
   */
  useEffect(() => {
    if (!running) {
      if (animationFrame.current) {
        cancelAnimationFrame(
          animationFrame.current,
        );

        animationFrame.current = null;
      }

      lastTime.current = null;

      return;
    }

    const animate = (
      timestamp: number,
    ) => {
      if (lastTime.current === null) {
        lastTime.current = timestamp;
      }

      const delta =
        (timestamp -
          lastTime.current) /
        1000;

      lastTime.current = timestamp;

      setTime((previous) => {
        const next =
          previous + delta;

        if (next >= TOTAL_TIME) {
          setRunning(false);

          return TOTAL_TIME;
        }

        return next;
      });

      animationFrame.current =
        requestAnimationFrame(
          animate,
        );
    };

    animationFrame.current =
      requestAnimationFrame(
        animate,
      );

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(
          animationFrame.current,
        );

        animationFrame.current = null;
      }

      lastTime.current = null;
    };
  }, [running]);

  const emergencyType = session?.emergencyType ?? 'NONE';

  const phase =
    getPhase(time, emergencyType);

  const signal =
    getSignal(phase, emergencyType);

  /*
   * Emergency vehicle stays on the first
   * straight lane and moves continuously.
   */
  const emergencyData =
    selectedTrack
      ? getEmergencyPosition(
          selectedTrack,
          time,
        )
      : {
          position: {
            x: 50,
            y: 42,
          },

          heading: 0,
        };

  const percentage =
    Math.min(
      100,
      Math.round(
        (time / TOTAL_TIME) *
          100,
      ),
    );

  /*
   * Vehicle count changes with uploaded video.
   *
   * The actual road positions remain stable.
   */
  const normalVehicleCount =
    tracks.length > 0
      ? Math.max(
          4,
          Math.min(
            8,
            tracks.length + 3,
          ),
        )
      : 0;

  const startSimulation = () => {
    if (!selectedTrack || emergencyType === 'NONE') {
      return;
    }

    if (time >= TOTAL_TIME) {
      setTime(0);
    }

    setRunning(true);
  };

  const pauseSimulation = () => {
    setRunning(false);
  };

  const replaySimulation = () => {
    if (!selectedTrack || emergencyType === 'NONE') {
      return;
    }

    setTime(0);

    setRunning(true);
  };

  const resetSimulation = () => {
    setRunning(false);

    setTime(0);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06111d] text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin" />

          Loading Digital Twin...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06111d] p-6 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/20 bg-[#0b1d2d] p-6">
          <div className="mb-2 text-lg font-bold">
            Digital Twin unavailable
          </div>

          <p className="mb-5 text-sm text-slate-400">
            {error}
          </p>

          <button
            onClick={() =>
              void loadData()
            }
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            <RefreshCw className="h-4 w-4" />

            Refresh Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06111d] text-white">
      {/* HEADER */}
      <div className="border-b border-white/10 bg-[#081827]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
          <div>
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-blue-400" />

              <h1 className="text-xl font-bold tracking-tight">
                Digital Twin
              </h1>
            </div>

            <p className="mt-1 text-xs text-slate-400">
              Traffic signal priority simulation
            </p>
          </div>

          <button
            onClick={() =>
              void loadData()
            }
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />

            Refresh Session
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {/* SESSION INFO */}
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          {/* SOURCE VIDEO */}
          <div className="rounded-xl border border-white/10 bg-[#0b1d2d] p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Source Video
            </div>

            <div className="mt-2 truncate text-sm font-semibold text-white">
              {session?.sourceVideo ||
                session?.videoName ||
                "Current processing session"}
            </div>
          </div>

          {/* SCENARIO */}
          <div className="rounded-xl border border-white/10 bg-[#0b1d2d] p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Scenario</div>
            <div className="mt-2 text-lg font-bold text-white">
              {emergencyType === 'AMBULANCE' ? 'AMBULANCE' : emergencyType === 'FIRE_BRIGADE' ? 'FIRE BRIGADE' : 'NORMAL TRAFFIC'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {emergencyType === 'NONE' ? 'Signal remains on normal cycle.' : 'Priority approach can turn GREEN in simulation.'}
            </div>
          </div>

          {/* DETECTED VEHICLES */}
          <div className="rounded-xl border border-white/10 bg-[#0b1d2d] p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Detected Vehicles
            </div>

            <div className="mt-2 text-2xl font-bold text-white">
              {tracks.length ||
                session?.detectedVehicles ||
                0}
            </div>
          </div>

          {/* SIGNAL */}
          <div className="rounded-xl border border-white/10 bg-[#0b1d2d] p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Current Signal
            </div>

            <div
              className={`mt-2 text-2xl font-bold ${
                signal === "GREEN"
                  ? "text-emerald-400"
                  : signal === "RED"
                    ? "text-red-400"
                    : "text-amber-400"
              }`}
            >
              {signal}
            </div>
          </div>
        </div>

        {/* TRACK SELECTION */}
        {tracks.length > 0 && (
          <div className="mb-5 rounded-xl border border-white/10 bg-[#0b1d2d] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">
                  Select Vehicle
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Select a detected vehicle
                  track for the priority
                  simulation.
                </div>
              </div>

              <TrafficCone className="h-5 w-5 text-slate-500" />
            </div>

            <div className="flex flex-wrap gap-2">
              {tracks.map(
                (track, index) => {
                  const id =
                    track.trackId ??
                    track.id ??
                    index;

                  const active =
                    id ===
                    effectiveSelectedTrackId;

                  return (
                    <button
                      key={String(id)}
                      onClick={() =>
                        setSelectedTrackId(
                          id,
                        )
                      }
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-blue-400/50 bg-blue-500/15 text-blue-300"
                          : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      Track{" "}
                      {String(id)}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        )}

        {/* CONTROLS */}
        <div className="mb-3 rounded-xl border border-white/10 bg-[#0b1d2d] px-4 py-3 text-xs text-slate-400">
          {emergencyType === 'NONE'
            ? 'NORMAL TRAFFIC: no emergency-priority request is active, so the signal does not change.'
            : `${emergencyType === 'AMBULANCE' ? 'AMBULANCE' : 'FIRE BRIGADE'}: the relevant approach becomes GREEN during PRIORITY ACTIVE/PASSING, then returns to the normal cycle.`}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            onClick={startSimulation}
            disabled={!selectedTrack || emergencyType === 'NONE'}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" />

            {emergencyType === 'NONE' ? 'No Signal Priority' : 'Start Simulation'}
          </button>

          <button
            onClick={pauseSimulation}
            disabled={!running}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Pause className="h-4 w-4" />

            Pause
          </button>

          <button
            onClick={replaySimulation}
            disabled={!selectedTrack || emergencyType === 'NONE'}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />

            Replay
          </button>

          <button
            onClick={resetSimulation}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10"
          >
            Reset
          </button>
        </div>

        {/* DIGITAL TWIN */}
        <section className="overflow-hidden rounded-2xl border border-[#18344b] bg-[#081b2d]">
          <div className="relative h-[600px] overflow-hidden bg-[#132b3d]">
            {/* BACKGROUND GRID */}
            <div
              className="absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)",
                backgroundSize:
                  "45px 45px",
              }}
            />

            {/* BUILDINGS */}
            <div className="absolute left-0 top-0 h-[38%] w-[30%] bg-[#19374b]" />

            <div className="absolute right-0 top-0 h-[38%] w-[30%] bg-[#19374b]" />

            <div className="absolute bottom-0 left-0 h-[38%] w-[30%] bg-[#19374b]" />

            <div className="absolute bottom-0 right-0 h-[38%] w-[30%] bg-[#19374b]" />

            {/* HORIZONTAL ROAD */}
            <div className="absolute left-0 top-[35%] h-[30%] w-full bg-[#263f50]" />

            {/* VERTICAL ROAD */}
            <div className="absolute left-[35%] top-0 h-full w-[30%] bg-[#263f50]" />

            {/* ROAD CENTER LINES */}
            <div className="absolute left-0 top-[49.4%] h-[1px] w-full border-t border-dashed border-yellow-300/40" />

            <div className="absolute left-[49.4%] top-0 h-full w-[1px] border-l border-dashed border-yellow-300/40" />

            {/* STOP LINES */}
            <div className="absolute left-[42%] top-[35%] h-[30%] w-[2px] bg-white/60" />

            <div className="absolute left-[58%] top-[35%] h-[30%] w-[2px] bg-white/60" />

            <div className="absolute left-[35%] top-[42%] h-[2px] w-[30%] bg-white/60" />

            <div className="absolute left-[35%] top-[58%] h-[2px] w-[30%] bg-white/60" />

            {/* CURRENT STATE */}
            <div className="absolute left-4 top-4 z-50 rounded-xl border border-white/15 bg-[#081b2d]/95 px-4 py-3 shadow-lg">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Current State
              </div>

              <div className="text-sm font-bold text-white">
                {PHASE_INFO[phase].label}
              </div>

              <div className="mt-1 text-[10px] font-semibold text-cyan-300">
                Scenario: {emergencyType === 'AMBULANCE' ? 'AMBULANCE' : emergencyType === 'FIRE_BRIGADE' ? 'FIRE BRIGADE' : 'NORMAL TRAFFIC'}
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Signal: {signal}
              </div>
            </div>

            {/* VIDEO SESSION INDICATOR */}
            <div className="absolute right-4 top-4 z-50 rounded-xl border border-white/10 bg-[#081b2d]/90 px-3 py-2 shadow-lg">
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Digital Twin Source
              </div>

              <div className="mt-1 text-[10px] font-bold text-blue-300">
                {tracks.length > 0
                  ? "UPLOADED VIDEO SESSION"
                  : "SIMULATION"}
              </div>
            </div>

            {/* NORMAL VEHICLES */}
            {Array.from({
              length: normalVehicleCount,
            }).map((_, index) => {
              /*
               * Lane 0 is reserved for the simulated
               * emergency vehicle.
               *
               * Other vehicle indexes remain fixed,
               * so changing videos does not rearrange
               * their road positions.
               */
              if (
                selectedTrack &&
                index === 0
              ) {
                return null;
              }

              const {
                position,
                heading,
              } =
                getNormalVehicle(
                  index,
                  time,
                );

              return (
                <div
                  key={`normal-${index}`}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                  }}
                >
                  <div
                    className="flex h-6 w-10 items-center justify-center rounded-md border border-slate-400 bg-slate-200 shadow-lg"
                    style={{
                      transform: `rotate(${heading}deg)`,
                    }}
                  >
                    <Car className="h-4 w-4 text-slate-600" />
                  </div>
                </div>
              );
            })}

            {/* EMERGENCY VEHICLE */}
            {selectedTrack && (
              <div
                className="pointer-events-none absolute z-[100] -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${emergencyData.position.x}%`,
                  top: `${emergencyData.position.y}%`,
                }}
              >
                {/* RED PASSING GLOW */}
                {phase ===
                  "PASSING" && (
                  <div className="absolute left-1/2 top-1/2 -z-10 h-10 w-28 -translate-x-full -translate-y-1/2 rounded-full bg-red-500/20 blur-xl animate-pulse" />
                )}

                {/* PRIORITY LABEL */}
                {phase ===
                  "PASSING" && (
                  <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-red-400/40 bg-red-600 px-3 py-1 text-[9px] font-extrabold tracking-wider text-white shadow-lg">
                    🚨 PRIORITY
                  </div>
                )}

                {/* EMERGENCY CAR */}
                <div
                  className={`relative flex h-6 w-10 items-center justify-center rounded-md border-2 bg-red-600 ${
                    phase === "PASSING"
                      ? "border-white shadow-[0_0_24px_rgba(239,68,68,0.95)]"
                      : "border-red-300 shadow-[0_0_12px_rgba(239,68,68,0.55)]"
                  }`}
                  style={{
                    transform: `rotate(${emergencyData.heading}deg)`,
                  }}
                >
                  {/* ONE RED BEACON */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div
                      className={`h-3 w-3 rounded-full bg-red-500 ${
                        phase ===
                        "PASSING"
                          ? "animate-pulse shadow-[0_0_20px_rgba(239,68,68,1)]"
                          : "shadow-[0_0_10px_rgba(239,68,68,0.9)]"
                      }`}
                    />
                  </div>

                  {/* NORMAL CAR SYMBOL */}
                  <Car className="h-4 w-4 text-white" />
                </div>

                {/* STATUS */}
                {phase ===
                  "PASSING" && (
                  <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/90 px-2 py-1 text-[8px] font-bold tracking-wide text-red-300">
                    EMERGENCY PASSING
                  </div>
                )}
              </div>
            )}

            {/* TRAFFIC SIGNAL */}
            <div className="absolute right-[25%] top-[23%] z-40">
              <div className="relative rounded-xl border border-white/15 bg-[#071521] p-2 shadow-2xl">
                {/* RED */}
                <div
                  className={`h-7 w-7 rounded-full border border-white/20 transition-all ${
                    signal === "RED"
                      ? "bg-red-500 shadow-[0_0_18px_rgba(239,68,68,.9)]"
                      : "bg-red-500/20"
                  }`}
                />

                {/* YELLOW */}
                <div
                  className={`mt-2 h-7 w-7 rounded-full border border-white/20 transition-all ${
                    signal ===
                    "YELLOW"
                      ? "bg-yellow-400 shadow-[0_0_18px_rgba(250,204,21,.9)]"
                      : "bg-yellow-400/20"
                  }`}
                />

                {/* GREEN */}
                <div
                  className={`mt-2 h-7 w-7 rounded-full border border-white/20 transition-all ${
                    signal ===
                    "GREEN"
                      ? "bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,.9)]"
                      : "bg-emerald-500/20"
                  }`}
                />

                {/* ONE RED DOT NEAR SIGNAL */}
                {phase ===
                  "PASSING" && (
                  <div className="absolute -right-8 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 rounded-full bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)] animate-pulse" />
                  </div>
                )}
              </div>

              <div className="mt-2 text-center text-[9px] font-bold tracking-wider text-white/70">
                SIGNAL
              </div>
            </div>

            {/* LEGEND */}
            <div className="absolute bottom-4 left-4 z-50 rounded-xl border border-white/10 bg-[#081b2d]/90 p-3 shadow-lg">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Legend
              </div>

              <div className="flex items-center gap-2 text-[10px] text-slate-300">
                <div className="h-3 w-5 rounded-sm bg-slate-200" />

                Normal Vehicle
              </div>

              <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-300">
                <div className="relative h-3 w-5 rounded-sm bg-red-600">
                  <div className="absolute -top-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-red-500" />
                </div>

                Simulated Emergency
              </div>
            </div>

            {/* PROGRESS */}
            <div className="absolute bottom-4 right-4 z-50 w-64 rounded-xl border border-white/10 bg-[#081b2d]/90 p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between text-[9px]">
                <span className="font-semibold uppercase tracking-wider text-slate-500">
                  Simulation
                </span>

                <span className="font-bold text-white">
                  {time.toFixed(1)}s /{" "}
                  {TOTAL_TIME}s
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-100"
                  style={{
                    width: `${percentage}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* PHASE TIMELINE */}
          <div className="border-t border-white/10 bg-[#0a1d2d] p-5">
            <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Simulation Timeline
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {(
                [
                  "NORMAL",
                  "REQUESTED",
                  "ACTIVE",
                  "PASSING",
                  "RESTORED",
                  "COMPLETED",
                ] as Phase[]
              ).map((item) => {
                const active =
                  phase === item;

                return (
                  <div
                    key={item}
                    className={`rounded-lg border p-3 transition ${
                      active
                        ? "border-blue-400/40 bg-blue-500/10"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <div
                      className={`text-[9px] font-bold tracking-wider ${
                        active
                          ? "text-blue-300"
                          : "text-slate-500"
                      }`}
                    >
                      {
                        PHASE_INFO[
                          item
                        ].label
                      }
                    </div>

                    <div className="mt-1 text-[9px] leading-relaxed text-slate-500">
                      {
                        PHASE_INFO[
                          item
                        ].description
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FINAL STATUS */}
          <div className="border-t border-white/10 bg-[#081827] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-white">
                  {
                    PHASE_INFO[
                      phase
                    ].label
                  }
                </div>

                <div className="mt-1 text-[10px] text-slate-500">
                  {
                    PHASE_INFO[
                      phase
                    ].description
                  }
                </div>
              </div>

              <div
                className={`rounded-full px-3 py-1 text-[9px] font-bold ${
                  phase === "PASSING"
                    ? "bg-red-500/15 text-red-300"
                    : phase === "COMPLETED"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-blue-500/15 text-blue-300"
                }`}
              >
                {running
                  ? "SIMULATION RUNNING"
                  : "SIMULATION PAUSED"}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}