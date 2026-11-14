"""Resolve development assets without assuming repository directory depth."""

from pathlib import Path


def fixture_directory(module_file: Path, configured: str | None) -> Path:
    if configured:
        # Containers set this explicitly. Do not inspect a repository layout
        # before honoring configuration: /app/app/main.py has few ancestors.
        return Path(configured).resolve()
    for ancestor in module_file.resolve().parents:
        candidate = ancestor / "fixtures"
        if candidate.is_dir():
            return candidate
    # A missing optional demo is handled by the route as a stable HTTP 503.
    return (Path.cwd() / "fixtures").resolve()
