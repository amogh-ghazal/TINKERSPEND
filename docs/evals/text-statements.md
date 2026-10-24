# Typed/voice statement evaluation

Status: deterministic parser only (unit tests in `packages/domain/test/statements.test.ts`). The AI extraction path and the Indian-English **voice** evaluation are **pending** an OpenAI key and owner-recorded samples; no accuracy figures are claimed yet.

Planned set (≥30 utterances, Indian English, mixed accents): multiple items, corrections ("not 150, it was 250"), relative dates near midnight IST, Hindi-English amounts ("dedh sau"), numbers in words, account digits/balances/UTRs mentioned in passing. Metrics: transcript WER, amount exact-match, date exact-match, item count, false-commit rate (must be 0: every result is a draft).
