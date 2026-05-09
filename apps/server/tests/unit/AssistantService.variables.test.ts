import { describe, it, expect, vi } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

function makeProvider(text = 'mock'): AIProvider {
  return {
    generateText: vi.fn().mockResolvedValue(text),
    generateImage: vi.fn(),
    generateMusic: vi.fn(),
  } as unknown as AIProvider;
}

describe('AssistantService.resolveVariables (S3.1)', () => {
  it('empty req + empty conv → empty vars', () => {
    const out = AssistantService.resolveVariables({}, {});
    expect(out).toEqual({});
  });

  it('request-only values pass through', () => {
    const out = AssistantService.resolveVariables({
      ruleset: 'Pathfinder 2e', setting: 'ringworld', playerLevel: 5, tone: 'noir', outputLanguage: 'English',
    });
    expect(out).toEqual({ ruleset: 'Pathfinder 2e', setting: 'ringworld', playerLevel: 5, tone: 'noir', outputLanguage: 'English' });
  });

  it('conversation defaults flow through when request is empty', () => {
    const out = AssistantService.resolveVariables({}, { ruleset: 'Shadowdark', tone: 'dark fantasy' });
    expect(out).toEqual({ ruleset: 'Shadowdark', tone: 'dark fantasy' });
  });

  it('request value beats conversation default (priority A > B)', () => {
    const out = AssistantService.resolveVariables(
      { ruleset: 'Shadowdark' },
      { ruleset: 'D&D 5e (2014 SRD)', tone: 'grimdark' },
    );
    expect(out).toEqual({ ruleset: 'Shadowdark', tone: 'grimdark' });
  });

  it('empty-string request value falls through to conv default', () => {
    const out = AssistantService.resolveVariables({ ruleset: '   ' }, { ruleset: 'D&D 5e (2014 SRD)' });
    expect(out.ruleset).toBe('D&D 5e (2014 SRD)');
  });

  it('playerLevel === 0 in request falls through (treated as not-set)', () => {
    const out = AssistantService.resolveVariables({ playerLevel: 0 }, { playerLevel: 5 });
    expect(out.playerLevel).toBe(5);
  });

  it('negative playerLevel in conv default is ignored', () => {
    const out = AssistantService.resolveVariables({}, { playerLevel: -3 });
    expect(out.playerLevel).toBeUndefined();
  });
});

describe('AssistantService.buildVariablesBlock (S3.1)', () => {
  it('returns empty string for empty vars', () => {
    expect(AssistantService.buildVariablesBlock({})).toBe('');
  });

  it('emits only the lines for set fields', () => {
    const block = AssistantService.buildVariablesBlock({ ruleset: 'Cairn 2e', tone: 'cozy' });
    expect(block).toContain('--- Session variables ---');
    expect(block).toContain('- Ruleset: Cairn 2e');
    expect(block).toContain('- Tone: cozy');
    expect(block).not.toContain('- Setting:');
    expect(block).not.toContain('- Player level:');
    expect(block).toContain('--- /Session variables ---');
  });

  it('emits all 5 lines for full vars in stable order', () => {
    const block = AssistantService.buildVariablesBlock({
      ruleset: 'D&D 5e (2014 SRD)',
      setting: 'underdark city',
      playerLevel: 7,
      tone: 'grimdark',
      outputLanguage: 'Ukrainian',
    });
    const idxR = block.indexOf('Ruleset:');
    const idxS = block.indexOf('Setting:');
    const idxP = block.indexOf('Player level:');
    const idxT = block.indexOf('Tone:');
    const idxO = block.indexOf('Output language:');
    expect(idxR).toBeGreaterThan(0);
    expect(idxS).toBeGreaterThan(idxR);
    expect(idxP).toBeGreaterThan(idxS);
    expect(idxT).toBeGreaterThan(idxP);
    expect(idxO).toBeGreaterThan(idxT);
  });

  it('uses §2.13.X-style fence dividers (--- Session variables ---)', () => {
    const block = AssistantService.buildVariablesBlock({ ruleset: 'X' });
    expect(block).toMatch(/--- Session variables ---/);
    expect(block).toMatch(/--- \/Session variables ---/);
  });
});

describe('AssistantService.convToVars (S3.1)', () => {
  it('all-null Prisma row → empty vars', () => {
    expect(AssistantService.convToVars({
      defaultRuleset: null, defaultSetting: null, defaultPlayerLevel: null,
      defaultTone: null, defaultOutputLanguage: null,
    })).toEqual({});
  });

  it('populated row → mapped vars', () => {
    const out = AssistantService.convToVars({
      defaultRuleset: 'Shadowdark', defaultSetting: null, defaultPlayerLevel: 3,
      defaultTone: 'pulp', defaultOutputLanguage: null,
    });
    expect(out).toEqual({ ruleset: 'Shadowdark', playerLevel: 3, tone: 'pulp' });
  });
});

describe('AssistantService.generateAssistantText with variables (S3.1, S6.1)', () => {
  it('injects --- Session variables --- block when ruleset is set', async () => {
    const provider = makeProvider('mock');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      roomId: 'r', context: 'npc-description', userPrompt: 'tavern keeper',
      ruleset: 'Pathfinder 2e', tone: 'cozy',
    });
    // S6.1: variables go into the system instruction (framing context, not user input).
    const arg = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { system: string; user: string };
    expect(arg.system).toContain('--- Session variables ---');
    expect(arg.system).toContain('- Ruleset: Pathfinder 2e');
    expect(arg.system).toContain('- Tone: cozy');
  });

  it('omits the variables block entirely when no vars are passed', async () => {
    const provider = makeProvider('mock');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      roomId: 'r', context: 'free-chat', userPrompt: 'random idea',
    });
    const arg = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { system: string };
    expect(arg.system).not.toContain('--- Session variables ---');
  });

  it('places variables block after system prompt and user is in separate field', async () => {
    const provider = makeProvider('mock');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      roomId: 'r', context: 'npc-description', userPrompt: 'TEST_USER',
      ruleset: 'Shadowdark',
    });
    const arg = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { system: string; user: string };
    const sysIdx = arg.system.indexOf('master-tier TTRPG');
    const varsIdx = arg.system.indexOf('--- Session variables ---');
    expect(sysIdx).toBeGreaterThanOrEqual(0);
    expect(varsIdx).toBeGreaterThan(sysIdx);
    // S6.1 history-spoof guard: user prompt is NOT in system instruction.
    expect(arg.system).not.toContain('TEST_USER');
    expect(arg.user).toBe('TEST_USER');
  });
});
