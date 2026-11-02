import {
  auth,
  createUserWithEmailAndPassword,
  db,
  doc,
  isFirebaseConfigured,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setDoc,
  serverTimestamp,
  signInWithEmailAndPassword,
  signOut,
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
const resendButton = document.querySelector("#resendButton");
const authStatus = document.querySelector("#authStatus");
const authStatusText = document.querySelector("#authStatusText");
const listen = (element, eventName, handler) => {
  if (element) element.addEventListener(eventName, handler);
};
let registerMode = false;
let authActionInProgress = false;

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `message ${type}`;
}

function setBusy(busy, text = "Working securely") {
  authActionInProgress = busy;
  authStatus.hidden = !busy;
  authStatusText.textContent = text;
  submitButton.disabled = busy;
  modeButton.disabled = busy;
  forgotButton.disabled = busy;
  resendButton.disabled = busy;
}

function showVerificationMessage(text) {
  showMessage(text, "success");
  resendButton.hidden = false;
}

function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/configuration-not-found": "Firebase Authentication is not enabled for this project. Enable Email/Password in Firebase Console > Authentication > Sign-in method.",
    "auth/operation-not-allowed": "Enable Email/Password in Firebase Console > Authentication > Sign-in method.",
    "auth/unauthorized-domain": "Add this website under Firebase Console > Authentication > Settings > Authorized domains.",
    "auth/too-many-requests": "Too many attempts. Wait a moment, then try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again."
  };
  if (error?.code?.startsWith("permission-denied")) {
    return "Your account was created, but the profile could not be saved. Publish the current Firestore rules, then try signing in again.";
  }
  return messages[error?.code] || "Authentication failed. Please try again.";
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
  forgotButton.disabled = true;
}

listen(modeButton, "click", () => {
  registerMode = !registerMode;
  setMode();
});

listen(forgotButton, "click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    showMessage("Enter your email first, then select Forgot password.");
    return;
  }
  setBusy(true, "Sending password reset email");
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset email sent.", "success");
  } catch (error) {
    showMessage(friendlyError(error));
  } finally {
    setBusy(false);
  }
});

listen(resendButton, "click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showMessage("Enter your email and password first, then resend the verification email.");
    return;
  }
  setBusy(true, "Resending verification email");
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (result.user.emailVerified) {
      window.location.href = "index.html?v=7ce89ce";
      return;
    }
    await sendEmailVerification(result.user);
    await signOut(auth);
    showVerificationMessage("A new verification email was sent. Verify your email before signing in.");
  } catch (error) {
    showMessage(friendlyError(error));
  } finally {
    setBusy(false);
  }
});

listen(form, "submit", async event => {
  event.preventDefault();
  setBusy(true, registerMode ? "Creating your account" : "Signing you in");
  resendButton.hidden = true;
  showMessage("", "hidden");
  let user = null;

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (registerMode) {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      user = result.user;
      const fullName = nameInput.value.trim();
      await updateProfile(user, { displayName: fullName });
      await setDoc(doc(db, "profiles", user.uid), {
        fullName,
        email,
        course: "",
        major: "",
        companyName: "",
        targetHours: 243,
        dailyMinutes: 480,
        timezone: "Asia/Manila",
        updatedAt: serverTimestamp()
      }, { merge: true });
      await sendEmailVerification(user);
      await signOut(auth);
      registerMode = false;
      setMode();
      passwordInput.value = "";
      showVerificationMessage("Account created. Check your email and verify your address before signing in.");
      return;
    } else {
      const result = await signInWithEmailAndPassword(auth, email, password);
      user = result.user;
      if (!user.emailVerified) {
        await sendEmailVerification(user);
        await signOut(auth);
        showVerificationMessage("Please verify your email first. We sent you a new verification email.");
        return;
      }
    }

    if (user) window.location.href = "index.html?v=7ce89ce";
  } catch (error) {
    if (user && !user.emailVerified) {
      await signOut(auth).catch(() => {});
    }
    showMessage(friendlyError(error));
  } finally {
    setBusy(false);
  }
});

if (isFirebaseConfigured) {
  onAuthStateChanged(auth, user => {
    if (user && !authActionInProgress) {
      if (user.emailVerified) {
        window.location.href = "index.html?v=7ce89ce";
      } else {
        signOut(auth).then(() => showVerificationMessage("Please verify your email before signing in.")).catch(() => {});
      }
    }
  });
}

setMode();
