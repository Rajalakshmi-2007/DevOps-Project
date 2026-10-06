from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, require_roles
from ..models import Complaint, User
from ..schemas import AdminUserCreate, UserBrief, UserOut, UserUpdate
from ..security import hash_password

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/technicians")
def technicians(_: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    techs = db.scalars(
        select(User).where(User.role == "technician", User.is_active.is_(True)).order_by(User.name)
    )
    open_counts = {}
    for c in db.scalars(select(Complaint).where(Complaint.status.in_(("assigned", "in_progress")))):
        if c.assignee_id:
            open_counts[c.assignee_id] = open_counts.get(c.assignee_id, 0) + 1
    return [
        {**UserBrief.model_validate(t).model_dump(), "speciality": t.speciality, "open_jobs": open_counts.get(t.id, 0)}
        for t in techs
    ]


@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: AdminUserCreate, _: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == data.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(
        name=data.name.strip(), email=data.email, password_hash=hash_password(data.password),
        role=data.role, department=data.department.strip(), speciality=data.speciality.strip(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    if user.id == admin.id and (data.role not in (None, "admin") or data.is_active is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't demote or deactivate your own account.")
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is not None:
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user

