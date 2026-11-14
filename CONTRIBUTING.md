# Contributing to Khonsu

Contributors beyond the original five engineers are welcome. Start with the README, `docs/mvp.md`, `docs/ownership.md`, and a small Ready issue on the project board. During the hackathon, prioritize a working real-data journey and acceptance failures.

1. Comment on the issue with the intended scope and the feature owner you need for review. Avoid starting a duplicate implementation.
2. Fork the repository if you do not have write access. Create a short branch such as `feat/12-epoch-scrubber` or `fix/24-empty-result`.
3. Follow the local setup and relevant task skill in `.agents/skills/`. Humans can read the same instructions; an agent is optional.
4. Respect folder boundaries and shared-file coordination. Avoid unrelated dependency, formatting or generated-file changes.
5. Add meaningful checks for new behavior, validate relevant acceptance criteria, and update affected docs. Keep fixtures small and traceable. Never commit archive credentials, private notes, large FITS archives or unlicensed assets.
6. Open a pull request using the template. Link the issue, show what changed, explain verification and limitations, and attach screenshots for visible behavior.
7. Address review feedback and rerun relevant checks. Maintainers merge once acceptance criteria and checks pass.

The repository's `.mcp.json` declares Linear's hosted MCP server (`https://mcp.linear.app/mcp`) for Claude Code. Claude Code asks you to approve this project server the first time; then run `/mcp`, choose `linear` and sign in with your own Linear account in the browser. The file holds no token, and the server is optional: decline it if you do not use Linear.

Use explicit coordinate and time units, plain language, descriptive error states and accessible controls. Never use the em dash character in authored content. Do not present synthetic fixtures as observations or candidates as confirmed discoveries.

Code contributions use the repository's MIT license. External data, fonts, images and models need their own source and terms recorded in `docs/assets.md` or `docs/data-sources.md`. Do not copy Marvel assets, Dribbble artwork, or NASA marks into product branding.

For a suspected security problem, avoid posting credentials or a working exploit publicly. Contact the repository owner through their GitHub profile contact options if available. For ordinary bugs, include reproducible steps, expected behavior, actual behavior, data mode and safe source identifiers.
