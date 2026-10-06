from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, require_roles
from ..models import REQUEST_KINDS, Complaint, TechRequest, User, utcnow
from ..schemas import RequestCreate, RequestOut, RequestUpdate

router = APIRouter(prefix="/api/requests", tags=["technician requests"])


@router.get("", response_model=list[RequestOut])
def list_requests(
    status_: str | None = Query(None, alias="status"),
    user: User = Depends(require_roles("admin", "technician")),
    db: Session = Depends(get_db),
):
    q = select(TechRequest)
    if user.role == "technician":
        q = q.where(TechRequest.technician_id == user.id)
    if status_:
        q = q.where(TechRequest.status == status_)
    return list(db.scalars(q.order_by(TechRequest.created_at.desc())))


@router.post("", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    data: RequestCreate,
    user: User = Depends(require_roles("technician")),
    db: Session = Depends(get_db),
):
    if data.kind not in REQUEST_KINDS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose what kind of request this is.")
    if data.complaint_id is not None:
        job = db.get(Complaint, data.complaint_id)
        if job is None or job.assignee_id != user.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose one of your own jobs.")
    req = TechRequest(
        technician_id=user.id, complaint_id=data.complaint_id, kind=data.kind,
        subject=data.subject.strip(), message=data.message.strip(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.patch("/{request_id}", response_model=RequestOut)
def update_request(
    request_id: int,
    data: RequestUpdate,
    _: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    req = db.get(TechRequest, request_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found.")
    fields = data.model_fields_set
    if "status" in fields and data.status:
        req.status = data.status
    if "reply" in fields:
        reply = (data.reply or "").strip()
        if reply != (req.admin_reply or ""):
            req.admin_reply = reply or None
            req.replied_at = utcnow() if reply else None
        if reply and req.status == "open":
            req.status = "acknowledged"
    db.commit()
    db.refresh(req)
    return req
