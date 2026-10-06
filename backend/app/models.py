from datetime import datetime, timedelta, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

ROLES = ("student", "staff", "technician", "admin")
CATEGORIES = (
    "Electrical", "Plumbing", "Network & Wi-Fi", "Cleaning",
    "Furniture", "HVAC", "Security & Safety", "Other",
)
PRIORITIES = ("low", "medium", "high", "urgent")
STATUSES = ("open", "assigned", "in_progress", "resolved", "closed", "rejected")

REQUEST_KINDS = (
    "Spare parts or materials", "Tools or equipment", "Access or permission",
    "Safety concern", "Schedule or leave", "Other",
)
REQUEST_STATUSES = ("open", "acknowledged", "resolved", "declined")

# Target resolution time (hours) by priority.
SLA_HOURS = {"urgent": 4, "high": 24, "medium": 72, "low": 168}


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(190), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="student")
    department: Mapped[str] = mapped_column(String(120), default="")
    speciality: Mapped[str] = mapped_column(String(60), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    building: Mapped[str] = mapped_column(String(80))
    room: Mapped[str] = mapped_column(String(60), default="")
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="complaint", cascade="all, delete-orphan", order_by="Comment.created_at"
    )
    activity: Mapped[list["Activity"]] = relationship(
        back_populates="complaint", cascade="all, delete-orphan", order_by="Activity.created_at"
    )

    @property
    def due_at(self) -> datetime:
        return self.created_at + timedelta(hours=SLA_HOURS.get(self.priority, 72))

    @property
    def is_overdue(self) -> bool:
        if self.status in ("resolved", "closed", "rejected"):
            return False
        return utcnow() > self.due_at


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    complaint: Mapped[Complaint] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class Activity(Base):
    __tablename__ = "activity"

    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    message: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    complaint: Mapped[Complaint] = relationship(back_populates="activity")
    actor: Mapped[User | None] = relationship()


class TechRequest(Base):
    """A technician's own need (parts, tools, access...) sent to the admin. Not a campus complaint."""

    __tablename__ = "tech_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    complaint_id: Mapped[int | None] = mapped_column(ForeignKey("complaints.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    subject: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    admin_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    technician: Mapped[User] = relationship()
