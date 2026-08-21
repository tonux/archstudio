# ArchiMate export

ArchStudio exports to the **ArchiMate Model Exchange File Format** — The Open Group's
interchange XML, the one Archi, BiZZdesign Horizzon and the rest read. Not a native
file for any single tool.

```
GET /api/projects/{id}/export?format=archimate
```

or **Export → ArchiMate** in the editor. Add `&revisionId=…` to export a frozen version.

The point is not that ArchStudio speaks ArchiMate internally. It does not, and it should
not. The point is that a model drawn here can leave, which is the first question any
architecture board asks about a new tool.

---

## What the model is, and what it is not

The document you draw here **is already a constrained ArchiMate profile**. A component is
an application component, a dependency is a serving relationship, a zone is a node or a
grouping. This file writes that correspondence down; it does not invent it.

What it deliberately does not do is adopt ArchiMate's full metamodel — around sixty
element types and eleven relationship types with derivation rules on top. That vocabulary
would have to be propagated through three renderers, the diff engine, the standalone
viewer (which is written by hand, because it ships inside the exported HTML), the Lego
catalog, the AI schema and sixty tested template snapshots. The person drawing a diagram
would get nothing for it.

So the profile is a **deliberate subset**: smaller and right, rather than complete and
guessed. The same discipline as the AI schema, which is also a chosen subset of the
document.

---

## Elements

| In the document | In ArchiMate | Note |
|---|---|---|
| Component | `ApplicationComponent` | The default. |
| Component on layer `platform` / `infra` / `compute` | `Node` | |
| Component on layer `data` / `index` | `SystemSoftware` | |
| Component on layer `vendors` | `ApplicationService` | A third party is consumed, not operated. |
| Component with an explicit **ArchiMate type** | that type | The author's choice always wins. |
| Zone, kind `platform` / `gateway` | `Node` | |
| Zone, kind `network` | `CommunicationNetwork` | |
| Zone, kind `perimeter` / `vendor`, or untyped | `Grouping` | ArchiMate's "these belong together", with no further claim. |
| Technology table row | `SystemSoftware` | Things that run, not files — hence not `Artifact`. |

The layer hints only apply to the layer ids ArchStudio itself ships. A layer you named
yourself falls through to `ApplicationComponent`, which is predictable rather than clever.

### Overriding a type

Inspector → **Enterprise architecture** → *ArchiMate type*. Fifteen types, grouped the way
ArchiMate groups them. The field shows what the export *would* infer, so leaving it unset
is a visible decision rather than an empty box.

It changes nothing else. The diagram, the standalone HTML, the printable document and
every other export are byte-for-byte identical whether it is set or not.

---

## Relationships

| In the document | In ArchiMate |
|---|---|
| `A` depends on `B` | `B --Serving--> A` |
| Zone contains a component | `Zone --Composition--> Component` |
| Zone nested in a zone | `Parent --Composition--> Child` |
| Component names a technology in the stack table | `Component --Association--> Technology` |

### The direction inverts. This is the part that matters.

`A.deps ∋ B` means **A calls B**. ArchiMate's `Serving` points from the *provider* to the
*consumer*. So the exported relationship is `B → A`.

An export that got this backwards would open perfectly and state the opposite of the
diagram — the worst possible failure, because nothing looks wrong. It is asserted directly
in `src/lib/archimate/export.test.ts`, not left to a golden file.

### Why every dependency is `Serving`

A dependency's `kind` — sync, async, batch — says *how a call travels*, not whether the
callee provides something. Reading `async` as a `Flow` relationship would be inventing
intent the document does not carry. The kind, the protocol note and the transition mark
ride on the relationship's own name and documentation instead, where they are facts rather
than reinterpretations.

### Why technology matching is exact

A component's `tech` entries are matched to the stack table on a trimmed, case-folded name
and nothing cleverer. `Postgres` matches the row `postgres`; `Postgres 16` does not. A
fuzzy match would invent edges, and an invented edge in an enterprise repository is worse
than a missing one — the fact still travels, as a property on the component.

---

## Properties

Carried on every component, the same set the draw.io export puts in Edit Data:

`Studio id` · `Scope` · `Layer` · `Deployed on` · `Badge` · `URL` · `Security` ·
`Transition` · `Technologies`, plus **one property per environment**, named in the
document's own words (`Production`, not `env-2`), holding the address, version and note.

`Studio id` is the component's id in ArchStudio. Keep it: it is what lets a future import
recognise what it is looking at.

---

## Organizations, and the view

Components are filed under **their layer** — the drawing's primary axis. Zones and
technologies get a folder each. Scope is a property rather than a folder, because a folder
tree only has one axis and the layer is the more useful one.

The model ships with **one laid-out view**, built from the same geometry the SVG and the
draw.io export consume. It opens arranged, not as a heap of boxes in the top-left corner.
Zone boxes are painted before the components that sit on them, and each component carries
its scope colour.

Nodes are flat rather than nested: a nested node's coordinates are relative to its parent,
and the layout measures in absolute sheet space. The containment is not lost — it is
carried by the `Composition` relationships, which is where a model should keep it anyway.

---

## Identifiers, and why re-export merges instead of duplicating

Every identifier is a hash of *what the thing is* — the project, the kind, and the entity's
own id — and of nothing about where it sits or when it was written.

```
id-<24 hex chars>   =  sha256(namespace · kind · projectId · entityId)
```

The consequence is the one that decides whether a tool is usable for enterprise
architecture:

- **Rename a component** → identifier unchanged. Archi updates the element.
- **Move it, reorder the sheet** → identifier unchanged.
- **Export the same project twice** → byte-identical file.
- **Two different projects** → no collision, even for components sharing an id.

Without this, "export again after a month of edits" means a second copy of the entire
model sitting next to the first, and whatever the architect did in between is stranded.

---

## Round trip

Export → open in [Archi](https://www.archimatetool.com/) (free, Open Group) → edit → export
again. The second file **merges** into the first model.

Import — ArchiMate *into* ArchStudio — is not here yet. It needs somewhere to put what
ArchiMate carries and ArchStudio does not: capabilities, actors, business objects. That
arrives with the enterprise referential, together with a CSV import, and both will show
what they could not map rather than dropping it silently.

---

## Implementation & Migration

A document that declares plateaus also exports the trajectory:

| In the document | In ArchiMate |
|---|---|
| Plateau | `Plateau`, in its own `Implementation & Migration` folder |
| What stands at a plateau | `Plateau --Aggregation--> Element` |
| What changes between two consecutive plateaus | `Gap`, named "Today → 2026", associated with the plateau it closes |

**Aggregation, not Composition**: an application is not *owned* by a moment in time. It
exists across several plateaus and belongs to none of them.

Emitted from the living document rather than from a projection — a model that only knew
one plateau would be a model that had lost the trajectory, which is the whole reason the
layer exists. `?plateau=` still works on this format, and then exports that single state.

---

## Motivation, Strategy and Business

| In the document | In ArchiMate |
|---|---|
| Motivation item | `Driver` / `Goal` / `Principle` / `Requirement` / `Constraint` / `Assessment` |
| What realises it | `Component --Realization--> Item` |
| A capability the document cites | `Capability`, from the imprint |
| A component carrying a capability | `Component --Realization--> Capability` |
| Flow | `BusinessProcess`, or `ValueStream` when the flow says so |
| A component in a flow's steps | `Component --Serving--> Process` |

The six motivation words map one for one because they were taken from ArchiMate in the
first place — this is transcription, not a mapping decision.

**`Realization` runs concrete → abstract.** A component realises a goal, never the other
way round. It is the same direction `realizedBy` reads in, which is why the field is named
that way.

Capabilities come from the document's **imprint** rather than from the referential, so the
exported model names exactly what the exported HTML names.

---

## Not exported yet

The editorial sections, and the referential's `business-object` and `actor` entities beyond
what a component cites. Nothing else is missing.

---

## Where the code lives

| File | What it holds |
|---|---|
| `src/lib/archimate/profile.ts` | The correspondence tables above. Declarative — this is the file to read first. |
| `src/lib/archimate/identity.ts` | Deterministic identifiers. |
| `src/lib/archimate/export.ts` | The XML. |
| `src/lib/archimate/export.test.ts` | Direction, identity and escaping, asserted directly. |

`Component.archimate` is **server-only**: `src/lib/mirror.test.ts` enforces that the
standalone viewer never reads it.
