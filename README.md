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

## Next implementation steps

1. Add settings for total hours, daily minutes, and timezone.
2. Add full Time Logs, Activity Logs, Competencies, and Reports pages.
3. Add Firebase Emulator Suite tests before production deployment.
4. Keep all Admin SDK credentials out of source control.

## GitHub Pages

GitHub Pages serves the static `index.html` and `login.html` files. It does not execute PHP, so the `.php` files are only for the local PHP server. After publishing this repository, add the GitHub Pages hostname, such as `your-user.github.io`, to Firebase Authentication authorized domains.
