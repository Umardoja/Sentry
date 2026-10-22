# Pass 4 pitch claims ledger

## Supported with required qualification

- **Measured:** the comparison ran 66 supported synthetic available-evidence episodes with 0 engine errors. **Qualification:** deliberately constructed internal fixtures, not bank data or external validation.
- **Measured:** purpose rules, behaviour/identity, their logical union and the current full score were evaluated on the same per-episode SQLite facts. **Qualification:** A–C are declared experimental comparators; D is an engine-level recommendation, not the complete reviewer workflow.
- **Measured:** 66/66 supported outputs were unchanged when only post-prediction hidden labels changed. **Qualification:** this is a narrow code-path check, not proof against every leakage channel.
- **Measured:** genuine ticket episodes retain first and post-ticket outputs. **Qualification:** ticket evidence supports its valid scope and does not authorize another customer's destination.
- **Measured:** the simple union produced TP=42, FN=0, FP=0, TN=24; Full SENTRY produced TP=12, FN=30, FP=0, TN=24. **Qualification:** this is a frozen synthetic policy cohort, and the Full SENTRY result is its engine-level score/recommendation rather than case or reviewer completion.
- **Measured:** Full SENTRY did not outperform the simple union on this corpus. **Qualification:** this is useful negative evidence about the current aggregation threshold, not proof that a union is generally optimal.

## Not supported by this evaluation

- Human investigation-time savings or reviewer productivity.
- Real fraud precision/recall, prevented loss, money saved, production throughput or statistical generalization.
- Zenith Bank's current controls, any vendor comparison, or production class prevalence.
- Source-outage handling, partial-refund entitlement, concurrent/distributed execution safety, bank acknowledgement or immutable audit.
- AI/ML benefit: the evaluated detection path is deterministic; template notes and model tooling do not set decisions.
