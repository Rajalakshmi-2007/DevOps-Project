from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Priority = Literal["low", "medium", "high", "urgent"]
Status = Literal["open", "assigned", "in_progress", "resolved", "closed", "rejected"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- users ----------
class UserOut(ORM):
    id: int
    name: str
    email: str
    role: str
    department: str
    speciality: str
    is_active: bool
    created_at: datetime


class UserBrief(ORM):
    id: int
    name: str
    role: str


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=190)
    password: str = Field(min_length=8, max_length=128)
    department: str = Field(default="", max_length=120)
    role: Literal["student", "staff"] = "student"

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1] or " " in v:
            raise ValueError("Enter a valid email address")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AdminUserCreate(RegisterIn):
    role: Literal["student", "staff", "technician", "admin"] = "technician"
    speciality: str = Field(default="", max_length=60)


class UserUpdate(BaseModel):
    role: Literal["student", "staff", "technician", "admin"] | None = None
    is_active: bool | None = None
    speciality: str | None = Field(default=None, max_length=60)
    department: str | None = Field(default=None, max_length=120)


# ---------- complaints ----------
class ComplaintCreate(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    description: str = Field(min_length=10, max_length=4000)
    category: str
    priority: Priority = "medium"
    building: str = Field(min_length=1, max_length=80)
    room: str = Field(default="", max_length=60)


class ComplaintUpdate(BaseModel):
    status: Status | None = None
    priority: Priority | None = None
    category: str | None = None
    assignee_id: int | None = None
    note: str | None = Field(default=None, max_length=500)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: str = Field(default="", max_length=1000)


class CommentOut(ORM):
    id: int
    body: str
    created_at: datetime
    author: UserBrief


class ActivityOut(ORM):
    id: int
    message: str
    created_at: datetime
    actor: UserBrief | None = None


class ComplaintOut(ORM):
    id: int
    title: str
    description: str
    category: str
    priority: str
    status: str
    building: str
    room: str
    image_path: str | None
    rating: int | None
    feedback: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    due_at: datetime
    is_overdue: bool
    reporter: UserBrief
    assignee: UserBrief | None


class ComplaintDetail(ComplaintOut):
    comments: list[CommentOut]
    activity: list[ActivityOut]


class ComplaintPage(BaseModel):
    items: list[ComplaintOut]
    total: int
    page: int
    pages: int


# ---------- technician requests ----------
class RequestCreate(BaseModel):
    kind: str
    subject: str = Field(min_length=5, max_length=160)
    message: str = Field(min_length=10, max_length=3000)
    complaint_id: int | None = None


class RequestUpdate(BaseModel):
    status: Literal["open", "acknowledged", "resolved", "declined"] | None = None
    reply: str | None = Field(default=None, max_length=1500)


class RequestOut(ORM):
    id: int
    kind: str
    subject: str
    message: str
    status: str
    complaint_id: int | None
    admin_reply: str | None
    replied_at: datetime | None
    created_at: datetime
    updated_at: datetime
    technician: UserBrief
