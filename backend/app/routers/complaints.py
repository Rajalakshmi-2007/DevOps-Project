import math
import uuid
from collections import Counter
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..deps import get_current_user, get_db, require_roles
from ..models import (
    CATEGORIES, REQUEST_KINDS, REQUEST_STATUSES, Activity, Comment, Complaint, TechRequest, User, utcnow,
)
from ..schemas import (
    CommentIn, ComplaintCreate, ComplaintDetail, ComplaintOut, ComplaintPage,
    ComplaintUpdate, FeedbackIn,
)

router = APIRouter(prefix="/api", tags=["complaints"])

ALLOWED_IMAGES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
CLOSED_STATES = ("resolved", "closed", "rejected")


# ---------- helpers ----------
def visible_query(user: User):
    q = select(Complaint)
    if user.role == "admin":
        return q
    if user.role == "technician":
        return q.where(Complaint.assignee_id == user.id)
    return q.where(Complaint.reporter_id == user.id)


def can_view(user: User, c: Complaint) -> bool:
    if user.role == "admin":
        return True
    if user.role == "technician":
        return c.assignee_id == user.id
    return c.reporter_id == user.id


def get_complaint_or_404(db: Session, user: User, complaint_id: int) -> Complaint:
    c = db.get(Complaint, complaint_id)
    if c is None or not can_view(user, c):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found.")
    return c


def log(db: Session, c: Complaint, actor: User | None, message: str) -> None:
    db.add(Activity(complaint_id=c.id, actor_id=actor.id if actor else None, message=message))


def pretty(s: str) -> str:
    return s.replace("_", " ")


# ---------- meta ----------
@router.get("/meta")
def meta():
    from ..models import PRIORITIES, SLA_HOURS, STATUSES

    return {
        "categories": list(CATEGORIES),
        "priorities": list(PRIORITIES),
        "statuses": list(STATUSES),
        "sla_hours": SLA_HOURS,
        "request_kinds": list(REQUEST_KINDS),
        "request_statuses": list(REQUEST_STATUSES),
        "buildings": [
            "Main Library", "Science Block", "Engineering Block", "Admin Block",
            "Student Hostel A", "Student Hostel B", "Sports Complex", "Cafeteria",
            "Auditorium", "Computer Centre",
        ],
    }


# ---------- CRUD ----------
@router.get("/complaints", response_model=ComplaintPage)
def list_complaints(
    status_: str | None = Query(None, alias="status"),
    category: str | None = None,
    priority: str | None = None,
    q: str | None = None,
    overdue: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = visible_query(user)
    if status_:
        query = query.where(Complaint.status == status_)
    if category:
        query = query.where(Complaint.category == category)
    if priority:
        query = query.where(Complaint.priority == priority)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(
            Complaint.title.ilike(like),
            Complaint.description.ilike(like),
            Complaint.building.ilike(like),
            Complaint.room.ilike(like),
        ))
    rows = list(db.scalars(query.order_by(Complaint.created_at.desc())))
    if overdue:
        rows = [c for c in rows if c.is_overdue]
    total = len(rows)
    pages = max(1, math.ceil(total / limit))
    start = (page - 1) * limit
    items = [ComplaintOut.model_validate(c) for c in rows[start:start + limit]]
    return ComplaintPage(items=items, total=total, page=page, pages=pages)


@router.post("/complaints", response_model=ComplaintDetail, status_code=status.HTTP_201_CREATED)
def create_complaint(
    data: ComplaintCreate,
    user: User = Depends(require_roles("student", "staff")),
    db: Session = Depends(get_db),
):
    if data.category not in CATEGORIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a valid category.")
    c = Complaint(
        title=data.title.strip(),
        description=data.description.strip(),
        category=data.category,
        priority=data.priority,
        building=data.building.strip(),
        room=data.room.strip(),
        reporter_id=user.id,
    )
    db.add(c)
    db.flush()
    log(db, c, user, "Complaint submitted")
    db.commit()
    db.refresh(c)
    return c


@router.get("/complaints/{complaint_id}", response_model=ComplaintDetail)
def get_complaint(complaint_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_complaint_or_404(db, user, complaint_id)


@router.patch("/complaints/{complaint_id}", response_model=ComplaintDetail)
def update_complaint(
    complaint_id: int,
    data: ComplaintUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = get_complaint_or_404(db, user, complaint_id)
    fields = data.model_fields_set
    is_admin = user.role == "admin"
    is_assigned_tech = user.role == "technician" and c.assignee_id == user.id
    is_reporter = c.reporter_id == user.id

    # Admin-only fields
    if ("priority" in fields or "category" in fields or "assignee_id" in fields) and not is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can change priority, category or assignment.")

    if "category" in fields and data.category is not None:
        if data.category not in CATEGORIES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a valid category.")
        if data.category != c.category:
            log(db, c, user, f"Category changed to {data.category}")
            c.category = data.category

    if "priority" in fields and data.priority and data.priority != c.priority:
        log(db, c, user, f"Priority changed from {c.priority} to {data.priority}")
        c.priority = data.priority

    if "assignee_id" in fields:
        if data.assignee_id is None:
            if c.assignee_id is not None:
                log(db, c, user, "Technician unassigned")
            c.assignee_id = None
            if c.status == "assigned":
                c.status = "open"
        else:
            tech = db.get(User, data.assignee_id)
            if not tech or tech.role != "technician" or not tech.is_active:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose an active technician.")
            if c.assignee_id != tech.id:
                log(db, c, user, f"Assigned to {tech.name}")
            c.assignee_id = tech.id
            if c.status == "open":
                c.status = "assigned"

    if "status" in fields and data.status and data.status != c.status:
        new = data.status
        allowed = False
        if is_admin:
            allowed = True
        elif is_assigned_tech:
            allowed = new in ("in_progress", "resolved")
        elif is_reporter:
            # Reporter can confirm (close) a resolved job or reopen it.
            allowed = (new == "closed" and c.status == "resolved") or (
                new == "open" and c.status in ("resolved", "closed")
            )
        if not allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't move this complaint to that status.")
        if new == "assigned" and c.assignee_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assign a technician first.")
        old = c.status
        c.status = new
        if new == "resolved":
            c.resolved_at = utcnow()
        elif new == "open":
            c.resolved_at = None
            if c.assignee_id is not None:
                c.status = "assigned"
        msg = f"Status changed from {pretty(old)} to {pretty(c.status)}"
        if data.note:
            msg += f": {data.note.strip()}"
        log(db, c, user, msg)

    db.commit()
    db.refresh(c)
    return c


@router.post("/complaints/{complaint_id}/comments", response_model=ComplaintDetail, status_code=status.HTTP_201_CREATED)
def add_comment(complaint_id: int, data: CommentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_complaint_or_404(db, user, complaint_id)
    db.add(Comment(complaint_id=c.id, author_id=user.id, body=data.body.strip()))
    c.updated_at = utcnow()
    db.commit()
    db.refresh(c)
    return c


@router.post("/complaints/{complaint_id}/attachment", response_model=ComplaintDetail)
async def upload_attachment(
    complaint_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = get_complaint_or_404(db, user, complaint_id)
    if c.reporter_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the reporter can attach a photo.")
    ext = ALLOWED_IMAGES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPG, PNG, WebP or GIF image.")
    settings = get_settings()
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Image must be under {settings.max_upload_mb} MB.")
    folder = Path(settings.upload_dir)
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(content)
    c.image_path = name
    log(db, c, user, "Photo attached")
    db.commit()
    db.refresh(c)
    return c


@router.post("/complaints/{complaint_id}/feedback", response_model=ComplaintDetail)
def give_feedback(complaint_id: int, data: FeedbackIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_complaint_or_404(db, user, complaint_id)
    if c.reporter_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the reporter can rate the work.")
    if c.status not in ("resolved", "closed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "You can rate the work once it's resolved.")
    c.rating = data.rating
    c.feedback = data.feedback.strip() or None
    log(db, c, user, f"Rated the resolution {data.rating}/5")
    db.commit()
    db.refresh(c)
    return c


# ---------- stats ----------
@router.get("/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(db.scalars(visible_query(user)))
    by_status = Counter(c.status for c in rows)
    by_category = Counter(c.category for c in rows)
    by_priority = Counter(c.priority for c in rows)

    durations = [
        (c.resolved_at - c.created_at).total_seconds() / 3600
        for c in rows if c.resolved_at is not None
    ]
    ratings = [c.rating for c in rows if c.rating]

    today = utcnow().date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    created = Counter(c.created_at.date() for c in rows)
    resolved = Counter(c.resolved_at.date() for c in rows if c.resolved_at)

    open_states = ("open", "assigned", "in_progress")
    open_requests = 0
    if user.role == "admin":
        open_requests = len(list(db.scalars(select(TechRequest.id).where(TechRequest.status == "open"))))
    elif user.role == "technician":
        open_requests = len(list(db.scalars(select(TechRequest.id).where(
            TechRequest.technician_id == user.id, TechRequest.status.in_(("open", "acknowledged"))))))
    return {
        "open_requests": open_requests,
        "total": len(rows),
        "active": sum(by_status[s] for s in open_states),
        "overdue": sum(1 for c in rows if c.is_overdue),
        "resolved": by_status["resolved"] + by_status["closed"],
        "avg_resolution_hours": round(sum(durations) / len(durations), 1) if durations else None,
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "by_status": dict(by_status),
        "by_category": dict(by_category),
        "by_priority": dict(by_priority),
        "trend": [
            {"date": d.isoformat(), "created": created.get(d, 0), "resolved": resolved.get(d, 0)}
            for d in days
        ],
    }
