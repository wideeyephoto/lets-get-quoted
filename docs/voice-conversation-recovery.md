# Spoken references and Dispatch readback

Dispatch now tries a conservative spoken-reference interpretation after a
successful empty literal lookup. For example, “Jay Demo 1071” can find the exact
reference `J-DEMO-1071`. A literal customer/address match takes precedence. The
fallback uses the same account scope and remaining four-second lookup budget;
only exact canonical references qualify. Missing digits, conflicting references,
duplicate matches and database failures cannot authorize a write. Mutations
continue to require the existing resolved target and staff permissions.

The tool description and conversation instructions explicitly support reading a
selected job's recorded quote through `lookup_jobs(include_details=true)`.
Reading a total does not permit changing it. A confirmed note can be read back
from its saved tool-result snapshot without another write. An uncertain save
still cannot be claimed as confirmed.

The prompt asks for only the requested fields, a short summary, and no repeated
follow-up question after every factual answer. “Stop,” “pause,” or “hold on”
should end the explanation and wait for the next instruction, rather than
restart the interrupted summary. These conversation rules need handset
acceptance; prompt and schema tests alone do not prove model behavior.
Staff calls also set the provider interruption prompt, preserve transparent
barge-in, and disallow starting functions while the caller is speaking over the
assistant. Existing submitted writes still require a truthful outcome check.

No migration or phone routing change is required. Audio endpointing timing is
unchanged. The requested interruption fade
still needs a supported provider playback control or a separately designed
media path.
