# One-word staff interruption

The owner reported that saying Stop during a summary did not interrupt the
September 15 handset call. The deployed provider document required two words to
trigger barging, contradicting the supported one-word Stop and Pause commands.

Staff calls now explicitly enable partial and complete interruptions with
`enable_barge: all` and `barge_min_words: 1`. Customer calls retain their existing
configurable threshold. Staff interruption must remain available even when the
general environment threshold is higher. Existing no-write-while-speaking and
do-not-restart instructions remain in place.

Validation: 44 provider-adapter and Dispatch timing tests passed; changed source
passes lint. Live acceptance is pending deployment and a handset interruption
test. This configuration correction does not establish audio performance or fix
the separate introduction gap, fragmented job references, or long reply delays.

Evidence: call c895d744-68bc-441d-9474-60cd0c68c2c5 ended at 17:43:12.689 UTC.
It resolved J-DEMO-1071 on the second attempt and returned the correct $2,300
quote. The first transcript reference was J demo 170. The user reported Stop
failed; the assistant's full summary appears before a short redacted user turn.
Redacted transcript text alone cannot establish exactly what was audible.
