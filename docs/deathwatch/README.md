# Deathwatch D100 module (compatibility preview)

This module is an independent implementation for mahoVTT. It does not require Foundry.
It is not an official or comprehensive implementation of every Deathwatch rule.

## Start

Start mahoVTT normally with `node scripts/start.mjs`, open `/games`, then choose
Deathwatch. Its separate page is `/games/deathwatch/index.html`.
Runtime dependencies: Node.js >=22.16; no additional production packages.
The module is native ESM under `modules/deathwatch/`; the TypeScript hall imports
its factory through `runtime.d.mts`. Both source and precompiled hall registries
are included, so changing this module does not require rebuilding the legacy RPG.

Choose six core Chapters and six Specialties, with Chapter restrictions enforced.
Create your character and two companions, select your leader/oath, spend initial
XP on supported characteristic advances, requisition supported equipment, then
launch. Attribute generation supports 100-point allocation and server-side rolls.
A field marked manual is a genuine stop for adjudication, not a hidden house rule.

## Content and privacy

The public source includes an original five-scene training mission.
The supplied private delivery contains a locally importable **Final Sanction**
adaptation and a text-search index generated from the user's uploaded PDFs.
Neither commercial PDFs, extracted book text, nor that private adventure belong
in the public repository. Do not publish exported private campaign saves either.

1. Copy private `data/games/deathwatch-private/library.json` into the application's
   data directory. With `SAGAS_DATA_DIR`, use that directory instead.
2. In the Deathwatch hall click “导入私有副本” and select the private JSON.
3. Create a new squad with the imported mission selected. Existing sessions keep
   their own content snapshot and are not silently changed by later imports.

The first release includes a finite selection of equipment, talents and powers.
It does not implement all expansions or all core character options. See RULES.md.

## AI

Use the existing mahoVTT settings page. The server reads the configured OpenAI-
compatible endpoint. The player can request an action proposal and confirm it;
companions request one validated action at a time, using deterministic fallback
when the model fails. The enemy policy is deterministic. AI cannot call manual
rulings, alter rolls, replace a player Fate decision or modify numeric outcomes.

Narration is a separate, non-streaming call in this release. It is persisted by
state version and attempt number; failure falls back to facts without changing
state. Local book retrieval uses keyword matching, not a vector database. The
“按检索结果解释” action supplies excerpts and page locators to the model; these
explanations remain suggestions, never authoritative mutations.

Auto-turn orchestration currently advances while the game page is open. Closing
the browser saves progress, and reopening resumes from the stored state. It does
not continue playing unsupervised while the page is closed.

## Persistence

`data/games/deathwatch-d100.sqlite` is independent of other games. WAL, short
transactions, optimistic versions and canonical request fingerprints protect
state/rolls/events from duplicate execution. Model calls are outside transactions.
Pending rolls and reactions survive restart. Export/import creates a new session;
portable imports require a checkpoint with no pending roll/reaction/manual ruling.
The export contains state and recent events, not an unlimited audit archive.

Large JSON imports use bounded gzip transport to stay compatible with the host's
existing request size cap. Decompressed limit: 8 MB. The request transport limit
is lower; very large incompressible saves are explicitly rejected.

## Verify

```sh
node --test tests/deathwatch.test.mjs tests/deathwatch-http.test.mjs
npm run build
```

The standalone tests use isolated temporary databases. Do not run test seed or
cleanup operations against a real campaign. TEST_REPORT.md distinguishes actual
checks from remaining Windows/DGX/long-play acceptance.
