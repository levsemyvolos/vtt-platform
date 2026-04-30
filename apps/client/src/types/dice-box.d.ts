// Minimal type declaration for @3d-dice/dice-box (no official .d.ts).
// Covers only the surface used by DiceRoller — extend as needed in later chats.
declare module '@3d-dice/dice-box' {
  export interface DiceBoxOptions {
    assetPath?: string;
    container?: string;
    theme?: string;
    scale?: number;
    gravity?: number;
    mass?: number;
    friction?: number;
    restitution?: number;
    angularDamping?: number;
    linearDamping?: number;
  }

  export interface DiceRollOutcome {
    qty: number;
    sides: number | string;
    modifier?: number;
    rolls: { value: number }[];
    value: number;
  }

  export default class DiceBox {
    constructor(container: string | HTMLElement, options?: DiceBoxOptions);
    init(): Promise<DiceBox>;
    roll(notation: string | string[]): Promise<DiceRollOutcome[]>;
    add(notation: string | string[]): Promise<DiceRollOutcome[]>;
    clear(): void;
    hide(): void;
    show(): void;
    onRollComplete?: (results: DiceRollOutcome[]) => void;
  }
}
