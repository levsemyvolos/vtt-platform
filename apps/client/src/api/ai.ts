import type { AssistantTextRequest, AssistantTextResponse } from '@vtt/shared';
import { apiFetch } from './apiFetch';

export function postAssistantText(req: AssistantTextRequest): Promise<AssistantTextResponse> {
  return apiFetch<AssistantTextResponse>('/api/ai/text', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
