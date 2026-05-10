declare module '@3d-dice/dice-box-threejs' {
  export interface DiceBoxConfig {
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    color_spotlight?: number;
    shadows?: boolean;
    theme_surface?: string;
    sound_dieMaterial?: string;
    theme_customColorset?: unknown;
    theme_colorset?: string;
    theme_texture?: string;
    theme_material?: 'none' | 'metal' | 'wood' | 'glass' | 'plastic';
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    onRollComplete?: (results: unknown) => void;
  }

  export interface DiceRollResult {
    value: number;
    rolls?: Array<{ sides: number; value: number }>;
  }

  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    /**
     * Async setup: builds the Three.js renderer, loads textures and theme,
     * attaches the canvas to the container. Constructor does NOT auto-call
     * this — caller MUST await before invoking `roll()`.
     */
    initialize(): Promise<void>;
    /** Roll dice. Notation: "1d20", "2d6+3", or "1d20@17" (predetermined face). */
    roll(notation: string): Promise<DiceRollResult>;
    /** Add more dice to existing roll. */
    add(notation: string): Promise<DiceRollResult>;
    // NOTE: clear() does NOT exist in v0.0.12. The library only exposes
    // clearDice() as an internal method; startClickThrow() calls it automatically
    // when a new roll starts while rolling=true.
  }
}
