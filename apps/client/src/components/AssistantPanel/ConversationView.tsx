import { useState, useEffect, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import ReactMarkdown from 'react-markdown';
import type { AssistantContext, ConversationMessage, AIImageRequest, AIImageResponse, AIMusicRequest, AIMusicResponse, AssistantVariables } from '@vtt/shared';
import NpcCard, { tryParseNpc } from './NpcCard';
import { useAppDispatch, useAppSelector } from '../../store';
import { sendAssistantMessage, regenerateAssistantMessage, editLastUserMessage, mapAIErrorKindToI18n } from '../../store/assistant';
import { apiFetch, ApiError } from '../../api/apiFetch';
import { createJournalEntry } from '../../api/journal';
import { emitChatMessage } from '../../api/socket';
import { addToast } from '../../store/toast';
import PresetChips from './PresetChips';
import ConversationVariables from './ConversationVariables';
import styles from './ConversationView.module.css';

export type MainTab = 'llm' | 'image' | 'music' | 'history';

// ─── MessageRow helpers ──────────────────────────────────────────────────────

interface BubbleProps {
  msg: ConversationMessage;
  context: AssistantContext;
  isEditing: boolean;
  editText: string;
  onEditChange: (val: string) => void;
}

function formatMsgTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderParagraph(para: string, idx: number): JSX.Element {
  const m = para.match(/^"(.+)"$/s);
  if (m) {
    return <blockquote key={idx} className={styles.speech}>{m[1]}</blockquote>;
  }
  return <ReactMarkdown key={idx}>{para}</ReactMarkdown>;
}

function MessageBubble({ msg, context, isEditing, editText, onEditChange }: BubbleProps): JSX.Element {
  const { t } = useTranslation('assistant');
  if (isEditing) {
    return (
      <textarea
        className={styles.textarea}
        value={editText}
        onChange={(e) => onEditChange(e.target.value)}
        rows={3}
        aria-label={t('conversation.actions.editLabel')}
      />
    );
  }
  if (msg.role === 'assistant') {
    // S6.2 — render the structured NPC card when the assistant message
    // for npc-description context parses as the documented JSON shape.
    // Falls through to markdown for legacy markdown-mode replies.
    if (context === 'npc-description') {
      const npc = tryParseNpc(msg.content);
      if (npc) return <NpcCard npc={npc} />;
    }
    const paragraphs = msg.content.split(/\n\n+/);
    return <>{paragraphs.map((p, i) => renderParagraph(p, i))}</>;
  }
  return <p>{msg.content}</p>;
}

interface ActionsProps {
  msg: ConversationMessage;
  idx: number;
  isEditing: boolean;
  canEdit: boolean;
  isLastMsg: boolean;
  editText: string;
  status: 'idle' | 'sending' | 'error';
  onStartEdit: (idx: number, content: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRegenerate: () => void;
  onToNotes: (content: string) => void;
  onToChat: (content: string) => void;
}

interface AssistantOnlyActionsProps {
  content: string;
  isLastMsg: boolean;
  status: 'idle' | 'sending' | 'error';
  onToNotes: (content: string) => void;
  onToChat: (content: string) => void;
  onRegenerate: () => void;
}

function AssistantOnlyActions({ content, isLastMsg, status, onToNotes, onToChat, onRegenerate }: AssistantOnlyActionsProps): JSX.Element {
  const { t } = useTranslation('assistant');
  return (
    <>
      <button type="button" className={styles.actionBtn} onClick={() => onToNotes(content)}>
        {t('conversation.actions.toNotes')}
      </button>
      <button type="button" className={styles.actionBtn} onClick={() => onToChat(content)}>
        {t('conversation.actions.toChat')}
      </button>
      {isLastMsg && (
        <button type="button" className={styles.actionBtn} disabled={status === 'sending'} onClick={onRegenerate}>
          {t('conversation.actions.regenerate')}
        </button>
      )}
    </>
  );
}

interface EditActionsProps {
  editText: string;
  originalContent: string;
  status: 'idle' | 'sending' | 'error';
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

function EditActions({ editText, originalContent, status, onSaveEdit, onCancelEdit }: EditActionsProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const saveDisabled = !editText.trim() || editText.trim() === originalContent || status === 'sending';
  return (
    <>
      <button type="button" className={styles.actionBtn} disabled={saveDisabled} onClick={onSaveEdit}>
        {t('conversation.actions.saveEdit')}
      </button>
      <button type="button" className={styles.actionBtn} onClick={onCancelEdit}>
        {t('conversation.actions.cancelEdit')}
      </button>
    </>
  );
}

function MessageActions({
  msg, idx, isEditing, canEdit, isLastMsg, editText, status,
  onStartEdit, onSaveEdit, onCancelEdit, onRegenerate, onToNotes, onToChat,
}: ActionsProps): JSX.Element | null {
  const { t } = useTranslation('assistant');

  // Hide all actions while this assistant message is still streaming.
  // Otherwise the user could click "В нотатки" / "В чат" / "Копія" on a
  // partial (or empty) response — the journal endpoint then 400s on the
  // empty title (zod .min(1)) and the chat broadcast would propagate a
  // truncated NPC reply. Edit on user msgs is already gated by `canEdit`,
  // which includes `status !== 'sending'`.
  const isStreamingThisMsg =
    msg.role === 'assistant' && isLastMsg && status === 'sending';
  if (isStreamingThisMsg) return null;

  return (
    <div className={styles.messageActions}>
      {!isEditing && (
        <button type="button" className={styles.actionBtn} onClick={() => void navigator.clipboard.writeText(msg.content)}>
          {t('conversation.actions.copy')}
        </button>
      )}
      {!isEditing && msg.role === 'assistant' && (
        <AssistantOnlyActions
          content={msg.content} isLastMsg={isLastMsg} status={status}
          onToNotes={onToNotes} onToChat={onToChat} onRegenerate={onRegenerate}
        />
      )}
      {!isEditing && canEdit && (
        <button type="button" className={styles.actionBtn} onClick={() => onStartEdit(idx, msg.content)}>
          {t('conversation.actions.edit')}
        </button>
      )}
      {isEditing && (
        <EditActions
          editText={editText} originalContent={msg.content} status={status}
          onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
        />
      )}
    </div>
  );
}

// ─── MessageRow ─────────────────────────────────────────────────────────────

interface MessageRowProps {
  msg: ConversationMessage;
  idx: number;
  /** Active conversation context — needed to pick NpcCard vs markdown render. */
  context: AssistantContext;
  isEditing: boolean;
  canEdit: boolean;
  isLastMsg: boolean;
  editText: string;
  status: 'idle' | 'sending' | 'error';
  onStartEdit: (idx: number, content: string) => void;
  onEditChange: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRegenerate: () => void;
  onToNotes: (content: string) => void;
  onToChat: (content: string) => void;
}

function MessageRow({
  msg, idx, context, isEditing, canEdit, isLastMsg, editText, status,
  onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onRegenerate, onToNotes, onToChat,
}: MessageRowProps): JSX.Element {
  const isStreaming = msg.role === 'assistant' && isLastMsg && status === 'sending';
  const timeStr = formatMsgTime(msg.createdAt);
  const eyebrow = msg.role === 'user'
    ? `ASKED${timeStr ? ` · ${timeStr}` : ''}`
    : `COUNSEL${timeStr ? ` · ${timeStr}` : ''}${isStreaming ? ' · STREAMING' : ''}`;

  return (
    <div className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}>
      <div className={styles.roleChip} aria-hidden="true">
        {msg.role === 'user' ? 'YOU' : 'GM'}
      </div>
      <div className={styles.msgBody}>
        <span className={styles.messageRole}>{eyebrow}</span>
        <div className={styles.messageBubble}>
          <MessageBubble msg={msg} context={context} isEditing={isEditing} editText={editText} onEditChange={onEditChange} />
        </div>
        {isStreaming && (
          <div className={styles.streamingTail}>
            <span className={styles.streamingDots}>···</span>
            <span className={styles.streamingLabel}>CONTINUING…</span>
          </div>
        )}
        <MessageActions
          msg={msg} idx={idx} isEditing={isEditing} canEdit={canEdit} isLastMsg={isLastMsg}
          editText={editText} status={status}
          onStartEdit={onStartEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} onRegenerate={onRegenerate}
          onToNotes={onToNotes} onToChat={onToChat}
        />
      </div>
    </div>
  );
}

// ─── Context toggle + preview row ───────────────────────────────────────────

interface ContextToggleRowProps {
  conversationId: string | null;
  checked: boolean;
  onChange: (val: boolean) => void;
  thinkingHigh: boolean;
  onThinkingHighChange: (val: boolean) => void;
}

function ContextToggleRow({ conversationId, checked, onChange, thinkingHigh, onThinkingHighChange }: ContextToggleRowProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadPreview(): Promise<void> {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ text: string }>(`/api/ai/conversations/${conversationId}/context-preview`);
      setText(res.text || t('conversation.contextPreviewEmpty'));
    } catch {
      setText(t('conversation.contextPreviewError'));
    } finally {
      setLoading(false);
    }
  }

  function toggle(): void {
    if (!open && text === '') { void loadPreview(); }
    setOpen((v) => !v);
  }

  return (
    <>
      <div className={styles.contextToggleRow}>
        <label className={styles.contextToggleLabel}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={t('conversation.useSessionContextLabel')}
          />
          <span>{t('conversation.useSessionContextLabel')}</span>
        </label>
        <label className={styles.contextToggleLabel}>
          <input
            type="checkbox"
            checked={thinkingHigh}
            onChange={(e) => onThinkingHighChange(e.target.checked)}
            aria-label={t('conversation.thinkingHighLabel')}
          />
          <span title={t('conversation.thinkingHighTooltip')}>{t('conversation.thinkingHighLabel')}</span>
        </label>
        <button
          type="button"
          className={styles.contextPreviewBtn}
          onClick={toggle}
          aria-expanded={open}
          aria-controls="ai-context-preview"
          title={t('conversation.contextPreviewToggle')}
          disabled={!conversationId}
        >
          {open ? '−' : 'ⓘ'}
        </button>
      </div>
      {open && (
        <pre id="ai-context-preview" className={styles.contextPreview}>
          {loading ? t('conversation.contextPreviewLoading') : text}
        </pre>
      )}
    </>
  );
}

// ─── LLM chat panel ────────────────────────────────────────────────────────

interface LlmPanelProps {
  roomId: string;
}

function LlmPanel({ roomId }: LlmPanelProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('assistant');
  const activeContext = useAppSelector((s) => s.assistant.activeContext);
  const status = useAppSelector((s) => s.assistant.status);
  const error = useAppSelector((s) => s.assistant.error);
  const activeConversationId = useAppSelector((s) => s.assistant.activeConversationId);
  const messages = useAppSelector(
    (s): ConversationMessage[] => activeConversationId ? (s.assistant.messages[activeConversationId] ?? []) : [],
  );
  const [text, setText] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [useSessionCtx, setUseSessionCtx] = useState<boolean>(() => {
    const saved = window.localStorage.getItem('vtt:assistant:useSessionContext');
    return saved === null ? true : saved === '1';
  });

  useEffect(() => {
    window.localStorage.setItem('vtt:assistant:useSessionContext', useSessionCtx ? '1' : '0');
  }, [useSessionCtx]);

  const [thinkingHigh, setThinkingHigh] = useState<boolean>(() => {
    const saved = window.localStorage.getItem('vtt:assistant:thinkingHigh');
    return saved === '1';
  });

  useEffect(() => {
    window.localStorage.setItem('vtt:assistant:thinkingHigh', thinkingHigh ? '1' : '0');
  }, [thinkingHigh]);

  // ─── Session variables (P4 backend, S3.2 UI) ──────────────────────────────
  const activeConv = useAppSelector(
    (s) => activeConversationId ? s.assistant.conversations[activeConversationId] : null,
  );
  const [vars, setVars] = useState<AssistantVariables>({});
  const [varsOpen, setVarsOpen] = useState<boolean>(() => {
    const saved = window.localStorage.getItem('vtt:assistant:varsOpen');
    return saved === '1';
  });
  useEffect(() => {
    window.localStorage.setItem('vtt:assistant:varsOpen', varsOpen ? '1' : '0');
  }, [varsOpen]);
  // Reset form when active conversation changes — load that conv's persisted defaults.
  useEffect(() => {
    setVars(activeConv?.defaults ?? {});
  }, [activeConversationId, activeConv?.defaults]);

  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') return i;
    }
    return -1;
  })();

  function handleSend(): void {
    const trimmed = text.trim();
    if (!trimmed || status === 'sending' || !activeConversationId) return;
    void dispatch(sendAssistantMessage({
      roomId,
      conversationId: activeConversationId,
      context: activeContext,
      prompt: trimmed,
      useSessionContext: useSessionCtx,
      thinkingLevel: thinkingHigh ? 'high' : 'low',
      variables: vars,
    }));
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSend(); }
  }

  async function handleToNotes(content: string): Promise<void> {
    // Defense-in-depth: MessageActions hides this button while the assistant
    // message is still streaming (empty/partial content), but a stale closure
    // could still fire after a dispatch. Bail on empty content so the journal
    // schema's title.min(1) doesn't 400.
    const titleSource = content.replace(/\s+/g, ' ').trim();
    if (!titleSource) return;
    const title = titleSource.length > 60 ? `${titleSource.slice(0, 57)}…` : titleSource;
    try {
      await createJournalEntry(roomId, { title, body: content });
      dispatch(addToast('success', t('conversation.toastSavedToNotes')));
    } catch (err) {
      void err;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatch(addToast('error', i18next.t('errors:network.saveFailed' as any)));
    }
  }

  async function handleToChat(content: string): Promise<void> {
    // Defense-in-depth (see handleToNotes). Without this guard the chat
    // broadcast would propagate an empty IC message to the room.
    if (!content.trim()) return;
    try {
      await emitChatMessage({ roomId, text: content, mode: 'ic' });
      dispatch(addToast('success', t('conversation.toastSentToChat')));
    } catch (err) {
      void err;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatch(addToast('error', i18next.t('errors:network.saveFailed' as any)));
    }
  }

  return (
    <div className={styles.conversation}>
      <div className={styles.messages}>
        {!activeConversationId && <p className={styles.empty}>{t('conversation.noConversation')}</p>}
        {activeConversationId && messages.length === 0 && <p className={styles.empty}>{t('conversation.empty')}</p>}
        {messages.map((msg, idx) => (
          <MessageRow
            key={idx}
            msg={msg}
            idx={idx}
            context={activeContext}
            isEditing={editingIdx === idx}
            canEdit={msg.role === 'user' && idx === lastUserIdx && status !== 'sending' && !!activeConversationId}
            isLastMsg={idx === messages.length - 1}
            editText={editText}
            status={status}
            onStartEdit={(i, content) => { setEditingIdx(i); setEditText(content); }}
            onEditChange={setEditText}
            onSaveEdit={() => {
              const trimmed = editText.trim();
              if (!trimmed || !activeConversationId) return;
              void dispatch(editLastUserMessage({ conversationId: activeConversationId, newContent: trimmed }));
              setEditingIdx(null);
              setEditText('');
            }}
            onCancelEdit={() => { setEditingIdx(null); setEditText(''); }}
            onRegenerate={() => {
              if (!activeConversationId) return;
              void dispatch(regenerateAssistantMessage({ roomId, conversationId: activeConversationId, context: activeContext }));
            }}
            onToNotes={(content) => { void handleToNotes(content); }}
            onToChat={(content) => { void handleToChat(content); }}
          />
        ))}
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {error && status === 'error' && <p className={styles.error} role="alert">{i18next.t(error as any)}</p>}
      <ContextToggleRow
        conversationId={activeConversationId}
        checked={useSessionCtx}
        onChange={setUseSessionCtx}
        thinkingHigh={thinkingHigh}
        onThinkingHighChange={setThinkingHigh}
      />
      <ConversationVariables
        conversationId={activeConversationId}
        value={vars}
        onChange={setVars}
        open={varsOpen}
        onToggle={setVarsOpen}
      />
      <div className={styles.inputBar}>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('input.placeholder')}
          rows={3}
          disabled={status === 'sending'}
          aria-label={t('input.inputLabel')}
        />
        <div className={styles.inputActions}>
          <PresetChips context={activeContext} onSelect={(prompt) => setText(prompt)} />
          <span className={styles.keyHint} aria-hidden="true">
            <kbd className={styles.kbd}>Ctrl</kbd>
            +
            <kbd className={styles.kbd}>Enter</kbd>
          </span>
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={status === 'sending' || !text.trim() || !activeConversationId}
            aria-label={t('input.sendLabel')}
          >
            {status === 'sending' ? t('input.sending') : t('input.sendBtn')}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6h8M7 3l3 3-3 3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Generate panel (Image / Music) ────────────────────────────────────────

interface GeneratePanelProps {
  type: 'image' | 'music';
  roomId: string;
}

function GeneratePanel({ type, roomId }: GeneratePanelProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<AIImageResponse | null>(null);
  const [musicResult, setMusicResult] = useState<AIMusicResponse | null>(null);

  const promptLabel = type === 'image' ? t('conversation.imagePromptLabel') : t('conversation.musicPromptLabel');
  const hint = type === 'image' ? t('conversation.imageHint') : t('conversation.musicHint');

  async function handleGenerate(): Promise<void> {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setImageResult(null);
    setMusicResult(null);
    try {
      if (type === 'image') {
        const body: AIImageRequest = { prompt: prompt.trim(), roomId };
        const res = await apiFetch<AIImageResponse>('/api/ai/image', { method: 'POST', body: JSON.stringify(body) });
        setImageResult(res);
      } else {
        const body: AIMusicRequest = { prompt: prompt.trim(), roomId };
        const res = await apiFetch<AIMusicResponse>('/api/ai/music', { method: 'POST', body: JSON.stringify(body) });
        setMusicResult(res);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError(i18next.t(mapAIErrorKindToI18n(err.kind, err.status) as any));
      } else {
        setError(t('conversation.generateError'));
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className={styles.conversation}>
      <div className={styles.generatePanel}>
        <p className={styles.generateHint}>{hint}</p>
        <textarea
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={promptLabel}
          rows={4}
          aria-label={promptLabel}
          disabled={generating}
        />
        <button
          type="button"
          className={styles.generateBtn}
          onClick={() => void handleGenerate()}
          disabled={generating || !prompt.trim()}
        >
          {generating ? t('conversation.generating') : t('conversation.generateBtn')}
        </button>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {imageResult && (
          <div className={styles.previewBox}>
            <img src={imageResult.previewUrl} alt={t('conversation.imagePreviewAlt')} className={styles.previewImg} />
          </div>
        )}
        {musicResult && (
          <div className={styles.previewBox}>
            <audio controls src={musicResult.previewUrl} style={{ width: '100%' }}>
              {t('conversation.audioUnsupported')}
            </audio>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History panel ──────────────────────────────────────────────────────────

interface HistoryPanelProps {
  roomId: string;
}

function HistoryPanel({ roomId }: HistoryPanelProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const conversationsMap = useAppSelector((s) => s.assistant.conversations);
  const messagesMap = useAppSelector((s) => s.assistant.messages);

  const threads = Object.values(conversationsMap)
    .filter((c) => c.roomId === roomId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className={styles.conversation}>
      <div className={styles.messages}>
        {threads.length === 0 && (
          <p className={styles.empty}>{t('conversation.historyEmpty')}</p>
        )}
        {threads.map((c) => {
          const msgs = messagesMap[c.id] ?? [];
          const tail = msgs.slice(-3);
          return (
            <div key={c.id} className={styles.historyGroup}>
              <p className={styles.historyId}>
                {c.title} · {t(`context.${c.context}`)} · {new Date(c.updatedAt).toLocaleDateString()}
              </p>
              {tail.length === 0 && (
                <p className={styles.historyMsg}><em>{t('conversation.historyNoMessages')}</em></p>
              )}
              {tail.map((msg, idx) => (
                <p key={idx} className={styles.historyMsg}>
                  <strong>
                    {msg.role === 'user' ? t('conversation.roleUser') : t('conversation.roleAssistant')}:
                  </strong>{' '}
                  {msg.content.length > 80 ? `${msg.content.slice(0, 80)}…` : msg.content}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Public component ───────────────────────────────────────────────────────

interface ConversationViewProps {
  roomId: string;
  mainTab: MainTab;
}

export default function ConversationView({ roomId, mainTab }: ConversationViewProps): JSX.Element {
  if (mainTab === 'llm') return <LlmPanel roomId={roomId} />;
  if (mainTab === 'image') return <GeneratePanel type="image" roomId={roomId} />;
  // Music tab is rendered directly from AssistantPanel (with sibling MusicHistoryList);
  // ConversationView is not invoked for music. Keep history as the catch-all.
  return <HistoryPanel roomId={roomId} />;
}
