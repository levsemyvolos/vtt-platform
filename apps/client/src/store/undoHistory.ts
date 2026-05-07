import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SceneObject, FogShape, DrawStrokePayload } from '@vtt/shared';

/**
 * Sess 7.5 — per-user client-side undo history for canvas mutations.
 *
 * Design (decisions 1β + 2α + 3α + 4α from Sess 7 plan):
 *  - Scope: every undoable canvas mutation registers a UndoEntry.
 *  - Storage: client-only (this slice). No server persistence; reset on scene change.
 *  - Encoding: per-action snapshot of the affected entity's relevant slice
 *    (before/after). Undo dispatches `before` through the SAME socket+reducer
 *    pathway as the forward action, so other clients see the rollback as a
 *    normal mutation and there is no separate server contract.
 *  - Stack depth: 20 entries; oldest is dropped when a 21st is pushed.
 *
 * Recording happens at action sites (drag end, context menu, fog handler, etc.).
 * Application happens via `applyUndoEntry(entry, direction)` in undoDispatcher.ts —
 * it emits the relevant socket event and dispatches the reducer; the result is
 * recorded NEITHER as a new entry (recordingPaused flag) NOR pushed back to the
 * stack (the dispatcher uses the suppressRecord param, not the slice itself).
 */

export const UNDO_STACK_LIMIT = 20;

export interface ObjectTransformSnapshot {
  id: string;
  x: number;
  y: number;
  rotation: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  fontSize?: number;
}

export interface ObjectMoveSnapshot {
  id: string;
  x: number;
  y: number;
}

export interface ObjectLockSnapshot {
  id: string;
  locked: boolean;
}

export interface ObjectLayerSnapshot {
  id: string;
  layer: 'tile' | 'overlay';
}

export interface ObjectVisibilitySnapshot {
  id: string;
  visibility: 'all' | 'gm-only';
}

export interface ZOrderSnapshot {
  /** Full ordering of object ids by zIndex (front-to-back) at the moment of capture. */
  ordering: { id: string; zIndex: number }[];
}

export interface TokenMoveSnapshot {
  tokenId: string;
  x: number;
  y: number;
}

export type UndoEntry =
  | { kind: 'object_transform'; before: ObjectTransformSnapshot; after: ObjectTransformSnapshot }
  | { kind: 'object_move'; before: ObjectMoveSnapshot; after: ObjectMoveSnapshot }
  | { kind: 'object_add'; object: SceneObject }
  | { kind: 'object_delete'; object: SceneObject }
  | { kind: 'object_duplicate'; clone: SceneObject }
  | { kind: 'object_lock'; before: ObjectLockSnapshot; after: ObjectLockSnapshot }
  | { kind: 'object_layer'; before: ObjectLayerSnapshot; after: ObjectLayerSnapshot }
  | { kind: 'object_visibility'; before: ObjectVisibilitySnapshot; after: ObjectVisibilitySnapshot }
  | { kind: 'object_zorder'; before: ZOrderSnapshot; after: ZOrderSnapshot }
  | { kind: 'fog_add'; shape: FogShape }
  | { kind: 'fog_remove'; shape: FogShape }
  | { kind: 'fog_clear'; shapes: FogShape[] }
  | { kind: 'token_move'; before: TokenMoveSnapshot; after: TokenMoveSnapshot }
  | { kind: 'draw_stroke'; stroke: DrawStrokePayload; object: SceneObject }
  | { kind: 'draw_clear'; objects: SceneObject[] };

interface UndoState {
  /** Stack of recorded actions, bounded to UNDO_STACK_LIMIT. */
  past: UndoEntry[];
  /** Stack of undone actions available for redo. Cleared on every new push. */
  future: UndoEntry[];
}

const initialState: UndoState = {
  past: [],
  future: [],
};

const undoHistorySlice = createSlice({
  name: 'undoHistory',
  initialState,
  reducers: {
    /** Records a new action. Truncates the redo stack so a fresh action invalidates pending redos. */
    pushUndoEntry(state, action: PayloadAction<UndoEntry>) {
      state.past.push(action.payload);
      if (state.past.length > UNDO_STACK_LIMIT) state.past.shift();
      state.future = [];
    },
    /** Pop the latest entry into `future` so redo can re-apply it. */
    popToRedo(state) {
      const entry = state.past.pop();
      if (entry) state.future.push(entry);
    },
    /** Pop the latest redo entry back onto `past`. */
    popToUndo(state) {
      const entry = state.future.pop();
      if (entry) {
        state.past.push(entry);
        if (state.past.length > UNDO_STACK_LIMIT) state.past.shift();
      }
    },
    /** Clears both stacks. Called on scene change / hydrate. */
    resetHistory(state) {
      state.past = [];
      state.future = [];
    },
  },
  extraReducers: (builder) => {
    // Sess 7.5: drop history when the scene snapshot is replaced — entries reference
    // entity ids that may no longer exist in the new scene, so applying them would
    // be incoherent.
    builder
      .addCase('scene/hydrateScene', (state) => {
        state.past = [];
        state.future = [];
      })
      .addCase('scene/clearScene', (state) => {
        state.past = [];
        state.future = [];
      });
  },
});

export const { pushUndoEntry, popToRedo, popToUndo, resetHistory } = undoHistorySlice.actions;
export default undoHistorySlice.reducer;
