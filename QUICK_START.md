# SignalGuard AI Quick Start

## Start

Requirements: Node.js 18+. PostgreSQL, Python, cloud services, and API keys are not required.

```bash
npm install
npm run dev
```

Open `http://localhost:3000/login` (or the port shown by Next.js).

## Demo Login

- Email: `admin@signalguard.local`
- Password: `SignalGuard@2026`

## MVP Demo Sequence

1. Sign in and open **Live Monitoring**.
2. Upload a real MP4, AVI, or MOV under 500MB.
3. Confirm the playable feed, progress, frames, detections, tracks, and processing timeline.
4. Review the measured candidate in **Emergency Verification**. Ordinary traffic may correctly remain `SUSPICIOUS` or produce no verified event.
5. Select **Use Track** for a measured track after processing completes.
6. Select **Start Video-Derived Emergency Simulation**. This reuses the selected real track and is explicitly labeled `DEMO / SIMULATION`.
7. Open **Emergency Verification** and confirm the selected-track demo candidate is verified.
8. Open **Signal Priority** and confirm the safe recommendation, approach, confidence, delay, and time saved.
9. Open **Digital Twin** and compare `NORMAL SIGNAL` with `SIGNALGUARD PRIORITY`; the selected vehicle stays red while its signal changes red to green.
10. Confirm **Analytics**, **Decision Log**, and **Reports** update from the same active session/event data.
11. Download both CSV and JSON reports, upload a second video, and confirm the active session resets to only the second video's data.
12. Log out and sign in again.

## Local Data

The application initializes `data/signalguard.db` automatically using SQLite. Uploaded files are stored in `uploads/`. No manual schema or database command is needed.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Processing Notes

The local worker uses the bundled FFmpeg binary to decode actual frames and performs deterministic motion, tracking, color-cue, temporal, behavioral, and context analysis. It does not claim a vehicle class or real ambulance when the evidence cannot support it. The demo scenario is a downstream presentation mode, not real-world detection and not real signal control.
