/**
 * @evidify/event-schema — Clinical Event Emitter
 *
 * A lightweight wrapper around SessionBuilder that provides
 * a simple pub/sub interface for clinical AI applications.
 *
 * Designed for real-time use: non-blocking, minimal overhead,
 * with optional buffering for batch persistence.
 */

import type {
  ClinicalAIEvent,
  EventType,
  EventPayloadMap,
  Actor,
  BaseEventPayload,
  ModelProvenance,
  EventSchemaConfig,
  SessionEnvelope,
} from './types';
import { SessionBuilder } from './session';

// ─── Listener Types ─────────────────────────────────────────────────────────

/** Callback for event listeners */
export type EventListener = (event: ClinicalAIEvent) => void;

/** Callback for specific event types */
export type TypedEventListener<T extends EventType> = (event: ClinicalAIEvent<T>) => void;

/** Callback for batched event flushing */
export type FlushCallback = (events: ReadonlyArray<ClinicalAIEvent>) => void | Promise<void>;

// ─── Emitter Options ────────────────────────────────────────────────────────

export interface EmitterOptions extends Partial<EventSchemaConfig> {
  domain: string;
  /** Buffer size before auto-flush (default: 100) */
  bufferSize?: number;
  /** Auto-flush interval in ms (default: 5000, 0 = disabled) */
  flushIntervalMs?: number;
  /** Callback when buffer is flushed */
  onFlush?: FlushCallback;
  /** Callback on every event (for real-time subscribers) */
  onEvent?: EventListener;
  /** Callback on validation errors */
  onError?: (error: Error, event?: ClinicalAIEvent) => void;
}

// ─── Clinical Event Emitter ─────────────────────────────────────────────────

/**
 * A clinical AI event emitter for real-time applications.
 *
 * @example
 * ```typescript
 * const emitter = new ClinicalEventEmitter({
 *   domain: 'rehab-neuromod',
 *   platform: { name: 'PMP', version: '2.0' },
 *   onFlush: async (events) => {
 *     await db.insertEvents(events);
 *   },
 * });
 *
 * // Start session
 * emitter.startSession({ role: 'clinician', sessionToken: 'dr-david' });
 *
 * // During encounter
 * emitter.setCase('encounter-001');
 * emitter.assessmentLocked(clinician, contentHash);
 * emitter.aiRevealed(aiSystem, modelId, contentHash);
 * emitter.aiAccepted(clinician, aiEventId, deliberationMs);
 *
 * // Ephemeral tracking
 * emitter.ephemeralShown(aiSystem, 'sidebar_panel', diffHash);
 * emitter.ephemeralDismissed(aiSystem, 'sidebar_panel', diffHash, 3200);
 *
 * // End session
 * const envelope = emitter.endSession();
 * ```
 */
export class ClinicalEventEmitter {
  private session: SessionBuilder;
  private options: Required<Omit<EmitterOptions, keyof EventSchemaConfig>> & EmitterOptions;
  private listeners: Map<string, Set<EventListener>> = new Map();
  private buffer: ClinicalAIEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: EmitterOptions) {
    this.options = {
      bufferSize: 100,
      flushIntervalMs: 5000,
      ...options,
    } as any;

    this.session = new SessionBuilder({
      domain: options.domain,
      studyId: options.studyId,
      condition: options.condition,
      enableChaining: options.enableChaining ?? true,
      enableSigning: options.enableSigning ?? false,
      platform: options.platform || { name: 'unknown', version: '0.0.0' },
      ephemeral: options.ephemeral,
    });

    // Start auto-flush timer
    if (this.options.flushIntervalMs && this.options.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(err => {
          this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
        });
      }, this.options.flushIntervalMs);
    }
  }

  /** Get the session ID */
  get sessionId(): string {
    return this.session.id;
  }

  /** Get current event count */
  get eventCount(): number {
    return this.session.eventCount;
  }

  // ── Session Lifecycle ──

  startSession(actor: Actor): ClinicalAIEvent<'SESSION_STARTED'> {
    const event = this.session.start(actor);
    this.notifyAndBuffer(event);
    return event;
  }

  endSession(actor?: Actor): SessionEnvelope {
    const event = this.session.end(actor);
    this.notifyAndBuffer(event);
    // Final flush
    this.flush().catch(() => {});
    this.stopFlushTimer();
    return this.session.toEnvelope();
  }

  setCase(caseId: string | null): void {
    this.session.setCase(caseId);
  }

  addModel(model: ModelProvenance): void {
    this.session.addModel(model);
  }

  // ── Core Emission ──

  /**
   * Emit any event type with full type safety.
   */
  emit<T extends EventType>(
    type: T,
    actor: Actor,
    payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : BaseEventPayload,
  ): ClinicalAIEvent<T> {
    try {
      const event = this.session.emit(type, actor, payload);
      this.notifyAndBuffer(event);
      return event;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      throw error;
    }
  }

  // ── Convenience Methods ──

  /** Lock clinician's independent assessment (pre-AI gate) */
  assessmentLocked(actor: Actor, contentHash: string, options?: {
    assessmentCode?: string; codeSystem?: string; category?: string;
  }): ClinicalAIEvent<'ASSESSMENT_LOCKED'> {
    return this.emit('ASSESSMENT_LOCKED', actor, {
      contentHash,
      assessmentCode: options?.assessmentCode,
      codeSystem: options?.codeSystem,
      category: options?.category,
    });
  }

  /** Record AI recommendation revealed to clinician */
  aiRevealed(actor: Actor, modelId: string, contentHash: string, options?: {
    aiConfidence?: number; modelVersion?: string; urgency?: 'STAT' | 'URGENT' | 'ROUTINE' | 'LOW';
  }): ClinicalAIEvent<'AI_RECOMMENDATION_REVEALED'> {
    return this.emit('AI_RECOMMENDATION_REVEALED', actor, {
      modelId,
      contentHash,
      outputType: 'recommendation',
      ...options,
    });
  }

  /** Record clinician accepted AI output */
  aiAccepted(actor: Actor, aiEventRef: string, deliberationTimeMs?: number): ClinicalAIEvent<'AI_OUTPUT_ACCEPTED'> {
    return this.emit('AI_OUTPUT_ACCEPTED', actor, {
      aiEventRef,
      action: 'accepted',
      deliberationTimeMs,
    });
  }

  /** Record clinician rejected AI output */
  aiRejected(actor: Actor, aiEventRef: string, deliberationTimeMs?: number): ClinicalAIEvent<'AI_OUTPUT_REJECTED'> {
    return this.emit('AI_OUTPUT_REJECTED', actor, {
      aiEventRef,
      action: 'rejected',
      deliberationTimeMs,
    });
  }

  /** Record clinician modified AI output */
  aiModified(actor: Actor, aiEventRef: string, resultContentHash: string, options?: {
    deliberationTimeMs?: number; confidenceShift?: number;
  }): ClinicalAIEvent<'AI_OUTPUT_MODIFIED'> {
    return this.emit('AI_OUTPUT_MODIFIED', actor, {
      aiEventRef,
      action: 'modified',
      resultContentHash,
      ...options,
    });
  }

  /** Record ephemeral AI suggestion shown */
  ephemeralShown(actor: Actor, elementType: 'tooltip' | 'sidebar_panel' | 'autocomplete' | 'inline_suggestion' | 'modal' | 'notification', contentHash: string): ClinicalAIEvent<'EPHEMERAL_SUGGESTION_SHOWN'> {
    return this.emit('EPHEMERAL_SUGGESTION_SHOWN', actor, {
      elementType,
      contentHash,
      wasVisible: true,
    });
  }

  /** Record ephemeral suggestion dismissed */
  ephemeralDismissed(actor: Actor, elementType: 'tooltip' | 'sidebar_panel' | 'autocomplete' | 'inline_suggestion' | 'modal' | 'notification', contentHash: string, displayDurationMs: number): ClinicalAIEvent<'EPHEMERAL_SUGGESTION_DISMISSED'> {
    return this.emit('EPHEMERAL_SUGGESTION_DISMISSED', actor, {
      elementType,
      contentHash,
      displayDurationMs,
      wasVisible: true,
    });
  }

  /** Record override documentation */
  overrideDocumented(actor: Actor, reasonCode: string, codeSystem: string, category: 'clinical' | 'process' | 'agreement' | 'escalation' | 'other', rationaleHash?: string): ClinicalAIEvent<'OVERRIDE_DOCUMENTED'> {
    return this.emit('OVERRIDE_DOCUMENTED', actor, {
      reasonCode,
      codeSystem,
      category,
      rationaleHash,
    });
  }

  /** Record confidence level */
  confidenceRecorded(actor: Actor, value: number, target: 'assessment' | 'ai_output' | 'diagnosis' | 'treatment'): ClinicalAIEvent<'CONFIDENCE_RECORDED'> {
    const { deriveConfidenceSignal } = require('./events');
    return this.emit('CONFIDENCE_RECORDED', actor, {
      value,
      signal: deriveConfidenceSignal(value),
      target,
    });
  }

  // ── Pub/Sub ──

  /**
   * Subscribe to all events.
   */
  on(listener: EventListener): () => void {
    return this.addListener('*', listener);
  }

  /**
   * Subscribe to events of a specific type.
   */
  onType<T extends EventType>(type: T, listener: TypedEventListener<T>): () => void {
    return this.addListener(type, listener as EventListener);
  }

  /**
   * Remove all listeners.
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  // ── Buffer & Flush ──

  /**
   * Manually flush the event buffer.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = [...this.buffer];
    this.buffer = [];
    if (this.options.onFlush) {
      await this.options.onFlush(batch);
    }
  }

  /**
   * Get the current session envelope (can be called before end).
   */
  getEnvelope(): SessionEnvelope {
    return this.session.toEnvelope();
  }

  /**
   * Get all events.
   */
  getEvents(): ReadonlyArray<ClinicalAIEvent> {
    return this.session.getEvents();
  }

  /**
   * Verify chain integrity.
   */
  verifyChain(): { valid: boolean; brokenAt?: number } {
    return this.session.verifyChain();
  }

  /**
   * Destroy the emitter. Stops flush timer and clears listeners.
   */
  destroy(): void {
    this.stopFlushTimer();
    this.removeAllListeners();
    this.buffer = [];
  }

  // ── Internal ──

  private notifyAndBuffer(event: ClinicalAIEvent): void {
    // Notify wildcard listeners
    this.getListeners('*').forEach(fn => {
      try { fn(event); } catch (err) {
        this.options.onError?.(err instanceof Error ? err : new Error(String(err)), event);
      }
    });

    // Notify type-specific listeners
    this.getListeners(event.type).forEach(fn => {
      try { fn(event); } catch (err) {
        this.options.onError?.(err instanceof Error ? err : new Error(String(err)), event);
      }
    });

    // Global onEvent callback
    this.options.onEvent?.(event);

    // Buffer for flush
    this.buffer.push(event);
    if (this.buffer.length >= (this.options.bufferSize || 100)) {
      this.flush().catch(err => {
        this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
  }

  private addListener(key: string, listener: EventListener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
    return () => {
      this.listeners.get(key)?.delete(listener);
    };
  }

  private getListeners(key: string): Set<EventListener> {
    return this.listeners.get(key) || new Set();
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
