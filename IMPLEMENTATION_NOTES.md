# Flexi OSSD Challenge - Phase 1 Notes

## Current Architecture

The app has been rebuilt as a static, data-driven game foundation.

- `index.html` is now a minimal shell with a single `#app` mount point.
- `data.js` owns the starter grade/question catalog.
- `styles.css` contains the refreshed responsive interface, reward view, and print certificate styles.
- `script.js` owns the runtime: route rendering, game state, scoring, transitions, review, leaderboard, reward, and certificate flow.

No build step or package install is required yet. Open `index.html` directly, or serve the folder with any static file server.

## Data Model

All starter grade content lives in `window.FLEXI_GRADE_CATALOG` inside `data.js`.

Each grade has:

- `id`
- `title`
- `focus`
- `color`
- `questions`

Supported question types:

- `choice`
- `fill`
- `match`

The renderer is generic, so adding a question should only require editing grade data rather than creating a new grade-specific function.

## Game State

The runtime tracks:

- student name
- mode: `challenge` or `practice`
- starting grade
- current grade
- current question
- attempts
- points
- first-try answers
- completed grades
- elapsed time

Last setup and leaderboard entries are saved in localStorage under the `flexi:v2:*` keys.

## Phase 1 Scope

Completed in Phase 1:

- Static app shell
- Hash routes: `home`, `game`, `results`, `leaderboard`
- Data-driven grade catalog for Grades 1-12
- Reusable renderers for choice, fill, and matching questions
- Scoring and first-try tracking
- Timed challenge mode
- One-grade practice mode
- Local leaderboard
- Responsive interface using existing local mascot/logo/background assets

Completed in Phase 2:

- Grade catalog extracted to `data.js`
- Grade-complete transition screen
- First-try streak tracking and streak bonus
- Missed-question review summary
- More visual Grade 1-12 journey track
- Reward screen using local assets only
- Printable certificate route with required selfie capture
- Leaderboard entries now include first-try and streak context
- Admin Pass button for operator-controlled grade bypasses; skipped prompts earn zero points and are recorded separately

Deferred:

- Booth QR and event mode
- Larger content bank per grade
- Question randomization
- Dedicated missed-question replay mode
- Optional camera fallback/upload path for devices that block live camera access
- Dedicated TypeScript/Vite project structure
- Automated tests
