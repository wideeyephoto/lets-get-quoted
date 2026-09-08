# SignalWire questions for remaining voice acceptance

Prepared September 8, 2026. Unsent. No customer identities, call IDs, secrets,
recordings, invoices, or live routing URLs are needed to ask these questions.

1. Our application uses native SWML AI on PSTN calls. Can TTS playback apply a
   short gain fade on caller barge-in, approximately 100–150 ms, while speech
   detection/input capture remain immediate? Please identify a supported
   parameter or media hook and explain how queued audio is canceled so it cannot
   resume after the fade. A higher barge-in threshold is not the desired effect.

2. Does `answer.max_duration` establish a deadline that remains effective after
   SWAIG `transfer: true` executes a new SWML document with `connect`? What happens
   if a later document executes `answer` again, including through a provider
   fallback URL? Does `connect.max_duration` start a new leg timer or replace a
   prior parent limit? We need an absolute ten-minute limit measured from the
   original connected call, including ringing, announcement, transfer and
   voicemail phases. Please identify the supported original-deadline mechanism.

3. For a phone number using `call_handler=relay_script` and an external
   `call_relay_script_url`, is `call_fallback_url` invoked on a fetch timeout,
   HTTP failure, or invalid SWML? Is that fallback request signed, and which
   format and original timing/vars does it carry? The phone-number API accepts
   the setting, but accepting configuration does not prove invocation.

These questions request supported behavior, not a proposed migration to another
media stack. Any new audio architecture needs its own design and acceptance.

References checked:

- [AI parameters](https://signalwire.com/docs/swml/reference/calling/ai/params)
- [Answer](https://signalwire.com/docs/swml/reference/calling/answer)
- [Connect](https://signalwire.com/docs/swml/reference/calling/connect)
- [Calling payload and variables](https://signalwire.com/docs/swml/reference/calling)
- [Update phone number](https://signalwire.com/docs/apis/rest/phone-numbers/update-phone-number)

The interruption design and acceptance criteria are in
[the fade investigation](voice-interruption-fade-2026-09-08.md).
