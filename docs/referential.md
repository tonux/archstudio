# The enterprise referential

Written for: architects and developers working on ArchStudio's EA layer.

A diagram says what one team built. The referential is what lets a question be
asked *across* diagrams — "which applications carry Billing", "if I decommission
this, who breaks", "which projects serve this objective". It lives in SQLite on
the server, and every document that cites it carries a frozen copy of the names
it used, so an exported HTML file still reads offline six months later.

---

## The model

Twelve kinds, grouped by the layer they belong to. Each one is here because a
question is asked about it across projects — that is the bar, and it is why
there are twelve rather than the sixty a faithful ArchiMate metamodel would have.

| Layer | Kinds |
|---|---|
| Business | `capability`, `business-process`, `business-service`, `business-object`, `actor`, `domain` |
| Application | `application` |
| Technology | `technology-standard` |
| Motivation | `driver`, `goal`, `principle`, `requirement` |

Four of them nest: `capability`, `domain`, `business-process`, `goal`. A cycle
cannot be stored — every reader walks the chain, so a loop is not a wrong tree,
it is a hung renderer.

### Fields

Beyond `name`, `code`, `parent` and `description`:

| Field | On which kinds | What it is |
|---|---|---|
| `status` | `technology-standard` | The radar decision: adopt / trial / hold / retire. |
| `lifecycle` | application, process, service | Where the thing itself stands: planned / live / sunset / retired. |
| `criticality` | the above plus `business-object` | vital / high / medium / low. |
| `startsOn`, `endsOn` | the lifecycle kinds | What the lifecycle says, in dates. |
| `source`, `externalId` | any | Where the row came from, and its key over there. |
| `props` | any | Free key/value attributes. |

**`status` and `lifecycle` are deliberately separate columns.** Java 8 can be
`retire` while the application running on it is very much `live`, and that
sentence is the whole of a rationalisation review. One column could not hold it.

Each vocabulary is legal only on the kinds it describes, enforced on write. A
criticality sent for a capability is dropped rather than stored, because a value
nothing can report on is worse than an empty field — it looks like data.

`props` is the extension point, and the evidence trail: if an attribute turns out
to be asked about across projects, it has earned a column of its own.

### Relationships

Eight kinds, and **both ends are checked** against `RELATION_ENDS` in
`src/lib/ea/types.ts`:

| Relationship | From | To |
|---|---|---|
| `realizes` | application, process, service | capability, service |
| `serves` | application, service, process | application, process, actor, domain |
| `assigned-to` | application, process, service, business-object | actor, domain |
| `accesses` | application, process | business-object |
| `uses-standard` | application, process, service | technology-standard |
| `triggers` | process | process |
| `motivated-by` | anything concrete | driver, goal, principle, requirement |
| `composed-of` | any | any |

`composed-of` is the open one on purpose — it is the escape hatch for
compositions the `parent_id` tree cannot express, and constraining it would mean
predicting them.

A metamodel whose rules live only in a comment drifts on its first import, which
is what happened before these were enforced: "a capability is owned by an
invoice" stored cleanly and quietly widened every query that read it.

---

## Two sources, both real

Every analysis reads **both** of:

1. **What somebody asserted** — a row in `ea_relations`.
2. **What the diagrams show** — `project_entity_links`, the index rebuilt from
   every document's citations.

A component citing an application and a capability in the same breath *says* the
one carries the other; that is a fact, and it costs nobody any extra data entry.
A declared relationship is the stronger claim, and the one that survives a
diagram being redrawn. Neither replaces the other, and `query.ts` unions them.

The index is derived and disposable: `reindexAll()` rebuilds it from the blobs,
which are the truth. If the two ever disagree, the blobs win.

---

## Citing from a document

A component cites through `Component.ea` — four fields: `app`, `capabilities`,
`owner`, `objects`. That object is deliberately still four fields: widening it is
the one change that reaches `viewer/engine.js` and costs the manual mirror a
rewrite.

A **motivation item** cites through `MotivationItem.entity`, pointing at one of
the four motivation kinds. The document keeps its own wording; the citation makes
it countable. `constraint` and `assessment` have no shared counterpart — both are
judgements about one piece of work at one moment.

Every citation is indexed under a `LinkRole`, which is what makes "which projects
serve this objective" the same query as "which projects use this application".

> **The trap.** `citedIds()` must walk the motivation block as well as the
> components. It did not, once: rule 2 of `normalizeImprint` prunes any imprint
> entry nobody cites, so an entity only a goal referred to was dropped from the
> imprint on one save, and then dropped from the goal on the next — because
> `normalizeMotivation` keeps only what the imprint backs. Two saves and the
> citation was gone with nothing logged. `src/lib/ea/model.test.ts` holds it.

---

## Filling it

### CSV, for a person with a spreadsheet

Two files, told apart by their header. A row that is sometimes an entity and
sometimes an edge is a row nobody can validate.

**Things** — `kind,code,name,parent,status,lifecycle,criticality,description,source,external_id,starts_on,ends_on`

**What joins them** — `relation,from,to,note`, where an end is a bare code,
`kind:name`, or a bare name. Ambiguity is reported, never guessed: two
applications called "Billing" is exactly when a guess does damage.

Matching runs most-specific-first: the source's own key, then `code`, then an
exact name within the same kind. Header spelling is forgiving (`external_id`,
`externalId` and `external id` are one column); the *report* names your columns
as you spelled them.

**Preview before applying.** `{ preview: true }` runs the real import inside a
transaction and rolls it back, so the numbers on screen are the numbers you get.
It is not a prediction — a second implementation would be a second place for the
rules to live, and the first time the two disagreed the preview would be worse
than none.

### `POST /api/ea/ingest`, for a job

```json
{
  "source": "cmdb",
  "kind": "application",
  "rows": [
    { "externalId": "ci-88213", "name": "Invoicing service",
      "code": "APP-0142", "lifecycle": "live", "criticality": "vital",
      "props": { "costCentre": "CC-12" } }
  ]
}
```

Matched on `(source, externalId)` and nothing else, because a source's own id is
the only identifier that survives somebody renaming the thing over there.
Matching on name would make a rename a duplicate, which is the failure that turns
a referential into a list nobody trusts after six months.

The whole batch is one transaction. A feed that half-applied would leave a state
no rerun corrects: the rows that landed look current and the rows that did not
look deleted. A row's `kind` is never patched — a row that changed kind is a
different thing wearing the same key, and rewriting it would take every citation
of it along.

---

## What it answers

Six queries, in `src/lib/ea/query.ts`, each returning a table because a table is
the shape an answer needs in order to *leave*: a computed section resolves
server-side at export and lands in the document frozen and dated.

`dependents` · `capability` · `coverage` · `standard` · `orphans` · `traceability`

And eight compliance rules in `src/lib/ea/compliance.ts`, each naming **who can
act** — a report with two hundred violations and no owners is a report that gets
filed.

---

## Where things live

| | |
|---|---|
| Vocabulary, pure | `src/lib/ea/types.ts` |
| SQL | `src/lib/ea/repository.ts` |
| Document-side rules, pure | `src/lib/ea/imprint.ts` |
| Document + database | `src/lib/ea/hydrate.ts` |
| Import | `src/lib/ea/csv.ts` |
| Questions | `src/lib/ea/{query,graph,compliance}.ts` |
| ArchiMate mapping | `src/lib/archimate/profile.ts`, and `docs/archimate.md` |
| Screens | `/ea`, `/analysis`, `/compliance` |

Anything a **client** component imports must not touch `db` — that is why the
pure/server pairs exist (`views/capability-map.ts` ↔ `ea/capability-tree.ts`,
`adm.ts` ↔ `adm-store.ts`). Importing a module that reaches `node:sqlite` into a
client component breaks the webpack build.
