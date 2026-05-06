# Session 06 — Combat polish + Sess 5.5 leftover bug

Worktree: `.claude/worktrees/recursing-wing-82a3e7`
Branch: redesign canvas iteration
Status: planned (after Sess 5.5 commit)

---

## Carry-over from Sess 5.5 — token-move OCC rollback in regular mode

### Symptom (reported 2026-05-06)

- Edit Scene mode: token drag works, all tokens move and persist correctly (Mini-C verified).
- Regular GameRoom (play mode): only one token (the first / center-spawned one) is movable. For every other token:
  - Drag is visually smooth on local client during LMB hold.
  - Live `token:drag-preview` is broadcast correctly to other clients (Mini-D verified).
  - On `dragEnd` the token snaps back to its original position. The optimistic `moveTokenOptimistic` reducer is reverted via `applyTokenRollback`.
- Reproducible on every non-first token added through the new `findFreeTokenSpawn` path (Mini-B).

### Hypothesis (to verify in Sess 06.1)

Suspected root cause: **OCC `clientSeq` mismatch for newly created tokens.**

`emitTokenMove` in `apps/client/src/components/GameCanvas/layers/TokenLayer.tsx` sends:

```ts
clientSeq: sceneVersion
```

But algorithm A2 (server `SceneService.applyTokenMove`) compares against `Token.version`, not the scene version. After the GM has moved the first token a few times, `sceneVersion` has been bumped, while a freshly-created (REST POST `/api/scenes/:id/tokens`) token still has `version: 1`. Server sees `clientSeq > token.version` (or strict `!==`) and rejects with `rollback`.

The first/center token works because nothing else has touched scene state between its creation and its first move, so `sceneVersion === 1 === token.version`.

### Diagnostic checklist (start of Sess 06)

1. Re-read `apps/server/src/services/SceneService.ts` → `applyTokenMove` to confirm the exact OCC predicate.
2. Re-read `apps/client/src/components/GameCanvas/layers/TokenLayer.tsx` → `handleDragEnd` to confirm what is sent as `clientSeq`.
3. Reproduce locally with `console.log` of `{ tokenId, clientSeq, tokenVersion: token.version }` on emit and the server-side comparison values.

### Likely fix shape

- Send **`token.version`** (per-token OCC sequence) as `clientSeq`, not the global `sceneVersion`. Each `TokenPublicDTO` already carries `version` — use it.
- After server accepts, the broadcast `scene:updated` payload bumps both per-token version and scene version; reducer must keep `scene.tokens[i].version` in sync.
- Add a regression test: GM moves token A, then GM creates token B and moves token B → both moves accepted without rollback.

### Mini-task split (Sess 06.1)

- **06.1.A** — Diagnose: insert temporary logs, confirm hypothesis with two-tab repro.
- **06.1.B** — Fix `emitTokenMove` callsite + reducer update path; add SceneService test for the new-token-after-other-move scenario.
- **06.1.C** — Verify (browser, two tabs): GM creates 3 tokens via AddTokenButton → drags each → all three accept without snap-back; Player can drag their assigned token same way.

---

## Sess 06.2 — Combat polish (planned)

Goals from project memory (`project_redesign_architecture.md`):

- **Token stack overlap**: when multiple tokens occupy the same cell, fan them out visually (offset stacking) instead of overlapping pixel-perfect.
- **Initiative highlight**: active actor's token gets an outline / glow on the canvas, synchronized to the InitiativeTracker turn pointer.

Decisions to confirm with user before Plan-agent:

1. Stack visual: fan-out offset (8 px per token) vs. small badge "+N" with click-to-cycle?
2. Initiative highlight color: theme-aware accent (purple in dark, amber in light) vs. fixed gold?
3. Highlight scope: GM only, all clients, or follow combat-visibility settings?

---

## Sess 07 — Transformer for text & stroke (planned)

Goal: extend the Konva Transformer (currently working on Image annotations from Sess 2) to:

- **Text annotations**: resize via corner handles → adjust `fontSize` proportionally (not the box). Rotation handle drives `rotation` field.
- **Free-draw strokes**: bounding-box transform that scales all `points[]` uniformly. Rotation rotates the point cloud around the centroid.

Decisions to confirm:

1. Text resize: scale font-size only, or also stretch the bounding box (anisotropic)?
2. Stroke transform: bake new points on commit (lossy but renders cheaply) vs. keep transform matrix on the SceneObject (clean but renderer must compose)?
3. Should `selectedSceneObjectIds` multi-select transform a group bounding box (Sess 02 left this for later)?

---

## Sess 08 — Brush size + extra tool affordances (planned)

- **Brush size slider** for the draw tool (currently fixed). Persist last-used size per user in `localStorage`.
- **Color palette presets** for draw + text (8 quick swatches).
- **Optional**: ruler "lock to grid" toggle.

Decisions to confirm:

1. Brush size range: 1–32 px or 1–64 px?
2. Persistence scope: per-user-per-room, per-user-globally, or session-only?

---

## Handover note for next session

Sess 5.5 committed: 4 mini-tasks (A=GM-only flip restore, B=findFreeTokenSpawn, C=token edit-scene staging via scene:flush, D=token live-drag preview). Mini-A/B/C/D verified working. One leftover bug: OCC rollback on non-first token in play mode — start Sess 06 with diagnostic step 06.1.A above, file to read first: `apps/server/src/services/SceneService.ts` (`applyTokenMove` predicate). Worktree path unchanged.
