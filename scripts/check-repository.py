"""Check contributor documentation, local links and skill metadata."""

from pathlib import Path
import re
import subprocess
import sys

import yaml

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "README.md", "AGENTS.md", "CONTRIBUTING.md", "compose.yaml",
    "docs/mvp.md", "docs/architecture.md", "docs/ownership.md",
    "docs/integration.md", "docs/design-system.md", "docs/viewer-interactions.md",
    "docs/data-sources.md", "docs/science-integrity.md", "docs/deployment.md",
    "docs/testing.md", "contracts/openapi.json",
]


def main() -> int:
    errors: list[str] = []
    for name in REQUIRED:
        if not (ROOT / name).is_file():
            errors.append(f"Missing required file: {name}")
    tracked = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    ).decode().split("\0")
    paths = sorted({ROOT / name for name in tracked if name})
    for path in paths:
        if not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        label = path.relative_to(ROOT).as_posix()
        for line, value in enumerate(content.splitlines(), start=1):
            if "\u2014" in value:
                errors.append(f"{label}:{line}: forbidden punctuation U+2014")
        if path.suffix == ".md":
            # Only file links are checked. Remote URLs and in-page anchors need review.
            for target in re.findall(r"\]\(([^)]+)\)", content):
                target = target.strip("<>").split("#", 1)[0]
                if not target or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
                    continue
                target = target.split(' "', 1)[0]
                resolved = (path.parent / target).resolve()
                if not resolved.is_relative_to(ROOT.resolve()) or not resolved.exists():
                    errors.append(f"{label}: broken local link: {target}")
    skills = sorted((ROOT / ".agents" / "skills").glob("*/SKILL.md"))
    if len(skills) != 6:
        errors.append(f"Expected six foundation skills, found {len(skills)}")
    for skill in skills:
        source = skill.read_text(encoding="utf-8")
        if not source.startswith("---\n"):
            errors.append(f"{skill.parent.name}: missing YAML frontmatter")
            continue
        try:
            front = yaml.safe_load(source.split("---", 2)[1])
            if set(front) != {"name", "description"}:
                errors.append(f"{skill.parent.name}: unexpected frontmatter fields")
            if front.get("name") != skill.parent.name or not front.get("description"):
                errors.append(f"{skill.parent.name}: invalid name or description")
            meta = yaml.safe_load((skill.parent / "agents" / "openai.yaml").read_text())
            ui = meta["interface"]
            if not 25 <= len(ui["short_description"]) <= 64:
                errors.append(f"{skill.parent.name}: short description must be 25..64 characters")
            if f"${skill.parent.name}" not in ui["default_prompt"]:
                errors.append(f"{skill.parent.name}: prompt does not mention the skill")
        except (ValueError, KeyError, TypeError, OSError, yaml.YAMLError) as exc:
            errors.append(f"{skill.parent.name}: invalid skill metadata: {exc}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"Repository checks passed for {len(paths)} files and {len(skills)} skills.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
