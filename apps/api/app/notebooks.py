"""Small, bounded private notebooks. Credentials are hashed and never put in URLs."""
import hashlib
import os
from pathlib import Path
import sqlite3
from contextlib import closing

from .jobs import JobError
from .schemas import NotebookDocument, NotebookRecord, NotebookWrite

MAX_NOTEBOOKS = 1000
MAX_DATABASE_CONTENT = 256 * 1024 * 1024
MAX_BODY_BYTES = 4 * 1024 * 1024


class NotebookRepository:
    def __init__(self, path: Path):
        self.path = path

    def connect(self):
        connection = sqlite3.connect(self.path, timeout=5)
        connection.execute("CREATE TABLE IF NOT EXISTS notebooks (key_hash TEXT PRIMARY KEY, revision INTEGER NOT NULL, document TEXT NOT NULL)")
        return connection

    def read(self, key: str) -> NotebookRecord:
        with closing(self.connect()) as db:
            row = db.execute("SELECT revision, document FROM notebooks WHERE key_hash = ?", (hashlib.sha256(key.encode()).hexdigest(),)).fetchone()
        return NotebookRecord(revision=row[0], document=NotebookDocument.model_validate_json(row[1])) if row else NotebookRecord(revision=0, document=None)

    def write(self, key: str, value: NotebookWrite) -> NotebookRecord:
        hashed = hashlib.sha256(key.encode()).hexdigest()
        payload = value.document.model_dump_json()
        if len(payload.encode()) > MAX_BODY_BYTES:
            raise JobError(413, "NOTEBOOK_TOO_LARGE", "Export and remove some notes before saving more.")
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision, length(CAST(document AS BLOB)) FROM notebooks WHERE key_hash = ?", (hashed,)).fetchone()
            revision = row[0] if row else 0
            if revision != value.revision:
                raise JobError(409, "NOTEBOOK_CONFLICT", "Another tab saved this notebook. Choose which copy to keep.")
            count, size = db.execute("SELECT count(*), coalesce(sum(length(CAST(document AS BLOB))), 0) FROM notebooks").fetchone()
            if (not row and count >= MAX_NOTEBOOKS) or size - (row[1] if row else 0) + len(payload.encode()) > MAX_DATABASE_CONTENT:
                raise JobError(507, "NOTEBOOK_CAPACITY", "The notebook database is full. Your browser copy can still be exported.")
            db.execute("INSERT INTO notebooks VALUES (?, ?, ?) ON CONFLICT(key_hash) DO UPDATE SET revision=excluded.revision, document=excluded.document", (hashed, revision + 1, payload))
        return NotebookRecord(revision=revision + 1, document=value.document)


def notebook_repository():
    path = os.environ.get("KHONSU_NOTEBOOK_DB")
    if not path:
        raise JobError(503, "NOTEBOOK_UNAVAILABLE", "Database storage is not configured. Notes remain in this browser.")
    return NotebookRepository(Path(path))


class NotebookBodyLimit:
    """Bound bytes before JSON parsing, including chunked bodies without a length."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != "/v1/notebook" or scope["method"] != "PUT":
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                from starlette.responses import JSONResponse
                return await JSONResponse({"code": "NOTEBOOK_TOO_LARGE", "message": "Notebook request exceeds 4 MiB.", "details": []}, status_code=413)(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        pending = True
        async def bounded_receive():
            nonlocal pending
            if pending:
                pending = False
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        await self.app(scope, bounded_receive, send)
