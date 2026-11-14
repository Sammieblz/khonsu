# Linear workspace and MCP setup

Audience: coding agents helping a ByteBoyz contributor join the team's Linear workspace and connect their AI client to it through Linear's hosted MCP server. Walk the user through these steps in order. Run what you can; hand the browser steps to the user and wait for them.

Source: [Linear MCP documentation](https://linear.app/docs/mcp). Recheck it if a step below no longer matches what the user sees.

## Rules for agents

- Never ask the user for a Linear password, API key, OAuth code or callback URL. Sign-in happens in the user's own browser.
- You cannot complete the OAuth sign-in yourself. Tell the user exactly what to click, then continue once they confirm.
- Use the hosted server `https://mcp.linear.app/mcp` (Streamable HTTP). Do not create a Linear OAuth application or API key for this setup; the hosted server registers the client automatically during sign-in.
- Use `/sse` only for the WSL fallback below; Linear documents it as deprecated.
- Keep the invite link inside the team. Do not post it in issues, pull requests, public chats or other repositories.
- Verify with read-only calls. Do not create, edit or comment on Linear issues just to test the connection.

## Step 1: Join the ByteBoyz workspace

The user must be a workspace member before signing in to the MCP server; otherwise the Linear consent screen will not offer ByteBoyz.

1. Ask the user to open the invite link in a browser: https://linear.app/byteboyz/join/fad762dd1ad2908a34106b480f6a90fe?s=0
2. They sign in to Linear, or create an account with the email they want on the team, and accept the invitation.
3. Confirm they can open the workspace at `https://linear.app/byteboyz`.

## Step 2: Add the server to the user's client

Identify the user's client first. The Claude Code extension for VS Code is Claude Code, not VS Code's built-in MCP support.

### Claude Code (CLI or IDE extension)

- **Inside this repository:** the root `.mcp.json` declares the server as `linear`. On first use Claude Code asks the user to approve the project's MCP servers; they approve `linear`.
- **Outside this repository, or if `.mcp.json` is absent on their branch:** add it for the user across all projects:

  ```sh
  claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp
  ```

- MCP servers load when a session starts. After adding the server or approving it, the user starts a new Claude Code session.
- `claude mcp get linear` shows the scope and status. `Pending approval` means the user has not yet approved the project server.

### Codex (CLI or IDE extension)

Enable the remote MCP client in `~/.codex/config.toml`:

```toml
[features]
experimental_use_rmcp_client = true
```

Then run `codex mcp add linear --url https://mcp.linear.app/mcp`. This prompts the user to sign in. If the server was added by editing `config.toml` instead, run `codex mcp login linear`.

### Cursor

Search for Linear on Cursor's MCP tools page and install it, or use the install link on the [Linear MCP documentation](https://linear.app/docs/mcp) page.

### VS Code built-in MCP support

Requires Node.js.

1. Press `CTRL/CMD + P` and run **MCP: Add Server**.
2. Choose **Command (stdio)** and enter `npx mcp-remote https://mcp.linear.app/mcp`.
3. Name it **Linear**.
4. Run **MCP: List Servers**, select **Linear**, then **Start Server**.

### Windsurf

Open settings (`CTRL/CMD + ,`), go to **Cascade > MCP servers**, choose **Add Server > Add custom server**, and add:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
    }
  }
}
```

### Zed

Open settings (`CMD + ,`) and add:

```json
{
  "context_servers": {
    "linear": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"],
      "env": {}
    }
  }
}
```

### Claude.ai and Claude Desktop

The user adds the Linear connector under **Settings > Connectors**. On Team and Enterprise plans it is at https://claude.ai/customize/connectors. A connector added here also appears in Claude Code sessions signed in with the same claude.ai account. In that case, do not add a second Linear server through Claude Code.

### Other MCP clients

Configure command `npx`, arguments `-y mcp-remote https://mcp.linear.app/mcp`, and no environment variables.

## Step 3: Sign in and choose ByteBoyz

- **Claude Code:** the user types `/mcp`, selects `linear`, chooses to authenticate, and completes the browser flow.
- **Codex:** the user follows the sign-in prompt from `codex mcp add`, or runs `codex mcp login linear`.
- **Other clients:** the user follows the client's own sign-in prompt.

On Linear's consent screen, the user must select the **ByteBoyz** workspace before authorizing. If they belong to several Linear workspaces, a different one may be preselected.

## Step 4: Verify

Once the user confirms they have signed in, call a read-only Linear tool, such as listing teams or the user's assigned issues. Confirm that the results come from the ByteBoyz workspace. In Claude Code the tools appear as `mcp__linear__*`. If the user connected through claude.ai instead, the tools carry a `claude_ai` prefix.

If the tools are missing, the session probably started before the server was added or approved. Ask the user to start a new session.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Signed in to the wrong workspace | Each workspace needs its own sign-in. Clear the server's saved authentication from the client's MCP settings (in Claude Code, through `/mcp`), sign in again and select ByteBoyz. |
| Internal server error with an `mcp-remote` client | Clear saved auth with `rm -rf ~/.mcp-auth`, then reconnect. Update Node.js if it is old. |
| Connection dropped or not responding | Disconnect and reconnect the server in the client's MCP settings. This does not affect Linear data or the sign-in. |
| WSL on Windows fails | Use Linear's documented fallback: `{"mcpServers": {"linear": {"command": "wsl", "args": ["npx", "-y", "mcp-remote", "https://mcp.linear.app/sse", "--transport sse-only"]}}}` |
| User wants Claude to read only | Use `https://mcp.linear.app/mcp/readonly`, which exposes only read tools. |
| Invite link rejected or expired | A ByteBoyz workspace admin can send a new invite. Do not look for other ways in. |
