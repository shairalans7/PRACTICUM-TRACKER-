# Practicum repository foundation review

Date reviewed: 2026-11-02

Source profile: https://github.com/shairalans7

The three public repositories were copied locally for read-only analysis under:

`work/github/shairalans7/`

No source repository was edited, reset, or committed.

## Repository inventory

| Repository | Stack | Shape | Foundation value |
|---|---|---|---|
| [PracticumFlow](https://github.com/shairalans7/PracticumFlow) | Single HTML file, Tailwind CDN, Chart.js CDN, Supabase JS CDN | Frontend prototype with Supabase Auth and tables | Good UI and product-flow reference; not a complete deployable backend |
| [practicum_track](https://github.com/shairalans7/practicum_track) | PHP 8, MySQLi, browser fetch APIs | Small server-rendered dashboard plus JSON endpoints | Best starting point for a coherent PHP/MySQL foundation |
| [practicum_trackk](https://github.com/shairalans7/practicum_trackk) | PHP 8, MySQLi and PDO, two schemas | `practicum_track` copy plus an unfinished second activity module | Useful extra UI ideas, but currently fragmented and should not be used as-is |

## Recommended foundation

Use `practicum_track` as the base and selectively borrow the following:

- From `PracticumFlow/index.html`: registration/profile fields, cleaner activity dashboard concept, and competency visualization.
- From `practicum_track/index.php`: authenticated server-rendered shell, accessible activity form, escaped log rendering, and the live dashboard layout.
- From `practicum_track/time_api.php`: server-owned clock sessions, active-session protection, and persisted duration calculation.
- From `practicum_track/save_log.php` and `get_logs.php`: prepared statements, session-scoped records, input limits, and JSON responses.
- From `practicum_trackk`: the separate reports and activity-log UI concepts only after they are connected to the same database and session model.

Target architecture:

```text
Authentication
  -> users / session
Dashboard
  -> time_sessions: attendance and clocked hours
  -> ojt_logs: task notes, competency, rendered hours
  -> reports: filtered ojt_logs query
  -> competencies: grouped ojt_logs query
Shared database connection
  -> one MySQLi or PDO layer, not both
```

## Current project tree

```text
PracticumFlow/
└── index.html

practicum_track/
├── db_connect.php
├── get_logs.php
├── index.php
├── login.php
├── login_process.php
├── logout.php
├── README_UPDATED.txt
├── save_log.php
├── schema_update.sql
└── time_api.php

practicum_trackk/
├── activitylogs.php
├── add-activity.php
├── competencies.php
├── db.php
├── reports.php
└── plus the same dashboard/auth/API files as practicum_track
```

## Dependencies and local setup

### PHP/MySQL version

- PHP 8-compatible server with MySQLi and/or PDO MySQL enabled.
- MySQL database named `practicum_tracker`.
- Existing tables expected by the PHP dashboard: `users` and `ojt_logs`.
- Import `schema_update.sql` to create `time_sessions`.
- Serve the selected folder through Apache/XAMPP or another PHP web server; do not open PHP files directly from the filesystem.

### Browser/CDN dependencies

- `PracticumFlow` loads Tailwind CSS, Chart.js, and Supabase JS from CDNs.
- The PHP dashboard references `bootstrap.css`, but that file is not present in either PHP repository.
- `practicum_trackk/login.php` additionally loads Bootstrap and Google Fonts from CDNs.

### Important data-model decision

Keep attendance time and activity duration separate until the product rules are decided. The PHP README explicitly says `time_sessions` are used for clocked hours while `ojt_logs.hours_rendered` is stored separately. A final dashboard should clearly label whether required hours come from attendance, approved activity logs, or a controlled combination.

## Reusable patterns already present

- Session guard before dashboard/API access.
- Prepared SQL statements with user ID filtering.
- `time_sessions` model with one open shift per user and server-side duration calculation.
- JSON endpoints for clocking and activity operations.
- HTML escaping in the PHP dashboard and browser-side escaping in the activity table.
- A single required-hours target currently set to 243 hours.
- Responsive dashboard layout and activity modal pattern.

## Blocking issues to resolve before using as a production foundation

1. `login_process.php` in both PHP repositories uses hardcoded credentials and always assigns `user_id = 1`. Replace it with a database lookup, `password_hash`/`password_verify`, session ID regeneration, and generic login errors.
2. Neither PHP repository contains the referenced `register.php` or `bootstrap.css` files.
3. `practicum_trackk/activitylogs.php` has a PHP parse error (`query .=` instead of `$query .=`), does not include/connect to `db.php`, never executes its query, and uses an undefined `$activities` variable.
4. `practicum_trackk/add-activity.php` writes to a separate `practicumflow_db.activities` table, while the dashboard reads `practicum_tracker.ojt_logs`. Those entries cannot appear in the dashboard.
5. The `activities` table in `practicum_trackk/schema_update.sql` has no `user_id`, so activity records would be shared across users.
6. `practicum_trackk/reports.php` expects `$report_activities`, but the file does not load it. The report page therefore has no working data path.
7. `practicum_trackk` appends a second form-processing implementation to `save_log.php`, mixing JSON output with a later redirect path. Keep one endpoint contract.
8. The dashboard navigation in `index.php` still marks Time Logs, Activity Log, Competencies, and Reports as visual placeholders.
9. No CSRF protection is present on state-changing requests. Add CSRF tokens to login, activity, and clock actions before deployment.
10. Database settings use the local `root` account with an empty password. Move credentials to environment/server configuration and use a restricted database user.

## Suggested implementation order

1. Pick `practicum_track` as the working base and freeze the other two as references.
2. Replace hardcoded authentication with database-backed authentication and add the missing registration flow only if registration is required.
3. Standardize on one database connection layer and one schema: `users`, `ojt_logs`, `time_sessions`.
4. Add shared authorization/bootstrap helpers so every page and endpoint checks the current user consistently.
5. Finish the dashboard actions: activity logs, time logs, competencies, and reports, all querying the same user-scoped data.
6. Add CSRF protection, validation, error handling, and environment-based configuration.
7. Add a small test checklist for login, clock in/out, activity save, filtering, competency totals, and report export.

## Validation performed

- All PHP files in `practicum_track` pass `php -l`.
- All PHP files in `practicum_trackk` pass `php -l` except `activitylogs.php`, which fails on line 14.
- `practicum_track` and `practicum_trackk` share identical copies of the main dashboard, database connector, log API, logout handler, time API, and README at the time of review.
- No database-backed runtime test was run because no local MySQL schema or credentials were provided.

## Netlify practicum-time-tracker reference

Live deployment: https://practicum-time-tracker.netlify.app/

The deployment exposes a Vite-style React production bundle at `/assets/`. The deployed HTML loads one JavaScript bundle and one CSS bundle. The source maps, `package.json`, `netlify.toml`, and other guessed source paths return the app shell rather than the original files, so the original source tree and Netlify function source cannot be reconstructed from the public URL alone.

A local read-only snapshot of the deployed assets is stored under:

`work/netlify/practicum-time-tracker/`

### Features identified from the deployed bundle

- Netlify Identity authentication through `/.netlify/identity`, including sign in, sign up, password recovery, password reset, and invite acceptance.
- A protected `/api/tracker` endpoint. An unauthenticated GET currently returns HTTP 401, confirming that records are server-backed and user-protected.
- Clock in and clock out actions persisted as shifts.
- Activity records with title, category, minutes, date, and notes.
- Editable practicum settings: total hours, daily minutes, and timezone.
- Default requirements of 243 hours, 480 minutes per day, and `Asia/Manila` timezone.
- Dashboard, time logs, activity logs, competencies, and reports navigation.
- Client-side PDF report generation using jsPDF/AutoTable bundled into the frontend.
- Time calculations split shifts by local date and derive today, week, total, and overtime values.

### Netlify foundation mapping

```text
Netlify Identity
  -> authenticated user/session
/api/tracker GET
  -> profile, shifts, activities
/api/tracker POST action=clock-in|clock-out
  -> persisted shift records
/api/tracker POST action=activity
  -> persisted activity records
/api/tracker POST action=settings
  -> profile requirements and timezone
React dashboard
  -> time calculations, competency summaries, PDF report
```

### How it fits the PHP foundation

The Netlify app is the strongest product and interaction reference. Its cleanest domain model should be carried into the PHP/MySQL base:

- `profile`: `total_hours`, `daily_minutes`, and `timezone` per user.
- `shifts`: `start`, `end`, and derived duration, equivalent to `time_sessions`.
- `activities`: `title`, `category`, `minutes`, `date`, and `notes`, equivalent to the current `ojt_logs` after field mapping.
- `settings`, `activity`, and clock actions: one authenticated service layer instead of separate disconnected PHP implementations.

The next foundation should therefore use `practicum_track` for the PHP server shell and adopt the Netlify app's data fields and user flow. It should not copy the minified bundle as application source.

To recover the original React/Netlify source, provide the GitHub repository connected to this Netlify site or authorize access to the Netlify project/source repository. The public URL alone is sufficient for behavior and UI reference, but not for the original source tree or serverless backend implementation.
