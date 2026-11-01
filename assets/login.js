import {
  auth,
  createUserWithEmailAndPassword,
  db,
  doc,
  isFirebaseConfigured,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setDoc,
  serverTimestamp,
  signInWithEmailAndPassword,
  updateProfile
} from "./firebase.js";

const form = document.querySelector("#authForm");
const modeButton = document.querySelector("#modeButton");
const submitButton = document.querySelector("#submitButton");
const nameField = document.querySelector("#nameField");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const message = document.querySelector("#message");
const forgotButton = document.querySelector("#forgotButton");
let registerMode = false;

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `message ${type}`;
}

function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/configuration-not-found": "Firebase Authentication is not enabled for this project. Enable Email/Password in Firebase Console > Authentication > Sign-in method.",
    "auth/operation-not-allowed": "Enable Email/Password in Firebase Console > Authentication > Sign-in method.",
    "auth/unauthorized-domain": "Add localhost and 127.0.0.1 under Firebase Console > Authentication > Settings > Authorized domains."
  };
  return messages[error.code] || error.message || "Authentication failed.";
}

function setMode() {
  nameField.hidden = !registerMode;
  nameInput.required = registerMode;
  submitButton.textContent = registerMode ? "Create account" : "Sign in";
  modeButton.textContent = registerMode
    ? "Already have an account? Sign in"
    : "Create a new account";
}

if (!isFirebaseConfigured) {
  showMessage("Add your Firebase web configuration in assets/firebase-config.js before signing in.");
  form.querySelectorAll("input, button").forEach(element => {
    if (element !== modeButton) element.disabled = true;
  });
}

modeButton.addEventListener("click", () => {
  registerMode = !registerMode;
  setMode();
});

forgotButton.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    showMessage("Enter your email first, then select Forgot password.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset email sent.", "success");
  } catch (error) {
    showMessage(friendlyError(error));
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("", "hidden");

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    let user;

    if (registerMode) {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      user = result.user;
      const fullName = nameInput.value.trim();
      await updateProfile(user, { displayName: fullName });
      await setDoc(doc(db, "profiles", user.uid), {
        fullName,
        email,
        targetHours: 243,
        dailyMinutes: 480,
        timezone: "Asia/Manila",
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      const result = await signInWithEmailAndPassword(auth, email, password);
      user = result.user;
    }

    if (user) window.location.href = "index.html";
  } catch (error) {
    showMessage(friendlyError(error));
  } finally {
    submitButton.disabled = false;
  }
});

if (isFirebaseConfigured) {
  onAuthStateChanged(auth, user => {
    if (user) window.location.href = "index.html";
  });
}

setMode();
