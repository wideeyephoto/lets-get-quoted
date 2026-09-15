# Spoken job-reference digits

The owner reported successful Stop, quiet waiting and resumption on call `849c53f7-4432-42b3-97b8-2b233aef2240`, but the subsequent quote lookup failed. The tool received `j demo one zero seven one`. A scoped database read reproduced zero matches for that literal phrase and one match for `J-DEMO-1071`. The previous fallback parser accepted only `jay` and numeric digits.

The read-only fallback now accepts J or Jay and digit words zero through nine (including oh for zero), mixed with numeric digits, after an explicit J-reference prefix. It still first tries the literal name/address, retries only after a confirmed empty result, shares the original lookup deadline, and accepts only exact canonical references from the same account. Multiple matches remain ambiguous. Mutation targeting is unchanged. Unsupported phrases and missing prefixes are not guessed.

Tests reproduce the observed spoken query and verify the returned $2,300 spoken quote, separators, mixed digits, rejected ambiguous phrases, exact-match enforcement, literal-match precedence, timeout/error handling, duplicate matches, and unchanged mutation targeting. Full type checking and targeted lint are also required. Release checks and a handset quote retest remain pending.

Stop result scope: the native wait function ran; the transcript contains an acknowledgment before the later question. The owner confirmed quiet waiting and successful resumption, so record that live result without claiming that the transcript proves zero acknowledgment speech.
