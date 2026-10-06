COMPLAINT = {
    "title": "Projector not working",
    "description": "The projector in room 204 does not switch on at all.",
    "category": "Electrical",
    "priority": "high",
    "building": "Engineering Block",
    "room": "204",
}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_register_login_and_me(client):
    r = client.post("/api/auth/register", json={
        "name": "Ann Lee", "email": "ann@test.edu", "password": "Password123"})
    assert r.status_code == 201
    token = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == "ann@test.edu"
    dup = client.post("/api/auth/register", json={
        "name": "Ann Lee", "email": "ann@test.edu", "password": "Password123"})
    assert dup.status_code == 409


def test_login_rejects_bad_password(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.edu", "password": "nope"})
    assert r.status_code == 401


def test_requires_auth(client):
    assert client.get("/api/complaints").status_code == 401


def test_register_cannot_choose_admin_role(client):
    r = client.post("/api/auth/register", json={
        "name": "Evil", "email": "evil@test.edu", "password": "Password123", "role": "admin"})
    assert r.status_code == 422


def test_full_complaint_lifecycle(client, admin_h, student_h, tech):
    # student files complaint
    r = client.post("/api/complaints", headers=student_h, json=COMPLAINT)
    assert r.status_code == 201
    cid = r.json()["id"]
    assert r.json()["status"] == "open"

    # student cannot assign
    r = client.patch(f"/api/complaints/{cid}", headers=student_h, json={"assignee_id": tech["id"]})
    assert r.status_code == 403

    # admin assigns -> status becomes assigned
    r = client.patch(f"/api/complaints/{cid}", headers=admin_h, json={"assignee_id": tech["id"]})
    assert r.status_code == 200
    assert r.json()["status"] == "assigned"
    assert r.json()["assignee"]["id"] == tech["id"]

    # technician starts and resolves
    r = client.patch(f"/api/complaints/{cid}", headers=tech["headers"], json={"status": "in_progress"})
    assert r.status_code == 200
    r = client.patch(f"/api/complaints/{cid}", headers=tech["headers"], json={"status": "resolved"})
    assert r.status_code == 200 and r.json()["resolved_at"] is not None

    # technician cannot close
    r = client.patch(f"/api/complaints/{cid}", headers=tech["headers"], json={"status": "closed"})
    assert r.status_code == 403

    # student rates and closes
    r = client.post(f"/api/complaints/{cid}/feedback", headers=student_h, json={"rating": 5, "feedback": "Great"})
    assert r.status_code == 200 and r.json()["rating"] == 5
    r = client.patch(f"/api/complaints/{cid}", headers=student_h, json={"status": "closed"})
    assert r.status_code == 200 and r.json()["status"] == "closed"

    # the audit trail recorded each step
    detail = client.get(f"/api/complaints/{cid}", headers=student_h).json()
    assert len(detail["activity"]) >= 5


def test_privacy_between_students(client, student_h, other_student_h):
    cid = client.post("/api/complaints", headers=student_h, json=COMPLAINT).json()["id"]
    assert client.get(f"/api/complaints/{cid}", headers=other_student_h).status_code == 404
    ids = [c["id"] for c in client.get("/api/complaints", headers=other_student_h).json()["items"]]
    assert cid not in ids


def test_comments(client, student_h):
    cid = client.post("/api/complaints", headers=student_h, json=COMPLAINT).json()["id"]
    r = client.post(f"/api/complaints/{cid}/comments", headers=student_h, json={"body": "Any update?"})
    assert r.status_code == 201
    assert r.json()["comments"][0]["body"] == "Any update?"


def test_validation_message(client, student_h):
    bad = {**COMPLAINT, "title": "no"}
    r = client.post("/api/complaints", headers=student_h, json=bad)
    assert r.status_code == 422
    assert "title" in r.json()["detail"]


def test_search_and_filters(client, student_h):
    client.post("/api/complaints", headers=student_h, json={**COMPLAINT, "title": "Leaking pipe in hostel", "category": "Plumbing"})
    r = client.get("/api/complaints", headers=student_h, params={"q": "leaking"})
    assert r.json()["total"] >= 1
    r = client.get("/api/complaints", headers=student_h, params={"category": "Plumbing"})
    assert all(c["category"] == "Plumbing" for c in r.json()["items"])


def test_stats_and_admin_users(client, admin_h, student_h):
    s = client.get("/api/stats", headers=admin_h).json()
    assert "total" in s and len(s["trend"]) == 14
    assert client.get("/api/users", headers=admin_h).status_code == 200
    assert client.get("/api/users", headers=student_h).status_code == 403


def test_attachment_upload(client, student_h):
    cid = client.post("/api/complaints", headers=student_h, json=COMPLAINT).json()["id"]
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
    r = client.post(f"/api/complaints/{cid}/attachment", headers=student_h,
                    files={"file": ("a.png", png, "image/png")})
    assert r.status_code == 200 and r.json()["image_path"].endswith(".png")
    bad = client.post(f"/api/complaints/{cid}/attachment", headers=student_h,
                      files={"file": ("a.txt", b"hello", "text/plain")})
    assert bad.status_code == 415


def test_admin_and_technician_cannot_file_complaints(client, admin_h, tech):
    assert client.post("/api/complaints", headers=admin_h, json=COMPLAINT).status_code == 403
    assert client.post("/api/complaints", headers=tech["headers"], json=COMPLAINT).status_code == 403


def test_technician_only_sees_assigned_jobs(client, admin_h, student_h, tech):
    cid = client.post("/api/complaints", headers=student_h, json=COMPLAINT).json()["id"]
    ids = [c["id"] for c in client.get("/api/complaints", headers=tech["headers"]).json()["items"]]
    assert cid not in ids
    assert client.get(f"/api/complaints/{cid}", headers=tech["headers"]).status_code == 404
    client.patch(f"/api/complaints/{cid}", headers=admin_h, json={"assignee_id": tech["id"]})
    ids = [c["id"] for c in client.get("/api/complaints", headers=tech["headers"]).json()["items"]]
    assert cid in ids


def test_technician_request_flow(client, admin_h, student_h, tech):
    body = {"kind": "Spare parts or materials", "subject": "Need new tube lights",
            "message": "Ten tube lights are needed for the science block corridor."}
    r = client.post("/api/requests", headers=tech["headers"], json=body)
    assert r.status_code == 201
    rid = r.json()["id"]

    # only technicians can send, only technicians/admins can read
    assert client.post("/api/requests", headers=student_h, json=body).status_code == 403
    assert client.post("/api/requests", headers=admin_h, json=body).status_code == 403
    assert client.get("/api/requests", headers=student_h).status_code == 403

    # a job that isn't theirs is rejected
    other = client.post("/api/complaints", headers=student_h, json=COMPLAINT).json()["id"]
    bad = client.post("/api/requests", headers=tech["headers"], json={**body, "complaint_id": other})
    assert bad.status_code == 422

    # admin sees it and replies; status moves to acknowledged
    assert any(x["id"] == rid for x in client.get("/api/requests", headers=admin_h).json())
    r = client.patch(f"/api/requests/{rid}", headers=admin_h, json={"reply": "Approved, collect from stores."})
    assert r.status_code == 200 and r.json()["status"] == "acknowledged"

    # technician cannot change it, but can read the reply
    assert client.patch(f"/api/requests/{rid}", headers=tech["headers"], json={"status": "resolved"}).status_code == 403
    mine = client.get("/api/requests", headers=tech["headers"]).json()
    assert mine[0]["admin_reply"].startswith("Approved")


def test_no_default_admin_without_env(client):
    # the owner's credentials come only from the environment (set in conftest)
    r = client.post("/api/auth/login", json={"email": "admin@campus.edu", "password": "Admin@12345"})
    assert r.status_code == 401
