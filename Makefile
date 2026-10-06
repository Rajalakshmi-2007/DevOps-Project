.PHONY: install dev test lint docker

install:
	cd backend && pip install -r requirements-dev.txt

dev:
	cd backend && uvicorn app.main:app --reload --port 8000

test:
	cd backend && pytest -q

lint:
	cd backend && ruff check .

docker:
	docker compose up --build
