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
const listen = (selector, eventName, handler) => {
  const element = typeof selector === "string" ? $(selector) : selector;
  if (element) element.addEventListener(eventName, handler);
  return element;
};
const state = {
  user: null,
  profile: null,
  shifts: [],
  activities: [],
  activeShift: null,
  editingActivityId: null,
  profileFormDirty: false,
  activityFilters: { search: "", category: "", date: "" },
  reportRange: { start: "", end: "" }
};
const ACTIVITY_CATEGORIES = ["Technical Skills", "Administration", "Communication", "Other"];
const CATEGORY_COLORS = {
  "Technical Skills": "#2f65d5",
  "Administration": "#1fb1c8",
  "Communication": "#f5b61b",
  "Other": "#c8d1df"
};
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
  const notice = $("#notice");
  notice.textContent = error.message || "The dashboard could not load. Check Firebase Authentication, Firestore, and Security Rules.";
  notice.className = "notice error";
  notice.hidden = false;
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
      course: "",
      major: "",
      companyName: "",
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
      course: savedProfile.course || "",
      major: savedProfile.major || "",
      companyName: savedProfile.companyName || "",
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

function syncProfileForm() {
  if (state.profileFormDirty || $("#profileSettingsForm")?.contains(document.activeElement)) return;
  $("#profileName").value = state.profile?.fullName || "";
  $("#profileCourse").value = state.profile?.course || "";
  $("#profileMajor").value = state.profile?.major || "";
  $("#profileCompany").value = state.profile?.companyName || "";
  $("#profileHours").value = state.profile?.targetHours || 243;
  $("#profileDailyMinutes").value = state.profile?.dailyMinutes || 480;
  $("#profileTimezone").value = state.profile?.timezone || "Asia/Manila";
}

function renderDashboard() {
  const targetHours = Number(state.profile?.targetHours || 243);
  const totalSeconds = completedSeconds() + liveSeconds();
  const targetSeconds = targetHours * 3600;
  const percentage = Math.min(100, targetSeconds ? (totalSeconds / targetSeconds) * 100 : 0);
  const fullName = state.profile?.fullName || state.user.displayName || state.user.email;

  $("#userName").textContent = fullName;
  $("#userEmail").textContent = state.user.email || "";
  syncProfileForm();
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

function minutesBetweenTimes(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  return minutes > 0 ? minutes : 0;
}

function updateActivityDuration() {
  const minutes = minutesBetweenTimes($("#activityStartTime").value, $("#activityEndTime").value);
  $("#duration").value = minutes ? (minutes / 60).toFixed(2) : "";
}

function renderCompetencyChart(totals, pieSelector = "#competencyPie", legendSelector = "#competencyLegend") {
  const pie = $(pieSelector);
  const legend = $(legendSelector);
  if (!pie || !legend) return;
  const totalMinutes = totals.reduce((sum, item) => sum + item.minutes, 0);
  if (!totalMinutes) {
    pie.className = "competency-pie empty";
    pie.style.background = "";
    pie.innerHTML = "<strong>0</strong><span>TASKS</span>";
    pie.setAttribute("aria-label", "No competency data yet");
    legend.innerHTML = totals.map(item => `<div class="legend-item"><span class="legend-name"><span class="legend-dot" style="color:${CATEGORY_COLORS[item.category]};background:${CATEGORY_COLORS[item.category]}" aria-hidden="true"></span><span>${escapeHtml(item.category)}</span></span><strong>0%</strong></div>`).join("");
    return;
  }
  let currentDegree = 0;
  const stops = totals.filter(item => item.minutes > 0).map(item => {
    const startDegree = currentDegree;
    currentDegree += item.minutes / totalMinutes * 360;
    return `${CATEGORY_COLORS[item.category]} ${startDegree}deg ${currentDegree}deg`;
  }).join(", ");
  pie.className = "competency-pie";
  pie.style.background = `conic-gradient(${stops})`;
  const totalTasks = totals.reduce((sum, item) => sum + item.count, 0);
  pie.innerHTML = `<strong>${totalTasks}</strong><span>TASKS</span>`;
  pie.setAttribute("aria-label", `Competency distribution: ${totals.filter(item => item.minutes > 0).map(item => `${item.category} ${Math.round(item.minutes / totalMinutes * 100)} percent`).join(", ")}`);
  legend.innerHTML = totals.map(item => `<div class="legend-item"><span class="legend-name"><span class="legend-dot" style="color:${CATEGORY_COLORS[item.category]};background:${CATEGORY_COLORS[item.category]}" aria-hidden="true"></span><span>${escapeHtml(item.category)}</span></span><strong>${Math.round(item.minutes / totalMinutes * 100)}%</strong></div>`).join("");
}

function setTaskType(category) {
  if (!ACTIVITY_CATEGORIES.includes(category)) category = "Technical Skills";
  $("#taskType").value = category;
  document.querySelectorAll("[data-task-type]").forEach(button => {
    const selected = button.dataset.taskType === category;
    button.setAttribute("aria-checked", String(selected));
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
    <tr><td>${escapeHtml(formatActivityDate(activity.date))}</td><td>${escapeHtml(activity.startTime || "-")} - ${escapeHtml(activity.endTime || "-")}</td><td><strong>${escapeHtml(activity.title)}</strong></td><td><span class="tag">${escapeHtml(activity.category)}</span></td><td>${(Number(activity.minutes || 0) / 60).toFixed(2)}h</td><td>${escapeHtml(activity.notes || "-")}</td><td><button class="table-action" data-edit-activity="${escapeHtml(activity.id)}" type="button">Edit</button> <button class="table-action danger" data-delete-activity="${escapeHtml(activity.id)}" type="button">Delete</button></td></tr>
  `).join("") : `<tr><td colspan="7" class="empty">No activities match the selected filters.</td></tr>`;

  const allTotals = ACTIVITY_CATEGORIES.map(category => ({
    category,
    count: state.activities.filter(activity => activity.category === category).length,
    minutes: state.activities.filter(activity => activity.category === category).reduce((total, activity) => total + Number(activity.minutes || 0), 0)
  }));
  renderCompetencyChart(allTotals);
  renderCompetencyChart(allTotals, "#dashboardCompetencyPie", "#dashboardCompetencyLegend");

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

function closeMobileNavigation() {
  const navigation = $("#mainNav");
  const toggle = $("#navToggle");
  if (window.matchMedia("(max-width: 900px)").matches) {
    navigation.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }
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
      const alreadyClockedToday = state.shifts.some(shift => shift.start && dateKeyFromParts(new Date(timestampMillis(shift.start))) === todayISO());
      if (alreadyClockedToday) {
        showNotice("Only one time log is allowed per day. Clock out the existing shift before trying again.", "error");
        return;
      }
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
  setTaskType("Technical Skills");
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
  setTaskType(activity.category || "Other");
  $("#activityDate").value = activity.date || todayISO();
  $("#activityStartTime").value = activity.startTime || "";
  $("#activityEndTime").value = activity.endTime || "";
  $("#duration").value = activity.startTime && activity.endTime
    ? (minutesBetweenTimes(activity.startTime, activity.endTime) / 60).toFixed(2)
    : (Number(activity.minutes || 0) / 60).toFixed(2);
  $("#notes").value = activity.notes || "";
  $("#activityModal").showModal();
}

async function saveProfileValues({ prefix, buttonSelector, closeSelector = null }) {
  const fullName = $(`#${prefix}Name`).value.trim();
  const course = $(`#${prefix}Course`)?.value.trim() || "";
  const major = $(`#${prefix}Major`)?.value.trim() || "";
  const companyName = $(`#${prefix}Company`)?.value.trim() || "";
  const targetHours = Number($(`#${prefix}Hours`).value);
  const dailyMinutes = Number($(`#${prefix}DailyMinutes`).value);
  const timezone = $(`#${prefix}Timezone`).value;

  if (!fullName || fullName.length > 120 || course.length > 120 || major.length > 120 || companyName.length > 160 || !Number.isFinite(targetHours) || targetHours <= 0 || targetHours > 1000 || !Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 1440 || !timezone) {
    showNotice("Check your name, course, major, company, target hours, daily minutes, and timezone.", "error");
    return;
  }

  const button = $(buttonSelector);
  button.disabled = true;
  try {
    const profile = { fullName, course, major, companyName, targetHours, dailyMinutes, timezone };
    await setDoc(doc(db, "profiles", state.user.uid), {
      ...profile,
      email: state.user.email,
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.profile = { ...state.profile, ...profile };
    state.profileFormDirty = false;
    if (closeSelector) $(closeSelector).close();
    renderDashboard();
    showNotice("Settings saved.");
  } catch (error) {
    showNotice(error.message || "Settings could not be saved.", "error");
  } finally {
    button.disabled = false;
  }
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
  const date = $("#activityDate").value;
  const startTime = $("#activityStartTime").value;
  const endTime = $("#activityEndTime").value;
  const minutes = minutesBetweenTimes(startTime, endTime);
  const notes = $("#notes").value.trim();
  if (!title || !date || !startTime || !endTime || !ACTIVITY_CATEGORIES.includes(category) || !Number.isInteger(minutes) || minutes < 15 || minutes > 1440) {
    showNotice("Enter a title, task type, date, start time, and end time. End time must be after start time and the task must be at least 15 minutes.", "error");
    return;
  }

  $("#saveActivity").disabled = true;
  try {
    const wasEditing = Boolean(state.editingActivityId);
    const activityData = { title, category, minutes, date, startTime, endTime, notes };
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

listen("#clockButton", "click", toggleClock);
listen("#openActivity", "click", openModal);
listen("#openActivityBottom", "click", openModal);
listen("#closeActivity", "click", closeModal);
listen("#activityForm", "submit", saveActivity);
listen("#activityStartTime", "change", updateActivityDuration);
listen("#activityEndTime", "change", updateActivityDuration);
document.querySelectorAll("[data-task-type]").forEach(button => listen(button, "click", () => setTaskType(button.dataset.taskType)));
listen("#profileSettingsForm", "submit", saveProfileSettings);
listen("#profileSettingsForm", "input", () => { state.profileFormDirty = true; });
document.querySelectorAll("[data-view]").forEach(button => listen(button, "click", () => setView(button.dataset.view)));
listen("#navToggle", "click", () => {
  const navigation = $("#mainNav");
  if (!navigation) return;
  const expanded = navigation.classList.toggle("open");
  $("#navToggle").setAttribute("aria-expanded", String(expanded));
});
document.querySelectorAll("[data-view]").forEach(button => listen(button, "click", closeMobileNavigation));
listen("#timeLogsClock", "click", toggleClock);
listen("#openActivityLogs", "click", openModal);
listen("#activityLogsList", "click", event => {
  const editButton = event.target.closest("[data-edit-activity]");
  const button = event.target.closest("[data-delete-activity]");
  if (editButton) openEditActivity(editButton.dataset.editActivity);
  if (button) deleteActivity(button.dataset.deleteActivity);
});
listen("#activitySearch", "input", event => { state.activityFilters.search = event.target.value; renderSecondaryViews(); });
listen("#activityCategoryFilter", "change", event => { state.activityFilters.category = event.target.value; renderSecondaryViews(); });
listen("#activityDateFilter", "change", event => { state.activityFilters.date = event.target.value; renderSecondaryViews(); });
listen("#clearActivityFilters", "click", () => {
  state.activityFilters = { search: "", category: "", date: "" };
  $("#activitySearch").value = "";
  $("#activityCategoryFilter").value = "";
  $("#activityDateFilter").value = "";
  renderSecondaryViews();
});
listen("#reportStart", "change", event => { state.reportRange.start = event.target.value; renderSecondaryViews(); });
listen("#reportEnd", "change", event => { state.reportRange.end = event.target.value; renderSecondaryViews(); });
listen("#clearReportRange", "click", () => {
  state.reportRange = { start: "", end: "" };
  $("#reportStart").value = "";
  $("#reportEnd").value = "";
  renderSecondaryViews();
});
listen("#printReport", "click", printReport);
listen("#exportReport", "click", exportReport);
listen("#signOut", "click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.querySelector(".signout-label").textContent = "Signing out…";
  try {
    await signOut(auth);
    window.location.replace("login.html");
  } catch (error) {
    button.disabled = false;
    button.querySelector(".signout-label").textContent = "Sign out";
    showNotice(error.message || "Could not sign out. Please try again.", "error");
  }
});
setInterval(() => { if (state.user) renderDashboard(); }, 1000);

if (!isFirebaseConfigured) {
  showFirebaseSetupMessage();
} else {
  let authHandled = false;
  const authTimeout = window.setTimeout(() => {
    if (!authHandled) {
      if (auth.currentUser) {
        handleAuthState(auth.currentUser);
      } else {
        window.location.replace("login.html");
      }
    }
  }, 5000);

  const handleAuthState = async user => {
    if (authHandled) return;
    authHandled = true;
    window.clearTimeout(authTimeout);
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
  };

  try {
    onAuthStateChanged(auth, handleAuthState, error => showLoadError(error));
  } catch (error) {
    showLoadError(error);
  }
}

window.setTimeout(() => {
  const loading = $("#loading");
  if (loading && !loading.hidden && !window.dashboardReady) {
    showLoadError(new Error("Firebase did not finish loading. Verify the Firebase Authorized Domain and reload with Ctrl + F5."));
  }
}, 16000);
