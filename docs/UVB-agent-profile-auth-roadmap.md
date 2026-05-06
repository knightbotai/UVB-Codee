# UVB Agent, Profile, and Remote Auth Roadmap

Last updated: 2026-05-06

This note captures the production path for the new Sophia/Nightbot agent controls, multi-user profile layer, skill intake, and future remote access through `daplab.net` / `tacimpulse.net`.

## What Is Real Now

- `Settings > Agent Tools` stores Sophia permissions for browser use, web research, coding, local computer use, terminal/file/git/network access, provider fallback, and audit preferences.
- `/api/agent/jobs` stores supervised jobs for deep research, browser use, local coding, and computer use in `.uvb/agent-jobs.json`.
- Telegram commands `/research`, `/browser`, `/code`, and `/computer` queue supervised agent jobs instead of pretending autonomous execution is already live.
- `/api/agent/skills` stores external SKILL.md-style candidates in `.uvb/agent-skills.json` with registry/source URL, trust tier, approve/block state, and local risk scan.
- `Settings > Profile > Account Profiles` creates separate local user records with username, email, role, Telegram chat ID, remote domains, access modes, auth providers, notes, and PBKDF2 password hashes.
- `/api/auth/readiness` reports whether local password, Google OIDC, and passkey/WebAuthn prerequisites are configured.

## Remote Access Shape

Target domains:

- `tacimpulse.net`
- `daplab.net`

The clean deployment path is:

1. Run UVB locally on the private host.
2. Put Cloudflare Tunnel or another reverse proxy in front of UVB.
3. Set `UVB_PUBLIC_URL` to the HTTPS origin, for example `https://uvb.tacimpulse.net`.
4. Configure Google OAuth callback:
   - `${UVB_PUBLIC_URL}/api/auth/google/callback`
5. Configure passkeys:
   - `UVB_PASSKEY_RP_ID=tacimpulse.net` or `daplab.net`
   - `UVB_PASSKEY_ORIGIN=https://uvb.tacimpulse.net`
6. Keep `.uvb/` untracked and backed up privately, because it contains local profile/job/skill state.

## Auth Environment

Add these to local runtime config when remote auth is ready:

```env
UVB_PUBLIC_URL=https://uvb.tacimpulse.net
UVB_GOOGLE_CLIENT_ID=
UVB_GOOGLE_CLIENT_SECRET=
UVB_PASSKEY_RP_ID=tacimpulse.net
UVB_PASSKEY_ORIGIN=https://uvb.tacimpulse.net
```

Current readiness endpoint:

```text
GET /api/auth/readiness
```

Next auth endpoints to implement:

- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `POST /api/auth/passkey/register/options`
- `POST /api/auth/passkey/register/verify`
- `POST /api/auth/passkey/login/options`
- `POST /api/auth/passkey/login/verify`
- `POST /api/auth/logout`
- session cookie middleware for remote browser access

## Agent Execution Runner

The job queue is now the control plane. The missing execution layer should be a separate supervised runner that reads approved jobs and writes results back.

Recommended runner phases:

1. Read-only research runner
   - Pull approved `deep-research` jobs.
   - Use browser/search tools.
   - Save cited summaries and source lists back to the job record.

2. Browser-use runner
   - Pull approved `browser-use` jobs.
   - Use Playwright/browser-use with screenshots and domain checks.
   - Pause for approval before login, purchase, posting, deletion, or data export.

3. Coding runner
   - Pull approved `coding` jobs.
   - Restrict edits to `workspaceRoot`.
   - Block `.env*`, `.git`, `node_modules`, and user-configured blocked paths.
   - Attach diffs/check results before commit/push.

4. Computer-use runner
   - Start read-only.
   - Add Windows UI Automation only after the browser/coding runners are stable.
   - Require explicit approval for OS-level clicks, typing, file movement, or shell launch.

## Skill Intake Rules

External skills are metadata until reviewed.

Do not auto-install a skill just because it appears in a registry. The safe flow is:

1. Stage skill candidate in `Settings > Agent Tools > Agent Skill Intake`.
2. Review source URL and SKILL.md content.
3. Check scan warnings.
4. Approve or block.
5. Only approved skills should be visible to a future runner.
6. Any skill that runs shell, downloads code, touches credentials, or modifies files must require an approval gate.

## Profile Rules

Local profiles are the identity map for future remote and Telegram sessions.

- Use `owner` for Richard.
- Use `collaborator` for Jusstin.
- Store real email addresses in profile records.
- Link Telegram by chat ID when available.
- Enable `remote-browser` only when HTTPS auth is ready.
- Use Google/passkey providers only after `/api/auth/readiness` reports them configured.
- Never store plaintext passwords; `/api/profiles` stores PBKDF2 hashes.

## Next Best Implementation Targets

Highest value next:

1. Implement real session middleware and local login for `Account Profiles`.
2. Implement Google OIDC start/callback and map Google subject IDs to profiles.
3. Implement passkey registration/login.
4. Build the read-only deep research runner for approved `/api/agent/jobs`.
5. Build a Memory retrieval injector that cites local memories and Telegram thread logs.
6. Wire Chatterbox/MOSS/VibeVoice clone-profile adapters into `/api/tts`.

