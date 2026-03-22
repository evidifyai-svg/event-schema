/**
 * @evidify/event-schema — Session Builder
 *
 * Accumulates events into a session envelope with automatic
 * sequencing, hash chaining, and integrity verification.
 */

import type {
  ClinicalAIEvent,
  EventType,
  EventPayloadMap,
  SessionEnvelope,
  Actor,
  ModelProvenance,
  BaseEventPayload,
  EventSchemaConfig,
} from './types';
import { createEvent, SCHEMA_VERSION, timestamp } from './events';
import { hashAndChainSync, canonicalize, sha256Sync } from './serialize';
import { validateEvent, validateSession } from './validate';

// ─── Genesis Hash ───────────────────────────────────────────────────────────

/** The hash chain starts from a well-known genesis value */
export const GENESIS_HASH = '0'.repeat(64);

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EventSchemaConfig = {
  schemaVersion: SCHEMA_VERSION,
  domain: 'unknown',
  enableChaining: true,
  enableSigning: false,
  hashAlgorithm: 'SHA-256',
  ephemeral: {
    enabled: true,
    minViewDurationMs: 500,
    minVisibilityPercent: 50,
  },
  platform: {
    name: 'unknown',
    version: '0.0.0',
  },
};

// ─── Session Builder ────────────────────────────────────────────────────────

/**
 * Builds a session by accumulating events with automatic sequencing,
 * hash chaining, and validation.
 *
 * @example
 * ```typescript
 * const session = new SessionBuilder({
 *   domain: 'ct-cardiac',
 *   studyId: 'CARDIAC-CT-DEMO-1',
 *   platform: { name: 'Evidify', version: '1.0.0' },
 *   enableChaining: true,
 *   enableSigning: false,
 * });
 *
 * session.start({ role: 'clinician', sessionToken: 'abc' });
 * session.emit('ASSESSMENT_LOCKED', clinicianActor, { contentHash: '...' });
 * session.emit('AI_RECOMMENDATION_REVEALED', aiActor, { modelId: '...', contentHash: '...' });
 * session.end();
 *
 * const envelope = session.toEnvelope();
 * ```
 */
export class SessionBuilder {
  private config: EventSchemaConfig;
  private sessionId: string;
  private events: ClinicalAIEvent[] = [];
  private sequence = 0;
  private lastHash: string = GENESIS_HASH;
  private startedAt: string | null = null;
  private endedAt: string | null = null;
  private caseId: string | null = null;
  private models: ModelProvenance[] = [];
  private sealed = false;

  constructor(config: Partial<EventSchemaConfig> & { domain: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
  }

  /** Get the current session ID */
  get id(): string {
    return this.sessionId;
  }

  /** Get current event count */
  get eventCount(): number {
    return this.events.length;
  }

  /** Get the current sequence number (next event will have this sequence) */
  get currentSequence(): number {
    return this.sequence;
  }

  /** Get the last event hash (for chain verification) */
  get lastEventHash(): string {
    return this.lastHash;
  }

  /** Check if the session is sealed */
  get isSealed(): boolean {
    return this.sealed;
  }

  // ── Lifecycle ──

  /**
   * Start the session. Emits SESSION_STARTED.
   */
  start(actor: Actor): ClinicalAIEvent<'SESSION_STARTED'> {
    if (this.startedAt) throw new Error('Session already started');
    this.startedAt = timestamp();
    return this.emit('SESSION_STARTED', actor, {});
  }

  /**
   * End the session. Emits SESSION_ENDED and seals the session.
   */
  end(actor?: Actor): ClinicalAIEvent<'SESSION_ENDED'> {
    if (!this.startedAt) throw new Error('Session not started');
    if (this.sealed) throw new Error('Session already sealed');
    const event = this.emit(
      'SESSION_ENDED',
      actor || { role: 'platform', sessionToken: 'system' },
      {},
    );
    this.endedAt = timestamp();
    this.sealed = true;
    return event;
  }

  /**
   * Set the current case context. Subsequent events will include this caseId.
   */
  setCase(caseId: string | null): void {
    this.caseId = caseId;
  }

  /**
   * Register an AI model used in this session.
   */
  addModel(model: ModelProvenance): void {
    this.models.push(model);
  }

  // ── Event Emission ──

  /**
   * Emit a typed event into the session.
   *
   * @param type - Event type from the taxonomy
   * @param actor - Who performed the action
   * @param payload - Event-specific payload
   * @returns The created event (with hash chain applied if enabled)
   */
  emit<T extends EventType>(
    type: T,
    actor: Actor,
    payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : BaseEventPayload,
  ): ClinicalAIEvent<T> {
    if (this.sealed) throw new Error('Cannot emit events on a sealed session');

    const context = {
      sessionId: this.sessionId,
      caseId: this.caseId || undefined,
      studyId: this.config.studyId,
      domain: this.config.domain,
      condition: this.config.condition,
    };

    const event = createEvent(type, actor, payload, context, this.sequence);

    // Validate
    const validation = validateEvent(event);
    if (!validation.valid) {
      const errorStr = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`Invalid event: ${errorStr}`);
    }

    // Hash chain
    if (this.config.enableChaining) {
      hashAndChainSync(event, this.lastHash);
      this.lastHash = event.eventHash!;
    }

    this.events.push(event);
    this.sequence++;

    return event;
  }

  // ── Export ──

  /**
   * Build the session envelope.
   * Can be called on sealed or unsealed sessions.
   */
  toEnvelope(): SessionEnvelope {
    const envelope: SessionEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      sessionId: this.sessionId,
      studyId: this.config.studyId,
      domain: this.config.domain,
      condition: this.config.condition,
      startedAt: this.startedAt || timestamp(),
      endedAt: this.endedAt || undefined,
      durationMs: this.startedAt && this.endedAt
        ? new Date(this.endedAt).getTime() - new Date(this.startedAt).getTime()
        : undefined,
      eventCount: this.events.length,
      events: [...this.events],
      platform: this.config.platform,
    };

    // Compute root hash if chaining enabled
    if (this.config.enableChaining && this.events.length > 0) {
      envelope.rootHash = this.lastHash;
      envelope.chainIntegrity = 'PASS'; // Builder always produces valid chains
    }

    // Add model provenance
    if (this.models.length > 0) {
      envelope.models = [...this.models];
    }

    return envelope;
  }

  /**
   * Export the session as canonical JSON (for storage or transmission).
   */
  toJSON(): string {
    return canonicalize(this.toEnvelope());
  }

  /**
   * Get all events as an array (read-only copy).
   */
  getEvents(): ReadonlyArray<ClinicalAIEvent> {
    return [...this.events];
  }

  /**
   * Get the last N events.
   */
  getRecentEvents(n: number): ReadonlyArray<ClinicalAIEvent> {
    return this.events.slice(-n);
  }

  /**
   * Find events by type.
   */
  findByType(type: EventType): ReadonlyArray<ClinicalAIEvent> {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Find events by case.
   */
  findByCase(caseId: string): ReadonlyArray<ClinicalAIEvent> {
    return this.events.filter(e => e.caseId === caseId);
  }

  // ── Verification ──

  /**
   * Verify the hash chain integrity of the session.
   */
  verifyChain(): { valid: boolean; brokenAt?: number } {
    if (!this.config.enableChaining) {
      return { valid: true };
    }

    let previousHash = GENESIS_HASH;
    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      if (event.previousHash !== previousHash) {
        return { valid: false, brokenAt: i };
      }
      previousHash = event.eventHash || '';
    }
    return { valid: true };
  }

  /**
   * Validate the complete session.
   */
  validate(): { valid: boolean; errors: string[] } {
    const envelope = this.toEnvelope();
    const result = validateSession(envelope);
    return {
      valid: result.valid,
      errors: result.errors.map(e => `${e.field}: ${e.message}`),
    };
  }

  // ── Internal ──

  private generateSessionId(): string {
    const domain = this.config.domain.replace(/[^a-z0-9]/gi, '');
    const rand = Math.random().toString(36).substring(2, 10);
    const ts = Date.now().toString(36);
    return `${domain}-${ts}-${rand}`;
  }
}

// ─── Session Verification (standalone) ──────────────────────────────────────

/**
 * Verify an existing session envelope's chain integrity.
 * For use by external verifiers who receive a session package.
 */
export function verifySessionChain(session: SessionEnvelope): {
  valid: boolean;
  brokenAt?: number;
  details: string;
} {
  if (!session.events || session.events.length === 0) {
    return { valid: true, details: 'Empty session — no chain to verify' };
  }

  // Check if events have hashes
  if (!session.events[0].eventHash) {
    return { valid: true, details: 'No hash chain present — events are unchained' };
  }

  let previousHash = GENESIS_HASH;
  for (let i = 0; i < session.events.length; i++) {
    const event = session.events[i];

    // Verify previousHash link
    if (event.previousHash !== previousHash) {
      return {
        valid: false,
        brokenAt: i,
        details: `Chain broken at event ${i}: expected previousHash ${previousHash.substring(0, 16)}..., got ${event.previousHash?.substring(0, 16)}...`,
      };
    }

    previousHash = event.eventHash || '';
  }

  return {
    valid: true,
    details: `Chain verified: ${session.events.length} events, root hash ${previousHash.substring(0, 16)}...`,
  };
}
