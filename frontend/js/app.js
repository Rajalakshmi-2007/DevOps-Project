import { api, session, API_BASE } from "./api.js";
import { categoryBars, statusMix, trendChart } from "./charts.js";
import {
  debounce, dueLabel, duration, fullDate, html, icon, initials, mount, prio, raw,
  stars, statusPill, ticket, timeAgo, titleCase, toast,
} from "./ui.js";

const app = document.getElementById("app");
const state = { user: session.user, meta: null };
let routeToken = 0;

// ---------- routing ----------
function parseHash() {
  const [path, query = ""] = (location.hash.replace(/^#/, "") || "/").split("?");
  return { parts: path.split("/").filter(Boolean), query: new URLSearchParams(query) };
}

async function loadSession() {
  if (!session.token) return false;
  try {
    state.user = await api.me();
    session.setUser(state.user);
    state.meta = await api.meta();
    return true;
  } catch {
    session.clear();
    state.user = null;
    return false;
  }
}

async function route() {
  const token = ++routeToken;
  const alive = () => token === routeToken;
  if (!session.token) { renderAuth(); return; }
  if (!state.user || !state.meta) {
    if (!(await loadSession())) { renderAuth(); return; }
  }
  if (!document.querySelector(".shell")) renderShell();
  const view = document.getElementById("view");
  const { parts } = parseHash();
  const section = parts[0] || "overview";
  markNav(section);
  document.querySelector(".sidebar")?.classList.remove("open");
  window.scrollTo(0, 0);
  mount(view, html`<p class="muted">Loading…</p>`);
  try {
    if (section === "overview") await viewOverview(view, alive);
    else if (section === "complaints" && parts[1]) await viewDetail(view, parts[1], alive);
    else if (section === "complaints") await viewList(view, alive);
    else if (section === "new") await viewNew(view, alive);
    else if (section === "requests" && roleIsStaff()) await viewRequests(view, alive);
    else if (section === "team" && state.user.role === "admin") await viewTeam(view, alive);
    else { location.hash = "#/"; }
  } catch (e) {
    if (!alive()) return;
    mount(view, html`<div class="panel empty"><h3>We couldn't load this page</h3><p>${e.message}</p>
      <a class="btn btn-dark" href="#/">Back to overview</a></div>`);
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("auth:expired", () => { toast("Your session ended. Please sign in again.", "err"); route(); });

// ---------- auth ----------

function renderAuth() {
  state.user = null; state.meta = null;
  let mode = "login";
  const draw = () => {
    mount(app, html`
      <div class="auth">
        <section class="auth-art">
          <div class="brand"><span class="brand-mark">${icon("logo")}</span>Smart Campus Care</div>
          <div>
            <h1>Fix it faster, together.</h1>
            <p class="lede">Report a broken light, a leaking tap or a Wi-Fi dead spot and follow it until it is fixed.</p>
          </div>
          <div class="signpost" aria-hidden="true">
            <div class="sign">Report <small>in under a minute</small></div>
            <div class="sign">Track <small>every step of the repair</small></div>
            <div class="sign">Rate <small>so we keep improving</small></div>
          </div>
          <p class="foot">Facilities and IT services, one place for the whole campus.</p>
        </section>
        <section class="auth-form-wrap">
          <div class="auth-card">
            <h2>${mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p class="muted">${mode === "login" ? "Sign in to see your complaints." : "Students and staff can report issues right away."}</p>
            <div class="tabs" role="tablist">
              <button type="button" role="tab" data-mode="login" aria-selected="${String(mode === "login")}">Sign in</button>
              <button type="button" role="tab" data-mode="register" aria-selected="${String(mode === "register")}">Create account</button>
            </div>
            <form id="auth-form" novalidate>
              ${mode === "register" ? html`
                <div class="field"><label for="f-name">Full name</label><input id="f-name" type="text" autocomplete="name" required></div>` : ""}
              <div class="field"><label for="f-email">Email</label><input id="f-email" type="email" autocomplete="email" required></div>
              <div class="field"><label for="f-pass">Password</label>
                <input id="f-pass" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required>
                ${mode === "register" ? html`<span class="hint">At least 8 characters.</span>` : ""}
              </div>
              ${mode === "register" ? html`
                <div class="row2">
                  <div class="field"><label for="f-role">I am a</label>
                    <select id="f-role"><option value="student">Student</option><option value="staff">Staff member</option></select></div>
                  <div class="field"><label for="f-dept">Department</label><input id="f-dept" type="text" autocomplete="organization-title"></div>
                </div>` : ""}
              <p class="error-text" id="auth-error" role="alert"></p>
              <button class="btn btn-primary btn-block" type="submit">${mode === "login" ? "Sign in" : "Create account"}</button>
            </form>
          </div>
        </section>
      </div>`);

    app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; draw(); }));
    app.querySelector("#auth-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const email = app.querySelector("#f-email").value.trim();
      const pw = app.querySelector("#f-pass").value;
      if (!email || !pw) { app.querySelector("#auth-error").textContent = "Enter your email and password."; return; }
      submit(email, pw);
    });
  };

  async function submit(email, password) {
    const err = app.querySelector("#auth-error");
    const btn = app.querySelector("#auth-form button[type=submit]");
    btn.disabled = true; err.textContent = "";
    try {
      let res;
      if (mode === "register") {
        res = await api.register({
          name: app.querySelector("#f-name").value.trim(),
          email, password,
          role: app.querySelector("#f-role").value,
          department: app.querySelector("#f-dept").value.trim(),
        });
      } else {
        res = await api.login(email, password);
      }
      session.save(res.access_token, res.user);
      state.user = res.user;
      state.meta = await api.meta();
      if (location.hash === "#/" || location.hash === "") route(); else location.hash = "#/";
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  }
  draw();
}

// ---------- shell ----------
function navItems() {
  const role = state.user.role;
  const items = [["overview", "#/", "grid", "Overview"]];
  items.push(["complaints", "#/complaints", "list",
    role === "admin" ? "All complaints" : role === "technician" ? "My jobs" : "My complaints"]);
  if (role === "technician") items.push(["requests", "#/requests", "chat", "Ask admin"]);
  if (role === "admin") items.push(["requests", "#/requests", "chat", "Technician requests"], ["team", "#/team", "users", "Team"]);
  return items;
}

function renderShell() {
  const u = state.user;
  mount(app, html`
    <div class="shell">
      <div class="topbar">
        <div class="brand"><span class="brand-mark">${icon("logo")}</span>Smart Campus Care</div>
        <button type="button" id="menu" aria-label="Open menu">${icon("menu")}</button>
      </div>
      <aside class="sidebar" aria-label="Main">
        <div class="brand"><span class="brand-mark">${icon("logo")}</span>Smart Campus Care</div>
        <nav class="nav">
          ${navItems().map(([key, href, ic, label]) => html`<a href="${href}" data-nav="${key}">${icon(ic)}${label}</a>`)}
          ${canReport() ? html`<a href="#/new" class="cta" data-nav="new">${icon("plus")}New complaint</a>` : ""}
        </nav>
        <div class="me">
          <span class="avatar" aria-hidden="true">${initials(u.name)}</span>
          <span class="who"><strong>${u.name}</strong><span>${u.role}</span></span>
          <button type="button" id="logout" aria-label="Sign out" title="Sign out">${icon("out")}</button>
        </div>
      </aside>
      <main id="view" tabindex="-1"></main>
    </div>`);
  document.getElementById("menu").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
  document.getElementById("logout").addEventListener("click", () => {
    session.clear(); state.user = null; state.meta = null;
    location.hash = "#/"; route();
  });
}

function markNav(section) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

// ---------- shared pieces ----------
const roleIsStaff = () => ["admin", "technician"].includes(state.user.role);
// Only students and staff report campus problems. Technicians use "Ask admin"; the admin manages.
const canReport = () => ["student", "staff"].includes(state.user.role);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function row(c) {
  const due = dueLabel(c);
  return html`
    <a class="item" data-p="${c.priority}" href="#/complaints/${c.id}">
      <span><span class="plate">${ticket(c.id)}</span></span>
      <span class="t"><strong>${c.title}</strong><span>${c.building}${c.room ? `, ${c.room}` : ""}</span></span>
      <span class="cat sub">${c.category}</span>
      <span>${statusPill(c.status)}</span>
      <span class="who2 sub">${c.assignee ? c.assignee.name : "Not assigned"}</span>
      <span class="due ${due.late ? "late" : "sub"}">${due.text}</span>
    </a>`;
}

function selectOptions(values, selected, labeler = (v) => v) {
  return values.map((v) => html`<option value="${v}" ${v === selected ? raw("selected") : ""}>${labeler(v)}</option>`);
}

// ---------- overview ----------
async function viewOverview(view, alive) {
  const u = state.user;
  const [stats, attention] = await Promise.all([
    api.stats(),
    api.complaints(roleIsStaff() ? { overdue: 1, limit: 5 } : { limit: 5 }),
  ]);
  if (!alive()) return;

  const s = stats.by_status;
  let summary;
  if (!stats.total) summary = u.role === "admin" || u.role === "technician" ? "Nothing has been reported yet." : "You haven't reported anything yet. When something needs fixing, tell us here.";
  else if (u.role === "admin") summary = `${stats.active} active complaints, ${s.open || 0} still waiting for a technician and ${stats.overdue} past their target time.`;
  else if (u.role === "technician") summary = `${stats.active} jobs on your list, ${stats.overdue} past their target time.`;
  else summary = stats.active ? `${stats.active} of your complaints ${stats.active === 1 ? "is" : "are"} still being handled.` : "All your complaints have been resolved.";

  const attnTitle = roleIsStaff() ? "Past their target time" : "Your latest complaints";
  mount(view, html`
    <div class="page-head">
      <div><h1>${greeting()}, ${u.name.split(" ")[0]}</h1><p>${summary}</p></div>
      ${canReport() ? html`<a class="btn btn-primary" href="#/new">${icon("plus")}New complaint</a>` : ""}
    </div>

    <div class="strip">
      <div><div class="n">${stats.total}</div><div class="l">Total complaints</div></div>
      <div><div class="n">${stats.active}</div><div class="l">Active</div></div>
      <div><div class="n ${stats.overdue ? "bad" : ""}">${stats.overdue}</div><div class="l">Past target time</div></div>
      <div><div class="n">${stats.resolved}</div><div class="l">Resolved</div></div>
      <div><div class="n">${duration(stats.avg_resolution_hours)}</div><div class="l">Average fix time</div></div>
      <div><div class="n">${stats.avg_rating ? `${stats.avg_rating}/5` : "—"}</div><div class="l">Average rating</div></div>
      ${roleIsStaff() ? html`<div><div class="n">${stats.open_requests}</div><div class="l">${u.role === "admin" ? "Requests to answer" : "Your pending requests"}</div></div>` : ""}
    </div>

    <div class="grid-2">
      <section class="panel"><div class="panel-head"><h2>Last 14 days</h2></div>${trendChart(stats.trend)}</section>
      <section class="panel"><div class="panel-head"><h2>Where things stand</h2></div>${statusMix(stats.by_status, stats.total)}</section>
    </div>

    <div class="grid-2 even">
      <section class="panel"><div class="panel-head"><h2>By category</h2></div>${categoryBars(stats.by_category)}</section>
      <section class="panel">
        <div class="panel-head"><h2>${attnTitle}</h2><a href="#/complaints">See all</a></div>
        ${attention.items.length
          ? html`<div class="list">${attention.items.map(row)}</div>`
          : html`<p class="muted">${roleIsStaff() ? "Nothing is overdue. Nice work." : "No complaints yet."}</p>`}
      </section>
    </div>`);
}

// ---------- list ----------
async function viewList(view, alive) {
  const role = state.user.role;
  const title = role === "admin" ? "All complaints" : role === "technician" ? "My jobs" : "My complaints";
  const sub = role === "admin" ? "Review, assign and track every request on campus."
    : role === "technician" ? "Jobs the admin has assigned to you." : "Everything you have reported, newest first.";
  const q = parseHash().query;
  const f = {
    q: q.get("q") || "", status: q.get("status") || "", category: q.get("category") || "",
    priority: q.get("priority") || "", overdue: q.get("overdue") === "1", page: Number(q.get("page")) || 1,
  };
  const m = state.meta;

  mount(view, html`
    <div class="page-head">
      <div><h1>${title}</h1><p>${sub}</p></div>
      ${canReport() ? html`<a class="btn btn-primary" href="#/new">${icon("plus")}New complaint</a>` : ""}
    </div>
    <form class="filters" id="filters" role="search" onsubmit="return false">
      <div class="search"><label class="sr" for="fq">Search</label><input id="fq" type="search" placeholder="Search title, building or room" value="${f.q}"></div>
      <div><label class="sr" for="fs">Status</label><select id="fs"><option value="">Any status</option>${selectOptions(m.statuses, f.status, titleCase)}</select></div>
      <div><label class="sr" for="fc">Category</label><select id="fc"><option value="">Any category</option>${selectOptions(m.categories, f.category)}</select></div>
      <div><label class="sr" for="fp">Priority</label><select id="fp"><option value="">Any priority</option>${selectOptions(m.priorities, f.priority, titleCase)}</select></div>
      <label class="check"><input type="checkbox" id="fo" ${f.overdue ? raw("checked") : ""}> Past target</label>
    </form>
    <div id="results"><p class="muted">Loading…</p></div>`);

  const results = view.querySelector("#results");
  async function load() {
    const params = {
      q: f.q, status: f.status, category: f.category, priority: f.priority,
      overdue: f.overdue ? 1 : "", page: f.page, limit: 10,
    };
    const qs = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && !(k === "page" && v === 1) && k !== "limit"));
    history.replaceState(null, "", `#/complaints${qs.toString() ? `?${qs}` : ""}`);
    let data;
    try { data = await api.complaints(params); } catch (e) { toast(e.message, "err"); return; }
    if (!alive()) return;
    if (!data.items.length) {
      const filtered = f.q || f.status || f.category || f.priority || f.overdue;
      mount(results, html`<div class="list"><div class="empty">
        <h3>${filtered ? "No complaints match those filters" : "No complaints yet"}</h3>
        <p>${filtered ? "Try removing a filter or searching for something else."
          : canReport() ? "When something on campus needs fixing, report it and it will show up here."
          : role === "technician" ? "Jobs appear here when the admin assigns them to you." : "Complaints from students and staff will appear here."}</p>
        ${filtered ? html`<button class="btn btn-line" id="clear">Clear filters</button>`
          : canReport() ? html`<a class="btn btn-primary" href="#/new">Report a problem</a>` : ""}
      </div></div>`);
      results.querySelector("#clear")?.addEventListener("click", () => { location.hash = "#/complaints"; route(); });
      return;
    }
    mount(results, html`
      <div class="list">${data.items.map(row)}</div>
      <div class="pager">
        <span>${data.total} complaint${data.total === 1 ? "" : "s"}, page ${data.page} of ${data.pages}</span>
        <span>
          <button class="btn btn-line btn-sm" id="prev" ${data.page <= 1 ? raw("disabled") : ""}>Previous</button>
          <button class="btn btn-line btn-sm" id="next" ${data.page >= data.pages ? raw("disabled") : ""}>Next</button>
        </span>
      </div>`);
    results.querySelector("#prev")?.addEventListener("click", () => { f.page -= 1; load(); });
    results.querySelector("#next")?.addEventListener("click", () => { f.page += 1; load(); });
  }

  const reload = () => { f.page = 1; load(); };
  view.querySelector("#fq").addEventListener("input", debounce((e) => { f.q = e.target.value.trim(); reload(); }));
  view.querySelector("#fs").addEventListener("change", (e) => { f.status = e.target.value; reload(); });
  view.querySelector("#fc").addEventListener("change", (e) => { f.category = e.target.value; reload(); });
  view.querySelector("#fp").addEventListener("change", (e) => { f.priority = e.target.value; reload(); });
  view.querySelector("#fo").addEventListener("change", (e) => { f.overdue = e.target.checked; reload(); });
  await load();
}

// ---------- new complaint ----------
async function viewNew(view) {
  if (!canReport()) { location.hash = "#/"; return; }
  const m = state.meta;
  mount(view, html`
    <div class="page-head"><div><h1>Report a problem</h1><p>Tell us what's wrong and where. The more specific you are, the faster it gets fixed.</p></div></div>
    <form class="panel form-card" id="new-form" novalidate>
      <div class="field"><label for="n-title">What's the problem?</label>
        <input id="n-title" type="text" maxlength="160" placeholder="For example: Projector in Room 204 won't turn on" required></div>
      <div class="row2">
        <div class="field"><label for="n-cat">Category</label>
          <select id="n-cat" required><option value="">Choose a category</option>${selectOptions(m.categories, "")}</select></div>
        <div class="field"><label for="n-bld">Building</label>
          <select id="n-bld" required><option value="">Choose a building</option>${selectOptions(m.buildings, "")}</select></div>
      </div>
      <div class="field"><label for="n-room">Room or spot <span class="muted">(optional)</span></label>
        <input id="n-room" type="text" maxlength="60" placeholder="Room 204, 2nd floor corridor, near the main gate"></div>
      <div class="field"><span class="label" id="prio-label">How urgent is it?</span>
        <div class="prio-pick" role="radiogroup" aria-labelledby="prio-label">
          ${m.priorities.map((p) => html`<label><input type="radio" name="prio" value="${p}" ${p === "medium" ? raw("checked") : ""}><span>${p}</span></label>`)}
        </div>
      </div>
      <p class="note-line" id="sla-note"></p>
      <div class="field"><label for="n-desc">Describe what happened</label>
        <textarea id="n-desc" maxlength="4000" placeholder="When did it start? Is anyone at risk? Anything the technician should know?" required></textarea></div>
      <div class="field"><span class="label">Photo <span class="muted">(optional)</span></span>
        <label class="drop" for="n-photo">
          <span id="drop-preview" class="muted">${icon("camera")}</span>
          <span><strong>Add a photo</strong><br><span class="muted" id="drop-name">JPG, PNG, WebP or GIF, up to 5 MB</span></span>
          <input class="sr" id="n-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
        </label>
      </div>
      <p class="error-text" id="new-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Submit complaint</button>
    </form>`);

  const note = view.querySelector("#sla-note");
  const updateNote = () => {
    const p = view.querySelector("input[name=prio]:checked").value;
    const h = m.sla_hours[p];
    note.textContent = `We aim to fix ${p} priority problems within ${h >= 48 ? `${h / 24} days` : `${h} hours`}.`;
  };
  view.querySelectorAll("input[name=prio]").forEach((r) => r.addEventListener("change", updateNote));
  updateNote();

  const photo = view.querySelector("#n-photo");
  photo.addEventListener("change", () => {
    const file = photo.files[0];
    const preview = view.querySelector("#drop-preview");
    if (!file) return;
    view.querySelector("#drop-name").textContent = file.name;
    preview.innerHTML = "";
    const img = document.createElement("img");
    img.alt = "Selected photo preview";
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });

  view.querySelector("#new-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = view.querySelector("#new-error");
    const btn = e.target.querySelector("button[type=submit]");
    const data = {
      title: view.querySelector("#n-title").value.trim(),
      category: view.querySelector("#n-cat").value,
      building: view.querySelector("#n-bld").value,
      room: view.querySelector("#n-room").value.trim(),
      priority: view.querySelector("input[name=prio]:checked").value,
      description: view.querySelector("#n-desc").value.trim(),
    };
    if (data.title.length < 5) { err.textContent = "Give the problem a short title (at least 5 characters)."; return; }
    if (!data.category) { err.textContent = "Choose a category."; return; }
    if (!data.building) { err.textContent = "Choose the building."; return; }
    if (data.description.length < 10) { err.textContent = "Add a few more details (at least 10 characters)."; return; }
    err.textContent = ""; btn.disabled = true; btn.textContent = "Submitting…";
    try {
      const created = await api.create(data);
      const file = photo.files[0];
      if (file) {
        try { await api.attach(created.id, file); } catch (ex) { toast(`Complaint saved, but the photo failed: ${ex.message}`, "err"); }
      }
      toast("Complaint submitted. We'll keep you posted.");
      location.hash = `#/complaints/${created.id}`;
    } catch (ex) {
      err.textContent = ex.message; btn.disabled = false; btn.textContent = "Submit complaint";
    }
  });
}

// ---------- detail ----------
async function viewDetail(view, id, alive) {
  let c = await api.complaint(id);
  const techs = state.user.role === "admin" ? await api.technicians() : [];
  if (!alive()) return;
  let pendingRating = 0;

  const draw = () => { mount(view, detailHtml(c, techs, pendingRating)); bind(); };
  const apply = async (promise, ok) => {
    try { c = await promise; pendingRating = 0; if (ok) toast(ok); draw(); } catch (e) { toast(e.message, "err"); }
  };

  function bind() {
    view.querySelector("#comment-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const body = view.querySelector("#comment-body").value.trim();
      if (body) apply(api.comment(c.id, body), "Comment posted");
    });

    view.querySelector("#admin-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const payload = {};
      const tech = view.querySelector("#a-tech").value;
      const currentTech = c.assignee ? String(c.assignee.id) : "";
      if (tech !== currentTech) payload.assignee_id = tech ? Number(tech) : null;
      const priority = view.querySelector("#a-prio").value;
      if (priority !== c.priority) payload.priority = priority;
      const status = view.querySelector("#a-status").value;
      if (status !== c.status) payload.status = status;
      const note = view.querySelector("#a-note").value.trim();
      if (note) payload.note = note;
      if (!Object.keys(payload).filter((k) => k !== "note").length) { toast("Nothing to update yet."); return; }
      apply(api.update(c.id, payload), "Changes saved");
    });

    view.querySelectorAll("[data-set-status]").forEach((b) => b.addEventListener("click", () => {
      const note = view.querySelector("#flow-note")?.value.trim();
      apply(api.update(c.id, { status: b.dataset.setStatus, ...(note ? { note } : {}) }), "Status updated");
    }));

    view.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", () => {
      pendingRating = Number(b.dataset.star);
      const text = view.querySelector("#fb-text")?.value || "";
      draw();
      const t = view.querySelector("#fb-text"); if (t) t.value = text;
    }));
    view.querySelector("#feedback-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!pendingRating) { toast("Pick a star rating first.", "err"); return; }
      apply(api.feedback(c.id, pendingRating, view.querySelector("#fb-text").value), "Thanks for the feedback");
    });

    view.querySelector("#late-photo")?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) apply(api.attach(c.id, file), "Photo added");
    });
  }
  draw();
}

function detailHtml(c, techs, pendingRating) {
  const u = state.user;
  const isAdmin = u.role === "admin";
  const isReporter = c.reporter.id === u.id;
  const isTech = u.role === "technician" && c.assignee && c.assignee.id === u.id;
  const due = dueLabel(c);

  const flowButtons = [];
  if (isTech && c.status === "assigned") flowButtons.push(html`<button class="btn btn-dark" data-set-status="in_progress">Start work</button>`);
  if (isTech && ["assigned", "in_progress"].includes(c.status)) flowButtons.push(html`<button class="btn btn-primary" data-set-status="resolved">Mark as resolved</button>`);
  if (isReporter && c.status === "resolved") flowButtons.push(html`<button class="btn btn-primary" data-set-status="closed">Confirm it's fixed</button>`);
  if (isReporter && ["resolved", "closed"].includes(c.status)) flowButtons.push(html`<button class="btn btn-danger" data-set-status="open">Reopen, not fixed</button>`);

  return html`
    <a class="crumb" href="#/complaints">${icon("back")}Back to complaints</a>
    <div class="detail-head">
      <div>
        <div class="meta"><span class="plate">${ticket(c.id)}</span>${statusPill(c.status)}${prio(c.priority)}</div>
        <h1>${c.title}</h1>
      </div>
      <div class="${due.late ? "late" : "muted"}">${due.text}</div>
    </div>

    <div class="detail">
      <div class="stack">
        <section class="panel">
          <div class="panel-head"><h2>What's wrong</h2></div>
          <p class="desc">${c.description}</p>
          ${c.image_path ? html`<img class="photo" src="${API_BASE}/uploads/${c.image_path}" alt="Photo attached to the complaint">` : ""}
          ${!c.image_path && (isReporter || isAdmin) ? html`
            <div class="field" style="margin-top:16px"><label for="late-photo">Add a photo</label><input id="late-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></div>` : ""}
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Conversation</h2></div>
          ${c.comments.length ? c.comments.map((m) => html`
            <div class="comment">
              <span class="avatar" aria-hidden="true">${initials(m.author.name)}</span>
              <div class="bubble"><header><strong>${m.author.name}</strong><span>${timeAgo(m.created_at)}</span></header><p class="desc">${m.body}</p></div>
            </div>`) : html`<p class="muted" style="margin-bottom:16px">No messages yet. Add details or ask for an update.</p>`}
          <form id="comment-form">
            <div class="field"><label class="sr" for="comment-body">Message</label>
              <textarea id="comment-body" maxlength="2000" placeholder="Write a message"></textarea></div>
            <button class="btn btn-dark" type="submit">Post comment</button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>History</h2></div>
          <ol class="timeline">
            ${c.activity.map((a) => html`<li>${a.message}<small>${a.actor ? `${a.actor.name}, ` : ""}${fullDate(a.created_at)}</small></li>`)}
          </ol>
        </section>
      </div>

      <div class="stack">
        <section class="panel">
          <div class="panel-head"><h2>Details</h2></div>
          <dl class="facts">
            <div><dt>Reported by</dt><dd>${c.reporter.name}</dd></div>
            <div><dt>Location</dt><dd>${c.building}${c.room ? `, ${c.room}` : ""}</dd></div>
            <div><dt>Category</dt><dd>${c.category}</dd></div>
            <div><dt>Reported</dt><dd>${fullDate(c.created_at)}</dd></div>
            <div><dt>Target fix</dt><dd>${fullDate(c.due_at)}</dd></div>
            <div><dt>Technician</dt><dd>${c.assignee ? c.assignee.name : "Not assigned yet"}</dd></div>
            ${c.resolved_at ? html`<div><dt>Resolved</dt><dd>${fullDate(c.resolved_at)}</dd></div>` : ""}
          </dl>
        </section>

        ${isTech ? html`<a class="btn btn-line btn-block" href="#/requests?complaint=${c.id}">Need parts, tools or access? Ask the admin</a>` : ""}

        ${isAdmin ? html`
          <section class="panel">
            <div class="panel-head"><h2>Manage</h2></div>
            <form id="admin-form" class="actions">
              <div class="field"><label for="a-tech">Technician</label>
                <select id="a-tech"><option value="">Not assigned</option>
                  ${techs.map((t) => html`<option value="${t.id}" ${c.assignee && c.assignee.id === t.id ? raw("selected") : ""}>${t.name}, ${t.speciality || "General"} (${t.open_jobs} open)</option>`)}
                </select></div>
              <div class="row2">
                <div class="field"><label for="a-prio">Priority</label><select id="a-prio">${selectOptions(state.meta.priorities, c.priority, titleCase)}</select></div>
                <div class="field"><label for="a-status">Status</label><select id="a-status">${selectOptions(state.meta.statuses, c.status, titleCase)}</select></div>
              </div>
              <div class="field"><label for="a-note">Note <span class="muted">(optional)</span></label><input id="a-note" type="text" maxlength="500" placeholder="Shown in the history"></div>
              <button class="btn btn-dark" type="submit">Save changes</button>
            </form>
          </section>` : ""}

        ${flowButtons.length ? html`
          <section class="panel">
            <div class="panel-head"><h2>${isTech ? "Update the job" : "Is it fixed?"}</h2></div>
            <div class="actions">
              <div class="field"><label for="flow-note">Note <span class="muted">(optional)</span></label>
                <input id="flow-note" type="text" maxlength="500" placeholder="${isTech ? "What was done?" : "Anything we should know?"}"></div>
              ${flowButtons}
            </div>
          </section>` : ""}

        ${isReporter && ["resolved", "closed"].includes(c.status) ? html`
          <section class="panel">
            <div class="panel-head"><h2>Rate the repair</h2></div>
            ${c.rating ? html`${stars(c.rating)}${c.feedback ? html`<p class="desc" style="margin-top:8px">${c.feedback}</p>` : ""}`
              : html`<form id="feedback-form">
                  <div class="field">${stars(pendingRating, { interactive: true })}</div>
                  <div class="field"><label class="sr" for="fb-text">Comments</label><textarea id="fb-text" maxlength="1000" placeholder="How did it go? (optional)"></textarea></div>
                  <button class="btn btn-dark" type="submit">Send rating</button>
                </form>`}
          </section>` : (!isReporter && c.rating ? html`<section class="panel"><div class="panel-head"><h2>Reporter's rating</h2></div>${stars(c.rating)}${c.feedback ? html`<p class="desc" style="margin-top:8px">${c.feedback}</p>` : ""}</section>` : "")}
      </div>
    </div>`;
}

// ---------- technician requests ----------
async function viewRequests(view, alive) {
  const isAdmin = state.user.role === "admin";
  const m = state.meta;
  const prefill = parseHash().query.get("complaint") || "";
  let filter = "";
  let list = await api.requests({});
  let jobs = [];
  if (!isAdmin) {
    const page = await api.complaints({ limit: 50 });
    jobs = page.items.filter((c) => !["resolved", "closed", "rejected"].includes(c.status));
  }
  if (!alive()) return;

  const card = (r) => html`
    <article class="panel req">
      <header>
        <div>
          <strong>${r.subject}</strong>
          <div class="muted">${isAdmin ? `${r.technician.name}, ` : ""}${r.kind}${r.complaint_id ? raw(", ") : ""}${r.complaint_id ? html`<a href="#/complaints/${r.complaint_id}">${ticket(r.complaint_id)}</a>` : ""}, ${timeAgo(r.created_at)}</div>
        </div>
        ${statusPill(r.status)}
      </header>
      <p class="desc">${r.message}</p>
      ${r.admin_reply ? html`<div class="reply"><strong>Admin reply</strong><p class="desc">${r.admin_reply}</p><small class="muted">${r.replied_at ? fullDate(r.replied_at) : ""}</small></div>` : ""}
      ${isAdmin ? html`
        <form class="req-form" data-req="${r.id}">
          <div class="row2">
            <div class="field"><label for="rs-${r.id}">Status</label>
              <select id="rs-${r.id}" name="status">${selectOptions(m.request_statuses, r.status, titleCase)}</select></div>
          </div>
          <div class="field"><label for="rr-${r.id}">Your reply</label>
            <textarea id="rr-${r.id}" name="reply" maxlength="1500" placeholder="Tell the technician what happens next">${r.admin_reply || ""}</textarea></div>
          <button class="btn btn-dark btn-sm" type="submit">Save reply</button>
        </form>` : ""}
    </article>`;

  const draw = () => {
    mount(view, html`
      <div class="page-head"><div>
        <h1>${isAdmin ? "Technician requests" : "Ask the admin"}</h1>
        <p>${isAdmin ? "Needs raised by your technicians: parts, tools, access, safety and schedule questions."
          : "Need parts, tools, access or a decision? Send it here. The admin replies on this page. Campus problems are reported by students and staff, not through this form."}</p>
      </div></div>

      ${isAdmin ? html`
        <div class="field req-filter"><label for="rf">Show</label>
          <select id="rf"><option value="">All requests</option>${selectOptions(m.request_statuses, filter, titleCase)}</select></div>` : html`
        <form class="panel form-card" id="req-form" novalidate style="margin-bottom:20px">
          <div class="row2">
            <div class="field"><label for="q-kind">What do you need?</label>
              <select id="q-kind"><option value="">Choose one</option>${selectOptions(m.request_kinds, "")}</select></div>
            <div class="field"><label for="q-job">Related job <span class="muted">(optional)</span></label>
              <select id="q-job"><option value="">Not about a specific job</option>
                ${jobs.map((c) => html`<option value="${c.id}" ${String(c.id) === prefill ? raw("selected") : ""}>${ticket(c.id)}, ${c.title}</option>`)}</select></div>
          </div>
          <div class="field"><label for="q-subject">Subject</label>
            <input id="q-subject" type="text" maxlength="160" placeholder="For example: Need 10 tube lights for the Science Block"></div>
          <div class="field"><label for="q-msg">Details</label>
            <textarea id="q-msg" maxlength="3000" placeholder="What do you need, how much, and by when?"></textarea></div>
          <p class="error-text" id="q-error" role="alert"></p>
          <button class="btn btn-primary" type="submit">Send to admin</button>
        </form>`}

      <div class="stack">
        ${list.length ? list.map(card) : html`<div class="panel empty"><h3>${isAdmin ? "No requests here" : "You haven't sent any requests"}</h3>
          <p>${isAdmin ? "When a technician asks for something, it will show up here." : "Anything you send to the admin will be listed here with their reply."}</p></div>`}
      </div>`);
    bind();
  };

  async function reload() {
    try { list = await api.requests(filter ? { status: filter } : {}); draw(); } catch (e) { toast(e.message, "err"); }
  }

  function bind() {
    view.querySelector("#rf")?.addEventListener("change", (e) => { filter = e.target.value; reload(); });
    view.querySelectorAll(".req-form").forEach((f) => f.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api.updateRequest(f.dataset.req, { status: f.elements.status.value, reply: f.elements.reply.value });
        toast("Reply saved");
        reload();
      } catch (ex) { toast(ex.message, "err"); }
    }));
    view.querySelector("#req-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = view.querySelector("#q-error");
      const data = {
        kind: view.querySelector("#q-kind").value,
        subject: view.querySelector("#q-subject").value.trim(),
        message: view.querySelector("#q-msg").value.trim(),
        complaint_id: view.querySelector("#q-job").value ? Number(view.querySelector("#q-job").value) : null,
      };
      if (!data.kind) { err.textContent = "Choose what you need."; return; }
      if (data.subject.length < 5) { err.textContent = "Add a short subject (at least 5 characters)."; return; }
      if (data.message.length < 10) { err.textContent = "Add a few more details (at least 10 characters)."; return; }
      try {
        await api.createRequest(data);
        toast("Sent to the admin");
        history.replaceState(null, "", "#/requests");
        filter = "";
        list = await api.requests({});
        draw();
      } catch (ex) { err.textContent = ex.message; }
    });
  }
  draw();
}

// ---------- team (admin) ----------
async function viewTeam(view, alive) {
  const users = await api.users();
  if (!alive()) return;
  const me = state.user;
  const roles = ["student", "staff", "technician", "admin"];
  const draw = (list) => {
    mount(view, html`
      <div class="page-head"><div><h1>Team and accounts</h1><p>Add technicians, change roles and switch accounts on or off.</p></div></div>

      <details class="add panel">
        <summary class="btn btn-dark">${icon("plus")}Add an account</summary>
        <form id="user-form" novalidate>
          <div class="row2">
            <div class="field"><label for="u-name">Full name</label><input id="u-name" type="text" required></div>
            <div class="field"><label for="u-email">Email</label><input id="u-email" type="email" required></div>
          </div>
          <div class="row2">
            <div class="field"><label for="u-pass">Temporary password</label><input id="u-pass" type="password" autocomplete="new-password" required><span class="hint">At least 8 characters.</span></div>
            <div class="field"><label for="u-role">Role</label><select id="u-role">${selectOptions(roles, "technician", titleCase)}</select></div>
          </div>
          <div class="row2">
            <div class="field"><label for="u-spec">Speciality <span class="muted">(technicians)</span></label>
              <select id="u-spec"><option value="">General</option>${selectOptions(state.meta.categories, "")}</select></div>
            <div class="field"><label for="u-dept">Department</label><input id="u-dept" type="text"></div>
          </div>
          <p class="error-text" id="user-error" role="alert"></p>
          <button class="btn btn-primary" type="submit">Create account</button>
        </form>
      </details>

      <section class="panel" style="padding:0">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Joined</th><th>Status</th></tr></thead>
          <tbody>
            ${list.map((u) => html`<tr>
              <td><strong>${u.name}</strong><br><span class="muted">${u.email}</span></td>
              <td><label class="sr" for="role-${u.id}">Role for ${u.name}</label>
                <select id="role-${u.id}" data-role="${u.id}" ${u.id === me.id ? raw("disabled") : ""}>${selectOptions(roles, u.role, titleCase)}</select>
                ${u.role === "technician" && u.speciality ? html`<br><span class="muted">${u.speciality}</span>` : ""}</td>
              <td>${u.department || "—"}</td>
              <td>${timeAgo(u.created_at)}</td>
              <td>${u.id === me.id ? html`<span class="muted">You</span>`
                : html`<button class="btn btn-line btn-sm" data-toggle="${u.id}">${u.is_active ? "Deactivate" : "Activate"}</button>`}</td>
            </tr>`)}
          </tbody>
        </table></div>
      </section>`);

    view.querySelectorAll("[data-role]").forEach((sel) => sel.addEventListener("change", async () => {
      try { await api.updateUser(sel.dataset.role, { role: sel.value }); toast("Role updated"); }
      catch (e) { toast(e.message, "err"); }
      refresh();
    }));
    view.querySelectorAll("[data-toggle]").forEach((btn) => btn.addEventListener("click", async () => {
      const target = list.find((x) => String(x.id) === btn.dataset.toggle);
      try { await api.updateUser(target.id, { is_active: !target.is_active }); toast(target.is_active ? "Account deactivated" : "Account activated"); }
      catch (e) { toast(e.message, "err"); }
      refresh();
    }));
    view.querySelector("#user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = view.querySelector("#user-error");
      try {
        await api.createUser({
          name: view.querySelector("#u-name").value.trim(),
          email: view.querySelector("#u-email").value.trim(),
          password: view.querySelector("#u-pass").value,
          role: view.querySelector("#u-role").value,
          speciality: view.querySelector("#u-spec").value,
          department: view.querySelector("#u-dept").value.trim(),
        });
        toast("Account created");
        refresh();
      } catch (ex) { err.textContent = ex.message; }
    });
  };
  async function refresh() {
    try { draw(await api.users()); } catch (e) { toast(e.message, "err"); }
  }
  draw(users);
}

// ---------- start ----------
route();
