# SignalGuard AI

**VERIFY. PRIORITIZE. RESPOND.**

SignalGuard AI is a local-first traffic emergency intelligence MVP. It uploads a traffic video, decodes sampled frames, measures persistent motion, tracks motion regions, evaluates multi-cue emergency evidence, recommends signal priority, and exports an auditable report.

## Local Startup

Requirements: Node.js 18 or newer. No PostgreSQL, Python, cloud service, or API key is required.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with:

- Email: `admin@signalguard.local`
- Password: `SignalGuard@2026`

The app creates the SQLite database `data/signalguard.db` and stores uploaded files in `uploads/` automatically.

## Emergency Scenario Demo

The prototype supports three controlled video scenarios from **Live Monitoring**:

- **Ambulance** → the processed session prepares an ambulance emergency-priority simulation; the selected approach becomes GREEN during `PRIORITY ACTIVE` / `PASSING`, then returns to normal.
- **Fire Brigade** → the same priority flow is used for a fire-brigade scenario.
- **Normal Traffic** → no emergency priority is created, so the Digital Twin remains on the normal signal cycle.

For a reliable offline/demo presentation, the scenario can be selected explicitly before upload. `AUTO` infers the scenario from filenames containing terms such as `ambulance` or `fire brigade`; this is a controlled prototype input, not autonomous vehicle classification.

The signal behavior is simulation-only and does not control a real traffic signal.

## Workflow Test

1. Sign in and open **Live Monitoring**.
2. Select a playable MP4, AVI, or MOV under 500MB.
3. Select **Upload & Process**.
4. Keep the page open while sampled frames are decoded and progress advances.
5. Review detections, tracks, and candidate evidence in **Emergency Verification**.
6. If the real video has no qualifying emergency, select **Use Track** for a measured track, then select **Start Video-Derived Emergency Simulation**. This reuses the selected track and is explicitly labeled `DEMO / SIMULATION`.
7. Review the selected-track demo candidate in **Emergency Verification** and the safe recommendation in **Signal Priority**.
8. Compare normal and priority phases in **Digital Twin**. The selected vehicle remains red while its relevant signal changes red to green.
9. Review measured aggregates in **Analytics** and decisions in **Decision Log**.
10. Download both CSV and JSON from Reports, upload a second video to verify session isolation, then log out and sign in again.

## What Is Real

- Authentication uses the `signalguard_session` HttpOnly cookie and locally persisted server sessions.
- Uploads are stored on disk with safe filenames and are playable from the app.
- FFmpeg decodes actual frames from the uploaded video. Motion regions are measured from frame-to-frame pixel differences and tracked across sampled frames.
- Emergency candidates require measured color, behavioral persistence, temporal, and context cues. A normal test video correctly produces no candidate when evidence is insufficient.
- Analytics, decision logs, priority recommendations, and reports are derived from stored processing results.

## What Is Simulation

Digital Twin values are deterministic counterfactual estimates based on the observed priority events. Signal recommendations are simulations only and never control a real traffic signal.

The local detector intentionally reports `vehicle-like motion` when a lightweight local pipeline cannot reliably identify a vehicle class. A full YOLO/OpenCV detector can be added later without changing the session/API contracts.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
