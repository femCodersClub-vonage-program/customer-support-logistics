# 0003. Vonage as the communications provider

- **Status:** accepted
- **Date:** 2026-11-08 (recorded retroactively)

## Context

To resolve a delivery incident, the customer, the support agent and the driver have to talk. The driver uses their own phone and won't install an app, so we have to reach them through SMS and ordinary phone calls (PSTN). The customer and the agent are already in a browser and can join a call from there.

We also need to verify the customer's phone number at login, with as little effort for them as possible.

The project is part of the femCoders Club × Vonage program.

## Options considered

### A different provider for each channel

For example, one service for SMS, a separate WebRTC media server (such as LiveKit or Jitsi) and a SIP trunk for PSTN calls.

- **Pros:** we could choose the best or cheapest option for each channel.
- **Cons:** several accounts, SDKs and webhook formats; bridging WebRTC and PSTN in the same call becomes our job.

### Another communications platform (for example Twilio)

- **Pros:** similar features (SMS, voice, WebRTC, verification).
- **Cons:** same lock-in as Vonage, with no advantage in this program.

### Vonage

- **Pros:** one Vonage Application covers verification, SMS, voice calls and browser calls. A named conversation joins WebRTC and PSTN participants without us carrying any audio. Verify v2 supports silent authentication with SMS fallback.
- **Cons:** we depend on one provider; silent authentication only works on mobile data and with supported carriers; every SMS and call minute has a cost.

## Decision

Vonage is the only communications provider, through a single **Vonage Application** with a private key:

- **Verify v2** for customer login: `silent_auth` first, then `sms` as fallback.
- **SMS** for messages to the driver and the customer, delivery receipts and driver replies, through the **Messages API** ([#29][i29], [#30][i30]): it authenticates with the application's private key and signs its webhooks the same way as the Voice API.
- **Voice API** for the mediation call: a conversation named `inc-<id>`, an outbound PSTN call to the driver with an NCCO menu (press 1 to join), and inbound calls to the virtual number.
- **Client SDK** (WebRTC) so the customer and the agent join the conversation from the browser.
- **Video API** for customer–agent video, in phase 2. The driver would still join by audio only, through SIP to the Voice API.

Only `apps/api` calls Vonage APIs and holds the credentials. Browsers only receive short-lived JWTs for the Client SDK.

## Consequences

- The API never carries audio: it creates the conversation, issues tokens and answers webhooks. This keeps it small.
- Vonage must reach our webhooks over public HTTPS (`PUBLIC_URL`). In development we use a tunnel such as ngrok.
- Webhooks must check Vonage's signature (`VONAGE_SIGNATURE_SECRET`) and be idempotent ([#30][i30]).
- Real phone numbers stay in the API. The other party only sees the virtual number.
- Changing provider would mean rewriting the `vonage` and `webhooks` modules and the call screens. The rest of the domain (incidents, state machine) doesn't depend on Vonage.
- How each API is used is described in [`docs/architecture/vonage.md`](../architecture/vonage.md).

[i29]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/29
[i30]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/30
