// Small UI toolkit: safe HTML templating, icons, formatting helpers, toasts.

class Safe { constructor(s) { this.s = s; } }
export const raw = (s) => new Safe(s);

export function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v === null || v === undefined || v === false) return "";
  return esc(v);
}

/** Tagged template: every interpolated value is HTML-escaped unless it came from html``/raw(). */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Safe(out);
}

export function mount(el, content) { el.innerHTML = render(content); return el; }

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.2 2.4 3.5 5.2"/>',
  out: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M16 8l4 4-4 4M20 12H9"/>',
  chat: '<path d="M4 5h16v11H10l-6 4z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  logo: '<path d="M5 18V9l7-4 7 4v9l-7 3z" fill="currentColor" stroke="none"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
};

export function icon(name) {
  return raw(`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`);
}

export function stars(n, { interactive = false } = {}) {
  const items = [1, 2, 3, 4, 5].map((i) => interactive
    ? raw(`<button type="button" data-star="${i}" class="${i <= n ? "on" : ""}" aria-label="${i} star${i > 1 ? "s" : ""}"><svg viewBox="0 0 24 24">${ICONS.star}</svg></button>`)
    : raw(`<span class="${i <= n ? "on" : ""}"><svg viewBox="0 0 24 24">${ICONS.star}</svg></span>`));
  return html`<span class="stars ${interactive ? "" : "ro"}" ${raw(interactive ? "" : `role="img" aria-label="${n} out of 5"`)}>${items}</span>`;
}

// ---------- formatting ----------
export const parseDate = (s) => new Date(/Z|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z");
export const titleCase = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const ticket = (id) => `CMP-${String(id).padStart(4, "0")}`;
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export function timeAgo(s) {
  const secs = Math.max(0, (Date.now() - parseDate(s).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = secs / 60;
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.floor(hrs)} h ago`;
  const days = hrs / 24;
  if (days < 30) return `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"} ago`;
  return parseDate(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const fullDate = (s) =>
  parseDate(s).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function duration(hours) {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** Text + class for the target-time column. */
export function dueLabel(c) {
  if (["resolved", "closed", "rejected"].includes(c.status)) return { text: titleCase(c.status), late: false };
  const diff = (parseDate(c.due_at).getTime() - Date.now()) / 36e5;
  if (diff < 0) return { text: `${duration(-diff)} overdue`, late: true };
  return { text: `Due in ${duration(diff)}`, late: false };
}

export const statusPill = (s) => html`<span class="pill" data-s="${s}">${titleCase(s)}</span>`;
export const prio = (p) => html`<span class="prio" data-p="${p}">${p}</span>`;

// ---------- toasts ----------
export function toast(message, type = "ok") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast${type === "err" ? " err" : ""}`;
  el.setAttribute("role", type === "err" ? "alert" : "status");
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === "err" ? 6000 : 3500);
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
