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

const projects = [
  { id: "h1", name: "บ้านคุณอร", place: "หนองจอก", stage: "กำลังติดตั้งหน้าบาน", contract: 242750, installments: [
    ["เริ่มงาน", 50000, 50000, true], ["วัสดุเข้าหน้างาน", 50000, 50000, true], ["ติดตั้งโครงตู้", 50000, 20000, true], ["ติดตั้งหน้าบาน", 50000, 0, false], ["ส่งมอบงาน", 42750, 0, false]
  ] },
  { id: "h2", name: "บ้านคุณนัท", place: "มีนบุรี", stage: "รอลูกค้าเลือกสี", contract: 82500, installments: [
    ["มัดจำ", 25000, 25000, true], ["เริ่มผลิต", 32500, 0, false], ["ส่งมอบงาน", 25000, 0, false]
  ] },
  { id: "h3", name: "บ้านคุณพิม", place: "ลาดกระบัง", stage: "นัดตรวจงาน", contract: 96000, installments: [
    ["มัดจำ", 48000, 48000, true], ["ติดตั้ง", 30000, 30000, true], ["ส่งมอบงาน", 18000, 0, false]
  ] }
];
const storageKey = "klao-work-prototype-tasks-v1";
function initialTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) return saved;
  } catch (error) {
    console.info("เปิดข้อมูลตัวอย่าง", error.name);
  }
  return [
    { id: "t1", project: "h1", title: "เช็กของก่อนเข้าติดตั้ง", date: today, time: "09:00", note: "เช็กบานพับ มือจับ และจำนวนหน้าบาน", done: true },
    { id: "t2", project: "h1", title: "ติดตั้งหน้าบานตู้ทีวี", date: today, time: "10:30", note: "นัดช่างเข้าพร้อมตัวอย่างสี", done: false },
    { id: "t3", project: "h2", title: "ส่งตัวอย่างสีให้ลูกค้า", date: today, time: "13:00", note: "เตรียมลามิเนตโทนไม้ 2 แบบ", done: false },
    { id: "t4", project: "h3", title: "นัดตรวจงานบิวท์อิน", date: today, time: "15:30", note: "ตรวจแนวหน้าบานและไฟใต้ชั้น", done: false },
    { id: "t5", project: "h1", title: "วางบิลงวดติดตั้ง", date: offsetDay(today, 3), time: "11:00", note: "", done: false }
  ];
}
let tasks = initialTasks();
let view = "homes";
let projectId = null;
let detailTab = "งาน";
let filter = "all";
let calendarDate = today;
let monthStart = today.slice(0, 7) + "-01";
let toastTimer;

const views = [
  ["homes", "บ้านทั้งหมด", "homes"], ["today", "งานวันนี้", "today"], ["calendar", "ปฏิทิน", "calendar"]
];
const filterLabels = [["all", "ทั้งหมด"], ["open", "ยังไม่เสร็จ"], ["done", "เสร็จแล้ว"]];
const projectFor = (id) => projects.find((project) => project.id === id);
const compareTasks = (a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99");
const sorted = (list) => [...list].sort(compareTasks);
const money = (amount) => currency.format(amount);
const received = (project) => project.installments.reduce((total, row) => total + row[2], 0);
const tile = (name, tone = "") => '<span class="tile ' + tone + '">' + icon(name) + '</span>';
const closeControl = '<button type="button" class="icon-button" aria-label="ปิด" data-close>' + icon("close") + '</button>';

function updateNetwork() {
  const online = navigator.onLine;
  $("#connection").textContent = online ? "ข้อมูลตัวอย่าง" : "ออฟไลน์ · ดูอย่างเดียว";
  $("#connection").classList.toggle("offline", !online);
  $("#add").disabled = !online;
  document.querySelectorAll(".done-check, form .primary").forEach((button) => { button.disabled = !online; });
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}
function saveTasks(nextTasks) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(nextTasks));
    tasks = nextTasks;
    return true;
  } catch {
    showToast("บันทึกไม่ได้ กรุณาตรวจพื้นที่จัดเก็บของเบราว์เซอร์");
    return false;
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
    + projects.map((project) => '<button class="site-preview" data-project="' + project.id + '">' + tile("homes") + '<span><strong>' + project.name + '</strong><span class="subtle">' + project.stage + '</span></span></button>').join("") + '</section></div>';
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
  return '<header class="heading"><h1>บ้านทั้งหมด</h1><p>' + projects.length
    + ' บ้านลูกค้า · เรียงตามนัดถัดไป</p></header><div class="project-grid">'
    + rankedProjects.map(({ project, next }) => {
      const nextTask = next
        ? '<span><strong>' + esc(next.title) + '</strong><span>' + formatShortDate.format(atNoon(next.date))
          + (next.time ? " · " + esc(next.time) + " น." : "") + '</span></span>'
        : '<span>ยังไม่มีนัดถัดไป</span>';
      return '<button class="project" data-project="' + project.id + '">'
        + '<span class="project-head">' + tile("homes") + '<span class="project-heading"><strong class="project-name">' + esc(project.name)
        + '</strong><span class="subtle">' + esc(project.place) + '</span></span></span>'
        + '<span class="project-stage">' + esc(project.stage) + '</span>'
        + '<span class="project-price"><span class="subtle">ราคารวม</span><strong class="value">' + money(project.contract) + '</strong></span>'
        + '<span class="project-next">' + icon("calendar") + nextTask + '</span></button>';
    }).join("") + '</div>';
}
function moneyRows(project) {
  return project.installments.map(([label, amount, paid, billed], index) => {
    const complete = paid === amount;
    const status = complete ? "รับครบแล้ว" : paid > 0 ? "รับบางส่วน" : billed ? "วางบิลแล้ว" : "ยังไม่วางบิล";
    const tone = complete ? " paid" : paid > 0 ? " partial" : "";
    const receipt = "รับแล้ว " + money(paid) + (paid > 0 && !complete ? " · เหลือ " + money(amount - paid) : "");
    return '<div class="money-row"><div><strong>งวด ' + (index + 1) + ' · ' + esc(label) + '</strong>'
      + '<span class="payment-status' + tone + '">' + status + '</span></div><div class="money-amount"><strong>'
      + money(amount) + '</strong><p class="subtle">' + receipt + '</p></div></div>';
  }).join("");
}
function docsFor(project) {
  const docs = [{ title: "ใบเสนอราคา", amount: project.contract }];
  project.installments.forEach(([label, amount, , billed], index) => {
    if (billed) docs.push({ title: "ใบวางบิล · งวด " + (index + 1), note: label, amount });
  });
  return docs;
}
function projectPage() {
  const project = projectFor(projectId);
  const paid = project.installments.filter((row) => row[1] === row[2]).length;
  const tabs = [["งาน", "today"], ["เงินงวด", "wallet"], ["เอกสาร", "file"]].map(([tab, symbol]) =>
    '<button type="button" class="detail-tab" data-detail="' + tab + '" aria-pressed="' + (tab === detailTab) + '">'
    + icon(symbol) + '<span>' + tab + '</span></button>'
  ).join("");
  let body;
  if (detailTab === "งาน") {
    body = '<ul class="task-list">' + taskRows(tasks.filter((task) => task.project === project.id)) + '</ul>';
  } else if (detailTab === "เงินงวด") {
    body = '<div class="detail-body">' + moneyRows(project) + '</div>';
  } else {
    body = '<div class="detail-body">' + docsFor(project).map((doc, index) =>
      '<button class="doc-row" data-doc="' + index + '">' + tile("file") + '<span><strong>' + esc(doc.title)
      + '</strong><small class="subtle">เอกสารตัวอย่าง</small></span></button>'
    ).join("") + '</div>';
  }
  return '<div class="project-detail"><header class="detail-header"><button class="text-button back" data-view="homes">กลับไปบ้านทั้งหมด</button>'
    + '<div class="detail-title"><div><h1>' + esc(project.name) + '</h1><p class="subtle">' + esc(project.place)
    + '</p></div><div class="detail-total"><span class="subtle">ราคารวมของงานนี้</span><strong>' + money(project.contract)
    + '</strong></div></div></header>'
    + '<div class="detail-stage">' + tile("today") + '<div><span class="subtle">ขั้นตอนการทำงาน</span><strong>'
    + esc(project.stage) + '</strong></div></div>'
    + '<div class="summary"><div><span class="subtle">ยอดเงินที่เหลือ</span><strong>' + money(project.contract - received(project))
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
function render(animate = true) {
  const pages = { today: todayPage, homes: homesPage, detail: projectPage, calendar: calendarPage };
  $("#content").innerHTML = '<div' + (animate ? ' class="page"' : "") + '>' + pages[view]() + '</div>';
  $("#add").hidden = view !== "calendar";
  document.querySelectorAll(".nav-button").forEach((button) => {
    if (button.dataset.view === (view === "detail" ? "homes" : view)) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  updateNetwork();
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
  updateNetwork();
}
function showForm() {
  if (view !== "calendar" || !navigator.onLine) return;
  const options = projects.map((project) => '<option value="' + project.id + '"' + '>' + project.name + '</option>').join("");
  showDialog("เพิ่มงาน", '<form id="add-form" class="form"><label>ชื่องาน<input name="title" required maxlength="120" autofocus placeholder="เช่น วัดหน้างานครัว"></label>'
    + '<label>บ้านลูกค้า<select name="project" required><option value="" disabled selected>เลือกบ้าน</option>' + options + '</select></label>'
    + '<div class="fields"><label>วันที่<input type="date" name="date" required value="' + calendarDate
    + '"></label><label>เวลา<input type="time" name="time"></label></div><label>โน้ต<input name="note" maxlength="500"></label>'
    + '<div class="dialog-actions"><button type="button" class="text-button" data-close>ยกเลิก</button><button type="submit" class="primary">บันทึกงาน</button></div></form>');
}
function showTask(task) {
  const project = projectFor(task.project);
  showDialog(esc(task.title), '<p class="subtle">' + esc(project.name) + ' · ' + formatDate.format(atNoon(task.date))
    + (task.time ? ' · ' + esc(task.time) + ' น.' : "") + '</p>'
    + (task.note ? '<p class="notes">' + esc(task.note) + '</p>' : "")
    + '<div class="dialog-actions"><button class="primary" data-project="' + project.id + '">เปิดรายละเอียดบ้าน</button></div>');
}
function showDocument(index) {
  const project = projectFor(projectId);
  const doc = docsFor(project)[index];
  showDialog(doc.title, '<div class="document"><p class="subtle">เอกสารตัวอย่าง · Klao Built-in</p><strong>' + project.name + '</strong>'
    + (doc.note ? '<p>' + doc.note + '</p>' : "") + '<strong>ยอดเงิน ' + money(doc.amount) + '</strong></div>');
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
  if (data.close !== undefined) $("#dialog").close();
  if (button.id === "add") showForm();
  if (data.view) navigate(data.view);
  if (data.project) {
    if ($("#dialog").open) $("#dialog").close();
    navigate("detail", data.project);
  }
  if (data.filter) {
    filter = data.filter;
    render(false);
    $('[data-filter="' + filter + '"]').focus({ preventScroll: true });
  }
  if (data.detail) {
    detailTab = data.detail;
    render(false);
    $('[data-detail="' + detailTab + '"]').focus({ preventScroll: true });
  }
  if (data.task) {
    const task = tasks.find((item) => item.id === data.task);
    if (task) showTask(task);
  }
  if (data.toggle && navigator.onLine) {
    const next = tasks.map((task) => task.id === data.toggle ? { ...task, done: !task.done } : task);
    if (saveTasks(next)) {
      render(false);
      const item = next.find((task) => task.id === data.toggle);
      (document.querySelector('[data-toggle="' + CSS.escape(item.id) + '"]') || $(".chip[aria-pressed=true]"))?.focus({ preventScroll: true });
      showToast(item.done ? "ทำเครื่องหมายเสร็จแล้ว" : "ย้ายกลับไปยังงานที่ยังไม่เสร็จ");
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
    if (data.month) $('[data-month="' + data.month + '"]').focus({ preventScroll: true });
    else if (data.date) $('[data-date="' + calendarDate + '"]').focus({ preventScroll: true });
    else $("[data-calendar-today]").focus({ preventScroll: true });
  }
});
$("#dialog").addEventListener("click", (event) => {
  if (event.target === $("#dialog")) {
    const rect = $("#dialog").getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top) $("#dialog").close();
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id !== "add-form") return;
  event.preventDefault();
  if (!navigator.onLine) return;
  const form = new FormData(event.target);
  const title = form.get("title").trim();
  if (!title) {
    showToast("กรุณาพิมพ์ชื่องาน");
    return;
  }
  const task = {
    id: crypto.randomUUID?.() || "task-" + Date.now(), title, project: form.get("project"),
    date: form.get("date"), time: form.get("time"), note: form.get("note").trim(), done: false
  };
  if (!saveTasks([...tasks, task])) return;
  $("#dialog").close();
  calendarDate = task.date;
  monthStart = task.date.slice(0, 7) + "-01";
  render(false);
  showToast("บันทึกงานตัวอย่างแล้ว");
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
render();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch((error) => console.info("Offline setup:", error.name));
}
