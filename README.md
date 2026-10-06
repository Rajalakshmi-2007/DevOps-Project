# Smart Campus Care
### Complaint & Maintenance Management System with automated CI/CD

Students and staff report campus problems (broken lights, leaking taps, Wi-Fi dead spots). Admins assign them to technicians, technicians update the job, and reporters confirm the fix and rate it. Every step is logged, and each priority has a target fix time so late jobs are visible.

**Stack:** Python 3.12, FastAPI, SQLAlchemy 2, JWT auth, SQLite (dev) or PostgreSQL (prod) / HTML, CSS and vanilla JavaScript (no build step) / Docker / GitHub Actions / Render.

---

## Features

| Role | How the account is made | What they can do |
|---|---|---|
| **Student / Staff** | Register themselves on the login page | Report a problem with category, building, room, priority and a photo. Follow progress, chat, confirm or reopen a fix, rate the repair. |
| **Technician** | Created by the admin (Team page) | See only the jobs assigned to them, start work, mark resolved, comment. If they need parts, tools, access or a decision, they use **Ask admin** and read the reply there. They cannot file campus complaints. |
| **Admin** | Only the email and password **you** put in `.env` | See every complaint, assign technicians, change priority and status, answer technician requests, manage accounts and roles, view analytics. The admin does not file complaints. |

There are **no demo accounts**. Nobody can sign in unless they registered or you created them.

Also included: search and filters, pagination, 14-day trend chart, status and category breakdown, target-time (SLA) tracking per priority (urgent 4 h, high 24 h, medium 3 days, low 7 days), full history timeline, responsive layout, keyboard-friendly UI.

## Project structure

```
smart-campus-cmms/
├── backend/
│   ├── app/
│   │   ├── main.py            # app, static hosting, health check
│   │   ├── config.py          # settings from environment variables
│   │   ├── database.py        # SQLAlchemy engine/session
│   │   ├── models.py          # User, Complaint, Comment, Activity
│   │   ├── schemas.py         # request/response validation
│   │   ├── security.py        # password hashing + JWT
│   │   ├── deps.py            # auth dependencies, role checks
│   │   ├── seed.py            # creates the owner admin from .env
│   │   └── routers/           # auth.py, complaints.py, requests.py, admin.py
│   ├── tests/                 # pytest API tests
│   ├── .env.example           # copy to .env and add your admin login
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/                    # app.js (views), api.js, ui.js, charts.js, config.js
├── .github/workflows/ci-cd.yml   # test -> build -> publish -> deploy
├── Dockerfile
├── docker-compose.yml         # app + PostgreSQL
├── render.yaml                # one-click Render blueprint
└── Makefile
```

The FastAPI app serves the frontend too, so one container is the whole product.

## Run it locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```
Open **http://localhost:8000** (API docs at `/docs`).

With Docker and PostgreSQL instead: put `SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` in a `.env` file next to `docker-compose.yml`, then `docker compose up --build`.

### Set your private admin login

```powershell
cd backend
copy .env.example .env
notepad .env
```
Fill in `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 10 characters) and `SECRET_KEY`. Generate a key with
`python -c "import secrets; print(secrets.token_urlsafe(48))"`. `.env` is git-ignored: never share or upload it.
The admin account is created (and kept in sync with `.env`) every time the server starts. To change the admin password, edit `.env` and restart.

Already ran an older version? Stop the server and delete `backend\campus.db` and the `backend\uploads` folder so the old demo users disappear.

## Tests

```bash
cd backend && pytest -q && ruff check .
```
Covers sign-up and login, role permissions, the full complaint lifecycle, privacy between users, search, uploads and stats.

## CI/CD pipeline

`.github/workflows/ci-cd.yml` runs on every push and pull request:

1. **Backend**: install, `ruff` lint, `pytest`.
2. **Frontend**: syntax-check every JS module.
3. **Docker**: build the image, start it, and hit `/api/health` and `/` as a smoke test. On `main` only, push it to GitHub Container Registry (`ghcr.io/<you>/<repo>:latest` and `:sha-...`).
4. **Deploy** (`main` only): call the Render deploy hook, then poll `/api/health` until the new version is live. A failed health check fails the run.

Pull requests run steps 1 to 3 without publishing or deploying. Dependabot keeps dependencies current.

## Deploy to Render (free tier works)

1. Create a GitHub repo and push this folder to the `main` branch.
2. On [render.com](https://render.com): **New → Blueprint**, choose the repo. Enter your private `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` when asked. Render creates the web service and a PostgreSQL database from `render.yaml`.
3. Open the service → **Settings → Deploy Hook**, copy the URL.
4. In GitHub: **Settings → Secrets and variables → Actions**
   - Secret `RENDER_DEPLOY_HOOK_URL` = the hook URL
   - Variable `APP_URL` = `https://<your-service>.onrender.com`
5. Push to `main`. The pipeline tests, builds, and deploys. Your site is live at `APP_URL`.

Free-tier notes: the service sleeps when idle (first request takes about 30 s to wake), uploaded photos live on the container disk and are lost on redeploy, and free databases may expire, so check Render's current limits. For real use, pick a paid plan with a persistent disk, or move uploads to S3 or Cloudinary.

**Other hosts:** the image is portable. Railway, Fly.io, Azure Container Apps, AWS App Runner or any VPS with Docker work. Set the environment variables below, expose port 8000 (or honour `$PORT`), and mount a volume at `/data` if you use SQLite.

## Jenkins and Docker Hub (optional second pipeline)

`Jenkinsfile` does: lint and tests, JavaScript check, `docker build`, a container smoke test, then (main branch only) push to Docker Hub as `<your-dockerhub-user>/smart-campus-cmms`.

```powershell
cd jenkins
docker compose up -d --build      # Jenkins at http://localhost:8080
```
Create a Jenkins credential (Username with password) with ID `dockerhub-creds`: your Docker Hub username and an access token. Then create a Pipeline job that uses "Pipeline script from SCM" pointing at your GitHub repo and `Jenkinsfile`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | none | **Required.** Your private admin login. Password at least 10 characters. |
| `SECRET_KEY` | random per start | Signs login tokens. Set a fixed long random value in production, otherwise everyone is signed out on each restart. |
| `DATABASE_URL` | `sqlite:///./campus.db` | Use a `postgresql://...` URL in production. |
| `UPLOAD_DIR` | `uploads` | Where photos are stored. |
| `CORS_ORIGINS` | `*` | Comma-separated origins if the frontend is hosted separately. |
| `PORT` | `8000` | Honoured by the Docker image. |

To host the frontend separately (Netlify, GitHub Pages), set `apiBase` in `frontend/js/config.js` to your API URL and `CORS_ORIGINS` to the frontend URL.

## API overview

Interactive docs: `/docs`. All routes except register, login, meta and health need `Authorization: Bearer <token>`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | returns token and user |
| GET | `/api/auth/me` | current user |
| GET / POST | `/api/complaints` | create is students and staff only; list (filters: `status`, `category`, `priority`, `q`, `overdue`, `page`) / create |
| GET / PATCH | `/api/complaints/{id}` | detail / update status, priority, category, assignee |
| POST | `/api/complaints/{id}/comments`, `/attachment`, `/feedback` | comment, photo, rating |
| GET / POST / PATCH | `/api/requests`, `/api/requests/{id}` | technician requests to the admin (technician sends, admin replies) |
| GET | `/api/stats` | dashboard numbers scoped to what the user may see |
| GET / POST / PATCH | `/api/users`, `/api/users/{id}`; GET `/api/technicians` | admin only |
| GET | `/api/health` | liveness for the host and the pipeline |

## Before real users arrive

- Use a strong, private `ADMIN_PASSWORD` and a fixed `SECRET_KEY`.
- Serve over HTTPS (Render does this for you) and restrict `CORS_ORIGINS` if the frontend is on another domain.
- Use PostgreSQL and persistent or object storage for photos.
- Ideas for next steps: email or SMS notifications, a login rate limiter, password reset, database migrations with Alembic, QR codes on rooms that open a pre-filled report form.
