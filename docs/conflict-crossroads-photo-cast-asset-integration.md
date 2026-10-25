# Conflict Crossroads — Photo-Cast Asset Integration

The student player supports four Conflict Crossroads characters and four cinematic scene backgrounds, with an illustrated fallback while any image is missing or loading.

## Package
`Conflict_Crossroads_Photo_Assets.zip` contains 32 optimized photo portraits (8 distinct expressions for each of Sofia Martinez, Daniel Park, Rae Johnson, and Morgan Ellis), four 16:9 scene backdrops, a manifest, and QA atlas.

**Important:** The binary image files are not in GitHub or Vercel until the package is uploaded. Code merging alone does not publish the photos.

## Install
Extract the package and place the `conflict-crossroads/` directory at `assets/leadership-101/conflict-crossroads/` in the repo. Resulting paths:

- `assets/leadership-101/conflict-crossroads/portraits/{sofia,daniel,rae,morgan}-{neutral,concerned,defensive,frustrated,skeptical,thoughtful,relieved,hopeful}.webp`
- `assets/leadership-101/conflict-crossroads/scenes/{conflict,coaching,planning,briefing}.webp`

The 15 story scenes select backdrops by node and the speaking character's tone selects an expression. Scene and portrait images have graceful fallback behavior. No changes to decisions, scoring, checkpoints, instructor injects, or classroom sessions.

## Acceptance checklist
- All 36 image assets return HTTP 200 after upload.
- A new classroom based on `l101-03` reveals the four identities and scene transitions.
- Complete one strong and one damaged outcome; verify reactions, scores and outcome.
- Check instructor injects, desktop and mobile responsiveness and contrast.
- Regression test `l101-02` so the first scenario's image behavior is preserved.
