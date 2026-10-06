import os
import sys
import tempfile
from pathlib import Path

# Configure the app for an isolated, throw-away environment BEFORE importing it.
_tmp = tempfile.mkdtemp(prefix="cmms-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-1234"
os.environ["ADMIN_EMAIL"] = "admin@test.edu"
os.environ["ADMIN_PASSWORD"] = "AdminPass123"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def auth(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_h(client):
    return auth(client, "admin@test.edu", "AdminPass123")


@pytest.fixture(scope="session")
def student_h(client):
    client.post("/api/auth/register", json={
        "name": "Test Student", "email": "stu@test.edu", "password": "Student123", "role": "student"})
    return auth(client, "stu@test.edu", "Student123")


@pytest.fixture(scope="session")
def other_student_h(client):
    client.post("/api/auth/register", json={
        "name": "Other Student", "email": "other@test.edu", "password": "Student123", "role": "student"})
    return auth(client, "other@test.edu", "Student123")


@pytest.fixture(scope="session")
def tech(client, admin_h):
    r = client.post("/api/users", headers=admin_h, json={
        "name": "Tech Tina", "email": "tina@test.edu", "password": "TechPass123",
        "role": "technician", "speciality": "Electrical"})
    assert r.status_code == 201, r.text
    return {"id": r.json()["id"], "headers": auth(client, "tina@test.edu", "TechPass123")}
