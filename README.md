# ArchStudio

[![CI](https://github.com/tonux/archstudio/actions/workflows/ci.yml/badge.svg)](https://github.com/tonux/archstudio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-0E7C8A.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.13-0E7C8A.svg)](#architecture-of-the-app-itself)

**Draw the architecture once. Send the document.**

A self-hosted studio for architecture documentation. Organise many architectures in folders,
build each one by dragging components onto layers, and export a self-contained HTML file anyone
can open.

```bash
npm install
npm run dev          # http://localhost:3000
```

That is the whole setup. No database server, no accounts, no cloud. A SQLite file appears at
`data/studio.db` on first run, seeded with one example architecture in an *Examples* folder so
the editor has something to open. Delete the folder and it is gone for good.

---

## Screenshots

The editor — layers as rows, scopes in the left rail, and the inspector editing whatever is
selected. Here it holds the document's own fields: name, headline, introduction, principle,
language, theme.

![The ArchStudio editor: a layered architecture diagram with the document inspector open on the right](screenshots/editor.png)

The **Preview** tab renders the exported file itself, in an iframe. Hovering a component dims
everything it does not touch, so a dependency reads at a glance — here, the worker and the three
data stores it writes to.

![The preview tab with a component hovered: its dependencies stay lit while the rest of the diagram fades](screenshots/preview-dependencies.png)

Clicking one opens its panel: role, technologies, responsibilities, and who depends on it in
which direction. The same panel ships inside the exported HTML.

![The preview with a component panel open, showing role, technologies, responsibilities and callers](screenshots/preview-component.png)

**Past about two dozen components the diagram reorganises itself.** Each layer splits into one
column per scope instead of one long wrapping row, and the cards drop to their icon and name so
twice as many fit — both switchable from the toolbar, and both settable up front with
`ui.architecture.cluster` and `ui.architecture.compact`. The sheet also gains a scale: **Fit**
finds the largest size at which the whole thing is on screen at once, Ctrl (or ⌘) and the wheel
zooms, dragging the paper pans it, and the last button takes the diagram full screen — with its
toolbar, because a full screen you cannot filter or zoom is a poster. Zooming out reflows rather
than shrinking away from the edge of the frame, so a smaller scale means more components per row
and not just smaller type.
Filtering by scope takes the emptied columns out of the sheet rather than fading them, so the
drawing actually gets shorter when you narrow it. Printing ignores all of it and lays the
diagram out whole, at 1:1.

---

## What it does

**Workspace** — every architecture is a project. Projects live in nested folders you create;
drag a project card onto a folder in the sidebar to move it. Search across all of them.

**Editor** — the canvas is your architecture. Layers are rows; drag components between them, drag
a component onto another to reorder, drag the dot under a card onto another card to create a
dependency. The inspector on the right edits whatever is selected — name, scope, layer, icon,
technologies, role, responsibilities, dependencies. Nothing has a Save button: edits persist
700 ms after you stop typing.

**Dependencies say how, not just who.** Open a dependency in the inspector and it takes a
protocol, a note, and one of three kinds — synchronous, asynchronous, batch. The kind is drawn
rather than written: a solid line waits for its answer, a dashed one is queued, a dotted one is
scheduled. It is the *stroke* and not the colour because colour already means scope, and a dash
survives a monochrome print. All of it is optional, and an edge nobody has annotated draws
exactly as it always did.

**Versions** — a diagram that is worth drawing is one that keeps changing, so the **Versions**
button holds the series it went through. **Freeze** the document under a number and a title
(“v1.2 — sent to the client”) and it is kept for good; the live document sits at the head of the
list as **Current**, with how far it has drifted since the last one. A frozen version is a place
you can go rather than a point to subtract from: **view** it in the Preview tab, **export** it to
HTML, SVG, PNG or draw.io, and **print** it — each one carries its own number on its cover and in
the viewer's subtitle, because freezing writes the number into the document itself.

Any two versions can be **compared**, not just each one against now: what changed between the
September board and the October one is a question you can ask. Under the series are the automatic
**snapshots** — one every five minutes while you edit, capped at 30, plus the ones the app writes
before a restore or an enrichment. They are still there and still restorable; naming one promotes
it into the series. Restoring writes a *Before restore* snapshot first, so a restore is itself
undoable.

**Preview** — the preview tab is not a re-implementation. It renders, in an iframe, byte-for-byte
the file you get when you click Export. One renderer, no drift between what you see and what you
ship.

**Export** — a single self-contained HTML file (235–240 KB, no external requests) you can email,
attach to a ticket, commit, or host anywhere. "No external requests" includes the typefaces:
Archivo and Space Mono are inlined as base64, which is most of that weight and the reason the
file looks like the studio on a machine that has never heard of either. Also exports raw JSON,
and an `architecture.js` data file for the standalone viewer.

**Document** — the same architecture as a numbered, printable design document. Print it from the
browser to get a PDF.

**Import** — accepts JSON or a `window.ARCHITECTURE = {…}` data file. Paste it or pick the file.

**Read a document** *(off until you configure a model)* — hand it a design document, an RFC or an
onboarding guide as PDF or Markdown, and it drafts the diagram the document describes: scopes, layers,
components, dependencies, and the role and responsibilities of each. The same reading can be run
against a project that already exists — **Enrich** in the editor — where it can only add: new
components, missing dependencies, and text in the fields you left empty. Nothing you have written
is ever overwritten, and applying leaves a named version in History to go back to.

Nothing is written until you have read what came back. The review screen states what the model
had to assume, what it could not answer, and what had to be repaired before the document could be
opened — a dependency on a component it never defined, an icon that does not exist. Treat all of
it as a draft: it is one reading of one document, and the dependencies especially deserve a
second pair of eyes.

This is the one feature that leaves your machine, so it is opt-in and it is yours to point:
choose a provider in **Settings** — Anthropic, OpenAI, Google Gemini, NVIDIA NIM, Poolside, or
anything that speaks the OpenAI API, including a model running on your own hardware. Configure
nothing and both entry points do not exist. See [Reading documents](#reading-documents).

**Only Anthropic and Gemini can be handed a PDF.** Everything else in that list is text-only —
the file picker narrows to Markdown and plain text on its own, rather than accepting a PDF and
failing after the upload. Convert it first, or point the reading at Claude.

---

## Templates

“New project” opens two steps: pick a starting point, then name it and aim it at a deployment
target. Six templates ship with the app, in English and French:

| Template | Components | What it answers |
|---|---|---|
| Serverless MVP | 15 | “We launch in six weeks, we are two, we do not want servers” |
| Multi-tenant B2B SaaS | 18 | “Several customer companies on one platform, isolated” |
| RAG — questions over documents | 17 | “Answer questions about our own corpus” |
| Event-driven processing | 16 | “Streams, queues, decoupling, replay” |
| Modular monolith | 14 | “One deployable application, well partitioned inside” |
| Multi-service architecture | 19 | “Several teams, several services, each with its own data” |

Each one carries components, dependencies, flows and three to four written sections — the
comparison of tenancy isolation models, the delivery-guarantee table, the “when to leave
serverless” thresholds. That editorial content is the point; the boxes are the easy part.

**Six templates, not thirty.** A template describes an *abstract* architecture, and every
component carries a per-target correspondence table. The target — vendor-neutral, AWS, Google
Cloud, Azure or self-hosted — is resolved once, at creation:

```
Template (abstract)          Target           Generated document
───────────────────          ──────           ──────────────────
"Message queue"        +     AWS        →     Amazon SQS
                             GCP        →     Cloud Pub/Sub
                             Azure      →     Azure Service Bus
                             self-hosted →    RabbitMQ / NATS JetStream
                             neutral    →     Message queue
```

The `id` never changes, so dependencies stay valid. Resolution filters components a target has no
equivalent for, rewires dependencies straight through the gap (and says so, on the component that
lost a hop), drops flow steps that no longer point anywhere, and generates a *Deployment* tab
listing the whole mapping.

A component whose identity is its business domain — “Service — orders”, “Module — billing” —
keeps its name and takes only the technologies from the target. Five service cards all reading
“ECS Fargate” would be a worse diagram than five cards saying what they do.

**A template is a starting point, not a recommendation**, and the app says so three times: in the
creation dialog, in each template's *Not this one when* list (shown before you choose), and in
`meta.principle` at the top of the generated document, where it is impossible to miss.

**The document has no link back to the template.** No inheritance, no “update from template”
that could overwrite someone's work. Adding a cloud means adding a column to
`src/lib/templates/services.ts`, not writing six more templates.

```
src/lib/templates/
  types.ts              the template contract, and the {en,fr} string helper
  services.ts           the cross-target service table — the file to re-read when a vendor renames something
  index.ts              registry + instantiate()
  serverless-mvp.ts  saas-multitenant.ts  rag.ts
  event-driven.ts    monolith.ts          multi-service.ts
  templates.test.ts     6 templates × 5 targets × 2 languages = 60 documents
  __snapshots__/        one digest per template, to catch silent drift
```

Service names were verified on 2026-08-14 and the date is in `services.ts`. They move — Cloud
Functions became Cloud Run functions, Azure AI Foundry became Microsoft Foundry, Azure AD B2C is
closing in favour of Entra External ID. Re-read that file once a year.

```bash
npm test                        # full suite (templates + admin + lego)
npm run test:admin              # admin CMS regression slice (F-REG)
UPDATE_SNAPSHOTS=1 npm test     # accept a deliberate template snapshot change
```

---

## Admin CMS (content without a code PR)

Open **`/admin`** on a local or private deploy. The shell uses the same Atelier chrome as the
editor (teal, square corners, `Fields` / `Icon`). There is **no auth** — same threat model as the
rest of the app ([SECURITY.md](SECURITY.md)): VPN / reverse-proxy / Tailscale only.

| Area | What you edit | Notes |
|---|---|---|
| Catalogue Lego | Bricks, scopes, intents, variants, dependencies, technologies | Create / update / delete; locked seed ids reappear after `ensure` |
| Templates | Project + architecture templates, cloud services | Diagram = same surface as the project editor |
| ADD / Flows | Document section presets, journey patterns | Publish blocked on placeholder markers (`[…]`, « À estimer ») |
| Locale / Import | System copy + layer labels; content bundle export/import | Bundle version `1` |
| Publish | Wizard across all content domains | Validates before write; issues link into editors |

Runtime flag **`CONTENT_FROM_ADMIN=1`**: published admin content feeds project creation, flow
plates, and ADD presets. Flag off keeps the previous code/seed paths.

Docs for reviewers: [`docs/add/README.md`](docs/add/README.md) · regression
[`docs/add/REGRESSION-admin.md`](docs/add/REGRESSION-admin.md).

---

## The identity

*Atelier* — an engineer's tool drawn like a workshop instrument, on the tonux colours.
Marine ink on white paper, one teal for action, monospace for everything the machine knows.
Square corners, hairline rules, no gradients, no shadows.

**The mark is a node and its dependency** — the smallest sentence the product can say. The filled
disc is the service that calls; the open circle is the one that answers. It is not decoration:
every edge the app draws, on the canvas, in the exported viewer and on the printed page, ends in
those same two shapes. That is how direction reads without an arrowhead, and it is the only thing
still carrying direction once hover is gone.

Five rules hold the whole thing together, and each one is written where it is enforced:

1. **A scope colour never touches a border.** It lives on the icon chip and the technology pills.
   Borders stay neutral — five scopes in a row would otherwise be five frames shouting.
2. **Teal is reserved for what you can act on.** Primary actions, selection, the focused field,
   links, the principle callout. No scope uses teal, or selection would be ambiguous.
3. **Monospace says only what the machine knows.** Technologies, paths, ids, chapter numbers,
   counts, timestamps. Prose is Archivo, on screen and on paper alike.
4. **Circles mean "a node in a graph"** — the mark, an edge endpoint, a flow step. Everything else
   is square, including the scope swatches and the card itself.
   **What a component *is* rides on the glyph, not on the outline.** A database is a cylinder on
   its chip and a rectangle as a card, because the outline is the one channel the edges need: an
   endpoint reads as an endpoint only while nothing else on the sheet is round. The set is 61
   glyphs in `src/lib/icons.ts`, drawn on a 24-unit box and stroked white on the scope chip — the
   same 20 px chip and 12 px glyph on the canvas, the printed sheet, the exported viewer *and* the
   SVG/PNG file, which is the surface people actually forward. The draw.io export is the one that
   opts out on purpose: it hands over a named `icon` field and an editable box, because a glyph
   mapped onto the wrong shape from someone else's library is worse than a field you can read.
   **The stroke between them says how the call travels** — solid waits, dashed is queued, dotted
   is scheduled. The endpoints never change: direction must not get quieter because a call is
   asynchronous. The table is `src/lib/links.ts`, mirrored by hand in `viewer/engine.js`, which
   ships inside the export and cannot import it.
5. **Paper does not copy hover, focus, or shadow.** `--shadow` stays a token so the printed sheet
   can set it to `none` rather than delete the rules that use it.

| Token | | |
|---|---|---|
| Layers | `--lt1..--lt6` | a band's label and the rule under it — never a chip |
| Ink | `#0B1B2B` | text, rules, the mark |
| Paper | `#FFFFFF` | surfaces, cards, the printed page |
| Calque | `#EEF3F6` | the canvas ground, the app background |
| Teal | `#0E7C8A` | the single accent — actions and selection only |
| Cyan | `#00E5FF` | **marine ground only, never on white** |
| Scopes | `oklch(0.62 0.11 h)` | h = 200, 250, 290, 340, 150 |

**The layer ramp is the one exception to rule 1, and it is an exception about
position rather than about colour.** A tall landscape has six or seven bands and, before it, one
way to tell them apart: a 10 px monospace label in `--ink-3`. What makes a layer tint safe is that
a scope colour lives on the icon chip and the technology pills, and a layer tint lives on the
band's label and the rule under it — the two never meet on one element, so neither can be read as
the other. The ground was not available: zones already own it at 3–9 % ink, and a second tint
under a zone rectangle makes both unreadable. The ramp is lower in chroma than the scope palette
and spans a wider arc, including warm hues the scope circle never reaches, so a band label never
competes with a card for attention.

It also reads *better* than what it replaced. Against paper the six measure 3.68–4.17:1 where
`--ink-3` measured 2.67:1; on the marine ground, 6.90–7.98:1 against 5.77:1. Six, where scopes
stop at five: that ceiling is an argument about one hue circle at fixed lightness, and this ramp
is neither. Past the sixth band it cycles. `ui.architecture.layerTint: false` emits no custom
property at all, and every rule falls back to the neutral it had before — the off state is the
absence of this look, not a second one to maintain.

Cyan is the one colour with a hard rule attached, and the rule is arithmetic: it sits at 1.5:1
against white and 11.3:1 against ink. So it is the inverted mark, the app icon, and the accent the
dark theme uses — teal at that lightness sinks into the navy and stops reading as actionable.
What sits *on top* of a filled chip flips with the theme, which is why it is a token (`--on-fill`)
rather than a literal: white on paper, ink on marine.

```
src/app/globals.css        the token block — the source of truth for the values
src/components/Brand.tsx   the mark's geometry, and the wordmark
viewer/style.css           the same tokens, for the export and the preview
.../document/document.css  the same tokens again, for the printed sheet
public/fonts/              Archivo and Space Mono, self-hosted, six subsets
```

Three stylesheets carry the same block rather than sharing one, because the viewer has to survive
being torn out of the app and mailed as a single file. When you change a value, change it in all
three — `globals.css` is the one to copy from.

**One known trade-off, measured rather than assumed.** Two things work against the scope
palette's separation: lightness is held constant, which is what makes it flat and even, and the
five hues sit on a cool arc rather than the full circle, which leaves 250° and 290° only 40°
apart. Adjacent pairs measure ΔE 7.4 (OKLab×100) for normal vision, falling to 1.4 under
deuteranopia and 1.9 under protanopia — both at 250°/290° — and 2.4 under tritanopia at
200°/250°. Widening the arc or spreading lightness is a different palette rather than a tweak.
Scope is never carried by colour alone in either medium — the diagram labels every card, and the
legend and the inventory table both name the scope in text — so this degrades rather than fails.
The numbers and the knob are in `src/lib/defaults.ts`.

---

## The document format

Each project stores one JSON document — the same shape the viewer consumes. Its core is:

- **groups** — scopes of responsibility, one colour each. Five is the ceiling: the palette is one
  hue circle at fixed lightness and chroma, so a sixth group wraps onto the first hue.
- **layers** — horizontal bands, top to bottom. From four layers up, the last one is treated as
  *support* and drawn without edges, so the infrastructure row does not turn into spaghetti.
- **components** — anything nameable: an app, an API, a database, a bucket, a vendor.
- **deps** — who calls whom. Direction matters: caller → callee.
- **links** — optional, and only ever a *description* of a dependency `deps` already declares:
  `{ to, kind, protocol, note, state }`. `deps` stays the single source of truth for whether an edge
  exists, so the two cannot disagree — normalisation drops any link whose target is not in
  `deps`, and an edge nobody annotated has no entry at all. That is what keeps a document
  written before this field existed exporting byte-for-byte as it did.
- **zones** — boundaries that cut *across* the layers. See below.

Beyond that the format carries `flows`, `technologies` and editorial `sections`
(`compare`, `cards`, `timeline`, `table`, `text`), all edited from the **Content** tab, plus the
one optional field the printable document reads — `sections[].doc.chapter`. See
`src/lib/types.ts` for the full contract.

---

## The landscape reading

Four fields turn the diagram from a picture of a system into the kind of drawing an
enterprise architect brings to a steering committee: a *landscape*. Every one of them is
optional, and every one of them is absent from a document that does not use it — so nothing
here changed a single diagram that already existed.

**The constraint that shaped all four.** The reference diagrams in the wild encode this in
colour: blue boxes for new, yellow for updated, hatched red for removed, a red badge for SSO.
Colour here belongs to scope (rule 1) and teal to what the reader can act on (rule 2). So the
four additions take the channels colour never claimed — the card's border, a monospace tick,
the stroke weight, a plate on the line, a glyph in the header row. The side effect is that all
of it survives a monochrome print and a reader who cannot separate two hues, which a hatched
red box does not.

### The protocol, on the line

`ui.architecture.defaultProtocol: "REST"` names the protocol the architecture speaks, and only
the edges that depart from it get a label — the "all calls are REST unless the line says
otherwise" convention, which is also printed in words under the diagram. `protocolLabels`
overrides what that implies: `all` labels every annotated edge, `off` keeps the sentence and
drops the plates. Name nothing and no plate is drawn at all.

The plate sits on the curve's midpoint, computed rather than measured: for the cubic the
renderers draw, `t = .5` collapses to `((x1+x2)/2, (y1+y2)/2 + 3(k1+k2)/8)`. A cross-layer edge
labels on its straight-line midpoint; a within-layer edge labels on the belly of its arc instead
of inside the row it passes under.

### The transition

`component.state` and `link.state` take `new`, `changed` or `removed`. Unset means "already
there", which is the common case and stays unwritten.

```
new      dashed border, tick NEW, heavier stroke, "+" in the plate
changed  border pulled to full ink, tick MOD, heavier stroke, "~"
removed  name struck, chip drained of its scope colour, tick DEL, ghosted line, "-"
```

**This is the field that makes a landscape worth keeping.** A landscape diagram is a picture of
a *delta*, which is why it survives a year of committees on one page: you present the same
drawing and move the marks. The toolbar gains **Transition** — on, the sheet shows the delta;
off, the removals leave the flow entirely and what is left is the state you are heading for. An
edge goes with it when it is retired *or* when either of its ends is: a dependency on something
that will not be there is not a dependency that survives. `ui.architecture.transition` sets
where the toggle starts; unset is on as soon as the document marks anything.

History names the direction — `transition: existing → removed` — rather than reporting that a
field moved. Marking a component for removal is the most consequential edit this format allows,
and History is where someone decides whether to undo it.

### Security marks

`component.marks` is a closed set — `public`, `basic-auth`, `sso`, `secured`, `pii` — drawn as
glyphs in the card's header row and always accompanied by a key. Weakest protection first, in
both, because that is the reading a review scans for. The free-text `badge` stays for the one
word that fits no category.

Closed, not free text, for three reasons: the glyphs can have a legend, the viewer's search box
can find every unauthenticated endpoint by typing either `sso` or `no authentication`, and
`"SSO"` / `"sso"` / `"Sign-on"` cannot become three different things. They live in the header
row rather than under the technology pills so they survive compact mode — a dense sheet is
exactly where "which of these is reachable without a login" stops being answerable any other
way.

### Zones

A `Zone` is a boundary that crosses the rows: `{ id, name, kind?, parent?, note? }`, with
`component.zone` naming the innermost one. Layers are rows and scopes are colours, and neither
can say "these six run on OpenShift" when three are front ends and three are APIs.

`kind` is one of `platform`, `network`, `gateway`, `perimeter`, `vendor`, and it picks between
**two** stroke treatments, not five: solid for a boundary you could point at in a room, dashed
for one that exists in a document. Everything else is carried by the label, which is always
drawn. Five dash patterns would be five things to look up; two and a name is one. Nesting
darkens the ground by a hair per level and insets the outer rule further than its children's,
which is the only thing saying that one neutral rectangle is inside another.

**A zone is measured, not laid out.** The sheet is HTML flow — that is what makes it reflow when
you zoom out — so a region spanning two rows cannot be a box in the DOM: it would have to
contain the rows. The rectangles are computed after layout in the same pass as the edges, from
*runs*: one element per zone per layer.

**And measuring alone is not enough** — this is the part that took a second pass to get right.
A rectangle around a zone's members on two rows is tall enough to hold both, so an unrelated
card on the row between them falls inside it, and the drawing makes a claim the document never
made. Ordering the cards, padding the box, tightening the union: all of them leave it
accidentally right rather than right.

So the space is **reserved**. Each bucket — the unzoned cards, then each zone — owns a *band* of
columns that is identical on every layer, and a card is placed in its own bucket's band and
nowhere else. A zone's rectangle can then only contain what was placed in its band, by
construction rather than by luck:

```
band 1          band 2 (OpenShift)
                ┌─ OPENSHIFT ────────┐
Client Channels │ [Next.js]          │
  [Flutter]     │                    │
Services & APIs │                    │
  [Anthropic]   │                    │
Data & Storage  │ [Amazon Aurora]    │
                └────────────────────┘
```

The plan is arithmetic, not measured: a card has a fixed width, so a band's width is a column
count, and a column count is something you can count. That is what keeps it out of the measure
pass and lets the printed sheet agree with the screen without a second layout. A band is as wide
as its bucket's busiest layer, capped at `BAND_MAX` (six, the same number the density threshold
uses); a bucket needing more wraps inside its own band rather than pushing every other band off
the page. Nested zones get contiguous bands in tree order, so a parent is one range of columns
and not two with a hole in the middle. The horizontal insets form a ladder — 7, 13, 19 px — that
fits inside the 24 px gutter between two bands, because anything wider would draw over the
neighbour's card and reintroduce exactly the false claim the bands exist to prevent.

**A zone is not the only way to say where something runs.** A component also carries
`deployedOn` — free text, "OpenShift", "AWS", "on-prem" — and the two answer different questions.
A zone *draws* the boundary: it reserves a band of columns on every layer and forces its members
to be adjacent, which is right when the point of the drawing is that these six are inside the
cluster and those three are not. `deployedOn` only *records* the fact: it costs the layout
nothing, works when what runs on a platform is scattered across the sheet, and gives you a second
row of filter chips that composes with the scopes — Core **and** OpenShift leaves the
intersection lit. Use the zone when the boundary is part of the argument; use the field when the
hosting is just something you need to look up, filter and hand on.

Free text rather than a list, because every closed list breaks on the first real answer:
"OpenShift" is a runtime and "AWS" is a provider, and OpenShift on AWS is one deployment. What
makes free text usable as a filter dimension anyway is one pass in the normaliser — the first
spelling a document uses wins, and every later case-variant folds onto it, so a stray "openshift"
cannot become a chip of its own. `src/lib/deployment.ts`.

**And "where it runs" is not "which copy of it".** `deployedOn` names a platform; the
**environments** name the stages the whole architecture runs in — dev, SA, production. They are
declared once on the document, in the palette rail beside the layers and the scopes, and each
component fills in the ones it lives in: an address, what version is running there, and a line of
prose. A component list of its own `{ name, url }` pairs would have been less plumbing and useless
within a week — one component says "SA", the next says "recette", the third says "staging", and
*give me every SA address* has no answer a table can hold.

Declaration order is the pipeline, which is why the rail moves them up and down rather than
sorting them: every table reads its columns from that order, and one that sorted itself would put
dev after SA and production first. The addresses surface on the component's inspector, in its
detail sheet, in the viewer's drawer, as a column per environment in the viewer's overview table
and in a generated **Environments** chapter under *DevOps & delivery* — the page someone prints
before a release — and as one Edit Data field per environment in the draw.io export. Every one of
those asks first: an environment nobody filled in draws no column.

The version field is the one to be careful with, and the module says so where it is defined: it is
the only thing here that goes stale on its own, nothing derives from it, and a document claiming
"prod = 2.4.1" three releases later is worse than one that never said. It earns its place during a
migration and should be cleared after. `src/lib/environments.ts`.

**Two things to know before you reach for zones.**

*Zones turn clustering off.* Two groupings cannot own one row: clustering splits a layer into
one column per scope, zones group the same cards by where they run, and asking for both cuts the
cards one way while drawing the rectangles around the other. Zones win, because a zone is drawn
and a scope is already carried twice — by the colour on every chip and by the filter chips above
the sheet. `cluster: true` on a zoned document is ignored.

*A zoned sheet is wider.* A band stays reserved on the layers where its zone has nothing, which
is the whole reason nothing foreign can wander into it — and the reason the drawing grows a
column per zone whether or not every row uses it. That is the visible, honest price of a
boundary that means what it draws.

**Shelves are how you buy that width back.** A zone that only ever draws on one layer pays for a
band on all of them, and that is the case worth fixing. Stacking puts it on a *shelf* — the same
range of columns as the zone before it, one row down — so the sheet loses a band and the layer
gains a row:

```
before: 8 columns                     after: 6 columns
┌─ 1-3 ──┐┌─ 4-6 ────┐┌─ 7-8 ──┐      ┌─ 1-3 ──┐┌───── 4-6 ─────┐
│  Edge  ││ OpenShift││ Legacy │      │  Edge  ││   OpenShift   │  shelf 0
└────────┘└──────────┘└────────┘      └────────┘├───────────────┤
                                                │   Legacy      │  shelf 1
                                                └───────────────┘
```

The reservation still holds; it is now a range of columns *on a shelf*. What keeps it true is one
rule, and it is the same argument as before turned on its side: a zone's rectangle is the union of
its runs across every layer, so a zone drawing on layers 1 and 3 owns a rectangle covering all of
layer 2 in its columns — and anything shelved under it there would fall inside a boundary that
never claimed it. **So a group only gets a second shelf when every zone in it draws on a single
layer.** Then each rectangle is one shelf on one layer: two on the same layer are different
shelves, two on different layers are different layers, and neither can hold the other. A zone can
only shelve under a *sibling*, never under the unzoned cards and never out of its own parent; a
group holds at most `SHELF_MAX` (three) shelves, because six boundaries in a column read as a list
and a list of zones is what the bands were drawn to stop being. The vertical inset ladder — 14, 23,
32 px — fits inside the 32 px `SHELF_GAP`, for the same reason the horizontal one fits inside the
gutter. A `stack` flag the layout cannot honour is ignored rather than drawn wrong.

**The sheet is capped, and the order is yours.** `BAND_MAX` caps one band at six columns; nothing
capped their *sum*, so a fourth zone could push the drawing off the right of the frame — where the
editor has no zoom to pull it back, only a scrollbar to find it with. `BAND_BUDGET` is twelve
columns, about 2 900 px. When the bands ask for more, shelving is tried first — a shelf gives back
a whole band for one row of height, while narrowing gives back one column and wraps the cards
anyway — and whatever is left over is narrowed, the widest band giving up a column at a time until
they fit. No card is lost either way: a narrowed band wraps inside itself and its layer grows
taller, which is the trade a reader can scroll. Automatic shelving is a layout decision and stays
one: nothing is written back to the document, so deleting a component puts the sheet back the way
it was. It is a ceiling and not a promise — a document whose zones all span layers, with more
buckets than columns, gets one each and is wider than that, because one card per band is the floor.

The **Zones** panel moves a zone two ways. The chevrons slide it among its own siblings — among
siblings because the band order comes from the zone tree, where the array position only ever breaks
ties between zones sharing a parent, so a plain array swap would usually move nothing at all. A
nested zone slides inside its parent and never out of it, and its children travel with it. On its
own shelf that reads as left and right; once it is stacked, the same move is up and down. The third
button puts it on a shelf under the zone before it, or takes it back off; when it cannot, the
tooltip says which of the rules above is in the way, because a disabled button that does not
explain itself reads as a bug.

To see a wide sheet whole, use **Preview**: it renders the real exported viewer, which has zoom,
pan and a **Fit** button. The editor canvas has none of those — it scrolls.

The **EXTERNAL / INTERNAL** divide those diagrams draw as a full-height vertical line does not
transpose, and shelves do not change that: a shelf is a row inside one layer, not an axis running
the height of the sheet. Modelled as a zone it gives you a frame around the external services,
which is legible and is not the same thing.

```
src/lib/links.ts       the protocol convention, and the plate's geometry
src/lib/lifecycle.ts   the three transition marks and what each commits you to
src/lib/marks.ts       the closed security set, its icons and its key
src/lib/deployment.ts  where a component runs, and why it is not a zone
src/lib/environments.ts dev / SA / prod, and one address per component per stage
src/lib/versions.ts    what makes a snapshot a version, and the next number
src/lib/zones.ts       the zone tree, the run ordering, and the measured union
```

Each one is mirrored by hand in `viewer/engine.js`, which ships inside the export and cannot
import them, and each one's *appearance* lives in the three stylesheets rather than in the
renderers — a change to how a zone or a tick looks is a change to CSS, not to three files.

---

## The design document

The viewer is tabbed and interactive; a design document is linear and numbered. The **Document**
button in the editor opens `/projects/:id/document` — the same JSON, rendered for paper, with a
cover, a table of contents, numbered chapters, and the diagram as a figure. Print it and choose
“Save as PDF”. **No dependency to install, and no headless browser on the server**: the one
prerequisite is a browser that can print, which is the browser you already opened it in.

The plan follows the Architecture Design Document structure:

```
1  Introduction                     meta.intro, header facts, the principle callout
2  Application architecture         the diagram, then the component inventory, then your chapters
3  Organisation architecture        your chapters
4  DevOps & delivery                your chapters
5  Cost estimation                  your chapters
6  Appendices                       unslotted sections, flows, the technology table
```

A section says where it belongs through one optional field, `doc.chapter` — `"2.4"` — edited in
the Sections panel. **The slot decides order, not the printed number**: numbering is recomputed
from the final position, so deleting a chapter renumbers the rest and an empty part disappears
instead of leaving a hole. A section with no slot lands in the appendices, and nothing else in
the document format changes — the viewer ignores the field entirely.

**The ADD preset.** The Sections panel offers to add the thirteen written chapters an ADD is
expected to carry: scope, data, scalability, tenancy, RPO/RTO, observability, resource
segmentation, IAM, networking, cost management, governance, delivery, cost estimate. They arrive
empty, structured, bilingual and *vendor-neutral* — service names belong to the components, which
already carry their per-target table. Applying it twice adds nothing.

They are also added **off the tab bar**: written for paper, absent from `ui.tabs`, so the
interactive viewer is exactly as it was. Turn one on from the Tabs panel if you want it on
screen too.

**One design, two media.** The print stylesheet is `viewer/style.css` transposed, not a second
look: same tokens, same card, same icon chip, same technology pills, same pole, same phase, same
note — the document's own `theme.brand` drives the page. A card carries its scope colour the way
the diagram does, on the chip and the pills, and its border stays neutral. Anything in
`document/document.css` that reads as a new visual idea is a bug. Two things are deliberately not
copied: hover and focus states, which paper does not have, and the shadow, which becomes a token
set to `none` when printing rather than a rule that disappears.

**The diagram is the hard part.** Edges are geometry measured after layout, and print layout is
not screen layout — measuring at `beforeprint` returns screen coordinates, which is the wrong
number by definition. So the diagram is laid out on a fixed 1000 px stage and scaled by a
transform, on screen and on paper alike: uniform scaling leaves the measured coordinates valid.
On paper the scale fits the page width, or the page height when the diagram is tall enough to
run off the bottom.

Two things a print stylesheet cannot do for you. Keep **background graphics on** in the print
dialog or the scope colours vanish; and the ADD's other diagrams — resource hierarchy, network
topology, CI/CD pipeline — have no equivalent in the document format, so those chapters are
prose and tables today.

If you want the PDF produced by the server rather than by a person, any headless Chrome will
render this route as it stands:

```bash
chrome --headless --no-pdf-header-footer \
  --print-to-pdf=architecture.pdf http://localhost:3000/projects/<id>/document
```

---

## Architecture of the app itself

```
src/app/                  Next.js 15 App Router
  page.tsx                workspace (server) → components/Workspace
  projects/[id]/page.tsx  editor (server)    → components/Editor
  projects/[id]/document/ the printable design document — plan, renderer, print CSS
  api/                    folders, projects, templates, export, import, revisions
  api/ai, api/settings    document analysis, and which model does it
src/components/           Workspace, Editor, Inspector, History, Analyse, Settings, Icon, Brand
src/lib/
  db.ts                   node:sqlite connection + schema
  store.ts                every query in the app lives here
  settings.ts             operator configuration; the only place a key is handled
  types.ts                the document contract
  defaults.ts             blank document, palette, normalisation
  links.ts                the dependency-kind table — stroke, labels, legend
  diff.ts                 two documents → what changed, in words
  ai/                     schema, prompts, convert, merge
  ai/providers/           one shape for five providers, three adapters
  templates/              the six templates and instantiate()
  document/               the ADD outline (plan.ts) and its chapter preset
  exportHtml.ts           document → self-contained HTML
viewer/                   the standalone renderer, verbatim
public/fonts/             Archivo + Space Mono, self-hosted and inlined into exports
data/studio.db            your data
```

**Why the document is a JSON blob instead of normalised tables.** The editor holds the whole
document in memory and writes it atomically. Splitting components, dependencies, flows and
sections across six tables would buy joins we never make, and would make import/export a
migration problem. Folders, ordering and revision history *are* relational, because those are
the things we query and reorder.

**Why `node:sqlite` and not Prisma.** Prisma downloads a ~20 MB query engine at install time and
needs a `generate` step — real friction for a tool whose pitch is "clone and run". `node:sqlite`
ships inside Node 22.5+, so the database layer costs **six production dependencies and no install
step at all**: three `@dnd-kit` packages, `next`, `react`, `react-dom`, and nothing for storage.
(`npm install` still lands 27 packages and does compile-or-fetch native binaries — `sharp` and,
on macOS, `fsevents` — but those are Next's, not the database's.) The cost is hand-written SQL and
an API Node still marks experimental. Every query is in `src/lib/store.ts`; if you outgrow it,
that one file is what you rewrite.

**Requires Node ≥ 22.13** — not 22.5, which is when `node:sqlite` landed *behind*
`--experimental-sqlite`. It was unflagged in 22.13.0, and on anything older the app dies on the
first import with `No such built-in module: node:sqlite`. CI runs the suite on 22.13 as well as
on current, so that floor is a tested number rather than a remembered one.

**Revisions.** Every save older than five minutes since the last snapshot writes one. The cap of
30 per project applies to automatic snapshots only: a named row is never pruned, and the
*Before restore* snapshots a restore leaves behind keep their own ceiling of five. Snapshots are
ordered `created_at DESC, rowid DESC` — `datetime('now')` has one-second granularity, so naming a
checkpoint during an autosave otherwise leaves two rows in the same second with no defined order.
The full surface is `GET/POST/PATCH/DELETE /api/projects/:id/revisions`, driven by the **Versions**
button in the editor. What that panel shows is computed by `src/lib/diff.ts`, which turns two
documents into sentences rather than a JSON diff.

**A version stores no more than a snapshot does.** The schema is `CREATE TABLE IF NOT EXISTS`
re-exec'd on every connection and there is no `ALTER TABLE` anywhere, so a column added to
`revisions` would land on fresh databases and never on an installed one. It is not needed: a
version's *title* is the row's `label`, which is what a label already was, and its *number* is the
`meta.version` of the document inside the snapshot — read back in the same `JSON.parse` that
already counted the components. Freezing therefore *edits the document* before snapshotting it,
which is why an exported version prints its own number without anything downstream being told
which revision it came from. The three kinds a row can be — a version, one of the app's own
checkpoints, an automatic save — are derived from the label in `src/lib/versions.ts`; the machine
labels live there too, so the prune SQL and the panel cannot drift apart on them.

`?revisionId=` on the export route and `?revision=` on the document page are what make a stored
version viewable, exportable and printable. Both fall back to the live document, so nothing about
the normal path changed.

---

## Reading documents

Nothing is configured out of the box. Open **Settings** — the gear at the foot of the sidebar —
and choose who reads your documents:

| Provider | Endpoint | PDFs | Token count before a run |
|---|---|---|---|
| Anthropic | built in | yes | exact |
| Google Gemini | built in | yes | exact |
| OpenAI | built in | text only | estimated |
| NVIDIA NIM | built in | text only | estimated |
| Poolside | editable | text only | estimated |
| OpenAI-compatible | yours | text only | estimated |

The last row is the interesting one: anything that speaks `/v1/chat/completions` — Ollama, LM
Studio, vLLM, Groq, Together, OpenRouter, a model on your own GPU — is a base URL away, and needs
no key at all when it is local and unauthenticated.

**Poolside** is that row with the base URL filled in. Its Laguna models are coding models and all
three are text-to-text, so a PDF has to become Markdown first. Two fields are deliberately loose:
the base URL stays editable, because Poolside documents different ones per access method — their
platform, Bedrock, OpenRouter, a self-hosted deployment — and no model is suggested, because the
ids differ the same way. Nothing is claimed about JSON-schema output either: their documentation
does not mention `response_format`, so the adapter sends OpenAI's form, falls back to
`guided_json`, and *Test* is what settles it. Checked against `docs.poolside.ai` on 2026-08-18.

**Six entries, three adapters.** OpenAI, NVIDIA, Poolside and the generic row are one code path.
A named entry buys nothing that row cannot already do — it buys not having to know a base URL,
and the one field the studio cannot guess: whether a PDF can be handed over as-is, which narrows
the file picker *before* someone chooses a document the provider will refuse. Adding a seventh is
one object in `src/lib/ai/providers/types.ts`; `registry.test.ts` holds the invariants, including
the one with teeth — a provider on the OpenAI adapter may never claim PDF support, because that
adapter throws on a PDF and the picker would have accepted the upload first.

**Test before you trust it.** Two buttons in the dialog: *Load models* asks the provider what it
can serve, and *Test* runs a real schema-constrained request. The second is the one that matters —
the analysis depends on the model honouring a JSON schema, most current models do and small local
ones often do not, and it is much better to learn that here than after uploading a 40-page
document.

**The key is stored in `data/studio.db`, in clear text.** There is no login in this application
to encrypt it against, and a key derived from something on the machine would only look like
encryption — so: anyone who can read that file, or a backup of it, can read the key. It is never
sent back to the browser, which only ever sees the last four characters. To keep it out of the
data directory entirely, set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` /
`NVIDIA_API_KEY` / `POOLSIDE_API_KEY` in the environment and leave the field empty; the dialog
then says it is reading the environment.

**An internal endpoint can come from the environment too.** The two providers whose endpoint is
yours to choose — Poolside and OpenAI-compatible — read `POOLSIDE_BASE_URL` and
`OPENAI_COMPATIBLE_BASE_URL`, with the same precedence as the key: what is typed into the dialog
wins, the environment fills in behind it, the built-in default is the floor. For a company running
its own Poolside instance that is the difference between a deployment that reproduces itself and
one that needs the URL retyped on every fresh volume. The other providers deliberately have no
such variable: their endpoint is presented as fixed, and an environment that could redirect it
would do so with no field on screen to reveal it.

**What it sends.** The file you choose, plus — for an enrichment — the id, name, scope and layer
of each component already in *that one project*. Nothing else: not your other projects, not the
database, not the file until you pick it. It goes to the endpoint you configured and nowhere else,
from the server process, so the key never reaches the browser.

**What it costs.** One request per run, on your own account. Providers do not publish their rates
through their APIs, so no price is invented for you: enter one in Settings (dollars per million
tokens, input and output) and the dialog shows what a run will cost before you start it. Leave it
empty and it shows a token count instead.

**What guarantees the output.** The answer is generated under a JSON Schema the provider enforces
— `output_config.format` on Anthropic, `response_format: json_schema` with `strict: true` on the
OpenAI surface, `responseSchema` on Gemini — so it cannot come back as prose or as half a
document. That leaves exactly one failure mode, a document that is well-formed and *wrong*, which
is why the result is shown for review rather than written, and why every repair is listed rather
than made quietly. The schema lives in `src/lib/ai/schema.ts`, is checked against `types.ts` by a
test, and is translated per provider in `src/lib/ai/providers/dialects.ts`.

**What it does not do.** It does not write your chapters: `sections` are the editorial argument of
the document and stay yours. It does not cite the source — the APIs reject citations and
schema-constrained output in the same request, so tracing a component back to its paragraph would
need a second pass, and pretending to trace it would be worse than not trying.

---

## Deploying it

It is a normal Next.js app with one caveat: it writes to the filesystem, so it does **not** run
on serverless platforms with a read-only disk (Vercel, Netlify functions). Run it where it can
keep a file:

```bash
npm run build && npm start          # a VPS, a Raspberry Pi, a container with a volume
```

There is no authentication. Put it behind your VPN, a reverse-proxy basic-auth, or a Tailscale
network — do not expose it to the open internet as is. Adding auth means one middleware and a
session check in the API routes; the data model does not need to change. The **`/admin`** CMS
shares that model: anyone who can reach the port can publish or wipe content domains.

**Docker** — a `Dockerfile` and `docker-compose.yml` ship at the repo root, mainly for anyone
whose local Node is older than the `node:sqlite` floor above.

```bash
docker compose up --build            # http://localhost:3000
```

`./data` on the host is bind-mounted to `/app/data` in the container, so `data/studio.db`
survives rebuilds. Run `npm run reset` on the **host**, not inside the container — `data` is the
mount point there, and a mount point cannot remove itself. To use a document-reading provider, copy
`.env.example` to `.env` and fill in the key(s) you need; `docker compose` reads it
automatically.

---

## Roadmap

- Diagram placeholders for the document chapters that have none — network topology, CI/CD pipeline
- Keyboard navigation on the canvas, and undo/redo
- Optional auth for shared installs (covers `/admin` too)
- Hydrate gated ADD cards to Acme density (no « Composants concernés » dump — CONTRAT B2)
- Multi-select and bulk move on the canvas

## Community

## License

MIT.
