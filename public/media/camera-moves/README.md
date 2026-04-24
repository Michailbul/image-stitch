# Camera Move Previews

Drop preview assets here. The Camera Language Library auto-resolves
them by move `id`.

## Naming

For each `CameraMove` in `utils/cameraLanguage.ts`:

- `{id}.mp4` — 3–5s muted loop. Suggested: 480×270 (16:9), H.264, ~1 Mbps.
- `{id}.jpg` — poster frame. Suggested: 960×540 JPG, quality 80.

Example for the `slow-dolly-in` move:

```
/public/media/camera-moves/slow-dolly-in.mp4
/public/media/camera-moves/slow-dolly-in.jpg
```

Missing files fall back to a styled empty slot — no 404 noise in the UI.

## Generation recipe

Batch across all 30 moves using each move's own `copyPrompt` against
a consistent subject so only the camera motion differs:

```
Subject: a lone figure in a neon-lit Tokyo alley, wearing a black
jacket, standing still.
Camera: {copyPrompt}
Duration: 4s. 480×270. Muted.
```

Override via `previewVideoUrl` / `previewPoster` on the `CameraMove`
entry if you need a different path (external CDN, per-move subject,
etc.).

## Move IDs (current seed)

- push_pull: slow-dolly-in, fast-dolly-in, slow-dolly-out, dolly-zoom, extreme-macro-zoom
- orbit: orbit-180, orbit-360, slow-cinematic-arc, dutch-orbit
- vertical: crane-up, crane-down, pedestal-up, pedestal-down, tilt-up
- lateral: lateral-track, side-tracking, leading-shot, following-shot
- lens_focus: optical-zoom-in, optical-zoom-out, snap-zoom, reveal-from-blur, rack-focus
- creative: drone-flyover, over-the-shoulder, handheld-dynamic, whip-pan, barrel-shot, pov, bullet-time
