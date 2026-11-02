# Practicum Tracker

This folder is the working PHP-served Firebase foundation for the practicum tracker.

## Working source

The root dashboard now uses Firebase Authentication and Cloud Firestore. PHP only serves the local pages:

- `index.php` — local PHP-served dashboard
- `login.php` — local PHP-served login page
- `index.html` — GitHub Pages dashboard entry point
- `login.html` — GitHub Pages login entry point
- `assets/firebase-config.js` — Firebase Web App configuration placeholder
- `assets/firebase.js` — Firebase SDK initialization
- `assets/login.js` — Firebase Authentication flow
- `assets/dashboard.js` — Firestore profiles, shifts, and activities
- `firestore.rules` — user-scoped Firestore security rules

## References

The `_references` folder is read-only reference material and is not part of the running app:

- `_references/github/practicum_trackk` — alternate PHP/UI attempt
- `_references/github/PracticumFlow` — standalone HTML/Supabase prototype
- `_references/netlify/practicum-time-tracker` — deployed Netlify assets

The review and integration notes are in `docs/practicum-foundation-review.md`.

## Firebase setup

1. Create or open a project in the Firebase console.
2. Add a Web App and copy its `firebaseConfig` object.
3. Enable Authentication > Sign-in method > Email/Password.
4. Create a Cloud Firestore database.
5. Paste the Web App values into `assets/firebase-config.js`.
6. Publish `firestore.rules` in the Firebase console or with the Firebase CLI.

The browser Firebase configuration is not a password. Security comes from Firebase Authentication and Firestore Security Rules. Do not put Admin SDK credentials in this project.

## Local development

1. Open this folder in VS Code.
2. Start Apache through XAMPP, or run `php -S 127.0.0.1:8000` from this folder.
3. Open `http://127.0.0.1:8000/login.php`.

## Implemented foundation features

- Dashboard, Time Logs, Activity Logs, Competencies, Reports, and Settings/Profile sections.
- Activity search, category/date filters, edit, and delete actions.
- Structured activity entries with date, task type, start time, end time, task description, and automatic duration calculation.
- Live competency category totals with a pie chart and legend.
- One clock-in per day guard in the client UI.
- Report date range, category totals, CSV download, and print/PDF-friendly layout.
- Profile values for full name, target hours, daily minutes, and timezone.

## Next implementation steps

1. Publish the latest `firestore.rules` and test every write action.
2. Add Firebase Emulator Suite tests before production deployment.
3. Keep all Admin SDK credentials out of source control.

## GitHub Pages

GitHub Pages serves the static `index.html` and `login.html` files. It does not execute PHP, so the `.php` files are only for the local PHP server. After publishing this repository, add the GitHub Pages hostname, such as `your-user.github.io`, to Firebase Authentication authorized domains.
