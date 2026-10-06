const cfg = window.CMMS_CONFIG || { apiBase: "" };
export const API_BASE = (cfg.apiBase || "").replace(/\/$/, "");

const TOKEN_KEY = "cmms.token";
const USER_KEY = "cmms.user";

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  setUser(user) { localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(method, path, body, { form = false, auth = true } = {}) {
  const headers = {};
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (body !== undefined) {
    if (form) payload = body;
    else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  }
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: payload });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401 && auth && session.token) {
      session.clear();
      window.dispatchEvent(new Event("auth:expired"));
    }
    const detail = data && typeof data.detail === "string" ? data.detail : "Something went wrong. Try again.";
    throw new ApiError(detail, res.status);
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined && v !== false) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  login: (email, password) => request("POST", "/api/auth/login", { email, password }, { auth: false }),
  register: (data) => request("POST", "/api/auth/register", data, { auth: false }),
  me: () => request("GET", "/api/auth/me"),
  meta: () => request("GET", "/api/meta"),
  stats: () => request("GET", "/api/stats"),
  complaints: (params) => request("GET", `/api/complaints${qs(params)}`),
  complaint: (id) => request("GET", `/api/complaints/${id}`),
  create: (data) => request("POST", "/api/complaints", data),
  update: (id, data) => request("PATCH", `/api/complaints/${id}`, data),
  comment: (id, body) => request("POST", `/api/complaints/${id}/comments`, { body }),
  attach: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("POST", `/api/complaints/${id}/attachment`, fd, { form: true });
  },
  feedback: (id, rating, feedback) => request("POST", `/api/complaints/${id}/feedback`, { rating, feedback }),
  requests: (params) => request("GET", `/api/requests${qs(params)}`),
  createRequest: (data) => request("POST", "/api/requests", data),
  updateRequest: (id, data) => request("PATCH", `/api/requests/${id}`, data),
  technicians: () => request("GET", "/api/technicians"),
  users: () => request("GET", "/api/users"),
  createUser: (data) => request("POST", "/api/users", data),
  updateUser: (id, data) => request("PATCH", `/api/users/${id}`, data),
};
