import { html, raw, titleCase } from "./ui.js";

export const STATUS_COLORS = {
  open: "#2f63c9", assigned: "#7048bd", in_progress: "#b36b00",
  resolved: "#1b7f55", closed: "#5f6d6a", rejected: "#b8381c",
};

/** 14-day line/area chart of complaints created vs resolved. */
export function trendChart(trend) {
  const W = 640, H = 220, L = 30, R = 10, T = 12, B = 28;
  const max = Math.max(4, ...trend.map((d) => Math.max(d.created, d.resolved)));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i) => L + (i * (W - L - R)) / (trend.length - 1);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const line = (key) => trend.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = `${line("created")} L${x(trend.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const grid = [0, 1, 2, 3, 4].map((i) => {
    const v = i * step;
    return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e9e5"/>` +
      `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#5a6b67">${v}</text>`;
  }).join("");
  const labels = trend.map((d, i) => {
    if (i % 2 && i !== trend.length - 1) return "";
    const dt = new Date(d.date + "T00:00:00");
    return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5a6b67">${dt.getDate()}/${dt.getMonth() + 1}</text>`;
  }).join("");
  const dots = trend.map((d, i) =>
    `<circle cx="${x(i)}" cy="${y(d.created)}" r="3" fill="#0f3d3a"><title>${d.date}: ${d.created} reported, ${d.resolved} resolved</title></circle>`).join("");

  return html`
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Complaints reported and resolved over the last 14 days">
        ${raw(grid)}
        <path d="${area}" fill="#0f3d3a" opacity=".08"/>
        <path d="${line("resolved")}" fill="none" stroke="#e0a100" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${line("created")}" fill="none" stroke="#0f3d3a" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${raw(dots)}
        ${raw(labels)}
      </svg>
      <div class="legend"><span><i style="background:#0f3d3a"></i>Reported</span><span><i style="background:#e0a100"></i>Resolved</span></div>
    </div>`;
}

/** Segmented bar + legend for the status mix. */
export function statusMix(byStatus, total) {
  const order = ["open", "assigned", "in_progress", "resolved", "closed", "rejected"];
  if (!total) return html`<p class="muted">Nothing to show yet.</p>`;
  return html`
    <div class="segbar" role="img" aria-label="Complaints by status">
      ${order.filter((s) => byStatus[s]).map((s) =>
        html`<span style="width:${(byStatus[s] / total) * 100}%;--c:${STATUS_COLORS[s]}" title="${titleCase(s)}: ${byStatus[s]}"></span>`)}
    </div>
    <div class="kv">
      ${order.map((s) => html`<div style="--c:${STATUS_COLORS[s]}"><span><i class="dot"></i>${titleCase(s)}</span><b>${byStatus[s] || 0}</b></div>`)}
    </div>`;
}

/** Horizontal bars by category. */
export function categoryBars(byCategory) {
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return html`<p class="muted">No complaints yet.</p>`;
  const max = entries[0][1];
  return html`<div class="bars">${entries.map(([k, v]) =>
    html`<div class="bar"><span>${k}</span><div class="track"><i style="width:${(v / max) * 100}%"></i></div><b>${v}</b></div>`)}</div>`;
}
