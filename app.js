"use strict";

const paths = {
  brand: '<path d="M3 11 12 4l9 7v8H3zM8 19v-7m0 2 6-4m-4 4 5 5"/>',
  today: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 12 2.5 2.5 5-5M9 3.5h6"/>',
  homes: '<path d="M3 10.5 12 3l9 7.5M5 9v11h14V9m-9 11v-6h4v6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M7.5 3v5m9-5v5m-13 3h17M8 15h2m4 0h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="m14 6 4 4M4 20l1-5L16 4a2.8 2.8 0 0 1 4 4L9 19z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  minus: '<path d="M8 12h8"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.6"/>',
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
const addButton = $("#add");
const houseMenu = $("#house-menu");
const backupPicker = $("#backup-file") || document.body.appendChild(Object.assign(document.createElement("input"), {
  id: "backup-file", type: "file", hidden: true
}));
backupPicker.accept = ".zip,.json,application/zip,application/json";
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

let workspaceStore;
let projects = [];
let tasks = [];
let ready = false;
let busy = false;
let hasRecovery = false;
let pendingRestore;
let backupSelection = 0;
let installmentContext;
let paymentContext;
let pendingItemAction;
let openPdfUrl;
let confirmationTimer;
let confirmationAvailableAt = Infinity;
const workspaceChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("klao-workspace") : null;

class InputError extends Error {}
let view = "homes";
let projectId = null;
let detailTab = "งาน";
let selectingHouses = false;
const selectedHouses = new Set();
let houseAmountTimer;
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
const sizeFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });
const fileSize = (bytes) => bytes >= 1000000 ? sizeFormat.format(bytes / 1000000) + " MB"
  : bytes >= 1000 ? sizeFormat.format(bytes / 1000) + " KB" : sizeFormat.format(bytes) + " B";
function money(amountSatang) {
  const amount = BigInt(amountSatang);
  const baht = amount / 100n;
  const satang = amount % 100n;
  if (!satang) return currency.format(baht);
  return fractionalCurrency.formatToParts(baht).map(({ type, value }) =>
    type === "fraction" ? String(satang).padStart(2, "0") : value
  ).join("");
}
const received = (project) => project.installments.reduce((total, item) => total + workspaceStore.paidAmount(item), 0);
const remainingAmount = (project) => project.contractSatang - received(project);
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
  addButton.disabled = !ready || busy;
  houseMenu.querySelector("[data-new-house]").disabled = !ready || busy;
  houseMenu.querySelector("[data-select-houses]").disabled = !ready || busy || !projects.length;
  document.querySelectorAll("#dialog [type=submit], #dialog [data-confirm], .done-check, [data-export]").forEach((button) => {
    button.disabled = !ready || busy || (button.dataset.confirm === "timed" && performance.now() < confirmationAvailableAt);
  });
  const remove = $("[data-delete-selected-houses]");
  if (remove) remove.disabled = !ready || busy || !selectedHouses.size;
}
function setWorkspace(data) {
  projects = data.projects;
  tasks = data.tasks;
  for (const id of selectedHouses) {
    if (!projectFor(id)) selectedHouses.delete(id);
  }
  if (!projects.length) selectingHouses = false;
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
    const name = projectFor(task.project)?.name ?? "งานในปฏิทิน";
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
  const items = tasks.filter((task) => task.date === today && task.project !== null);
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
function houseAmount(project) {
  const total = money(project.contractSatang);
  const balance = money(remainingAmount(project));
  return '<div class="project-amount"><span class="visually-hidden">จำนวนเงินรวม ' + total
    + ' · จำนวนเงินคงเหลือ ' + balance + '</span>'
    + '<span class="project-figure amount-total" aria-hidden="true"><span class="subtle">จำนวนเงินรวม</span><strong class="value">'
    + total + '</strong></span><span class="project-figure amount-balance" aria-hidden="true">'
    + '<span class="subtle">จำนวนเงินคงเหลือ</span><strong class="value">' + balance + '</strong></span></div>';
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
  const actions = selectingHouses
    ? '<div class="house-actions"><button class="outline-button" data-finish-house-selection>เสร็จสิ้น</button>'
      + '<button class="primary danger-fill" data-delete-selected-houses>ลบที่เลือก</button></div>'
    : "";
  const subtitle = selectingHouses
    ? '<p role="status" data-house-selection-count>' + houseSelectionLabel() + '</p>'
    : '<p>' + projects.length + ' บ้านลูกค้า' + (projects.length ? ' · เรียงตามนัดถัดไป' : '') + '</p>';
  const totals = projects.reduce((sum, project) => {
    sum.contract += BigInt(project.contractSatang);
    sum.remaining += BigInt(remainingAmount(project));
    return sum;
  }, { contract: 0n, remaining: 0n });
  return '<header class="heading with-action' + (selectingHouses ? ' house-selection-toolbar' : '') + '"><div><h1>บ้านทั้งหมด</h1>'
    + subtitle + '</div>' + actions + '</header>'
    + '<section class="summary homes-summary" aria-label="สรุปจำนวนเงินทุกบ้าน"><div><span class="subtle">จำนวนเงินรวมทุกบ้าน</span><strong>'
    + money(totals.contract) + '</strong></div><div class="balance-summary"><span class="subtle">จำนวนเงินคงเหลือ</span><strong>'
    + money(totals.remaining) + '</strong></div></section><div class="project-grid" data-amount-mode="total">'
    + rankedProjects.map(({ project, next }) => {
      const nextTask = next
        ? '<span><strong>' + esc(next.title) + '</strong><span>' + formatShortDate.format(atNoon(next.date))
          + (next.time ? " · " + esc(next.time) + " น." : "") + '</span></span>'
        : '<span>ยังไม่มีนัดถัดไป</span>';
      return '<article class="project"><div class="project-head">' + tile("homes")
        + '<div class="project-heading"><button type="button" class="project-open project-name" data-project="' + esc(project.id) + '"'
        + (selectingHouses ? ' aria-pressed="' + selectedHouses.has(project.id) + '"' : '') + '>' + esc(project.name) + '</button>'
        + '<span class="subtle">' + esc(project.place) + (project.sample ? (project.place ? " · ตัวอย่าง" : "ตัวอย่าง") : "") + '</span></div>'
        + (selectingHouses ? '<span class="project-select-mark" aria-hidden="true">' + icon("check") + '</span>' : '') + '</div>'
        + '<span class="project-stage">' + esc(stageName(project)) + '</span>'
        + houseAmount(project)
        + '<span class="project-next">' + icon("calendar") + nextTask + '</span></article>';
    }).join("") + '</div>' + (projects.length ? "" : '<p class="empty">ยังไม่มีบ้านลูกค้า</p>');
}
function moneyRows(project) {
  if (!project.installments.length) return '<p class="empty">ยังไม่มีงวดเงิน</p>';
  return project.installments.map((item, index) => {
    const paid = workspaceStore.paidAmount(item);
    const left = item.amountSatang - paid;
    const status = !left ? "รับครบแล้ว" : paid ? "รับบางส่วน" : item.billed ? "วางบิลแล้ว" : "รอรับเงิน";
    const tone = !left ? " paid" : paid ? " partial" : "";
    const receipts = item.payments.length ? '<details class="payment-history" data-payment-history="' + esc(item.id)
      + '"><summary>ประวัติรับเงิน</summary><ul>'
      + item.payments.map((payment) => '<li class="receipt-line"><span>' + (payment.date ? formatShortDate.format(atNoon(payment.date)) : "ยอดเดิม")
        + ' · ' + money(payment.amountSatang) + '</span>'
        + (payment.cancelledOn
          ? '<span class="receipt-cancelled">ยกเลิกแล้ว ' + formatShortDate.format(atNoon(payment.cancelledOn)) + '</span>'
          : '<span class="receipt-actions"><button class="text-button" data-edit-payment="' + esc(payment.id) + '" data-installment="'
            + esc(item.id) + '" aria-label="แก้ไขรายการรับเงิน ' + esc(money(payment.amountSatang)) + '">แก้ไข</button>'
            + '<button class="text-button danger" data-cancel-payment="' + esc(payment.id) + '" data-installment="'
            + esc(item.id) + '" aria-label="ยกเลิกรายการรับเงิน ' + esc(money(payment.amountSatang)) + '">ยกเลิกรายการ</button></span>')
        + '</li>').join("") + '</ul></details>' : "";
    return '<div class="money-row' + (paid ? ' money-row-received' : '') + '"><div class="money-main"><strong class="money-name">งวด ' + (index + 1) + ' · ' + esc(item.label) + '</strong>'
      + '<span class="payment-status' + tone + '">' + status + '</span>' + receipts
      + '</div><div class="money-amount"><div class="money-meta"><strong class="money-number">' + money(item.amountSatang)
      + '</strong><p class="subtle money-breakdown"><span>รับแล้ว ' + money(paid) + '</span>'
      + (paid && left ? '<span>เหลือ ' + money(left) + '</span>' : "") + '</p></div>'
      + '<div class="money-actions">' + (left ? '<button class="outline-button small money-pay" data-payment="' + esc(item.id) + '">รับเงิน</button>' : "")
      + moreButton("installment", item.id, "จัดการงวด " + (index + 1) + " " + item.label) + '</div></div></div>';
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

const projectActions = {
  "งาน": ["new-project-task", "เพิ่มงาน"],
  "เงินงวด": ["new-installment", "เพิ่มงวดเงิน"],
  "เอกสาร": ["new-pdf", "เพิ่ม PDF"]
};
function projectPage() {
  const project = projectFor(projectId);
  const paid = project.installments.filter((item) => item.amountSatang === workspaceStore.paidAmount(item)).length;
  const tabs = [["งาน", "today"], ["เงินงวด", "wallet"], ["เอกสาร", "file"]].map(([tab, symbol]) =>
    '<button type="button" class="detail-tab" data-detail="' + tab + '" aria-pressed="' + (tab === detailTab) + '">'
    + icon(symbol) + '<span>' + tab + '</span></button>'
  ).join("");
  const [action, label] = projectActions[detailTab];
  const toolbar = '<div class="detail-actions detail-toolbar"><button type="button" class="outline-button" data-' + action
    + '>' + icon("plus") + '<span>' + label + '</span></button>'
    + (detailTab === "เอกสาร" ? '<button type="button" class="text-button" data-new-doc>แนบลิงก์เอกสาร</button>' : "")
    + '</div>';
  let body;
  if (detailTab === "งาน") {
    body = '<ul class="task-list">' + taskRows(tasks.filter((task) => task.project === project.id)) + '</ul>';
  } else if (detailTab === "เงินงวด") {
    body = '<div class="detail-body money-list">' + moneyRows(project)
      + '<div class="money-received-total"><span>จำนวนเงินที่รับแล้วรวม</span><strong>' + money(received(project)) + '</strong></div></div>';
  } else {
    const docs = docsFor(project);
    const docRows = docs.map((doc, index) => {
      const subtitle = doc.pdf ? "PDF · " + fileSize(doc.pdf.size) : doc.url ? "เปิดลิงก์เอกสาร" : "เอกสารตัวอย่าง";
      const label = tile("file") + '<span><strong>' + esc(doc.title)
        + '</strong><small class="subtle">' + esc(subtitle) + '</small></span>';
      const control = doc.url
        ? '<a class="doc-row" target="_blank" rel="noopener noreferrer" href="' + esc(doc.url) + '">' + label + '</a>'
        : '<button type="button" class="doc-row" data-doc="' + index + '">' + label + '</button>';
      return doc.id
        ? '<div class="doc-entry">' + control + moreButton("doc", doc.id, "จัดการเอกสาร " + doc.title) + '</div>'
        : control;
    }).join("");
    body = '<div class="detail-body">' + (docRows || '<p class="empty">ยังไม่มีเอกสาร</p>') + '</div>';
  }
  return '<div class="project-detail"><header class="detail-header">'
    + '<button class="text-button back" data-view="homes">กลับไปบ้านทั้งหมด</button>'
    + '<div class="detail-title"><div><h1>' + esc(project.name) + '</h1><p class="subtle">' + esc(project.place) + (project.sample ? (project.place ? " · ข้อมูลตัวอย่าง" : "ข้อมูลตัวอย่าง") : "")
    + '</p></div><div class="detail-total"><span class="subtle">จำนวนเงินรวมของบ้าน</span><strong>' + money(project.contractSatang)
    + '</strong></div></div></header>'
    + '<div class="detail-stage">' + tile("today") + '<div><span class="subtle">ขั้นตอนการทำงาน</span><strong>'
    + esc(stageName(project)) + '</strong></div><button class="text-button" data-change-stage>เปลี่ยนขั้นตอน</button></div>'
    + '<div class="summary"><div class="balance-summary"><span class="subtle">จำนวนเงินคงเหลือ</span><strong>' + money(remainingAmount(project))
    + '</strong></div><div><span class="subtle">รับครบแล้ว</span><strong>' + paid + ' จาก ' + project.installments.length
    + ' งวด</strong></div></div>'
    + '<section aria-label="รายละเอียดบ้าน"><div class="detail-tabs" role="group" aria-label="หมวดรายละเอียด">' + tabs
    + '</div><div class="panel detail-panel">' + toolbar + body + '</div></section></div>';
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
    + '<p class="subtle">ดาวน์โหลด ZIP รวมข้อมูลบ้าน งาน งวดเงิน และไฟล์ PDF</p>'
    + '<button class="outline-button" data-export>' + icon("download") + '<span>ดาวน์โหลดไฟล์สำรอง</span></button></section>'
    + '<section class="panel backup-panel"><h2>กู้คืนข้อมูล</h2><p class="subtle">เลือกไฟล์ ZIP หรือไฟล์สำรอง JSON จากเวอร์ชันก่อน</p>'
    + '<button class="outline-button" data-import>เลือกไฟล์สำรอง</button>'
    + (hasRecovery ? '<button class="text-button" data-revert>กลับไปข้อมูลก่อนกู้คืน</button>' : "")
    + '</section></div><section class="panel backup-panel reset-panel"><h2>รีเซ็ตแอป</h2>'
    + '<p class="subtle">ล้างข้อมูลทั้งหมดที่เก็บไว้ในแอปบนเครื่องนี้</p>'
    + '<button type="button" class="primary danger-fill" data-reset-data>รีเซ็ตข้อมูลทั้งหมด</button></section>';
}
function render(animate = true) {
  const pages = { today: todayPage, homes: homesPage, detail: projectPage, calendar: calendarPage, backup: backupPage };
  $("#content").innerHTML = '<div' + (animate ? ' class="page"' : "") + '>' + pages[view]() + '</div>';
  clearInterval(houseAmountTimer);
  const grid = $("[data-amount-mode]");
  if (grid?.childElementCount) {
    houseAmountTimer = setInterval(() => {
      grid.dataset.amountMode = grid.dataset.amountMode === "total" ? "balance" : "total";
    }, 3000);
  }
  const isHomes = view === "homes";
  const addLabel = isHomes ? "จัดการบ้าน" : "เพิ่มงาน";
  addButton.hidden = view !== "calendar" && !(isHomes && !selectingHouses);
  addButton.setAttribute("aria-label", addLabel);
  addButton.title = addLabel;
  if (isHomes) {
    addButton.setAttribute("aria-haspopup", "dialog");
    addButton.setAttribute("aria-expanded", houseMenu.open);
  } else {
    addButton.removeAttribute("aria-haspopup");
    addButton.removeAttribute("aria-expanded");
  }
  document.querySelectorAll(".nav-button").forEach((button) => {
    if (button.dataset.view === (view === "detail" ? "homes" : view)) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  updateNetwork();
  updateControls();
}
function navigate(name, id = null) {
  selectingHouses = false;
  selectedHouses.clear();
  view = name;
  projectId = id;
  detailTab = "งาน";
  render();
  window.scrollTo(0, 0);
}
function clearConfirmationTimer() {
  clearInterval(confirmationTimer);
  confirmationAvailableAt = Infinity;
}
function releasePdfUrl() {
  if (!openPdfUrl) return;
  const previousUrl = openPdfUrl;
  openPdfUrl = undefined;
  setTimeout(() => URL.revokeObjectURL(previousUrl), 1000);
}
function showDialog(title, body) {
  pendingItemAction = undefined;
  clearConfirmationTimer();
  releasePdfUrl();
  const dialog = $("#dialog");
  dialog.innerHTML = '<div class="dialog-head"><h2 id="dialog-title">' + title + '</h2>' + closeControl + '</div>' + body;
  dialog.querySelector("form")?.setAttribute("method", "dialog");
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector("input[autofocus]") || dialog.querySelector(".dialog-head button"))?.focus({ preventScroll: true });
  updateControls();
}
function stageOptions(project, selected = null, includeNone = false) {
  return (includeNone ? '<option value="">ไม่เปลี่ยนขั้นตอน</option>' : "")
    + (project ? project.stages.map((stage, index) => '<option value="' + index + '"' + (index === selected ? " selected" : "")
      + '>' + esc(stage) + '</option>').join("") : "");
}
function showForm(task = null) {
  if (!ready || busy || (!task && view !== "calendar" && view !== "detail")) return;
  const fromHouse = !task && view === "detail";
  const project = projectFor(task ? task.project : fromHouse ? projectId : null);
  const options = (fromHouse ? [project] : projects).map((item) => '<option value="' + esc(item.id) + '"'
    + (item.id === project?.id ? " selected" : "") + '>' + esc(item.name) + '</option>').join("");
  const noHouse = fromHouse ? "" : '<option value=""' + (project ? "" : " selected") + '>ไม่เลือกบ้าน</option>';
  const date = task?.date || (fromHouse ? dayKey.format(new Date()) : calendarDate);
  showDialog(task ? "แก้ไขงาน" : "เพิ่มงาน", '<form id="add-form" class="form">'
    + (task ? '<input type="hidden" name="recordId" value="' + esc(task.id) + '">' : "")
    + '<label>ชื่องาน<input name="title" required maxlength="120" autofocus placeholder="เช่น วัดหน้างานครัว" value="' + esc(task?.title) + '"></label>'
    + '<label>บ้านลูกค้า<select name="project"' + (fromHouse ? " required" : "") + '>' + noHouse + options + '</select></label>'
    + (!fromHouse ? '<p class="subtle" id="calendar-only-note"' + (project ? " hidden" : "")
      + '>งานที่ไม่เลือกบ้านจะแสดงเฉพาะในปฏิทิน</p>' : "")
    + '<div class="fields"><label>วันที่<input type="date" name="date" required value="' + esc(date)
    + '"></label><label>เวลา<input type="time" name="time" value="' + esc(task?.time)
    + '"></label></div><label>ขั้นตอนที่เกี่ยวข้อง<select name="stage"' + (project ? "" : " disabled") + '>'
    + stageOptions(project, task?.stage, true) + '</select></label><label>โน้ต<input name="note" maxlength="500" value="'
    + esc(task?.note) + '"></label>' + submitActions(task ? "บันทึกการแก้ไข" : "บันทึกงาน") + '</form>');
}
function moreButton(kind, id, label) {
  return '<button type="button" class="icon-button item-more" data-item-menu="' + kind + '" data-item="' + esc(id)
    + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon("more") + '</button>';
}
function showTask(task) {
  const project = projectFor(task.project);
  showDialog(esc(task.title), '<p class="subtle">' + esc(project?.name ?? 'งานในปฏิทิน') + ' · ' + formatDate.format(atNoon(task.date))
    + (task.time ? ' · ' + esc(task.time) + ' น.' : "") + '</p>'
    + (task.completedOn ? '<p class="subtle">เสร็จเมื่อ ' + formatShortDate.format(atNoon(task.completedOn)) + '</p>' : "")
    + (task.note ? '<p class="notes">' + esc(task.note) + '</p>' : "")
    + '<div class="dialog-actions">' + moreButton("task", task.id, "จัดการงาน")
    + (project ? '<button class="primary" data-project="' + esc(project.id) + '">เปิดรายละเอียดบ้าน</button>' : "") + '</div>');
}
function showItemMenu(kind, id) {
  const project = projectFor(projectId);
  const item = kind === "task" ? tasks.find((task) => task.id === id)
    : (kind === "installment" ? project?.installments : project?.documents)?.find((entry) => entry.id === id);
  if (!item) return;
  const label = kind === "task" ? "งาน" : kind === "installment" ? "งวดเงิน" : item.pdf ? " PDF" : "ลิงก์เอกสาร";
  const ref = ' data-kind="' + kind + '" data-item="' + esc(id) + '"';
  showDialog("จัดการ" + label, '<p class="item-title">' + esc(item.title ?? item.label) + '</p><div class="item-actions">'
    + '<button type="button" class="outline-button" data-edit-item' + ref + '>แก้ไข' + label + '</button>'
    + '<button type="button" class="outline-button danger" data-remove-item' + ref + '>ลบ' + label + '</button></div>');
}

function showDocument(index) {
  const project = projectFor(projectId);
  const doc = docsFor(project)[index];
  if (!doc || doc.url) return;
  if (doc.pdf) {
    showDialog(esc(doc.title), '<p class="subtle document-file-name">' + esc(doc.fileName) + ' · ' + fileSize(doc.pdf.size)
      + '</p><div class="dialog-actions pdf-actions"><a class="outline-button" id="pdf-download">' + icon("download")
      + '<span>ดาวน์โหลด PDF</span></a><a class="primary" id="pdf-open" target="_blank" rel="noopener noreferrer">เปิด PDF</a></div>');
    openPdfUrl = URL.createObjectURL(doc.pdf);
    $("#pdf-open").href = openPdfUrl;
    const download = $("#pdf-download");
    download.href = openPdfUrl;
    download.download = doc.fileName;
    return;
  }
  showDialog(esc(doc.title), '<div class="document"><p class="subtle">เอกสารตัวอย่าง · Klao Built-in</p><strong>' + esc(project.name) + '</strong>'
    + (doc.note ? '<p>' + esc(doc.note) + '</p>' : "") + '<strong>ยอดเงิน ' + money(doc.amountSatang) + '</strong></div>');
}
function showHouseForm() {
  showDialog("เพิ่มบ้านลูกค้า", '<form id="house-form" class="form">'
    + '<label>ชื่อบ้านหรือชื่อลูกค้า<input name="name" maxlength="100" required autofocus></label>'
    + '<label>สถานที่<input name="place" maxlength="160"></label>'
    + '<label>จำนวนเงินรวม (บาท)<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>'
    + submitActions("เพิ่มบ้าน") + '</form>');
}
function showStageForm() {
  const project = projectFor(projectId);
  showDialog("เปลี่ยนขั้นตอน", '<form id="stage-form" class="form"><label>ขั้นตอนปัจจุบัน<select name="stage">'
    + stageOptions(project, project.stageIndex) + '</select></label>' + submitActions("บันทึกขั้นตอน") + '</form>');
}
const installmentCapacity = (project, exceptId) => project.installments.reduce((available, item) =>
  item.id === exceptId ? available : available - item.amountSatang, project.contractSatang);
const amountValue = (satang) => {
  const value = String(satang).padStart(3, "0");
  return value.slice(0, -2) + "." + value.slice(-2);
};
function showInstallmentForm(itemId) {
  const project = projectFor(projectId);
  const item = project?.installments.find((entry) => entry.id === itemId);
  if (!project || (itemId && !item)) return;
  const available = installmentCapacity(project, itemId);
  if (!available) {
    showToast("แบ่งงวดครบตามจำนวนเงินรวมแล้ว");
    return;
  }
  installmentContext = { projectId: project.id, item };
  const paid = item ? workspaceStore.paidAmount(item) : 0;
  const hint = item ? 'ยอดสูงสุด ' + money(available) + (paid ? ' · รับแล้ว ' + money(paid) : "") : 'ยอดที่ยังแบ่งงวดได้ ' + money(available);
  showDialog(item ? "แก้ไขงวดเงิน" : "เพิ่มงวดเงิน", '<p class="subtle">' + hint + '</p><form id="installment-form" class="form">'
    + '<label>ชื่องวด<input name="label" maxlength="100" required autofocus placeholder="เช่น มัดจำ" value="' + esc(item?.label) + '"></label>'
    + '<label>จำนวนเงินงวด (บาท)<input name="amount" type="number" min="' + amountValue(Math.max(paid, 1))
    + '" max="' + amountValue(available) + '" value="' + (item ? amountValue(item.amountSatang) : "")
    + '" step="0.01" inputmode="decimal" required></label>' + submitActions(item ? "บันทึกการแก้ไข" : "เพิ่มงวดเงิน") + '</form>');
}
function showPaymentForm(id, paymentId) {
  const project = projectFor(projectId);
  if (!project) return;
  const index = project.installments.findIndex((item) => item.id === id);
  const item = project.installments[index];
  if (!item) return;
  const existing = item.payments.find((payment) => payment.id === paymentId && !payment.cancelledOn);
  if (paymentId && !existing) return;
  const expectedPaid = workspaceStore.paidAmount(item);
  const left = item.amountSatang - expectedPaid;
  if (!left && !existing) return;
  const limit = left + (existing?.amountSatang ?? 0);
  paymentContext = { projectId: project.id, itemId: item.id, expectedPaid, limit, existing };
  const date = existing ? existing.date ?? "" : dayKey.format(new Date());
  showDialog(existing ? "แก้ไขรายการรับเงิน" : "รับเงินงวด " + (index + 1), '<p class="subtle">' + esc(item.label)
    + (existing ? ' · แก้ได้สูงสุด ' + money(limit) : ' · ยังค้าง ' + money(left))
    + '</p><form id="payment-form" class="form"><label>ยอดรับจริง (บาท)<input name="amount" type="number" min="0.01" max="'
    + amountValue(limit) + '" value="' + amountValue(existing?.amountSatang ?? limit) + '" step="0.01" inputmode="decimal" required></label>'
    + '<label>วันที่รับเงิน<input name="date" type="date"' + (existing?.date === null ? "" : " required")
    + ' value="' + date + '"></label>' + submitActions(existing ? "บันทึกการแก้ไข" : "ยืนยันรับเงินครบ") + '</form>');
}
function showPdfForm(doc = null) {
  showDialog(doc ? "แก้ไข PDF" : "เพิ่ม PDF", '<form id="pdf-form" class="form">'
    + (doc ? '<input type="hidden" name="recordId" value="' + esc(doc.id) + '">' : "")
    + '<label>' + (doc ? "เลือกไฟล์ PDF ใหม่" : "เลือกไฟล์ PDF") + '<input name="pdf" type="file" accept="application/pdf,.pdf"'
    + (doc ? "" : " required") + '></label>'
    + (doc ? '<p class="subtle document-file-name">ไฟล์ปัจจุบัน ' + esc(doc.fileName) + '</p>' : "")
    + '<label>ชื่อเอกสาร<input name="title" maxlength="120" value="' + esc(doc?.title)
    + '" placeholder="ใช้ชื่อไฟล์ถ้าเว้นว่าง"></label>'
    + submitActions(doc ? "บันทึกการแก้ไข" : "บันทึก PDF") + '</form>');
}
function showDocForm(doc = null) {
  showDialog(doc ? "แก้ไขลิงก์เอกสาร" : "แนบลิงก์เอกสาร", '<form id="doc-form" class="form">'
    + (doc ? '<input type="hidden" name="recordId" value="' + esc(doc.id) + '">' : "")
    + '<label>ชื่อเอกสาร<input name="title" maxlength="120" required autofocus value="' + esc(doc?.title) + '"></label>'
    + '<label>ลิงก์เอกสาร<input name="url" type="url" required maxlength="2048" placeholder="https://" value="'
    + esc(doc?.url) + '"></label>' + submitActions(doc ? "บันทึกการแก้ไข" : "บันทึกลิงก์") + '</form>');
}
function confirmItemAction(title, message, label, action) {
  showDialog(title, '<p>' + message + '</p><div class="dialog-actions">'
    + '<button type="button" class="text-button" data-close>กลับ</button>'
    + '<button type="button" class="primary danger-fill" data-confirm="item">' + label + '</button></div>');
  pendingItemAction = action;
}
function editItem(kind, id) {
  if (kind === "installment") {
    showInstallmentForm(id);
  } else if (kind === "task") {
    const task = tasks.find((entry) => entry.id === id);
    if (task) showForm(task);
  } else {
    const doc = projectFor(projectId)?.documents.find((entry) => entry.id === id);
    if (doc?.pdf) showPdfForm(doc);
    else if (doc) showDocForm(doc);
  }
}
function removeItem(kind, id) {
  if (kind === "installment") {
    removeInstallment(id);
    return;
  }
  const house = projectId;
  const taskMenu = kind === "task";
  const item = taskMenu ? tasks.find((task) => task.id === id) : projectFor(house)?.documents.find((doc) => doc.id === id);
  if (!item) return;
  const label = taskMenu ? "งาน" : item.pdf ? " PDF" : "ลิงก์เอกสาร";
  confirmItemAction("ลบ" + label + "?", "ลบ “" + esc(item.title) + "” ออกจากแอปหรือไม่?", "ยืนยันลบ" + label, () =>
    commit(() => workspaceStore.update((workspace) => {
      const rows = taskMenu ? workspace.tasks : projectIn(workspace, house)?.documents;
      const index = rows?.findIndex((entry) => entry.id === id) ?? -1;
      if (index < 0) throw new InputError("ไม่พบรายการนี้แล้ว");
      const [removed] = rows.splice(index, 1);
      if (taskMenu && removed.stage !== null) {
        workspaceStore.advanceStage(projectIn(workspace, removed.project), workspace.tasks);
      }
    }), "ลบ" + label + "แล้ว", closeDialog)
  );
}
function removeInstallment(id) {
  const house = projectId;
  const item = projectFor(house)?.installments.find((entry) => entry.id === id);
  if (!item) return;
  const snapshot = JSON.stringify(item);
  const paid = workspaceStore.paidAmount(item);
  const effect = item.payments.length ? '<p class="reset-description notes">ประวัติรับเงินของงวดนี้จะถูกลบด้วย'
    + (paid ? ' และจำนวนเงินคงเหลือของบ้านจะเพิ่มขึ้น ' + money(paid) : "") + '</p>' : "";
  showTimedConfirmation("ลบงวดเงิน?", '<p class="item-title">“' + esc(item.label) + '” · ' + money(item.amountSatang) + '</p>'
    + effect, "ยืนยันลบงวด", () => commit(() => workspaceStore.update((workspace) => {
      const installments = projectIn(workspace, house)?.installments;
      const index = installments?.findIndex((entry) => entry.id === id) ?? -1;
      if (index < 0 || JSON.stringify(installments[index]) !== snapshot) {
        throw new InputError("งวดเงินเปลี่ยนแล้ว กรุณาปิดแล้วเปิดใหม่");
      }
      installments.splice(index, 1);
    }), "ลบงวดเงินแล้ว", closeDialog));
}
function houseSelectionLabel() {
  return selectedHouses.size ? "เลือกแล้ว " + selectedHouses.size + " หลัง" : "แตะการ์ดบ้านที่ต้องการลบ";
}
function setHouseSelectionMode(active) {
  selectingHouses = active;
  selectedHouses.clear();
  render(false);
  (active ? $(".project-open") : addButton)?.focus({ preventScroll: true });
}
function toggleHouseSelection(button) {
  const id = button.dataset.project;
  const selected = !selectedHouses.has(id);
  if (selected) selectedHouses.add(id);
  else selectedHouses.delete(id);
  button.setAttribute("aria-pressed", selected);
  $("[data-house-selection-count]").textContent = houseSelectionLabel();
  updateControls();
}
function confirmHouseDeletion() {
  const houses = projects.filter((project) => selectedHouses.has(project.id));
  if (!houses.length) return;
  const ids = new Set(houses.map((house) => house.id));
  const names = houses.map((house) => "<li>" + esc(house.name) + "</li>").join("");
  showTimedConfirmation("ลบบ้าน " + houses.length + " หลัง?", '<ul class="house-delete-list">' + names + '</ul>'
    + '<p class="reset-description">งานและนัดของบ้านที่เลือก รวมถึงงวดเงิน ประวัติรับเงิน และเอกสารแนบ จะถูกลบจากเครื่องนี้ด้วย</p>',
  "ยืนยันลบ", async () => {
    const saved = await commit(() => workspaceStore.update((workspace) => {
      if (!workspace.projects.some((house) => ids.has(house.id))) throw new InputError("บ้านที่เลือกถูกลบแล้ว");
      workspace.projects = workspace.projects.filter((house) => !ids.has(house.id));
      workspace.tasks = workspace.tasks.filter((task) => !ids.has(task.project));
    }), "ลบบ้านที่เลือกแล้ว", () => {
      selectingHouses = false;
      selectedHouses.clear();
      closeDialog();
    });
    if (saved) addButton.focus({ preventScroll: true });
  });
}
function cancelPayment(itemId, paymentId) {
  const house = projectId;
  const item = projectFor(house)?.installments.find((entry) => entry.id === itemId);
  const payment = item?.payments.find((entry) => entry.id === paymentId);
  if (!payment || payment.cancelledOn) return;
  confirmItemAction("ยกเลิกรายการรับเงิน?", "ยอดเงินที่เหลือจะเพิ่ม " + money(payment.amountSatang)
    + " และรายการนี้จะอยู่ในประวัติพร้อมสถานะยกเลิก", "ยืนยันยกเลิกรายการ", async () => {
    const saved = await commit(() => workspaceStore.update((workspace) => {
      const project = projectIn(workspace, house);
      const stored = project?.installments.find((entry) => entry.id === itemId)?.payments.find((entry) => entry.id === paymentId);
      if (!stored || stored.cancelledOn || stored.amountSatang !== payment.amountSatang || stored.date !== payment.date) {
        throw new InputError("รายการรับเงินเปลี่ยนแล้ว กรุณาปิดแล้วเปิดใหม่");
      }
      stored.cancelledOn = dayKey.format(new Date());
    }), "ยกเลิกรายการรับเงินแล้ว", closeDialog);
    if (saved) $('[data-payment-history="' + CSS.escape(itemId) + '"]')?.setAttribute("open", "");
  });
}
async function downloadBackup() {
  if (!ready || busy) return;
  busy = true;
  updateControls();
  try {
    const data = await workspaceStore.read();
    const file = await workspaceStore.exportArchive(data);
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "klao-backup-" + dayKey.format(new Date()) + ".zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast("ดาวน์โหลดไฟล์สำรองแล้ว");
  } catch {
    showToast("ดาวน์โหลดไฟล์สำรองไม่ได้");
  } finally {
    busy = false;
    updateControls();
  }
}
function showTimedConfirmation(title, body, label, action) {
  const seconds = 5;
  showDialog(title, body
    + '<div class="dialog-actions reset-actions"><button type="button" class="primary danger-fill" data-confirm="timed" disabled>'
    + label + ' (' + seconds + ')</button><button type="button" class="outline-button" data-close>ยกเลิก</button></div>');
  pendingItemAction = action;
  confirmationAvailableAt = performance.now() + seconds * 1000;
  const button = $('[data-confirm="timed"]');
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((confirmationAvailableAt - performance.now()) / 1000));
    const caption = remaining ? label + " (" + remaining + ")" : label;
    if (button.textContent !== caption) button.textContent = caption;
    if (!remaining) {
      clearInterval(confirmationTimer);
      updateControls();
    }
  };
  confirmationTimer = setInterval(tick, 100);
  $(".reset-actions [data-close]").focus({ preventScroll: true });
}
function showResetDialog() {
  showTimedConfirmation("รีเซ็ตข้อมูลทั้งหมด?", '<p class="reset-description">การรีเซ็ตจะลบบ้าน งาน นัด งวดเงิน ประวัติรับเงิน ไฟล์ PDF และลิงก์เอกสารทั้งหมดในเครื่องนี้ รวมถึงข้อมูลก่อนกู้คืนที่แอปเก็บไว้</p>'
    + '<p class="subtle notes">หากต้องการนำข้อมูลกลับมา ให้ส่งออกไฟล์สำรองก่อนรีเซ็ต</p>', "รีเซ็ต", () =>
    commit(workspaceStore.reset, "รีเซ็ตข้อมูลแล้ว", () => {
      hasRecovery = false;
      pendingRestore = undefined;
      closeDialog();
    })
  );
}

function closeDialog() {
  clearConfirmationTimer();
  $("#dialog").close();
}
$("#dialog").addEventListener("close", () => {
  if (!$("#dialog").open) {
    pendingItemAction = undefined;
    clearConfirmationTimer();
    releasePdfUrl();
  }
});
$("#logo").innerHTML = icon("brand");
$("#logo").dataset.view = "homes";
addButton.innerHTML = icon("plus");
houseMenu.querySelector("[data-new-house]").insertAdjacentHTML("afterbegin", icon("plus"));
houseMenu.querySelector("[data-select-houses]").insertAdjacentHTML("afterbegin", icon("pencil"));
houseMenu.querySelector("[data-close-house-menu]").innerHTML = icon("close");
houseMenu.addEventListener("click", (event) => {
  if (event.target !== houseMenu) return;
  const bounds = houseMenu.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    houseMenu.close();
  }
});
houseMenu.addEventListener("close", () => {
  if (!houseMenu.open && view === "homes") addButton.setAttribute("aria-expanded", "false");
});
$("#nav").innerHTML = views.map(([viewName, title, symbol]) => '<button class="nav-button" data-view="' + viewName + '" aria-label="' + title
  + '" title="' + title + '">' + icon(symbol) + '</button>').join("");
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.close !== undefined) closeDialog();
  if (!ready) return;
  if (button === addButton) {
    if (view === "homes" && !selectingHouses) {
      houseMenu.showModal();
      addButton.setAttribute("aria-expanded", "true");
    } else if (view === "calendar") showForm();
  }
  if (data.newProjectTask !== undefined) showForm();
  if (data.closeHouseMenu !== undefined) houseMenu.close();
  if (data.newHouse !== undefined || data.selectHouses !== undefined) {
    houseMenu.close();
    if (data.newHouse !== undefined) showHouseForm();
    else setHouseSelectionMode(true);
  }
  if (data.finishHouseSelection !== undefined) setHouseSelectionMode(false);
  if (data.deleteSelectedHouses !== undefined) confirmHouseDeletion();
  if (data.changeStage !== undefined) showStageForm();
  if (data.newInstallment !== undefined) showInstallmentForm();
  if (data.payment) showPaymentForm(data.payment);
  if (data.editPayment) showPaymentForm(data.installment, data.editPayment);
  if (data.newDoc !== undefined) showDocForm();
  if (data.newPdf !== undefined) showPdfForm();
  if (data.itemMenu) showItemMenu(data.itemMenu, data.item);
  if (data.editItem !== undefined) editItem(data.kind, data.item);
  if (data.removeItem !== undefined) removeItem(data.kind, data.item);
  if (data.cancelPayment) cancelPayment(data.installment, data.cancelPayment);
  if (data.confirm === "item" || data.confirm === "timed") {
    const dialog = $("#dialog");
    if (dialog.open && dialog.contains(button) && !button.disabled
      && (data.confirm === "item" || performance.now() >= confirmationAvailableAt)) void pendingItemAction?.();
  }
  if (data.export !== undefined) void downloadBackup();
  if (data.resetData !== undefined) showResetDialog();
  if (data.import !== undefined) {
    backupPicker.value = "";
    backupPicker.click();
  }
  if (data.revert !== undefined) showDialog("ย้อนการกู้คืน",
    '<p>ข้อมูลจะกลับไปเป็นชุดก่อนกู้คืนครั้งล่าสุด</p><div class="dialog-actions">'
    + '<button type="button" class="text-button" data-close>ยกเลิก</button>'
    + '<button type="button" class="primary" data-confirm="revert">ย้อนการกู้คืน</button></div>');
  if (data.confirm === "restore" && pendingRestore) {
    void commit(() => workspaceStore.restore(pendingRestore), "กู้คืนข้อมูลแล้ว", () => {
      hasRecovery = true;
      pendingRestore = undefined;
      closeDialog();
    });
  }
  if (data.confirm === "revert") void commit(workspaceStore.revert, "ย้อนการกู้คืนแล้ว", closeDialog);
  if (data.view) navigate(data.view);
  if (data.project) {
    if (view === "homes" && selectingHouses) toggleHouseSelection(button);
    else {
      if ($("#dialog").open) closeDialog();
      navigate("detail", data.project);
    }
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
      void commit(() => workspaceStore.update((workspace) => {
        const task = workspace.tasks.find((entry) => entry.id === item.id);
        if (!task) throw new InputError("ไม่พบงานนี้แล้ว");
        if (task.done === done) return;
        task.done = done;
        task.completedOn = done ? dayKey.format(new Date()) : null;
        if (task.stage !== null) workspaceStore.advanceStage(projectIn(workspace, task.project), workspace.tasks);
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
  const existingId = form.get("recordId");
  const stage = form.get("stage");
  const changes = {
    id: existingId || workspaceStore.createId(), title: form.get("title").trim(), project: form.get("project") || null,
    date: form.get("date"), time: form.get("time"), note: form.get("note").trim(),
    stage: stage ? Number(stage) : null
  };
  void commit(() => workspaceStore.update((workspace) => {
    const index = workspace.tasks.findIndex((entry) => entry.id === existingId);
    const previous = workspace.tasks[index];
    if (existingId && !previous) throw new InputError("ไม่พบงานนี้แล้ว");
    const task = { done: false, ...previous, ...changes };
    const project = projectIn(workspace, task.project);
    if (!workspaceStore.validTask(task, project)) throw new InputError("กรุณาตรวจชื่องาน บ้าน และวันที่");
    if (previous) workspace.tasks[index] = task;
    else workspace.tasks.push(task);
    const linkageChanged = !previous || previous.project !== task.project || previous.stage !== task.stage;
    if (linkageChanged) {
      const affected = new Set();
      if (previous && previous.stage !== null) affected.add(previous.project);
      if (task.stage !== null) affected.add(task.project);
      affected.forEach((id) => workspaceStore.advanceStage(projectIn(workspace, id), workspace.tasks));
    }
  }), existingId ? "บันทึกการแก้ไขแล้ว" : "บันทึกงานแล้ว", () => {
    closeDialog();
    if (view === "calendar") {
      calendarDate = changes.date;
      monthStart = changes.date.slice(0, 7) + "-01";
    }
  });
}
function saveHouse(form) {
  const project = {
    id: workspaceStore.createId(), name: form.get("name").trim(), place: form.get("place").trim(),
    contractSatang: workspaceStore.toSatang(form.get("amount")), sample: false,
    stages: [...workspaceStore.stages], stageStart: 0, stageIndex: 0, installments: [], documents: []
  };
  if (!project.name || !workspaceStore.validMoney(project.contractSatang)) {
    showToast("กรุณากรอกชื่อบ้านและจำนวนเงินรวม");
    return;
  }
  void commit(() => workspaceStore.update((workspace) => workspace.projects.push(project)), "เพิ่มบ้านแล้ว", () => {
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
  void commit(() => workspaceStore.update((workspace) => {
    const project = projectIn(workspace, id);
    if (!project?.stages[index]) throw new InputError("ไม่พบขั้นตอนนี้แล้ว");
    project.stageStart = index;
    project.stageIndex = index;
  }), "บันทึกขั้นตอนแล้ว", closeDialog);
}
function saveInstallment(form) {
  const context = installmentContext;
  if (!context) return;
  const { projectId: id, item } = context;
  const label = form.get("label").trim();
  const amountSatang = workspaceStore.toSatang(form.get("amount"));
  if (!label || !workspaceStore.validMoney(amountSatang)) {
    showToast("กรุณากรอกชื่องวดและจำนวนเงิน");
    return;
  }
  void commit(() => workspaceStore.update((workspace) => {
    const project = projectIn(workspace, id);
    if (!project) throw new InputError("ไม่พบบ้านนี้แล้ว");
    if (amountSatang > installmentCapacity(project, item?.id)) {
      throw new InputError("ยอดงวดรวมเกินจำนวนเงินรวมของบ้าน");
    }
    if (item) {
      const stored = project.installments.find((entry) => entry.id === item.id);
      if (!stored || stored.label !== item.label || stored.amountSatang !== item.amountSatang) {
        throw new InputError("งวดเงินเปลี่ยนแล้ว กรุณาปิดแล้วเปิดใหม่");
      }
      if (amountSatang < workspaceStore.paidAmount(stored)) throw new InputError("จำนวนเงินงวดต่ำกว่ายอดที่รับแล้ว");
      Object.assign(stored, { label, amountSatang });
    } else {
      project.installments.push({ id: workspaceStore.createId(), label, amountSatang, billed: false, payments: [] });
    }
  }), item ? "แก้ไขงวดเงินแล้ว" : "เพิ่มงวดเงินแล้ว", closeDialog);
}
async function savePayment(form) {
  const context = paymentContext;
  if (!context) return;
  const { existing } = context;
  const amountSatang = workspaceStore.toSatang(form.get("amount"));
  const date = form.get("date") || null;
  if (!workspaceStore.validMoney(amountSatang)
    || !(workspaceStore.validDate(date) || (date === null && existing?.date === null))) {
    showToast("กรุณาตรวจยอดและวันที่รับเงิน");
    return;
  }
  const saved = await commit(() => workspaceStore.update((workspace) => {
    const project = projectIn(workspace, context.projectId);
    const item = project?.installments.find((entry) => entry.id === context.itemId);
    if (!item || workspaceStore.paidAmount(item) !== context.expectedPaid) {
      throw new InputError("ยอดเงินเปลี่ยนแล้ว กรุณาปิดแล้วเปิดกรอกรับเงินใหม่");
    }
    const othersPaid = context.expectedPaid - (existing?.amountSatang ?? 0);
    if (amountSatang > item.amountSatang - othersPaid) throw new InputError("ยอดรับสูงกว่าจำนวนเงินงวด");
    if (existing) {
      const stored = item.payments.find((entry) => entry.id === existing.id);
      if (!stored || stored.cancelledOn || stored.amountSatang !== existing.amountSatang || stored.date !== existing.date) {
        throw new InputError("รายการรับเงินเปลี่ยนแล้ว กรุณาปิดแล้วเปิดใหม่");
      }
      Object.assign(stored, { amountSatang, date });
    } else {
      item.payments.push({ id: workspaceStore.createId(), amountSatang, date });
    }
  }), existing ? "แก้ไขรายการรับเงินแล้ว" : "บันทึกรับเงินแล้ว", closeDialog);
  if (saved && existing) $('[data-payment-history="' + CSS.escape(context.itemId) + '"]')?.setAttribute("open", "");
}
function saveDoc(form) {
  const id = projectId;
  const existingId = form.get("recordId");
  const title = form.get("title").trim();
  const url = form.get("url").trim();
  if (!title || !workspaceStore.validLink(url)) {
    showToast("กรุณาใส่ชื่อและลิงก์เอกสารที่ขึ้นต้นด้วย https://");
    return;
  }
  void commit(() => workspaceStore.update((workspace) => {
    const project = projectIn(workspace, id);
    if (!project) throw new InputError("ไม่พบบ้านนี้แล้ว");
    if (existingId) {
      const doc = project.documents.find((item) => item.id === existingId);
      if (!doc) throw new InputError("ไม่พบลิงก์นี้แล้ว");
      Object.assign(doc, { title, url });
    } else {
      project.documents.push({ id: workspaceStore.createId(), title, url });
    }
  }), "บันทึกลิงก์แล้ว", closeDialog);
}
function savePdf(form) {
  const house = projectId;
  const id = form.get("recordId");
  const file = form.get("pdf");
  const name = form.get("title").trim();
  void commit(async () => {
    let attachment;
    if (file?.size) {
      let pdf;
      try {
        pdf = await workspaceStore.readPdf(file);
      } catch {
        throw new InputError("กรุณาเลือกไฟล์ PDF ที่เปิดได้");
      }
      attachment = { pdf, fileName: file.name };
    }
    return workspaceStore.update((workspace) => {
      const project = projectIn(workspace, house);
      if (!project) throw new InputError("ไม่พบบ้านนี้แล้ว");
      const existing = project.documents.find((doc) => doc.id === id);
      if (id && !existing?.pdf) throw new InputError("ไม่พบ PDF นี้แล้ว");
      if (!existing && !attachment) throw new InputError("กรุณาเลือกไฟล์ PDF");
      const fileName = attachment?.fileName ?? existing.fileName;
      const title = name || fileName.replace(/\.pdf$/i, "").trim().slice(0, 120) || "เอกสาร PDF";
      if (existing) Object.assign(existing, attachment, { title });
      else project.documents.push({ id: workspaceStore.createId(), title, ...attachment });
    });
  }, "บันทึก PDF แล้ว", closeDialog);
}

const formHandlers = {
  "add-form": saveTask, "house-form": saveHouse, "stage-form": saveHouseStage,
  "installment-form": saveInstallment, "payment-form": savePayment, "doc-form": saveDoc, "pdf-form": savePdf
};
document.addEventListener("submit", (event) => {
  if (!event.target.closest("#dialog")) return;
  event.preventDefault();
  const handler = formHandlers[event.target.getAttribute("id")];
  if (handler && ready && !busy) handler(new FormData(event.target));
});
$("#dialog").addEventListener("change", (event) => {
  if (!event.target.matches("#add-form select[name='project']")) return;
  const project = projectFor(event.target.value);
  const picker = $("#add-form select[name='stage']");
  picker.innerHTML = stageOptions(project, null, true);
  picker.disabled = !project;
  const calendarNote = $("#calendar-only-note");
  if (calendarNote) calendarNote.hidden = Boolean(project);
});
$("#dialog").addEventListener("input", (event) => {
  if (!event.target.matches("#payment-form input[name='amount']") || !paymentContext || paymentContext.existing) return;
  $("#payment-form [type=submit]").textContent = workspaceStore.toSatang(event.target.value) === paymentContext.limit
    ? "ยืนยันรับเงินครบ" : "บันทึกรับเงิน";
});
backupPicker.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || busy || !ready) return;
  const selected = ++backupSelection;
  try {
    const incoming = await workspaceStore.readBackup(file);
    if (selected !== backupSelection || view !== "backup" || $("#dialog").open) return;
    pendingRestore = incoming;
    const pdfCount = incoming.projects.reduce((count, project) => count + project.documents.filter((doc) => doc.pdf).length, 0);
    showDialog("กู้คืนข้อมูล", '<p>พบ ' + incoming.projects.length + ' บ้าน · ' + incoming.tasks.length
      + ' งาน · ' + pdfCount + ' ไฟล์ PDF</p>'
      + '<p class="subtle notes">ชุดนี้จะแทนข้อมูลที่เปิดอยู่ แอปจะเก็บข้อมูลชุดเดิมไว้ให้ย้อนกลับได้</p>'
      + '<div class="dialog-actions"><button type="button" class="text-button" data-close>ยกเลิก</button>'
      + '<button type="button" class="primary" data-confirm="restore">ยืนยันกู้คืน</button></div>');
  } catch {
    if (selected === backupSelection) showToast("ไฟล์สำรองไม่ถูกต้อง ข้อมูลเดิมยังอยู่");
  }
});
workspaceChannel?.addEventListener("message", async () => {
  if (!ready) return;
  try {
    const [data, previous] = await Promise.all([workspaceStore.read(), workspaceStore.hasPrevious()]);
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
    if (window.localData?.revision !== 15) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "./data.js?v=15";
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
    }
    workspaceStore = window.localData;
    const data = await workspaceStore.load(today, offsetDay(today, 3));
    hasRecovery = await workspaceStore.hasPrevious();
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
