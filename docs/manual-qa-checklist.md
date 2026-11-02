# PracticumFlow manual QA checklist

Run this checklist on `http://localhost:8000/login.html` and on the GitHub Pages URL after publishing the latest Firestore rules.

## Authentication

- [ ] Registration with a new email creates one Firebase Auth user and one `profiles/{uid}` document.
- [ ] Registration sends an email verification message and does not open the dashboard before verification.
- [ ] Sign-in with valid verified credentials opens `index.html`.
- [ ] Invalid credentials show a clear error without exposing Firebase internals.
- [ ] Password reset sends an email for an existing account.
- [ ] Unverified sign-in shows the verification message and resend action.
- [ ] Sign out returns to `login.html` and a protected `index.html` visit redirects back to login.

## Dashboard and data ownership

- [ ] Clock in creates one `shifts` document with the current timestamp.
- [ ] Clock out updates only the active shift and calculates its duration.
- [ ] A second click cannot create duplicate clock-out updates.
- [ ] A second clock-in on the same local day is rejected until the existing shift is clocked out.
- [ ] Activity creation saves a valid title, task type, date, start time, end time, calculated minutes, notes, and owner UID.
- [ ] Activity duration updates automatically when start or end time changes.
- [ ] Activity creation rejects a missing time or an end time earlier than the start time.
- [ ] Activity edit changes only the selected owner's activity.
- [ ] Activity delete removes only the selected owner's activity after confirmation.
- [ ] Search, category filter, and date filter return the expected activity rows.
- [ ] Reports update for the selected date range and print/CSV actions work.
- [ ] Competencies show category totals and the pie chart/legend updates after adding or deleting an activity.
- [ ] Profile settings save full name, target hours, daily minutes, and timezone.

## Accessibility and responsive behavior

- [ ] Tab through login, theme toggle, form controls, dialogs, and dashboard actions; every focus target has a visible focus ring.
- [ ] Screen-reader labels announce the theme toggle, navigation menu, search/filter controls, status messages, and dialogs.
- [ ] With reduced motion enabled, the interface does not use distracting transitions or animations.
- [ ] At a narrow mobile width, the navigation toggle opens and closes the menu; selecting a view closes it.
- [ ] At a narrow mobile width, tables scroll horizontally and buttons remain reachable.
- [ ] Light and dark mode both keep text and controls readable, and the selected theme survives refresh.

## Two-user and security checks

- [ ] Create User A and User B in separate browser profiles or private windows.
- [ ] Add time/activity data as User A; User B must not see it.
- [ ] Attempt to read, update, or delete User A's document IDs while signed in as User B; Firestore must return permission denied.
- [ ] Attempt any protected read/write while signed out; Firestore must return permission denied.
- [ ] Attempt to create a future-dated shift; Firestore rules must reject it.
- [ ] Confirm `assets/firebase-config.js` contains only browser Firebase configuration and no service-account JSON, private key, or Admin SDK credential.

## Deployability checks

- [ ] `node --check assets/theme.js`, `assets/login.js`, `assets/dashboard.js`, and `assets/firebase.js` pass.
- [ ] All project scripts, images, and module imports use relative project paths or approved Firebase CDN URLs.
- [ ] `index.html`, `login.html`, and both background image files return HTTP 200 from GitHub Pages.
- [ ] Firestore rules are published from `firestore.rules` before production testing.
