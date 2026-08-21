# Security

ArchStudio is a **single-user, self-hosted** tool. It ships no authentication, and that is a
design decision rather than an oversight — the threat model below says where that decision stops
being reasonable, and what does count as a bug worth reporting.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting**: this repository's *Security* tab →
*Report a vulnerability*. It opens a private thread; please do not open a public issue for
something exploitable.

> Private reporting has to be switched on once per repository —
> *Settings → Code security → Private vulnerability reporting*. Until it is, that tab has no
> button and this paragraph is a dead end.

Expect a first reply within a week. This is a spare-time project — there is no on-call, and no
bounty.

Supported: **the latest commit on `main`.** There are no maintained release branches, so a fix
means an upgrade.

## The threat model, stated plainly

The intended deployment is one person, or one team, running the app on a machine only they can
reach — a laptop, a VPS behind a VPN, a container on a Tailscale network. Everything below
follows from that.

### Not vulnerabilities

**There is no authentication, and no authorisation.** Anyone who can reach the port can read,
edit, export and delete every project — and, with the Admin CMS, publish or replace content
domains under `/admin` and `/api/admin/**`. This is documented in the README, and the fix is a
reverse proxy, a VPN, or the middleware the README describes — not a report.

**An instance exposed to the open internet is compromised by design.** Reporting that a
public instance can be edited by anyone is reporting the documented behaviour.

**`node:sqlite` is marked experimental by Node.** That is a stability caveat, not a
vulnerability.

**Your own content can contain HTML.** See below — authoring markup in your own document is the
feature, not the bug. What matters is where that content came from.

### Real, and worth reporting

**Anything that turns *someone else's* document into code execution in your session.** Prose
fields — `intro`, `principle`, `role`, section bodies, notes — are rendered as HTML on purpose,
so that `<b>`, `<i>` and `<code>` work. That rendering does **not** sanitise, and the allow-list
in the code comment is documentation, not enforcement.

That is harmless while every document is one you typed. It stops being harmless at the two points
where a document arrives from elsewhere:

- **Import.** `/api/projects/import` accepts arbitrary JSON or a `window.ARCHITECTURE = {…}`
  file. A document someone sends you can carry markup that runs when you open it in the editor,
  with same-origin access to an API that has no authentication in front of it.
- **Export.** The self-contained HTML you email to a client carries that markup with it, and runs
  it in *their* browser.

The **Preview** tab is already sandboxed (`sandbox="allow-scripts"`, deliberately without
`allow-same-origin`), so the preview is not the hole. The editor and the printable document route
render in the main origin, and are.

If you have a concrete path from an imported or exported document to code execution, or to
reading anything outside that document, please report it.

**Also worth reporting:**

- Path traversal or arbitrary file write via `DATABASE_PATH`, import, or export
- SQL injection — every query lives in `src/lib/store.ts` and should be parameterised; a
  concatenated one is a bug
- A crafted document that makes the server write outside `data/`, exhaust memory, or hang
- Anything that escapes the Preview iframe's sandbox
- Dependency advisories with a *practical* path to exploitation here, not just a matching version

## Known issues, already counted

**`sharp` / `libvips` high-severity advisories** (CVE-2026-33327, -33328, -35590, -35591) reach us
transitively through Next 15. `npm audit` reports three high findings. The only upgrade path is
Next 16, which is a breaking change; until that migration happens the advisories stand. ArchStudio
does not itself process untrusted images, so the exposure is Next's image optimiser, which this
app does not use for user-supplied input.

CI runs `npm audit` on every push and reports the full output, but only fails on `critical` — a
build that is permanently red teaches everyone to ignore it.

**No sanitisation on prose fields**, as described above. Fixing it properly means an allow-list
sanitiser applied in all three renderers at once (the editor, `viewer/engine.js`, and the print
renderer), so that the exported file and the studio agree. It is tracked, not forgotten.
