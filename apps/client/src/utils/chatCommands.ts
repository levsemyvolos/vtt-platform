import type { DiceMode } from '@vtt/shared';

export type ParsedCommand =
  | { kind: 'plain'; text: string }
  | { kind: 'roll'; expression: string; mode: DiceMode; secret: boolean }
  | { kind: 'whisper'; recipientQuery: string; text: string }
  | { kind: 'ooc'; text: string }
  | { kind: 'me'; text: string }
  | { kind: 'invalid'; reason: 'roll-syntax' | 'whisper-empty' | 'ooc-empty' | 'me-empty' };

/**
 * Recognized modifier tokens for /roll.
 * 'adv'/'advantage' → advantage mode
 * 'dis'/'disadvantage' → disadvantage mode
 * 'secret' → secret flag (orthogonal to mode)
 */
const ADV_TOKENS = new Set(['adv', 'advantage']);
const DIS_TOKENS = new Set(['dis', 'disadvantage']);
const SECRET_TOKEN = 'secret';

/**
 * Validates a full dice expression which may chain multiple terms with +/-.
 * Examples: "2d6", "1d20+5", "2d6+1d4", "1d20+1d4-2"
 */
function isValidDiceExpression(expr: string): boolean {
  return /^\d*d\d+([+-]\d+)?(\s*[+-]\s*\d*d\d+)*$/i.test(expr.replace(/\s/g, ''));
}

function parseRoll(tokens: string[]): ParsedCommand {
  // tokens[0] is '/roll'; need at least one more token for the expression
  if (tokens.length < 2) {
    return { kind: 'invalid', reason: 'roll-syntax' };
  }

  let mode: DiceMode = 'normal';
  let secret = false;
  const exprTokens: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const tok = (tokens[i] as string).toLowerCase();
    if (ADV_TOKENS.has(tok)) {
      if (mode === 'disadvantage') {
        return { kind: 'invalid', reason: 'roll-syntax' };
      }
      mode = 'advantage';
    } else if (DIS_TOKENS.has(tok)) {
      if (mode === 'advantage') {
        return { kind: 'invalid', reason: 'roll-syntax' };
      }
      mode = 'disadvantage';
    } else if (tok === SECRET_TOKEN) {
      secret = true;
    } else {
      // Must be part of the dice expression
      exprTokens.push(tokens[i] as string);
    }
  }

  const expression = exprTokens.join(' ').trim();
  if (!isValidDiceExpression(expression)) {
    return { kind: 'invalid', reason: 'roll-syntax' };
  }
  return { kind: 'roll', expression, mode, secret };
}

function parseWhisper(tokens: string[]): ParsedCommand {
  const args = tokens.slice(1);
  if (args.length < 2) {
    return { kind: 'invalid', reason: 'whisper-empty' };
  }
  // args.length >= 2 guaranteed above
  const recipientQuery = args[0] as string;
  return { kind: 'whisper', recipientQuery, text: args.slice(1).join(' ') };
}

function parseOoc(tokens: string[]): ParsedCommand {
  const args = tokens.slice(1);
  if (args.length === 0) {
    return { kind: 'invalid', reason: 'ooc-empty' };
  }
  return { kind: 'ooc', text: args.join(' ') };
}

function parseMe(tokens: string[]): ParsedCommand {
  const args = tokens.slice(1);
  if (args.length === 0) {
    return { kind: 'invalid', reason: 'me-empty' };
  }
  return { kind: 'me', text: args.join(' ') };
}

const COMMAND_PARSERS: Record<string, (tokens: string[]) => ParsedCommand> = {
  '/roll': parseRoll,
  '/w': parseWhisper,
  '/ooc': parseOoc,
  '/me': parseMe,
};

/**
 * Parses a trimmed chat input into a structured command.
 * Caller must trim() the input before passing it here.
 */
export function parseChatCommand(input: string): ParsedCommand {
  if (!input.startsWith('/')) {
    return { kind: 'plain', text: input };
  }

  const tokens = input.split(/\s+/).filter((t) => t.length > 0);
  // tokens[0] is guaranteed non-empty: input starts with '/' so split always produces ≥1 item
  const command = (tokens[0] as string).toLowerCase();
  const parser = COMMAND_PARSERS[command];

  if (!parser) {
    return { kind: 'plain', text: input };
  }

  return parser(tokens);
}
