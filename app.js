"use strict";

const paths = {
  brand: '<path d="M3 11 12 4l9 7v8H3zM8 19v-7m0 2 6-4m-4 4 5 5"/>',
  today: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 12 2.5 2.5 5-5M9 3.5h6"/>',
  homes: '<path d="M3 10.5 12 3l9 7.5M5 9v11h14V9m-9 11v-6h4v6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M7.5 3v5m9-5v5m-13 3h17M8 15h2m4 0h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  minus: '<path d="M8 12h8"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  storage: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  wallet: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M21 10h-5a2 2 0 0 0 0 4h5m-4-2h.01"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>'
};
const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const fractionalCurrency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const formatDate = new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeZone: "Asia/Bangkok" });
const formatShortDate = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const formatMonth = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
const today = dayKey.format(new Date());
const atNoon = (date) => new Date(date + "T12:00:00+07:00");
function offsetDay(date, days) {
  const instant = atNoon(date);
  instant.setUTCDate(instant.getUTCDate() + days);
  return dayKey.format(instant);
}

let projects = [];
let tasks = [];
let ready = false;
let busy = false;
let hasRecovery = false;
let pendingRestore;
let paymentContext;
const workspaceChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("klao-workspace") : null;

class InputError extends Error {}
let view = "homes";
let projectId = null;
let detailTab = "งาน";
let filter = "all";
let calendarDate = today;
let monthStart = today.slice(0, 7) + "-01";
let toastTimer;

const views = [
  ["homes", "บ้านทั้งหมด", "homes"], ["today", "งานวันนี้", "today"], ["calendar", "ปฏิทิน", "calendar"], ["backup", "สำรองข้อมูล", "storage"]
];
const filterLabels = [["all", "ทั้งหมด"], ["open", "ยังไม่เสร็จ"], ["done", "เสร็จแล้ว"]];
const projectFor = (id) => projects.find((project) => project.id === id);
const compareTasks = (a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99");
const sorted = (list) => [...list].sort(compareTasks);
const money = (amountSatang) => (amountSatang % 100 ? fractionalCurrency : currency).format(amountSatang / 100);
const received = (project) => project.installments.reduce((total, item) => total + localData.paidAmount(item), 0);
const stageName = (project) => project.stages[project.stageIndex];
const projectIn = (data, id) => data.projects.find((project) => project.id === id);
const submitActions = (label) => '<div class="dialog-actions"><button type="button" class="text-button" data-close>ยกเลิก</button>'
  + '<button type="submit" class="primary">' + label + '</button></div>';
const tile = (name, tone = "") => '<span class="tile ' + tone + '">' + icon(name) + '</span>';
const closeControl = '<button type="button" class="icon-button" aria-label="ปิด" data-close>' + icon("close") + '</button>';

function updateNetwork() {
  const connection = $("#connection");
  connection.textContent = navigator.onLine ? "บันทึกในเครื่อง" : "ออฟไลน์ · บันทึกได้";
  connection.classList.toggle("offline", !navigator.onLine);
}
function updateControls() {
  $("#add").disabled = !ready || busy;
  document.querySelectorAll("#dialog [type=submit], #dialog [data-confirm], .done-check, [data-export]").forEach((button) => {
    button.disabled = !ready || busy;
  });
}
function setWorkspace(data) {
  projects = data.projects;
  tasks = data.tasks;
  if (view === "detail" && !projectFor(projectId)) goHome();
}
function goHome() {
  view = "homes";
  projectId = null;
  detailTab = "งาน";
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}
async function commit(operation, message, onSaved) {
  if (!ready || busy) return false;
  busy = true;
  updateControls();
  try {
    setWorkspace(await operation());
    onSaved?.();
    render(false);
    workspaceChannel?.postMessage("updated");
    showToast(message);
    return true;
  } catch (error) {
    if (!(error instanceof InputError)) console.info("Local save:", error.name);
    showToast(error instanceof InputError ? error.message : "บันทึกไม่ได้ กรุณาตรวจพื้นที่ในเครื่อง");
    return false;
  } finally {
    busy = false;
    updateControls();
  }
}
function taskRows(items, emptyText = "ยังไม่มีงาน") {
  if (items.length === 0) return '<li class="empty">' + emptyText + '</li>';
  return sorted(items).map((task) => {
    const name = projectFor(task.project)?.name || "";
    const subtitle = task.date === today ? name : name + " · " + formatShortDate.format(atNoon(task.date));
    return '<li class="task"><button class="done-check" aria-label="เสร็จแล้ว: ' + esc(task.title) + '" aria-pressed="' + task.done
      + '" data-toggle="' + esc(task.id) + '">' + icon(task.done ? "check" : "minus") + '</button>'
      + '<button class="task-body" data-task="' + esc(task.id) + '"><strong>' + esc(task.title) + '</strong><small>' + esc(subtitle)
      + '</small></button><span class="task-time">' + esc(task.time ? task.time + " น." : "") + '</span></li>';
  }).join("");
}
function stat(name, label, value, tone) {
  return '<div class="stat">' + tile(name, tone) + '<div><p>' + label + '</p><strong>' + value + '</strong></div></div>';
}
function pills(items, attribute, active) {
  return items.map(([value, label]) => '<button class="chip" data-' + attribute + '="' + value + '" aria-pressed="' + (value === active) + '">' + label + '</button>').join("");
}
function todayPage() {
  const items = tasks.filter((task) => task.date === today);
  const done = items.filter((task) => task.done).length;
  const open = items.length - done;
  const filtered = items.filter((task) => filter === "all" || (filter === "done" ? task.done : !task.done));
  return '<section class="hero"><div class="hero-content"><p class="hero-date">' + formatDate.format(atNoon(today))
    + '</p><h1>งานวันนี้</h1><p>' + (open ? 'เหลือ <strong>' + open + ' งาน</strong> ที่ต้องทำวันนี้' : "จัดการงานวันนี้ครบแล้ว") + '</p></div>'
    + '<div class="blueprint" aria-hidden="true"><div class="plan"><i></i><i></i><i></i><i></i></div></div></section>'
    + '<div class="stats">' + stat("today", "นัดและงาน", items.length) + stat("clock", "ยังไม่เสร็จ", open, "amber") + stat("check", "เสร็จแล้ว", done, "green") + '</div>'
    + '<div class="dashboard"><section class="panel"><div class="panel-head"><h2>รายการงาน</h2></div><div class="filters">'
    + pills(filterLabels, "filter", filter) + '</div><ul class="task-list">' + taskRows(filtered, "ไม่มีงานในรายการนี้") + '</ul></section>'
    + '<section class="panel"><div class="panel-head"><h2>บ้านลูกค้า</h2><button class="text-button" data-view="homes">ดูทั้งหมด</button></div>'
    + projects.map((project) => '<button class="site-preview" data-project="' + esc(project.id) + '">' + tile("homes") + '<span><strong>' + esc(project.name) + '</strong><span class="subtle">' + esc(stageName(project)) + '</span></span></button>').join("") + '</section></div>';
}
function homesPage() {
  const upcoming = sorted(tasks.filter((task) => !task.done && task.date >= today));
  const rankedProjects = projects.map((project) => ({
    project,
    next: upcoming.find((task) => task.project === project.id)
  })).sort((a, b) => {
    if (a.next && b.next) return compareTasks(a.next, b.next);
    return Number(!a.next) - Number(!b.next);
  });
  return '<header class="heading with-action"><div><h1>บ้านทั้งหมด</h1><p>' + projects.length
    + ' บ้านลูกค้า · เรียงตามนัดถัดไป</p></div><button class="outline-button" data-new-house>' + icon("plus")
    + '<span>เพิ่มบ้าน</span></button></header><div class="project-grid">' 
    + rankedProjects.map(({ project, next }) => {
      const nextTask = next
        ? '<span><strong>' + esc(next.title) + '</strong><span>' + formatShortDate.format(atNoon(next.date))
          + (next.time ? " · " + esc(next.time) + " น." : "") + '</span></span>'
        : '<span>ยังไม่มีนัดถัดไป</span>';
      return '<button class="project" data-project="' + esc(project.id) + '">'
        + '<span class="project-head">' + tile("homes") + '<span class="project-heading"><strong class="project-name">' + esc(project.name)
        + '</strong><span class="subtle">' + esc(project.place) + (project.sample ? (project.place ? " · ตัวอย่าง" : "ตัวอย่าง") : "") + '</span></span></span>'
        + '<span class="project-stage">' + esc(stageName(project)) + '</span>'
        + '<span class="project-price"><span class="subtle">ราคารวม</span><strong class="value">' + money(project.contractSatang) + '</strong></span>'
        + '<span class="project-next">' + icon("calendar") + nextTask + '</span></button>';
    }).join("") + '</div>';
}
function moneyRows(project) {
  if (!project.installments.length) return '<p class="empty">ยังไม่มีงวดเงิน</p>';
  return project.installments.map((item, index) => {
    const paid = localData.paidAmount(item);
    const left = item.amountSatang - paid;
    const status = !left ? "รับครบแล้ว" : paid ? "รับบางส่วน" : item.billed ? "วางบิลแล้ว" : "รอรับเงิน";
    const tone = !left ? " paid" : paid ? " partial" : "";
    const receipts = item.payments.length ? '<details class="payment-history"><summary>ประวัติรับเงิน</summary><ul>'
      + item.payments.map((payment) => '<li>' + (payment.date ? formatShortDate.format(atNoon(payment.date)) : "ยอดเดิม")
        + ' · ' + money(payment.amountSatang) + '</li>').join("") + '</ul></details>' : "";
    return '<div class="money-row"><div><strong>งวด ' + (index + 1) + ' · ' + esc(item.label) + '</strong>'
      + '<span class="payment-status' + tone + '">' + status + '</span>' + receipts
      + '</div><div class="money-amount"><strong>' + money(item.amountSatang)
      + '</strong><p class="subtle">รับแล้ว ' + money(paid) + (paid && left ? " · เหลือ " + money(left) : "")
      + '</p>' + (left ? '<button class="outline-button small" data-payment="' + esc(item.id) + '">รับเงิน</button>' : "") + '</div></div>';
  }).join("");
}
function docsFor(project) {
  const docs = [...project.documents];
  if (project.sample) {
    docs.push({ title: "ใบเสนอราคา", amountSatang: project.contractSatang });
    project.installments.forEach((item, index) => {
      if (item.billed) docs.push({ title: "ใบวางบิล · งวด " + (index + 1), note: item.label, amountSatang: item.amountSatang });
    });
  }
  return docs;
}

function projectPage() {
  const project = projectFor(projectId);
  const paid = project.installments.filter((item) => item.amountSatang === localData.paidAmount(item)).length;
  const tabs = [["งาน", "today"], ["เงินงวด", "wallet"], ["เอกสาร", "file"]].map(([tab, symbol]) =>
    '<button type="button" class="detail-tab" data-detail="' + tab + '" aria-pressed="' + (tab === detailTab) + '">'
    + icon(symbol) + '<span>' + tab + '</span></button>'
  ).join("");
  let body;
  if (detailTab === "งาน") {
    body = '<ul class="task-list">' + taskRows(tasks.filter((task) => task.project === project.id)) + '</ul>';
  } else if (detailTab === "เงินงวด") {
    body = '<div class="detail-body"><div class="detail-actions"><button class="outline-button" data-new-installment>'
      + icon("plus") + '<span>เพิ่มงวดเงิน</span></button></div>' + moneyRows(project) + '</div>';
  } else {
    const docs = docsFor(project);
    const docRows = docs.map((doc, index) => {
      const label = tile("file") + '<span><strong>' + esc(doc.title)
        + '</strong><small class="subtle">' + (doc.url ? "เปิดลิงก์เอกสาร" : "เอกสารตัวอย่าง") + '</small></span>';
      return doc.url
        ? '<a class="doc-row" target="_blank" rel="noopener noreferrer" href="' + esc(doc.url) + '">' + label + '</a>'
        : '<button class="doc-row" data-doc="' + index + '">' + label + '</button>';
    }).join("");
    body = '<div class="detail-body"><div class="detail-actions"><button class="outline-button" data-new-doc>'
      + icon("plus") + '<span>แนบลิงก์เอกสาร</span></button></div>' + (docRows || '<p class="empty">ยังไม่มีเอกสาร</p>') + '</div>';
  }
  return '<div class="project-detail"><header class="detail-header"><button class="text-button back" data-view="homes">กลับไปบ้านทั้งหมด</button>'
    + '<div class="detail-title"><div><h1>' + esc(project.name) + '</h1><p class="subtle">' + esc(project.place) + (project.sample ? (project.place ? " · ข้อมูลตัวอย่าง" : "ข้อมูลตัวอย่าง") : "")
    + '</p></div><div class="detail-total"><span class="subtle">ราคารวมของงานนี้</span><strong>' + money(project.contractSatang)
    + '</strong></div></div></header>'
    + '<div class="detail-stage">' + tile("today") + '<div><span class="subtle">ขั้นตอนการทำงาน</span><strong>'
    + esc(stageName(project)) + '</strong></div><button class="text-button" data-change-stage>เปลี่ยนขั้นตอน</button></div>'
    + '<div class="summary"><div><span class="subtle">ยอดเงินที่เหลือ</span><strong>' + money(project.contractSatang - received(project))
    + '</strong></div><div><span class="subtle">รับครบแล้ว</span><strong>' + paid + ' จาก ' + project.installments.length
    + ' งวด</strong></div></div>'
    + '<section aria-label="รายละเอียดบ้าน"><div class="detail-tabs" role="group" aria-label="หมวดรายละเอียด">' + tabs
    + '</div><div class="panel detail-panel">' + body + '</div></section></div>';
}
function calendarPage() {
  const firstDay = atNoon(monthStart).getUTCDay();
  const lastDay = new Date(Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0)).getUTCDate();
  const daysWithTasks = new Set(tasks.map((task) => task.date));
  let cells = '<span></span>'.repeat(firstDay);
  for (let day = 1; day <= lastDay; day += 1) {
    const date = offsetDay(monthStart, day - 1);
    cells += '<button class="calendar-day ' + (daysWithTasks.has(date) ? "has-task" : "") + '" data-date="' + date
      + '" aria-label="' + formatDate.format(atNoon(date)) + '" aria-pressed="' + (date === calendarDate) + '"'
      + (date === today ? ' aria-current="date"' : "") + '>' + day + '</button>';
  }
  return '<header class="heading"><h1>ปฏิทิน</h1></header><div class="dashboard cal-layout"><section class="panel calendar"><div class="panel-head"><h2>'
    + formatMonth.format(atNoon(monthStart)) + '</h2><div class="month-buttons"><button class="icon-button" data-month="-1" aria-label="เดือนก่อนหน้า">' + icon("left")
    + '</button><button class="icon-button" data-month="1" aria-label="เดือนถัดไป">' + icon("right")
    + '</button><button class="text-button" data-calendar-today>วันนี้</button></div></div><div class="calendar-grid">'
    + ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."].map((day) => '<span class="weekday">' + day + '</span>').join("") + cells
    + '</div></section><section class="panel"><div class="panel-head"><h2>' + formatShortDate.format(atNoon(calendarDate))
    + '</h2></div><ul class="task-list">' + taskRows(tasks.filter((task) => task.date === calendarDate)) + '</ul></section></div>';
}
function backupPage() {
  return '<header class="heading"><h1>สำรองข้อมูล</h1></header>'
    + '<div class="backup-grid"><section class="panel backup-panel"><h2>ส่งออกข้อมูล</h2>'
    + '<p class="subtle">ดาวน์โหลดไฟล์ JSON รวมบ้าน งาน งวดเงิน และลิงก์เอกสาร</p>'
    + '<button class="outline-button" data-export>' + icon("download") + '<span>ดาวน์โหลดไฟล์สำรอง</span></button></section>'
    + '<section class="panel backup-panel"><h2>กู้คืนข้อมูล</h2><p class="subtle">เลือกไฟล์สำรองจากเครื่องหรือ Google Drive</p>'
    + '<button class="outline-button" data-import>เลือกไฟล์สำรอง</button>'
    + (hasRecovery ? '<button class="text-button" data-revert>กลับไปข้อมูลก่อนกู้คืน</button>' : "")
    + '</section></div>';
}
function render(animate = true) {
  const pages = { today: todayPage, homes: homesPage, detail: projectPage, calendar: calendarPage, backup: backupPage };
  $("#content").innerHTML = '<div' + (animate ? ' class="page"' : "") + '>' + pages[view]() + '</div>';
  $("#add").hidden = view !== "calendar";
  document.querySelectorAll(".nav-button").forEach((button) => {
    if (button.dataset.view === (view === "detail" ? "homes" : view)) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  updateNetwork();
  updateControls();
}
function navigate(name, id = null) {
  view = name;
  projectId = id;
  detailTab = "งาน";
  render();
  window.scrollTo(0, 0);
}
function showDialog(title, body) {
  const dialog = $("#dialog");
  dialog.innerHTML = '<div class="dialog-head"><h2 id="dialog-title">' + title + '</h2>' + closeControl + '</div>' + body;
  dialog.showModal();
  updateControls();
}
function stageOptions(project, selected = null, includeNone = false) {
  return (includeNone ? '<option value="">ไม่เปลี่ยนขั้นตอน</option>' : "")
    + (project ? project.stages.map((stage, index) => '<option value="' + index + '"' + (index === selected ? " selected" : "")
      + '>' + esc(stage) + '</option>').join("") : "");
}
function showForm() {
  if (view !== "calendar" || !ready || busy) return;
  const options = projects.map((project) => '<option value="' + esc(project.id) + '">' + esc(project.name) + '</option>').join("");
  if (!options) {
    showToast("เพิ่มบ้านลูกค้าก่อนนัดงาน");
    return;
  }
  showDialog("เพิ่มงาน", '<form id="add-form" class="form"><label>ชื่องาน<input name="title" required maxlength="120" autofocus placeholder="เช่น วัดหน้างานครัว"></label>'
    + '<label>บ้านลูกค้า<select name="project" required><option value="" disabled selected>เลือกบ้าน</option>' + options + '</select></label>'
    + '<div class="fields"><label>วันที่<input type="date" name="date" required value="' + calendarDate
    + '"></label><label>เวลา<input type="time" name="time"></label></div><label>ขั้นตอนที่เกี่ยวข้อง<select name="stage" disabled>'
    + stageOptions(null, null, true) + '</select></label><label>โน้ต<input name="note" maxlength="500"></label>'
    + submitActions("บันทึกงาน") + '</form>');
}
function showTask(task) {
  const project = projectFor(task.project);
  showDialog(esc(task.title), '<p class="subtle">' + esc(project.name) + ' · ' + formatDate.format(atNoon(task.date))
    + (task.time ? ' · ' + esc(task.time) + ' น.' : "") + '</p>'
    + (task.completedOn ? '<p class="subtle">เสร็จเมื่อ ' + formatShortDate.format(atNoon(task.completedOn)) + '</p>' : "")
    + (task.note ? '<p class="notes">' + esc(task.note) + '</p>' : "")
    + '<div class="dialog-actions"><button class="primary" data-project="' + esc(project.id) + '">เปิดรายละเอียดบ้าน</button></div>');
}
function showDocument(index) {
  const project = projectFor(projectId);
  const doc = docsFor(project)[index];
  if (!doc || doc.url) return;
  showDialog(esc(doc.title), '<div class="document"><p class="subtle">เอกสารตัวอย่าง · Klao Built-in</p><strong>' + esc(project.name) + '</strong>'
    + (doc.note ? '<p>' + esc(doc.note) + '</p>' : "") + '<strong>ยอดเงิน ' + money(doc.amountSatang) + '</strong></div>');
}
function showHouseForm() {
  showDialog("เพิ่มบ้านลูกค้า", '<form id="house-form" class="form">'
    + '<label>ชื่อบ้านหรือชื่อลูกค้า<input name="name" maxlength="100" required autofocus></label>'
    + '<label>สถานที่<input name="place" maxlength="160"></label>'
    + '<label>ราคารวม (บาท)<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>'
    + submitActions("เพิ่มบ้าน") + '</form>');
}
function showStageForm() {
  const project = projectFor(projectId);
  showDialog("เปลี่ยนขั้นตอน", '<form id="stage-form" class="form"><label>ขั้นตอนปัจจุบัน<select name="stage">'
    + stageOptions(project, project.stageIndex) + '</select></label>' + submitActions("บันทึกขั้นตอน") + '</form>');
}
function showInstallmentForm() {
  const project = projectFor(projectId);
  const available = project.contractSatang - project.installments.reduce((total, item) => total + item.amountSatang, 0);
  if (!available) {
    showToast("แบ่งงวดครบตามราคารวมแล้ว");
    return;
  }
  showDialog("เพิ่มงวดเงิน", '<p class="subtle">ยอดที่ยังแบ่งงวดได้ ' + money(available) + '</p><form id="installment-form" class="form">'
    + '<label>ชื่องวด<input name="label" maxlength="100" required autofocus placeholder="เช่น มัดจำ"></label>'
    + '<label>ยอดงวด (บาท)<input name="amount" type="number" min="0.01" max="' + available / 100
    + '" step="0.01" inputmode="decimal" required></label>' + submitActions("เพิ่มงวดเงิน") + '</form>');
}
function showPaymentForm(id) {
  const project = projectFor(projectId);
  const index = project.installments.findIndex((item) => item.id === id);
  const item = project.installments[index];
  if (!item) return;
  const expectedPaid = localData.paidAmount(item);
  const left = item.amountSatang - expectedPaid;
  if (!left) return;
  paymentContext = { projectId: project.id, itemId: item.id, expectedPaid, left };
  showDialog("รับเงินงวด " + (index + 1), '<p class="subtle">' + esc(item.label) + ' · ยังค้าง ' + money(left)
    + '</p><form id="payment-form" class="form"><label>ยอดรับจริง (บาท)<input name="amount" type="number" min="0.01" max="'
    + left / 100 + '" value="' + left / 100 + '" step="0.01" inputmode="decimal" required></label>'
    + '<label>วันที่รับเงิน<input name="date" type="date" required value="' + dayKey.format(new Date()) + '"></label>'
    + submitActions("ยืนยันรับเงินครบ") + '</form>');
}
function showDocForm() {
  showDialog("แนบลิงก์เอกสาร", '<form id="doc-form" class="form"><label>ชื่อเอกสาร<input name="title" maxlength="120" required autofocus></label>'
    + '<label>ลิงก์เอกสาร<input name="url" type="url" required maxlength="2048" placeholder="https://"></label>'
    + submitActions("บันทึกลิงก์") + '</form>');
}
async function downloadBackup() {
  try {
    const data = await localData.read();
    const file = new Blob([localData.exportBackup(data)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "klao-backup-" + dayKey.format(new Date()) + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast("ดาวน์โหลดไฟล์สำรองแล้ว");
  } catch {
    showToast("ดาวน์โหลดไฟล์สำรองไม่ได้");
  }
}
function closeDialog() {
  $("#dialog").close();
}
$("#logo").innerHTML = icon("brand");
$("#logo").dataset.view = "homes";
$("#add").innerHTML = icon("plus");
$("#nav").innerHTML = views.map(([viewName, title, symbol]) => '<button class="nav-button" data-view="' + viewName + '" aria-label="' + title
  + '" title="' + title + '">' + icon(symbol) + '</button>').join("");
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.close !== undefined) closeDialog();
  if (!ready) return;
  if (button.id === "add") showForm();
  if (data.newHouse !== undefined) showHouseForm();
  if (data.changeStage !== undefined) showStageForm();
  if (data.newInstallment !== undefined) showInstallmentForm();
  if (data.payment) showPaymentForm(data.payment);
  if (data.newDoc !== undefined) showDocForm();
  if (data.export !== undefined) void downloadBackup();
  if (data.import !== undefined) {
    const picker = $("#backup-file");
    picker.value = "";
    picker.click();
  }
  if (data.revert !== undefined) showDialog("ย้อนการกู้คืน",
    '<p>ข้อมูลจะกลับไปเป็นชุดก่อนกู้คืนครั้งล่าสุด</p><div class="dialog-actions">'
    + '<button type="button" class="text-button" data-close>ยกเลิก</button>'
    + '<button type="button" class="primary" data-confirm="revert">ย้อนการกู้คืน</button></div>');
  if (data.confirm === "restore" && pendingRestore) {
    void commit(() => localData.restore(pendingRestore), "กู้คืนข้อมูลแล้ว", () => {
      hasRecovery = true;
      pendingRestore = undefined;
      closeDialog();
    });
  }
  if (data.confirm === "revert") void commit(localData.revert, "ย้อนการกู้คืนแล้ว", closeDialog);
  if (data.view) navigate(data.view);
  if (data.project) {
    if ($("#dialog").open) $("#dialog").close();
    navigate("detail", data.project);
  }
  if (data.filter) {
    filter = data.filter;
    render(false);
    if (event.detail === 0) $('[data-filter="' + filter + '"]').focus({ preventScroll: true });
  }
  if (data.detail) {
    detailTab = data.detail;
    render(false);
    if (event.detail === 0) $('[data-detail="' + detailTab + '"]').focus({ preventScroll: true });
  }
  if (data.task) {
    const task = tasks.find((item) => item.id === data.task);
    if (task) showTask(task);
  }
  if (data.toggle) {
    const item = tasks.find((task) => task.id === data.toggle);
    if (item) {
      const done = !item.done;
      void commit(() => localData.update((workspace) => {
        const task = workspace.tasks.find((entry) => entry.id === item.id);
        if (!task) throw new InputError("ไม่พบงานนี้แล้ว");
        if (task.done === done) return;
        task.done = done;
        task.completedOn = done ? dayKey.format(new Date()) : null;
        if (task.stage !== null) localData.advanceStage(projectIn(workspace, task.project), workspace.tasks);
      }), done ? "ทำเครื่องหมายเสร็จแล้ว" : "ย้ายกลับไปยังงานที่ยังไม่เสร็จ").then((saved) => {
        if (saved && event.detail === 0) {
          $('[data-toggle="' + CSS.escape(item.id) + '"]')?.focus({ preventScroll: true });
        }
      });
    }
  }
  if (data.doc !== undefined) showDocument(Number(data.doc));
  if (data.date || data.month || data.calendarToday !== undefined) {
    if (data.month) {
      const month = atNoon(monthStart);
      month.setUTCMonth(month.getUTCMonth() + Number(data.month));
      monthStart = dayKey.format(month);
      calendarDate = monthStart;
    } else {
      calendarDate = data.date || today;
      monthStart = calendarDate.slice(0, 7) + "-01";
    }
    render(false);
    if (event.detail === 0) {
      if (data.month) $('[data-month="' + data.month + '"]').focus({ preventScroll: true });
      else if (data.date) $('[data-date="' + calendarDate + '"]').focus({ preventScroll: true });
      else $("[data-calendar-today]").focus({ preventScroll: true });
    }
  }
});
$("#dialog").addEventListener("click", (event) => {
  if (event.target === $("#dialog")) {
    const rect = $("#dialog").getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top) $("#dialog").close();
  }
});
function saveTask(form) {
  const stage = form.get("stage");
  const task = {
    id: localData.createId(), title: form.get("title").trim(), project: form.get("project"),
    date: form.get("date"), time: form.get("time"), note: form.get("note").trim(), done: false,
    stage: stage ? Number(stage) : null
  };
  void commit(() => localData.update((workspace) => {
    const project = projectIn(workspace, task.project);
    if (!localData.validTask(task, project)) throw new InputError("กรุณาตรวจชื่องาน บ้าน และวันที่");
    workspace.tasks.push(task);
    if (task.stage !== null) localData.advanceStage(project, workspace.tasks);
  }), "บันทึกงานแล้ว", () => {
    closeDialog();
    calendarDate = task.date;
    monthStart = task.date.slice(0, 7) + "-01";
  });
}
function saveHouse(form) {
  const project = {
    id: localData.createId(), name: form.get("name").trim(), place: form.get("place").trim(),
    contractSatang: localData.toSatang(form.get("amount")), sample: false,
    stages: [...localData.stages], stageStart: 0, stageIndex: 0, installments: [], documents: []
  };
  if (!project.name || !localData.validMoney(project.contractSatang)) {
    showToast("กรุณากรอกชื่อบ้านและราคารวม");
    return;
  }
  void commit(() => localData.update((workspace) => workspace.projects.push(project)), "เพิ่มบ้านแล้ว", () => {
    closeDialog();
    view = "detail";
    projectId = project.id;
    detailTab = "งาน";
    window.scrollTo(0, 0);
  });
}
function saveHouseStage(form) {
  const id = projectId;
  const index = Number(form.get("stage"));
  void commit(() => localData.update((workspace) => {
    const project = projectIn(workspace, id);
    if (!project?.stages[index]) throw new InputError("ไม่พบขั้นตอนนี้แล้ว");
    project.stageStart = index;
    project.stageIndex = index;
  }), "บันทึกขั้นตอนแล้ว", closeDialog);
}
function saveInstallment(form) {
  const id = projectId;
  const label = form.get("label").trim();
  const amountSatang = localData.toSatang(form.get("amount"));
  if (!label || !localData.validMoney(amountSatang)) {
    showToast("กรุณากรอกชื่องวดและจำนวนเงิน");
    return;
  }
  void commit(() => localData.update((workspace) => {
    const project = projectIn(workspace, id);
    if (!project) throw new InputError("ไม่พบบ้านนี้แล้ว");
    const allotted = project.installments.reduce((total, item) => total + item.amountSatang, 0);
    if (amountSatang > project.contractSatang - allotted) throw new InputError("ยอดงวดรวมเกินราคารวมของบ้าน");
    project.installments.push({ id: localData.createId(), label, amountSatang, billed: false, payments: [] });
  }), "เพิ่มงวดเงินแล้ว", closeDialog);
}
function savePayment(form) {
  const context = paymentContext;
  if (!context) return;
  const payment = { id: localData.createId(), amountSatang: localData.toSatang(form.get("amount")), date: form.get("date") };
  if (!localData.validMoney(payment.amountSatang) || !localData.validDate(payment.date)) {
    showToast("กรุณาตรวจยอดและวันที่รับเงิน");
    return;
  }
  void commit(() => localData.update((workspace) => {
    const project = projectIn(workspace, context.projectId);
    const item = project?.installments.find((entry) => entry.id === context.itemId);
    if (!item || localData.paidAmount(item) !== context.expectedPaid) {
      throw new InputError("ยอดเงินเปลี่ยนแล้ว กรุณาปิดแล้วเปิดกรอกรับเงินใหม่");
    }
    if (payment.amountSatang > item.amountSatang - context.expectedPaid) throw new InputError("ยอดรับสูงกว่ายอดค้าง");
    item.payments.push(payment);
  }), "บันทึกรับเงินแล้ว", closeDialog);
}
function saveDoc(form) {
  const id = projectId;
  const title = form.get("title").trim();
  const url = form.get("url").trim();
  if (!title || !localData.validLink(url)) {
    showToast("กรุณาใส่ชื่อและลิงก์เอกสารที่ขึ้นต้นด้วย https://");
    return;
  }
  void commit(() => localData.update((workspace) => {
    const project = projectIn(workspace, id);
    if (!project) throw new InputError("ไม่พบบ้านนี้แล้ว");
    project.documents.push({ id: localData.createId(), title, url });
  }), "บันทึกลิงก์แล้ว", closeDialog);
}
const formHandlers = {
  "add-form": saveTask, "house-form": saveHouse, "stage-form": saveHouseStage,
  "installment-form": saveInstallment, "payment-form": savePayment, "doc-form": saveDoc
};
document.addEventListener("submit", (event) => {
  const handler = formHandlers[event.target.id];
  if (!handler) return;
  event.preventDefault();
  if (ready && !busy) handler(new FormData(event.target));
});
$("#dialog").addEventListener("change", (event) => {
  if (!event.target.matches("#add-form select[name='project']")) return;
  const project = projectFor(event.target.value);
  const picker = $("#add-form select[name='stage']");
  picker.innerHTML = stageOptions(project, null, true);
  picker.disabled = !project;
});
$("#dialog").addEventListener("input", (event) => {
  if (!event.target.matches("#payment-form input[name='amount']") || !paymentContext) return;
  $("#payment-form [type=submit]").textContent = localData.toSatang(event.target.value) === paymentContext.left
    ? "ยืนยันรับเงินครบ" : "บันทึกรับเงิน";
});
$("#backup-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || busy || !ready) return;
  try {
    const incoming = localData.parseBackup(await file.text());
    if (view !== "backup" || $("#dialog").open) return;
    pendingRestore = incoming;
    showDialog("กู้คืนข้อมูล", '<p>พบ ' + incoming.projects.length + ' บ้าน และ ' + incoming.tasks.length + ' งานในไฟล์นี้</p>'
      + '<p class="subtle notes">ชุดนี้จะแทนข้อมูลที่เปิดอยู่ แอปจะเก็บข้อมูลชุดเดิมไว้ให้ย้อนกลับได้</p>'
      + '<div class="dialog-actions"><button type="button" class="text-button" data-close>ยกเลิก</button>'
      + '<button type="button" class="primary" data-confirm="restore">ยืนยันกู้คืน</button></div>');
  } catch {
    showToast("ไฟล์สำรองไม่ถูกต้อง ข้อมูลเดิมยังอยู่");
  }
});
workspaceChannel?.addEventListener("message", async () => {
  if (!ready) return;
  try {
    const [data, previous] = await Promise.all([localData.read(), localData.hasPrevious()]);
    setWorkspace(data);
    hasRecovery = previous;
    render(false);
  } catch (error) {
    console.info("Refresh local data:", error.name);
  }
});
window.addEventListener("online", updateNetwork);
window.addEventListener("offline", updateNetwork);
const installButton = $("#install");
let installEvent = null;

installButton?.insertAdjacentHTML("afterbegin", icon("download"));
window.addEventListener("beforeinstallprompt", (event) => {
  if (!installButton) return;
  event.preventDefault();
  installEvent = event;
  installButton.hidden = false;
});
installButton?.addEventListener("click", async () => {
  const prompt = installEvent;
  if (!prompt) return;
  installEvent = null;
  installButton.hidden = true;
  try {
    await prompt.prompt();
  } catch {
    showToast("ติดตั้งได้ผ่านเมนูของ Chrome");
  }
});
window.addEventListener("appinstalled", () => {
  installEvent = null;
  if (installButton) installButton.hidden = true;
});
async function start() {
  try {
    const data = await localData.load(today, offsetDay(today, 3));
    hasRecovery = await localData.hasPrevious();
    setWorkspace(data);
    ready = true;
    render();
    navigator.storage?.persist?.().catch(() => {});
  } catch (error) {
    console.info("Open local data:", error.name);
    $("#connection").textContent = "เปิดข้อมูลไม่ได้";
    $("#content").innerHTML = '<h1>เปิดข้อมูลไม่ได้</h1><p class="notes">ลองปิดแล้วเปิดแอปใหม่</p>';
  }
}
void start();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch((error) => console.info("Offline setup:", error.name));
}
