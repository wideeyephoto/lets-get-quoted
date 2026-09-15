# Staff Stop must wait for the caller

The September 15 handset retest reached AI and the owner confirmed that saying Stop interrupted speech. They then confirmed that the assistant spoke again. The receipt contains a follow-up question after Stop; interruption therefore passed, but quiet waiting failed. The call settled automatically (19 AI seconds, one allowance minute).

## Change

Expose SignalWire's native `wait_for_user` action to staff calls, with no filler speech. Both the staff system prompt and interruption prompt direct bare Stop/Pause/Hold on commands to this action without acknowledgment or another question. A command containing a new request still asks the assistant to answer that request. Disable staff attention reminders, whose documented default is five seconds. The call's hard deadline and hangup remain unchanged.

The silence reminder is a possible contributor; the transcript alone does not prove which provider mechanism generated the follow-up. Native waiting provides an explicit supported action instead of relying solely on a prose instruction to stay silent. Customer reminders and tool configuration are unchanged.

References: [native waiting](https://signalwire.com/docs/swml/reference/calling/ai/swaig), [attention and hard deadlines](https://signalwire.com/docs/swml/reference/calling/ai/params).

Validation: targeted voice adapter, latency, prompt and grounding tests; full type checking; targeted lint. Full release checks and handset Stop/wait/resume acceptance remain required. No universal reliability claim follows from one call.
