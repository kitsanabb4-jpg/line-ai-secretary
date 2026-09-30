import { Router } from "express";
import { getUserById } from "../users/userService";

/**
 * Planner Dashboard — หน้าเว็บง่าย ๆ ในตัว server เดิม (ตามที่ผู้ใช้เลือก) ไม่มี build step/frontend framework แยก
 * ใช้ vanilla HTML/CSS/JS ฝังในไฟล์เดียว คุยกับ REST API ใน src/api/planner.ts ผ่าน fetch()
 * เข้าถึงผ่านลิงก์ /planner/:userId ที่บอทส่งให้ผู้ใช้ทาง LINE (ดู quickReply.ts)
 */
export const plannerPageRouter = Router();

plannerPageRouter.get("/planner/:userId", async (req, res) => {
  const user = await getUserById(req.params.userId);
  if (!user) {
    res.status(404).send("ไม่พบผู้ใช้นี้ค่ะ 🐷 ลองเปิดลิงก์ Planner ใหม่จากในแชท LINE อีกครั้งนะคะ");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderPlannerHtml(req.params.userId, user.displayName || "เพื่อนของฉัน"));
});

function renderPlannerHtml(userId: string, displayName: string): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Planner — ${escapeHtml(displayName)}</title>
<style>
  :root { --pink:#ff8fab; --pink-dark:#e0567e; --bg:#fff6f8; --card:#ffffff; --text:#3a2e33; --muted:#9a8890; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
  header { background: linear-gradient(135deg, var(--pink), var(--pink-dark)); color: white; padding: 20px 16px; }
  header h1 { margin: 0; font-size: 20px; }
  header p { margin: 4px 0 0; opacity: 0.9; font-size: 13px; }
  .tabs { display: flex; gap: 8px; padding: 12px 16px 0; flex-wrap: wrap; }
  .tab { padding: 8px 16px; border-radius: 20px; background: var(--card); border: 1px solid #f0d5dc; cursor: pointer; font-size: 14px; }
  .tab.active { background: var(--pink-dark); color: white; border-color: var(--pink-dark); }
  main { padding: 16px; max-width: 720px; margin: 0 auto; }
  .card { background: var(--card); border-radius: 14px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
  .day-header { font-weight: 600; color: var(--pink-dark); margin: 16px 0 8px; font-size: 14px; }
  .item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f5e8ec; gap: 8px; }
  .item:last-child { border-bottom: none; }
  .item-title { font-size: 14px; }
  .item-time { color: var(--muted); font-size: 12px; }
  .item-actions button { border: none; background: none; cursor: pointer; font-size: 15px; padding: 4px; }
  form.quick-add { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  form.quick-add input, form.quick-add select { flex: 1; min-width: 100px; padding: 8px; border-radius: 8px; border: 1px solid #e5c9d2; font-size: 14px; }
  form.quick-add button { padding: 8px 14px; border-radius: 8px; border: none; background: var(--pink-dark); color: white; cursor: pointer; }
  .empty { color: var(--muted); font-size: 13px; padding: 8px 0; }
  .section-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .balance { font-size: 18px; font-weight: 700; color: var(--pink-dark); }
  .muted { color: var(--muted); font-size: 12px; }
  .cal-title { text-align: center; font-weight: 700; color: var(--pink-dark); margin-bottom: 10px; font-size: 16px; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cal-head { margin-bottom: 4px; }
  .cal-dow { text-align: center; font-size: 11px; color: var(--muted); font-weight: 600; padding: 4px 0; }
  .cal-cell { min-height: 64px; border-radius: 8px; background: #fffafb; border: 1px solid #f5e3e8; padding: 4px; cursor: pointer; overflow: hidden; }
  .cal-cell:active { background: #fdeef2; }
  .cal-cell.cal-empty { background: transparent; border: none; cursor: default; }
  .cal-cell.cal-today { border: 2px solid var(--pink-dark); }
  .cal-cell.cal-selected { background: #ffe1ea; }
  .cal-daynum { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
  .cal-item { font-size: 10px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
  .cal-more { font-size: 10px; color: var(--pink-dark); font-weight: 600; }
</style>
</head>
<body>
<header>
  <h1>🐷 Planner ของ ${escapeHtml(displayName)}</h1>
  <p>ดู แก้ไข และจัดการงาน/นัดหมาย/การเงินได้จากที่นี่ — ซิงค์กับ LINE อัตโนมัติ</p>
</header>
<div class="tabs">
  <div class="tab active" data-tab="today">วันนี้</div>
  <div class="tab" data-tab="week">สัปดาห์นี้</div>
  <div class="tab" data-tab="month">เดือนนี้</div>
  <div class="tab" data-tab="calendar">📅 ปฏิทิน</div>
  <div class="tab" data-tab="finance">การเงิน</div>
</div>
<main id="app"></main>

<script>
const USER_ID = ${JSON.stringify(userId)};
const API = "/api/planner/" + USER_ID;
let currentTab = "today";

async function api(path, opts) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}

function fmt(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function groupByDay(items) {
  const groups = {};
  for (const it of items) {
    const key = new Date(it.date).toDateString();
    (groups[key] = groups[key] || []).push(it);
  }
  return groups;
}

function flatten(data) {
  const items = [];
  for (const t of data.tasks || []) if (t.dueDate) items.push({ kind: "task", id: t.id, title: t.title, date: t.dueDate });
  for (const e of (data.events || []).filter((e) => e.status !== "CANCELLED")) items.push({ kind: "event", id: e.id, title: e.title, date: e.startTime });
  for (const r of data.reminders || []) items.push({ kind: "reminder", id: r.id, title: r.title, date: r.reminderTime });
  items.sort((a, b) => new Date(a.date) - new Date(b.date));
  return items;
}

function itemRow(it) {
  const icon = it.kind === "task" ? "📌" : it.kind === "event" ? "📅" : "⏰";
  const actions = it.kind === "task"
    ? \`<button onclick="completeTask('\${it.id}')" title="เสร็จแล้ว">✅</button><button onclick="cancelItem('task','\${it.id}')" title="ยกเลิก">🚫</button><button onclick="deleteItem('tasks','\${it.id}')" title="ลบถาวร">🗑️</button>\`
    : it.kind === "event"
    ? \`<button onclick="cancelItem('event','\${it.id}')" title="ยกเลิก">🚫</button><button onclick="deleteItem('events','\${it.id}')" title="ลบถาวร">🗑️</button>\`
    : \`<button onclick="cancelItem('reminder','\${it.id}')" title="ยกเลิก">🚫</button>\`;
  return \`<div class="item"><div><div class="item-title">\${icon} \${escapeHtml(it.title)}</div><div class="item-time">\${fmt(it.date)}</div></div><div class="item-actions">\${actions}</div></div>\`;
}

function renderList(items, undatedTasks) {
  if (items.length === 0 && (!undatedTasks || undatedTasks.length === 0)) {
    return '<div class="card"><div class="empty">ไม่มีอะไรในระบบเลยค่ะ 🐷</div></div>';
  }
  const groups = groupByDay(items);
  let html = '<div class="card">';
  for (const key of Object.keys(groups)) {
    const label = new Date(key).toLocaleDateString("th-TH", { weekday: "long", day: "2-digit", month: "2-digit" });
    html += \`<div class="day-header">\${label}</div>\`;
    html += groups[key].map(itemRow).join("");
  }
  if (undatedTasks && undatedTasks.length > 0) {
    html += '<div class="day-header">งานที่ยังไม่กำหนดวัน</div>';
    html += undatedTasks.map((t) => itemRow({ kind: "task", id: t.id, title: t.title, date: t.createdAt })).join("");
  }
  html += "</div>";
  return html;
}

function dateKey(d) {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

let calItemsByDate = {};

/**
 * ปฏิทินแบบตาราง (grid) ของเดือนปัจจุบัน — ต่างจาก renderList ตรงที่นี่เป็นตารางเห็นทั้งเดือนในหน้าเดียว
 * แต่ละช่องวันจะโชว์ข้อความสั้น ๆ ของรายการวันนั้นให้เห็นตรง ๆ (ไม่ต้องกดเข้าไปดูก่อน) ถ้ามีเยอะจะโชว์
 * "+N เพิ่มเติม" แล้วกดที่ช่องวันเพื่อดูรายละเอียดเต็ม ๆ (พร้อมปุ่มจัดการ) ในการ์ดด้านล่างตาราง
 */
function renderCalendar(items) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const todayKey = dateKey(now);

  calItemsByDate = {};
  for (const it of items) {
    const key = dateKey(it.date);
    (calItemsByDate[key] = calItemsByDate[key] || []).push(it);
  }

  const monthLabel = firstDay.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const dowLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

  let html = '<div class="card"><div class="cal-title">' + monthLabel + "</div>";
  html += '<div class="cal-grid cal-head">' + dowLabels.map((d) => '<div class="cal-dow">' + d + "</div>").join("") + "</div>";
  html += '<div class="cal-grid">';
  for (let i = 0; i < startWeekday; i++) html += '<div class="cal-cell cal-empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const key = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const dayItems = calItemsByDate[key] || [];
    const cls = "cal-cell" + (key === todayKey ? " cal-today" : "");
    html += '<div class="' + cls + '" id="cal-' + key + '" onclick="showDayDetail(\'' + key + "')\">";
    html += '<div class="cal-daynum">' + day + "</div>";
    const shown = dayItems.slice(0, 2);
    html += shown
      .map((it) => '<div class="cal-item">' + (it.kind === "task" ? "📌" : it.kind === "event" ? "📅" : "⏰") + " " + escapeHtml(truncate(it.title, 8)) + "</div>")
      .join("");
    if (dayItems.length > 2) html += '<div class="cal-more">+' + (dayItems.length - 2) + " เพิ่มเติม</div>";
    html += "</div>";
  }
  html += "</div></div>";
  html += '<div id="dayDetail"></div>';
  return html;
}

/** กดที่ช่องวันในปฏิทิน -> โชว์รายละเอียดเต็ม ๆ ของวันนั้น (พร้อมปุ่มจัดการเหมือนมุมมองอื่น ๆ) ในการ์ดด้านล่างตาราง */
function showDayDetail(key) {
  document.querySelectorAll(".cal-cell").forEach((c) => c.classList.remove("cal-selected"));
  const cell = document.getElementById("cal-" + key);
  if (cell) cell.classList.add("cal-selected");

  const items = calItemsByDate[key] || [];
  const label = new Date(key + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "2-digit", month: "long" });
  const el = document.getElementById("dayDetail");
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = '<div class="card"><div class="day-header">' + label + '</div><div class="empty">ไม่มีอะไรในวันนี้เลยค่ะ 🐷</div></div>';
    return;
  }
  el.innerHTML = '<div class="card"><div class="day-header">' + label + "</div>" + items.map(itemRow).join("") + "</div>";
}

function quickAddForm() {
  return \`
  <div class="card">
    <div class="section-title">➕ เพิ่มงานใหม่</div>
    <form class="quick-add" onsubmit="return addTask(event)">
      <input name="title" placeholder="ชื่องาน" required />
      <input name="dueDate" type="datetime-local" />
      <button type="submit">บันทึก</button>
    </form>
  </div>
  <div class="card">
    <div class="section-title">➕ เพิ่มนัดหมายใหม่</div>
    <form class="quick-add" onsubmit="return addEvent(event)">
      <input name="title" placeholder="ชื่อนัดหมาย" required />
      <input name="startTime" type="datetime-local" required />
      <button type="submit">บันทึก</button>
    </form>
  </div>\`;
}

async function loadView(tab) {
  const app = document.getElementById("app");
  app.innerHTML = '<div class="card">กำลังโหลด...</div>';
  try {
    if (tab === "calendar") {
      // ปฏิทินแบบตาราง (เดือนปัจจุบัน) — โชว์ข้อความสั้น ๆ ของแต่ละวันตรง ๆ ในช่องปฏิทินเลย
      // ไม่ต้องกดเข้าไปดูทีละวันก็เห็นคร่าว ๆ ว่าวันนั้นมีอะไรบ้าง กดที่ช่องวันเพื่อดูรายละเอียดเต็ม ๆ ด้านล่าง
      const data = await api("/month");
      const items = flatten(data);
      app.innerHTML = renderCalendar(items);
      return;
    }
    if (tab === "finance") {
      const summary = await api("/finance");
      let html = '<div class="card">';
      html += \`<div class="balance">คงเหลือเดือนนี้: \${summary.balance.toLocaleString()} บาท</div>\`;
      html += \`<div class="muted">รวมรายรับ \${summary.totalIncome.toLocaleString()} บาท · รวมรายจ่าย \${summary.totalExpense.toLocaleString()} บาท</div></div>\`;
      html += '<div class="card"><div class="section-title">➕ บันทึกรายรับ-รายจ่าย</div><form class="quick-add" onsubmit="return addFinance(event)">' +
        '<select name="type"><option value="EXPENSE">รายจ่าย</option><option value="INCOME">รายรับ</option></select>' +
        '<input name="amount" type="number" step="0.01" placeholder="จำนวนเงิน" required />' +
        '<input name="category" placeholder="หมวดหมู่ (ไม่บังคับ)" />' +
        '<button type="submit">บันทึก</button></form></div>';
      if (summary.records.length === 0) {
        html += '<div class="card"><div class="empty">เดือนนี้ยังไม่มีรายการเลยค่ะ</div></div>';
      } else {
        html += '<div class="card">' + summary.records.map((r) =>
          \`<div class="item"><div><div class="item-title">\${r.type === "INCOME" ? "🟢+" : "🔴-"}\${r.amount.toLocaleString()} บาท\${r.category ? " (" + escapeHtml(r.category) + ")" : ""}</div><div class="item-time">\${fmt(r.date)}</div></div><div class="item-actions"><button onclick="deleteFinance('\${r.id}')">🗑️</button></div></div>\`
        ).join("") + '</div>';
      }
      app.innerHTML = html;
      return;
    }
    const data = await api("/" + tab);
    const items = flatten(data);
    app.innerHTML = quickAddForm() + renderList(items, data.undatedTasks);
  } catch (err) {
    app.innerHTML = '<div class="card">โหลดไม่สำเร็จ: ' + escapeHtml(err.message) + '</div>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function addTask(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api("/tasks", { method: "POST", body: JSON.stringify({ title: f.get("title"), dueDate: f.get("dueDate") || undefined }) });
    loadView(currentTab);
  } catch (err) { alert(err.message); }
  return false;
}

async function addEvent(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api("/events", { method: "POST", body: JSON.stringify({ title: f.get("title"), startTime: f.get("startTime") }) });
    loadView(currentTab);
  } catch (err) { alert(err.message); }
  return false;
}

async function addFinance(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api("/finance", { method: "POST", body: JSON.stringify({ type: f.get("type"), amount: parseFloat(f.get("amount")), category: f.get("category") || undefined }) });
    loadView(currentTab);
  } catch (err) { alert(err.message); }
  return false;
}

async function completeTask(id) {
  try { await api("/tasks/" + id + "/complete", { method: "POST" }); loadView(currentTab); } catch (err) { alert(err.message); }
}

async function cancelItem(kind, id) {
  const path = kind === "task" ? "/tasks/" + id + "/cancel" : kind === "event" ? "/events/" + id + "/cancel" : "/reminders/" + id + "/cancel";
  try { await api(path, { method: "POST" }); loadView(currentTab); } catch (err) { alert(err.message); }
}

async function deleteItem(resource, id) {
  if (!confirm("ต้องการลบถาวรใช่ไหมคะ? กู้คืนไม่ได้นะคะ")) return;
  try { await api("/" + resource + "/" + id, { method: "DELETE" }); loadView(currentTab); } catch (err) { alert(err.message); }
}

async function deleteFinance(id) {
  if (!confirm("ต้องการลบรายการนี้ใช่ไหมคะ?")) return;
  try { await api("/finance/" + id, { method: "DELETE" }); loadView(currentTab); } catch (err) { alert(err.message); }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    loadView(currentTab);
  });
});

loadView(currentTab);
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
