"""Emit public build artifacts as bounded records for connector retrieval.

Only explicitly named repository-relative paths are accepted. Never pass secrets.
"""
import base64
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
for pattern in sys.argv[1:]:
    for path in sorted(ROOT.glob(pattern)):
        if not path.is_file() or not path.resolve().is_relative_to(ROOT):
            continue
        encoded = base64.b64encode(path.read_bytes()).decode()
        chunks = [encoded[i:i + 24000] for i in range(0, len(encoded), 24000)] or [""]
        for index, chunk in enumerate(chunks):
            print("KHONSU_ARTIFACT=" + json.dumps({"path": path.relative_to(ROOT).as_posix(),
                  "part": index, "total": len(chunks), "data": chunk}), flush=True)
