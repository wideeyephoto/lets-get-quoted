# Dispatch draft retention — September 15, 2026

On production `8126f4e08`, the owner selected a job and dictated a note in short
phrases. The assistant repeatedly asked for wording it had already heard and
could not read the draft back. No save function ran. Lookup returned the correct
quote; the final receipt processed once and settled 82 AI seconds as two minutes.

The staff prompt now gives unsaved drafts an explicit, high-priority conversation
rule: retain the selected job, combine dictated fragments, preserve wording when
the caller says not to save, read it back as unsaved, and save only on an explicit
save request. Discarding a draft clears it without writing. Existing authorization,
exact-job resolution, unknown-save recovery and quote-write restrictions remain.

This is a candidate correction, not live acceptance. Repeat the full fragmented
draft/readback/save sequence on the released revision, including a correction and
an interruption. Verify one saved action with the exact final wording and no
mutation before approval. Code checks do not establish model behavior.

The owner separately reported a pause inside the fixed opening between
"Your personal" and "Let's Get Quoted". That audio issue remains open; a pause
before the sentence would not address it.
