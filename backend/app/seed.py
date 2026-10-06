"""Creates (or keeps in sync) the single owner admin account from environment variables.

There are no demo users. Students and staff register themselves; the admin creates
technician accounts from the Team page.
"""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import User
from .security import hash_password, verify_password

log = logging.getLogger("uvicorn.error")
MIN_ADMIN_PASSWORD = 10


def ensure_admin(db: Session) -> None:
    settings = get_settings()
    email = settings.admin_email.strip().lower()
    password = settings.admin_password

    if not email or not password:
        log.warning("ADMIN_EMAIL / ADMIN_PASSWORD are not set, so no admin account exists. Set them in backend/.env")
        return
    if len(password) < MIN_ADMIN_PASSWORD:
        log.warning("ADMIN_PASSWORD must be at least %d characters. Admin account was not created.", MIN_ADMIN_PASSWORD)
        return

    admin = db.scalar(select(User).where(User.email == email))
    if admin is None:
        db.add(User(
            name="Campus Admin", email=email, password_hash=hash_password(password),
            role="admin", department="Facilities Office",
        ))
        db.commit()
        return

    # The environment is the source of truth for the admin: keep role, status and password in sync.
    changed = False
    if admin.role != "admin":
        admin.role, changed = "admin", True
    if not admin.is_active:
        admin.is_active, changed = True, True
    if not verify_password(password, admin.password_hash):
        admin.password_hash, changed = hash_password(password), True
    if changed:
        db.commit()
