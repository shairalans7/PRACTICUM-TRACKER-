import {
  addDoc,
  auth,
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  isFirebaseConfigured,
  onAuthStateChanged,
  query,
  serverTimestamp,
  setDoc,
  signOut,
  Timestamp,
  updateDoc,
  where
} from "./firebase.js";

const $ = selector => document.querySelector(selector);
const state = { user: null, profile: null, shifts: [], activities: [], activeShift: null };
window.dashboardBooted = true;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  return [hours, minutes, remaining].map(value => String(value).padStart(2, "0")).join(":");
}

function formatHours(seconds) {
  return `${(Math.max(0, seconds) / 3600).toFixed(1)}h`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function timestampMillis(value) {
  return value?.toMillis ? value.toMillis() : 0;
}

function showNotice(text, type = "success") {
  const notice = $("#notice");
  notice.textContent = text;
  notice.hidden = false;
  notice.className = `notice ${type}`;
}

function showFirebaseSetupMessage() {
  $("#loading").hidden = true;
  $("#setupNotice").hidden = false;
  $("#app").hidden = true;
}

function showLoadError(error) {
  $("#loading").hidden = false;
  $("#loading").innerHTML = `<h2>Dashboard could not load</h2><p>${escapeHtml(error.message || "Check Firebase Authentication, Firestore, and Security Rules.")}</p><p>Confirm that Firestore is created and <code>firestore.rules</code> has been published.</p>`;
}

async function loadProfile() {
  const profileRef = doc(db, "profiles", state.user.uid);
  const profileSnapshot = await getDoc(profileRef);
  if (!profileSnapshot.exists()) {
    state.profile = {
      fullName: state.user.displayName || state.user.email?.split("@")[0] || "Student Intern",
      targetHours: 243,
      dailyMinutes: 480,
      timezone: "Asia/Manila"
    };
    await setDoc(profileRef, { ...state.profile, email: state.user.email, updatedAt: serverTimestamp() }, { merge: true });
  } else {
    state.profile = profileSnapshot.data();
  }
}

async function loadData() {
  const userId = state.user.uid;
  const shiftSnapshot = await getDocs(query(collection(db, "shifts"), where("userId", "==", userId)));
  const activitySnapshot = await getDocs(query(collection(db, "activities"), where("userId", "==", userId)));
  state.shifts = shiftSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => timestampMillis(b.start) - timestampMillis(a.start));
  state.activities = activitySnapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => `${b.date}${b.createdAt?.toMillis?.() || 0}`.localeCompare(`${a.date}${a.createdAt?.toMillis?.() || 0}`));
  state.activeShift = state.shifts.find(shift => !shift.end) || null;
}

function completedSeconds() {
  return state.shifts.reduce((total, shift) => {
    if (shift.durationSeconds) return total + Number(shift.durationSeconds);
    if (shift.end && shift.start) return total + Math.max(0, timestampMillis(shift.end) - timestampMillis(shift.start)) / 1000;
    return total;
  }, 0);
}

function liveSeconds() {
  return state.activeShift?.start ? Math.max(0, Date.now() - timestampMillis(state.activeShift.start)) / 1000 : 0;
}

function renderDashboard() {
  const targetHours = Number(state.profile?.targetHours || 243);
  const totalSeconds = completedSeconds() + liveSeconds();
  const targetSeconds = targetHours * 3600;
  const percentage = Math.min(100, targetSeconds ? (totalSeconds / targetSeconds) * 100 : 0);
  const fullName = state.profile?.fullName || state.user.displayName || state.user.email;

  $("#userName").textContent = fullName;
  $("#userEmail").textContent = state.user.email || "";
  $("#todayLabel").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  $("#timerStatus").textContent = state.activeShift ? "Your shift is in progress" : "Ready when you are";
  $("#timerDisplay").textContent = formatClock(liveSeconds());
  $("#clockButton").textContent = state.activeShift ? "Clock out" : "Clock in";
  $("#hoursCompleted").textContent = formatHours(totalSeconds);
  $("#hoursRemaining").textContent = `${formatHours(Math.max(0, targetSeconds - totalSeconds))} remaining`;
  $("#progressPercent").textContent = `${percentage.toFixed(0)}% completed`;
  $("#progressBar").style.width = `${percentage}%`;
  $("#taskCount").textContent = state.activities.length;

  const today = todayISO();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const todaySeconds = state.shifts.filter(shift => shift.start && new Date(timestampMillis(shift.start)).toISOString().slice(0, 10) === today).reduce((total, shift) => total + Number(shift.durationSeconds || 0), 0) + (state.activeShift ? liveSeconds() : 0);
  const weekSeconds = state.shifts.filter(shift => shift.start && timestampMillis(shift.start) >= weekStart.getTime()).reduce((total, shift) => total + Number(shift.durationSeconds || 0), 0) + (state.activeShift ? liveSeconds() : 0);
  $("#todayHours").textContent = formatHours(todaySeconds);
  $("#weekHours").textContent = formatHours(weekSeconds);

  const categoryTotals = {};
  state.activities.forEach(activity => {
    categoryTotals[activity.category] = (categoryTotals[activity.category] || 0) + Number(activity.minutes || 0);
  });
  $("#competencyList").innerHTML = ["Technical Skills", "Administration", "Communication", "Other"].map(category => {
    const minutes = categoryTotals[category] || 0;
    const totalMinutes = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0) || 1;
    return `<div class="competency-row"><span>${escapeHtml(category)}</span><strong>${Math.round(minutes / totalMinutes * 100)}%</strong></div>`;
  }).join("");

  $("#activityList").innerHTML = state.activities.length ? state.activities.slice(0, 8).map(activity => `
    <article class="activity-row">
      <div><span class="tag">${escapeHtml(activity.category)}</span><strong>${escapeHtml(activity.title)}</strong><p>${escapeHtml(activity.notes || "No notes")}</p></div>
      <span class="duration">${(Number(activity.minutes || 0) / 60).toFixed(2)}h</span>
    </article>`).join("") : "<p class=\"empty\">No activities recorded yet.</p>";
}

async function toggleClock() {
  $("#clockButton").disabled = true;
  try {
    if (state.activeShift) {
      const end = Timestamp.now();
      const durationSeconds = Math.max(0, end.toMillis() - timestampMillis(state.activeShift.start)) / 1000;
      await updateDoc(doc(db, "shifts", state.activeShift.id), { end, durationSeconds });
      showNotice("Shift saved. Every hour counts.");
    } else {
      await addDoc(collection(db, "shifts"), { userId: state.user.uid, start: Timestamp.now(), end: null, durationSeconds: 0, createdAt: serverTimestamp() });
      showNotice("You are clocked in. Have a productive day!");
    }
    await loadData();
    renderDashboard();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    $("#clockButton").disabled = false;
  }
}

function openModal() {
  $("#activityModal").showModal();
  $("#activityDate").value = todayISO();
}

function closeModal() {
  $("#activityModal").close();
}

async function saveActivity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = $("#taskTitle").value.trim();
  const category = $("#taskType").value;
  const minutes = Math.round(Number($("#duration").value) * 60);
  const date = $("#activityDate").value;
  const notes = $("#notes").value.trim();
  if (!title || !minutes || !date) return;

  $("#saveActivity").disabled = true;
  try {
    await addDoc(collection(db, "activities"), { userId: state.user.uid, title, category, minutes, date, notes, createdAt: serverTimestamp() });
    form.reset();
    closeModal();
    await loadData();
    renderDashboard();
    showNotice("Activity saved.");
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    $("#saveActivity").disabled = false;
  }
}

$("#clockButton").addEventListener("click", toggleClock);
$("#openActivity").addEventListener("click", openModal);
$("#openActivityBottom").addEventListener("click", openModal);
$("#closeActivity").addEventListener("click", closeModal);
$("#activityForm").addEventListener("submit", saveActivity);
$("#signOut").addEventListener("click", () => signOut(auth));
setInterval(() => { if (state.user) renderDashboard(); }, 1000);

if (!isFirebaseConfigured) {
  showFirebaseSetupMessage();
} else {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    try {
      state.user = user;
      await loadProfile();
      await loadData();
      $("#loading").hidden = true;
      $("#app").hidden = false;
      renderDashboard();
    } catch (error) {
      showLoadError(error);
    }
  });
}
