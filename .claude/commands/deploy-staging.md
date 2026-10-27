---
description: Copy production's database into staging and publish the current branch at /card-cove/staging/ for testing
---

Put the current branch live on staging (https://supportbgp.github.io/card-cove/staging/).

1. Check `git status`. Staging is built from the branch's last **commit**, so if there are uncommitted changes the user meant to test, say so and ask whether to commit them first. If the branch doesn't include the staging setup yet (no `.env.staging` / `build:staging`), merge `origin/main` into it first.
2. Run, with the Bash tool and a 10-minute timeout:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-staging.ps1 -NoPrompt`
   It copies production's database into staging, runs this branch's new migrations on staging, publishes the branch, and waits until the site serves it.
3. Never open, print or read `.staging-db.local` (it holds the database passwords). If the script says credentials aren't saved yet, tell the user to run `npm run deploy-staging` once in their own terminal; it asks for them there and saves them.
4. Report the result: the staging URL, the branch and commit that's live, and which migrations ran. If it failed, show the error and what was left unchanged. Remind the user to run `/staging-down` (or `npm run staging-down`) when they're done testing.
