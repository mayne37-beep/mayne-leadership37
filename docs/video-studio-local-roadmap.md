# Video Studio: free online now, local GPU later

## Phase 4 (online, zero AI API billing)
The same Mayne Leadership Video Studio stays online and remains the editor. The new **Free AI narration** panel runs the Apache-2.0 Kokoro-82M speech model in a Web Worker on the author's device via \`kokoro-js@1.2.1\`. Inference does **not** call a voice-generation provider, charge credits, or transmit the narration script to an AI inference service.

The first user-initiated generation downloads the pinned JavaScript bundle from jsDelivr and the open-weight model from the Hugging Face model repository. Downloads may be large, require internet connectivity and browser storage, and can be reused from browser cache when available. The runtime prefers compatibility (WASM q8), so generation is much slower on mobile or low-power systems. The model is not part of the website's Vercel function or its build output.

Generation limit: 1,200 characters per scene. Choose among supported fixed voices. The generated WAV is written to existing per-scene IndexedDB audio storage, becomes downloadable, and appears in the scene's real browser video export. Uploaded photos, microphone recordings, moving videos and existing projects continue to work as before. Browser speechSynthesis preview still **cannot** be recorded; use the Free AI narration generator if the voice must appear in the exported movie.

No realistic lip synchronization or background voice cloning is promised by this mode. Moving video clips can still be imported, edited and composited as in Phase 3.

## Portable handoff
A new **Download future GPU render job** button exports \`mayne-local-video-job\` version 1. It contains scene scripts, preferred Kokoro voice, design settings, layout and duration, plus flags indicating which scene media will need to be supplied separately. **It does not contain media files, access credentials or browser-only IndexedDB media IDs.** For portability, retain original media separately.

This job format is a forward-compatible handoff to a future dedicated computer; it is not an active remote-render queue, server endpoint or automatic synchronization.

## Later: owner-controlled GPU workstation
1. Deploy a locally managed Kokoro TTS and MuseTalk/LatentSync-style avatar rendering service on hardware with a sufficiently capable NVIDIA GPU.
2. Implement a job receiver for the version 1 manifest with private scene media upload, authentication and per-job state.
3. Only then connect the online Studio to the workstation via authenticated TLS and a carefully designed private gateway or outbound job-polling agent. Do not expose an unauthenticated local GPU endpoint or attempt direct cross-origin localhost calls from a public production site.
4. Validate consent for source presenters and voices, limits, model licenses, job isolation, output size and cleanup. Keep the website editing experience and its existing project data model.
5. After local renderer passes end-to-end tests, add the Local GPU option. Maintain browser-only voice generation as a fallback.

## Costs and constraints
No third-party **AI subscription** is needed in the current free-browser mode. Hosting, domain registration, storage, bandwidth, electricity and eventual GPUs can still cost money. Vercel's zero-cost Hobby tier is restricted to personal, noncommercial use: verify site usage and account eligibility before representing hosting as free for a business. The model and CDN are still outside resources for software/weight delivery, not self-hosted generation infrastructure.

## Testing
\`npm run check:video\`: model and PCM audio unit tests, worker/editor syntax checks.
\`node tests/video-studio-browser.mjs\`: Chromium functionality, no-API mocked Worker audio attachment, portable render-job download, reload persistence, live clip composition and actual video export.

**Note:** CI uses a simulated WAV-producing Worker to test integration. The live 80–300MB model download and inference are not exercised in CI; test actual Kokoro synthesis on a supported desktop browser after release before depending on it for production video work.
