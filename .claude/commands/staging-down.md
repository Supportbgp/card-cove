---
description: Take the staging site offline and empty the staging database
---

Take staging down.

1. Run, with the Bash tool and a 10-minute timeout:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/staging-down.ps1 -NoPrompt`
   It deletes the `staging` branch, redeploys the site without `/card-cove/staging/`, and empties every table in the staging database (structure is kept).
2. Never open, print or read `.staging-db.local`. If the script says credentials aren't saved yet, tell the user to run `npm run staging-down` once in their own terminal.
3. Report what happened: site offline (or still disappearing from GitHub's cache), and the database emptied.
