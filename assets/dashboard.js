import {
  addDoc,
  auth,
  collection,
  deleteDoc,
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
const state = {
  user: null,
  profile: null,
  shifts: [],
  activities: [],
  activeShift: null,
  editingActivityId: null,
  activityFilters: { search: "", category: "", date: "" },
  reportRange: { start: "", end: "" }
};
const ACTIVITY_CATEGORIES = ["Technical Skills", "Administration", "Communication", "Other"];
window.dashboardBooted = true;
window.dashboardReady = false;

window.addEventListener("error", event => {
  if (!window.dashboardReady && document.querySelector("#loading")) {
    showLoadError(event.error || new Error(event.message || "The dashboard script encountered an error."));
  }
});

window.addEventListener("unhandledrejection", event => {
  if (!window.dashboardReady && document.querySelector("#loading")) {
    showLoadError(event.reason instanceof Error ? event.reason : new Error("Firebase initialization failed."));
  }
});

function timeZone() {
  const candidate = state.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "Asia/Manila";
  }
}

function dateKeyFromParts(date, zone = timeZone()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function todayISO() {
  return dateKeyFromParts(new Date());
}

function formatDateInTimeZone(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone(),
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

function weekStartISO(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
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
  window.dashboardReady = true;
  $("#loading").hidden = true;
  $("#setupNotice").hidden = false;
  $("#app").hidden = true;
}

function showLoadError(error) {
  window.dashboardReady = true;
  $("#loading").hidden = false;
  $("#loading").innerHTML = `<h2>Dashboard could not load</h2><p>${escapeHtml(error.message || "Check Firebase Authentication, Firestore, and Security Rules.")}</p><p>Confirm that Firestore is created and <code>firestore.rules</code> has been published.</p>`;
}

function withTimeout(promise, milliseconds = 15000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Firebase is taking too long to respond. Check your internet connection, Firebase Authorized Domains, and Firestore rules.")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
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
    const savedProfile = profileSnapshot.data();
    state.profile = {
      ...savedProfile,
      fullName: savedProfile.fullName || state.user.displayName || state.user.email?.split("@")[0] || "Student Intern",
      targetHours: Number(savedProfile.targetHours || 243),
      dailyMinutes: Number(savedProfile.dailyMinutes || 480),
      timezone: savedProfile.timezone || "Asia/Manila"
    };
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
  $("#profileName").value = state.profile?.fullName || "";
  $("#profileHours").value = state.profile?.targetHours || 243;
  $("#profileDailyMinutes").value = state.profile?.dailyMinutes || 480;
  $("#profileTimezone").value = state.profile?.timezone || "Asia/Manila";
  $("#todayLabel").textContent = formatDateInTimeZone();
  $("#timerStatus").textContent = state.activeShift ? "Your shift is in progress" : "Ready when you are";
  $("#timerDisplay").textContent = formatClock(liveSeconds());
  $("#clockButton").textContent = state.activeShift ? "Clock out" : "Clock in";
  $("#hoursCompleted").textContent = formatHours(totalSeconds);
  $("#hoursRemaining").textContent = `${formatHours(Math.max(0, targetSeconds - totalSeconds))} remaining`;
  $("#progressPercent").textContent = `${percentage.toFixed(0)}% completed`;
  $("#progressBar").style.width = `${percentage}%`;
  $("#taskCount").textContent = state.activities.length;

  const today = todayISO();
  const weekStart = weekStartISO(today);
  const todaySeconds = state.shifts.filter(shift => shift.start && dateKeyFromParts(new Date(timestampMillis(shift.start))) === today).reduce((total, shift) => total + Number(shift.durationSeconds || 0), 0) + (state.activeShift ? liveSeconds() : 0);
  const weekSeconds = state.shifts.filter(shift => shift.start && dateKeyFromParts(new Date(timestampMillis(shift.start))) >= weekStart && dateKeyFromParts(new Date(timestampMillis(shift.start))) <= today).reduce((total, shift) => total + Number(shift.durationSeconds || 0), 0) + (state.activeShift ? liveSeconds() : 0);
  $("#todayHours").textContent = formatHours(todaySeconds);
  $("#weekHours").textContent = formatHours(weekSeconds);

  const categoryTotals = {};
  state.activities.forEach(activity => {
    categoryTotals[activity.category] = (categoryTotals[activity.category] || 0) + Number(activity.minutes || 0);
  });
  $("#competencyList").innerHTML = ACTIVITY_CATEGORIES.map(category => {
    const minutes = categoryTotals[category] || 0;
    const totalMinutes = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0) || 1;
    return `<div class="competency-row"><span>${escapeHtml(category)}</span><strong>${Math.round(minutes / totalMinutes * 100)}%</strong></div>`;
  }).join("");

  $("#activityList").innerHTML = state.activities.length ? state.activities.slice(0, 8).map(activity => `
    <article class="activity-row">
      <div><span class="tag">${escapeHtml(activity.category)}</span><strong>${escapeHtml(activity.title)}</strong><p>${escapeHtml(activity.notes || "No notes")}</p></div>
      <span class="duration">${(Number(activity.minutes || 0) / 60).toFixed(2)}h</span>
    </article>`).join("") : "<p class=\"empty\">No activities recorded yet.</p>";
  renderSecondaryViews();
}

function formatTimestamp(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone(),
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestampMillis(value)));
}

function formatActivityDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone(),
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function shiftSeconds(shift) {
  if (shift.durationSeconds) return Number(shift.durationSeconds);
  if (shift.end && shift.start) return Math.max(0, timestampMillis(shift.end) - timestampMillis(shift.start)) / 1000;
  return shift.start ? liveSeconds() : 0;
}

function filteredActivities() {
  const { search, category, date } = state.activityFilters;
  const term = search.trim().toLowerCase();
  return state.activities.filter(activity => {
    const matchesSearch = !term || `${activity.title} ${activity.notes || ""}`.toLowerCase().includes(term);
    const matchesCategory = !category || activity.category === category;
    const matchesDate = !date || activity.date === date;
    return matchesSearch && matchesCategory && matchesDate;
  });
}

function inReportRange(date) {
  return (!state.reportRange.start || date >= state.reportRange.start)
    && (!state.reportRange.end || date <= state.reportRange.end);
}

function getReportData() {
  const activities = state.activities.filter(activity => inReportRange(activity.date));
  const shifts = state.shifts.filter(shift => shift.start && inReportRange(dateKeyFromParts(new Date(timestampMillis(shift.start)))));
  const totals = ACTIVITY_CATEGORIES.map(category => {
    const matching = activities.filter(activity => activity.category === category);
    const minutes = matching.reduce((total, activity) => total + Number(activity.minutes || 0), 0);
    return { category, count: matching.length, minutes };
  });
  return { activities, shifts, totals, activityMinutes: activities.reduce((total, activity) => total + Number(activity.minutes || 0), 0), clockedSeconds: shifts.reduce((total, shift) => total + shiftSeconds(shift), 0) };
}

function renderSecondaryViews() {
  $("#timeLogsClock").textContent = state.activeShift ? "Clock out" : "Clock in";
  $("#timeLogsList").innerHTML = state.shifts.length ? state.shifts.map(shift => `
    <tr><td>${escapeHtml(formatActivityDate(dateKeyFromParts(new Date(timestampMillis(shift.start)))))}</td><td>${escapeHtml(formatTimestamp(shift.start))}</td><td>${escapeHtml(formatTimestamp(shift.end))}</td><td>${formatHours(shiftSeconds(shift))}</td><td><span class="status-pill">${shift.end ? "Completed" : "In progress"}</span></td></tr>
  `).join("") : `<tr><td colspan="5" class="empty">No time logs yet.</td></tr>`;

  const visibleActivities = filteredActivities();
  $("#activityLogsList").innerHTML = visibleActivities.length ? visibleActivities.map(activity => `
    <tr><td>${escapeHtml(formatActivityDate(activity.date))}</td><td><strong>${escapeHtml(activity.title)}</strong></td><td><span class="tag">${escapeHtml(activity.category)}</span></td><td>${(Number(activity.minutes || 0) / 60).toFixed(2)}h</td><td>${escapeHtml(activity.notes || "—")}</td><td><button class="table-action" data-edit-activity="${escapeHtml(activity.id)}" type="button">Edit</button> <button class="table-action danger" data-delete-activity="${escapeHtml(activity.id)}" type="button">Delete</button></td></tr>
  `).join("") : `<tr><td colspan="6" class="empty">No activities match the selected filters.</td></tr>`;

  const allTotals = ACTIVITY_CATEGORIES.map(category => ({
    category,
    count: state.activities.filter(activity => activity.category === category).length,
    minutes: state.activities.filter(activity => activity.category === category).reduce((total, activity) => total + Number(activity.minutes || 0), 0)
  }));
  const totalMinutes = allTotals.reduce((total, item) => total + item.minutes, 0) || 1;
  $("#competencySummary").innerHTML = allTotals.map(item => `<div class="card"><h3>${escapeHtml(item.category)}</h3><strong>${(item.minutes / 60).toFixed(1)}h</strong><p class="muted">${item.count} activit${item.count === 1 ? "y" : "ies"}</p></div>`).join("");
  $("#competencyDetails").innerHTML = allTotals.map(item => `
    <div class="competency-row"><span>${escapeHtml(item.category)}</span><strong>${Math.round(item.minutes / totalMinutes * 100)}%</strong></div>
    <div class="progress-track" style="margin-bottom:14px"><div class="progress-bar" style="width:${Math.round(item.minutes / totalMinutes * 100)}%"></div></div>
  `).join("");

  const report = getReportData();
  const activityMinutes = report.activityMinutes;
  const completedHours = report.clockedSeconds / 3600;
  const targetHours = Number(state.profile?.targetHours || 243);
  $("#reportSummary").innerHTML = `
    <div class="card"><h3>Clocked hours</h3><strong>${completedHours.toFixed(1)}h</strong><p class="muted">From saved shifts</p></div>
    <div class="card"><h3>Activity hours</h3><strong>${(activityMinutes / 60).toFixed(1)}h</strong><p class="muted">From activity logs</p></div>
    <div class="card"><h3>Remaining goal</h3><strong>${Math.max(0, targetHours - completedHours).toFixed(1)}h</strong><p class="muted">Target: ${targetHours.toFixed(1)}h</p></div>`;
  $("#reportList").innerHTML = report.totals.map(item => `<tr><td>${escapeHtml(item.category)}</td><td>${item.count}</td><td>${item.minutes}</td><td>${(item.minutes / 60).toFixed(2)}h</td></tr>`).join("");
}

async function deleteActivity(activityId) {
  const activity = state.activities.find(item => item.id === activityId);
  if (!activity || !window.confirm(`Delete “${activity.title}”? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "activities", activityId));
    await loadData();
    renderDashboard();
    showNotice("Activity deleted.");
  } catch (error) {
    showNotice(error.message || "Activity could not be deleted.", "error");
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportReport() {
  const report = getReportData();
  const rows = [["Category", "Activities", "Minutes", "Hours"]];
  report.totals.forEach(item => rows.push([item.category, item.count, item.minutes, (item.minutes / 60).toFixed(2)]));
  rows.push([]);
  rows.push(["Clocked hours", "", "", (report.clockedSeconds / 3600).toFixed(2)]);
  rows.push(["Report range", state.reportRange.start || "All dates", "to", state.reportRange.end || "All dates"]);
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `practicum-report-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showNotice("Report downloaded.");
}

function printReport() {
  setView("reports");
  window.setTimeout(() => window.print(), 50);
}

function setView(viewName) {
  const views = {
    dashboard: "#dashboardView",
    timeLogs: "#timeLogsView",
    activityLogs: "#activityLogsView",
    competencies: "#competenciesView",
    reports: "#reportsView",
    settings: "#settingsView"
  };
  Object.entries(views).forEach(([name, selector]) => {
    $(selector).hidden = name !== viewName;
  });
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  renderSecondaryViews();
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
  state.editingActivityId = null;
  $("#activityModalTitle").textContent = "Add activity";
  $("#saveActivity").textContent = "Save activity";
  $("#activityForm").reset();
  $("#activityModal").showModal();
  $("#activityDate").value = todayISO();
}

function closeModal() {
  $("#activityModal").close();
  state.editingActivityId = null;
}

function openEditActivity(activityId) {
  const activity = state.activities.find(item => item.id === activityId);
  if (!activity) return;
  state.editingActivityId = activityId;
  $("#activityModalTitle").textContent = "Edit activity";
  $("#saveActivity").textContent = "Update activity";
  $("#taskTitle").value = activity.title || "";
  $("#taskType").value = activity.category || "Other";
  $("#duration").value = (Number(activity.minutes || 0) / 60).toFixed(2);
  $("#activityDate").value = activity.date || todayISO();
  $("#notes").value = activity.notes || "";
  $("#activityModal").showModal();
}

function openSettings() {
  $("#settingsName").value = state.profile?.fullName || "";
  $("#settingsHours").value = state.profile?.targetHours || 243;
  $("#settingsDailyMinutes").value = state.profile?.dailyMinutes || 480;
  $("#settingsTimezone").value = state.profile?.timezone || "Asia/Manila";
  $("#settingsModal").showModal();
}

function closeSettings() {
  $("#settingsModal").close();
}

async function saveProfileValues({ prefix, buttonSelector, closeSelector = null }) {
  const fullName = $(`#${prefix}Name`).value.trim();
  const targetHours = Number($(`#${prefix}Hours`).value);
  const dailyMinutes = Number($(`#${prefix}DailyMinutes`).value);
  const timezone = $(`#${prefix}Timezone`).value;

  if (!fullName || fullName.length > 120 || !Number.isFinite(targetHours) || targetHours <= 0 || targetHours > 1000 || !Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 1440 || !timezone) {
    showNotice("Check your name, target hours, daily minutes, and timezone.", "error");
    return;
  }

  const button = $(buttonSelector);
  button.disabled = true;
  try {
    const profile = { fullName, targetHours, dailyMinutes, timezone };
    await setDoc(doc(db, "profiles", state.user.uid), {
      ...profile,
      email: state.user.email,
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.profile = { ...state.profile, ...profile };
    if (closeSelector) $(closeSelector).close();
    renderDashboard();
    showNotice("Settings saved.");
  } catch (error) {
    showNotice(error.message || "Settings could not be saved.", "error");
  } finally {
    button.disabled = false;
  }
}

function saveSettings(event) {
  event.preventDefault();
  return saveProfileValues({ prefix: "settings", buttonSelector: "#saveSettings", closeSelector: "#settingsModal" });
}

function saveProfileSettings(event) {
  event.preventDefault();
  return saveProfileValues({ prefix: "profile", buttonSelector: "#saveProfileSettings" });
}

async function saveActivity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = $("#taskTitle").value.trim();
  const category = $("#taskType").value;
  const minutes = Math.round(Number($("#duration").value) * 60);
  const date = $("#activityDate").value;
  const notes = $("#notes").value.trim();
  if (!title || !date || !ACTIVITY_CATEGORIES.includes(category) || !Number.isInteger(minutes) || minutes < 15 || minutes > 1440) {
    showNotice("Enter a title, choose a valid category, and use a duration from 0.25 to 24 hours.", "error");
    return;
  }

  $("#saveActivity").disabled = true;
  try {
    const wasEditing = Boolean(state.editingActivityId);
    const activityData = { title, category, minutes, date, notes };
    if (wasEditing) {
      await updateDoc(doc(db, "activities", state.editingActivityId), activityData);
    } else {
      await addDoc(collection(db, "activities"), { userId: state.user.uid, ...activityData, createdAt: serverTimestamp() });
    }
    form.reset();
    closeModal();
    await loadData();
    renderDashboard();
    showNotice(wasEditing ? "Activity updated." : "Activity saved.");
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
$("#openSettings").addEventListener("click", openSettings);
$("#closeSettings").addEventListener("click", closeSettings);
$("#settingsForm").addEventListener("submit", saveSettings);
$("#profileSettingsForm").addEventListener("submit", saveProfileSettings);
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
$("#timeLogsClock").addEventListener("click", toggleClock);
$("#openActivityLogs").addEventListener("click", openModal);
$("#activityLogsList").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-activity]");
  const button = event.target.closest("[data-delete-activity]");
  if (editButton) openEditActivity(editButton.dataset.editActivity);
  if (button) deleteActivity(button.dataset.deleteActivity);
});
$("#activitySearch").addEventListener("input", event => { state.activityFilters.search = event.target.value; renderSecondaryViews(); });
$("#activityCategoryFilter").addEventListener("change", event => { state.activityFilters.category = event.target.value; renderSecondaryViews(); });
$("#activityDateFilter").addEventListener("change", event => { state.activityFilters.date = event.target.value; renderSecondaryViews(); });
$("#clearActivityFilters").addEventListener("click", () => {
  state.activityFilters = { search: "", category: "", date: "" };
  $("#activitySearch").value = "";
  $("#activityCategoryFilter").value = "";
  $("#activityDateFilter").value = "";
  renderSecondaryViews();
});
$("#reportStart").addEventListener("change", event => { state.reportRange.start = event.target.value; renderSecondaryViews(); });
$("#reportEnd").addEventListener("change", event => { state.reportRange.end = event.target.value; renderSecondaryViews(); });
$("#clearReportRange").addEventListener("click", () => {
  state.reportRange = { start: "", end: "" };
  $("#reportStart").value = "";
  $("#reportEnd").value = "";
  renderSecondaryViews();
});
$("#printReport").addEventListener("click", printReport);
$("#exportReport").addEventListener("click", exportReport);
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
      $("#loading").hidden = true;
      $("#app").hidden = false;
      window.dashboardReady = true;
      renderDashboard();
      await withTimeout(loadProfile());
      await withTimeout(loadData());
      renderDashboard();
    } catch (error) {
      showNotice(error.message || "Your dashboard data could not be loaded. Check Firestore rules and try again.", "error");
    }
  });
}

window.setTimeout(() => {
  const loading = $("#loading");
  if (loading && !loading.hidden && !window.dashboardReady) {
    showLoadError(new Error("Firebase did not finish loading. Verify the Firebase Authorized Domain and reload with Ctrl + F5."));
  }
}, 16000);
