"""Recreate the local Compose API and verify an isolated notebook survives.

This expires active temporary science jobs. It never removes the notebook volume
or accesses a visitor's notes. Run after `docker compose up --build -d --wait`.
"""
import json
from pathlib import Path
import secrets
import subprocess
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
KEY = secrets.token_hex(32)
URL = "http://localhost:8000/v1/notebook"


def request(method, value=None):
    body = None if value is None else json.dumps(value).encode()
    headers = {"X-Khonsu-Notebook": KEY, "Content-Type": "application/json"}
    with urlopen(Request(URL, data=body, headers=headers, method=method), timeout=15) as response:
        return json.load(response)


document = {
    "candidate_snapshot": json.dumps({"schema": "khonsu-candidates", "version": 2, "candidates": [], "sequences": {}}),
    "observation_notes": [{"id": "restart-check", "text": "Isolated container persistence test, not an astronomical observation.",
                           "created_at": "2026-11-16T03:00:00Z", "updated_at": "2026-11-16T03:00:00Z",
                           "sequence": None, "frame_id": None}],
}
assert request("GET") == {"revision": 0, "document": None}
saved = request("PUT", {"revision": 0, "document": document})
subprocess.run(["docker", "compose", "up", "-d", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "90", "api"], cwd=ROOT, check=True)
restored = request("GET")
assert restored == saved, "Notebook changed or disappeared after API recreation"
document["observation_notes"] = []
assert request("PUT", {"revision": restored["revision"], "document": document})["revision"] == 2
report = {"container_recreated": True, "notebook_retained": True, "isolated_test_note_removed": True}
output = ROOT / ".cache/guided-notebook/docker-restart.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
