# The Deadline and the Team: character-photo integration

The player supports real character photographs, 8 expressions for each of Malik, Hannah, Nora and Cameron, and four changing scene photographs. Missing photos gracefully fall back to the existing illustrated character and workplace artwork; live classrooms, original checkpoints, story scoring and instructor injects are unchanged.

The companion asset pack is `Deadline_Team_Photo_Assets.zip` (generated separately) and should be extracted so its `deadline-team/` folder contents land at `assets/leadership-101/deadline-team/` in the website repo. Layout: `scenes/{standup,coaching,planning,briefing}.webp`, `portraits/{malik,hannah,nora,cameron}-{neutral,concerned,defensive,frustrated,disappointed,thoughtful,relieved,hopeful}.webp`. The manifest and QA atlas are supporting files, not required at runtime.

After uploading the assets, verify all 4 scene backgrounds and character emotion changes in a **new** classroom on a desktop and mobile browser. Test instructor injects and all ending types. Existing classrooms continue to preserve their original scenario snapshot.
