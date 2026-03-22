# @evidify/event-schema

**Open event schema for clinical AI decision provenance.**

Define, validate, and serialize human-AI interaction events for tamper-evident verification. Domain-agnostic. PHI-free by design. Zero dependencies.

---

## The Problem

When a clinician interacts with an AI recommendation — accepts it, modifies it, overrides it — that decision sequence either isn't recorded at all, or it's recorded in a way that can't be independently verified later.

Every clinical AI system will eventually need to answer: **"What did the AI suggest, and what did the clinician do with it?"**

This package defines the event schema for capturing that interaction with integrity.

## Design Principles

1. **PHI-free by structure** — Events contain codes and hashes, never clinical text
2. **Append-only** — Events are immutable once emitted
3. **Domain-agnostic** — Same schema for radiology, cardiology, rehabilitation, pathology
4. **Verification-ready** — Events are designed to be chained, hashed, and verified
5. **Standards-aligned** — Maps to FHIR AuditEvent, CDS Hooks, EU AI Act Article 12

## Install

```bash
npm install @evidify/event-schema
```

## Quick Start

```typescript
import { SessionBuilder, ClinicalEventEmitter } from '@evidify/event-schema';

// Define actors
const clinician = { role: 'clinician', sessionToken: 'dr-001' };
const aiSystem = { role: 'ai_system', sessionToken: 'model-001' };

// Create a session
const session = new SessionBuilder({
  domain: 'ct-cardiac',
  studyId: 'CARDIAC-STUDY-1',
  platform: { name: 'MyApp', version: '1.0.0' },
  enableChaining: true,
});

// Record the clinical encounter
session.start(clinician);
session.setCase('case-001');

// Clinician locks their independent assessment BEFORE seeing AI
session.emit('ASSESSMENT_LOCKED', clinician, {
  contentHash: 'sha256-of-assessment...',
  category: 'present',
  codeSystem: 'custom',
});

// AI recommendation revealed
session.emit('AI_RECOMMENDATION_REVEALED', aiSystem, {
  modelId: 'cleerly-v2.0',
  contentHash: 'sha256-of-ai-output...',
  outputType: 'recommendation',
  aiConfidence: 0.91,
  urgency: 'URGENT',
});

// Clinician responds to AI
session.emit('AI_OUTPUT_MODIFIED', clinician, {
  aiEventRef: 'event-id-of-ai-reveal',
  action: 'modified',
  resultContentHash: 'sha256-of-modified-assessment...',
  deliberationTimeMs: 4200,
  confidenceShift: -12,
});

// Session complete
session.end();

// Export verified envelope
const envelope = session.toEnvelope();
console.log(`Events: ${envelope.eventCount}`);
console.log(`Chain: ${envelope.chainIntegrity}`);
console.log(`Root hash: ${envelope.rootHash}`);
```

## Real-Time Emitter

For live clinical encounters, use the `ClinicalEventEmitter` with automatic buffering and flush:

```typescript
import { ClinicalEventEmitter } from '@evidify/event-schema';

const emitter = new ClinicalEventEmitter({
  domain: 'rehab-neuromod',
  platform: { name: 'PMP', version: '2.0' },
  flushIntervalMs: 5000,
  onFlush: async (events) => {
    // Persist to local SQLite, send to Evidify, etc.
    await db.insertBatch(events);
  },
  onEvent: (event) => {
    // Real-time subscriber (e.g., update UI, analytics)
    console.log(`[${event.type}] ${event.timestamp}`);
  },
});

emitter.startSession(clinician);

// Track ephemeral AI suggestions (shown but not saved)
emitter.ephemeralShown(aiSystem, 'sidebar_panel', 'diff-hash');
emitter.ephemeralDismissed(aiSystem, 'sidebar_panel', 'diff-hash', 3200);

// Track AI draft editing
emitter.emit('AI_DRAFT_EDITED', clinician, {
  originalHash: 'ai-draft-hash',
  modifiedHash: 'human-edited-hash',
  diffFormat: 'json-patch',
  diff: [{ op: 'replace', path: '/assessment', value: 'changed' }],
  attribution: {
    aiOriginatedPercent: 60,
    humanOriginatedPercent: 10,
    humanEditedPercent: 30,
  },
});

const envelope = emitter.endSession();
emitter.destroy();
```

## Event Taxonomy

### Categories

| Category | Description | Example Events |
|----------|-------------|----------------|
| `session` | Session lifecycle | SESSION_STARTED, SESSION_ENDED, CASE_STARTED |
| `assessment` | Clinician assessments | ASSESSMENT_LOCKED, CONFIDENCE_RECORDED |
| `ai_output` | AI recommendations | AI_RECOMMENDATION_REVEALED, AI_DRAFT_GENERATED |
| `ai_interaction` | Clinician responses to AI | AI_OUTPUT_ACCEPTED, AI_OUTPUT_REJECTED |
| `comprehension` | Error rate disclosure | ERROR_RATE_DISCLOSED, COMPREHENSION_GATE_PASSED |
| `documentation` | Override documentation | OVERRIDE_DOCUMENTED, RATIONALE_RECORDED |
| `ephemeral` | Shown-but-not-saved AI | EPHEMERAL_SUGGESTION_SHOWN, EPHEMERAL_PANEL_DISMISSED |
| `viewer` | Image/document interactions | VIEWER_INTERACTION, VIEWER_MEASUREMENT_TAKEN |
| `quality` | Automated quality flags | QUALITY_FLAG_RAISED, GAMING_PATTERN_DETECTED |
| `system` | Platform events | SYSTEM_ATTESTATION, SYSTEM_EXPORT_GENERATED |

### Key Event Sequence

The core provenance pattern captured by this schema:

```
ASSESSMENT_LOCKED          ← Clinician commits independent judgment
  ↓
AI_RECOMMENDATION_REVEALED ← AI output shown AFTER commitment
  ↓
AI_OUTPUT_ACCEPTED         ← Clinician accepts, modifies, or rejects
  | AI_OUTPUT_MODIFIED
  | AI_OUTPUT_REJECTED
  ↓
OVERRIDE_DOCUMENTED        ← Structured reasoning if changed
  ↓
CONFIDENCE_RECORDED        ← Post-AI confidence level
```

## Validation

```typescript
import { validateEvent, validateSession, detectPotentialPHI } from '@evidify/event-schema';

// Validate a single event
const result = validateEvent(event);
if (!result.valid) {
  console.error(result.errors);
}

// Validate a session envelope
const sessionResult = validateSession(envelope);

// Check for accidental PHI leakage
const phiCheck = detectPotentialPHI(event);
if (!phiCheck.valid) {
  console.warn('Potential PHI detected:', phiCheck.errors);
}
```

## Chain Verification

```typescript
import { verifySessionChain } from '@evidify/event-schema';

const result = verifySessionChain(envelope);
console.log(result.valid);   // true/false
console.log(result.details);  // "Chain verified: 15 events, root hash abc123..."
```

## Supported Domains

The schema is domain-agnostic. It works for any clinical AI interaction:

| Domain | Example Use | Status |
|--------|------------|--------|
| Radiology (CT/MRI) | AI-assisted hemorrhage detection | Production |
| Cardiac Imaging | Coronary stenosis AI evaluation | Production |
| Mammography | AI-assisted breast screening | Production |
| Rehabilitation | AI copilot treatment planning | Designed |
| Ambient AI Scribes | Document attribution tracking | Designed |
| Pathology | AI-assisted slide analysis | Planned |
| Ophthalmology | Diabetic retinopathy AI | Planned |

## Regulatory Alignment

| Regulation | How This Schema Helps |
|-----------|----------------------|
| EU AI Act Article 12 | Automatic event logging for high-risk AI (mandatory Aug 2026) |
| HIPAA §164.312(b) | Audit controls for ePHI access |
| 21 CFR Part 11 | Electronic records with tamper-evident audit trails |
| ONC HTI-1 | Source attributes for predictive decision support |
| FSMB Guidance | Document rationale for accepting/rejecting AI |

## License

MIT — free for research and commercial use.

## Citation

If you use this schema in research, please cite:

```
Henderson, J.M. (2026). @evidify/event-schema: An open event schema for
clinical AI decision provenance. Evidify LLC. https://github.com/evidifyai-svg/event-schema
```

## About

Created by [Joshua M. Henderson, Ph.D.](https://evidify.ai) | [Evidify LLC](https://evidify.ai)

The flight recorder for AI-assisted clinical decisions.
