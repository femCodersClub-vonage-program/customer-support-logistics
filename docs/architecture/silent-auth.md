# Silent authentication from the PWA

> **Status:** planned. Customer login with Verify v2 is the next part of [#31] (API) and [#33] (client). This page records what the web flow needs, so both sides build the same thing.

[ADR 0008](../adr/0008-authentication-and-sessions.md) decides how customers log in: Verify v2 with `silent_auth` first and `sms` as fallback. This page goes one level deeper. A PWA runs in a browser, not in a native app, and that changes how silent authentication has to be wired.

## What is already in place

- **Ownership checks.** `ownedBy()` in `apps/api/src/incidents/incidents.service.ts` limits customers to their own incidents, and `@Roles()` returns `403` when an agent calls `GET /orders`. The `AuthGuard` turns the session cookie into `{ role, id }`, so a customer session from Verify plugs into the existing routes.
- **The SDK.** The installed `@vonage/verify2` (1.22.1) already has `checkUrl`, `nextWorkflow()` and `cancel()`. No upgrade is needed.

## What the web flow needs

- **The browser navigates to the `check_url`; it doesn't fetch it.** The `check_url` answers with a chain of `30x` redirects through the mobile carrier, and a `fetch` from the page would be stopped by CORS. Vonage's web flow uses a `redirect_url` in the workflow (the SDK requires it), and at the end of the chain the browser comes back to that URL with `request_id` and `code` in the URL fragment.
- **A client route that receives the result**, for example `/login/callback`. It reads the fragment and sends the code to `POST /auth/customer/check`.
- **Compare the `request_id`.** Vonage recommends checking that the `request_id` that comes back matches the one the API stored, in an `HttpOnly` cookie, to prevent person-in-the-middle attacks.
- **An endpoint that moves on to the SMS.** When silent authentication fails, the API calls `nextWorkflow()`. Without it, Verify waits a fixed 60 seconds before sending the SMS. If `next_workflow` is called too early, Vonage can answer `409`, and the call is retried.

## Limits of a PWA

- **A browser can't force mobile data.** Vonage handles that in its native iOS and Android SDKs, not on the web.
- **On Wi-Fi, silent authentication always fails.** The browser can't reliably tell Wi-Fi from mobile data either: Safari on iOS doesn't support the Network Information API. So the fallback to SMS is a normal path, not an edge case.

## Overview

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontFamily': 'Space Grotesk, system-ui, sans-serif',
  'primaryColor': '#f5f0fd', 'primaryTextColor': '#0d0d0d', 'primaryBorderColor': '#6405d1',
  'lineColor': '#31304f', 'textColor': '#0d0d0d',
  'clusterBkg': '#ffffff', 'clusterBorder': '#cccccc'
}}}%%
flowchart LR
  subgraph done["Already in place"]
    own["Ownership checks<br/>ownedBy() in incidents.service.ts<br/>agent on /orders → 403"]
    guard["AuthGuard turns the session<br/>cookie into { role, id }<br/>for the existing routes"]
    sdk["Installed SDK, no upgrade:<br/>checkUrl, nextWorkflow(), cancel()"]
  end

  subgraph todo["Needed for the web flow"]
    nav["No fetch to check_url<br/>30x redirects hit CORS<br/>→ the browser NAVIGATES"]
    cb["New client route<br/>/login/callback<br/>reads request_id and code from the fragment"]
    next["New API endpoint<br/>calls nextWorkflow()<br/>otherwise 60 s until the SMS"]
    mitm["Compare the returned request_id<br/>with the one in an HttpOnly cookie<br/>against person-in-the-middle attacks"]
    redir["redirect_url in the workflow<br/>required by the SDK"]
  end

  subgraph limits["Limits of a PWA"]
    cell["A browser can't force mobile data<br/>only Vonage's native SDKs can"]
    wifi["On Wi-Fi it always fails<br/>and Safari on iOS can't tell<br/>Wi-Fi from mobile data"]
  end

  nav --> cb
  nav --> redir
  cb --> mitm
  cell --> wifi --> next

  classDef doneStyle fill:#e1f8e5,stroke:#167629,stroke-width:2px,color:#0d0d0d
  classDef todoStyle fill:#fdf5d4,stroke:#a64c03,stroke-width:2px,color:#0d0d0d
  classDef limitStyle fill:#f5f0fd,stroke:#6405d1,stroke-width:2px,color:#0d0d0d
  class own,guard,sdk doneStyle
  class nav,cb,next,mitm,redir todoStyle
  class cell,wifi limitStyle
```

Green: in place. Amber: to build. Purple: platform limits, which can be handled but not avoided.

## The login sequence

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontFamily': 'Space Grotesk, system-ui, sans-serif',
  'actorBkg': '#6405d1', 'actorBorder': '#6405d1', 'actorTextColor': '#ffffff', 'actorLineColor': '#757575',
  'signalColor': '#31304f', 'signalTextColor': '#0d0d0d',
  'noteBkgColor': '#f5f0fd', 'noteBorderColor': '#871eff', 'noteTextColor': '#0d0d0d',
  'labelBoxBkgColor': '#f5f0fd', 'labelBoxBorderColor': '#6405d1', 'labelTextColor': '#0d0d0d',
  'loopTextColor': '#0d0d0d', 'activationBkgColor': '#f5f0fd', 'activationBorderColor': '#6405d1',
  'textColor': '#0d0d0d'
}}}%%
sequenceDiagram
  autonumber
  participant P as PWA
  participant A as API
  participant V as Vonage Verify
  participant O as Mobile carrier

  P->>A: POST /auth/customer/start with the phone
  A->>V: newRequest with silent_auth (redirect_url = /login/callback), then sms
  V-->>A: request_id and check_url
  A-->>P: check_url, and request_id in an HttpOnly cookie
  Note over P: NAVIGATES to check_url.<br/>A fetch won't work: CORS stops the 30x redirects

  alt Mobile data and a supported carrier
    rect rgb(232, 244, 251)
      P->>O: GET check_url (browser navigation)
      O-->>P: 30x redirects to /login/callback
      Note over P: /login/callback reads request_id<br/>and code from the fragment
      P->>A: POST /auth/customer/check with request_id and code
      A->>A: Same request_id as the cookie?<br/>If not, rejected
      A->>V: checkCode
      V-->>A: completed
      A-->>P: csl_session cookie, logged in
    end
  else Wi-Fi, unsupported carrier or error
    rect rgb(253, 245, 212)
      P->>A: Report the failure (new endpoint)
      A->>V: nextWorkflow(request_id), retried on 409
      Note over A,V: Without this step, Verify waits<br/>a fixed 60 seconds before the SMS
      V-->>P: SMS with the code to the phone
      P->>A: POST /auth/customer/check with the code
      A->>V: checkCode
      V-->>A: completed
      A-->>P: csl_session cookie, logged in
    end
  end
```

## To be confirmed on a real phone ([#33])

- How the browser comes back when the redirect chain fails: whether it reaches `/login/callback` with an error in the fragment or stays outside the PWA. That decides how the PWA notices the failure and tells the API.
- Whether to skip silent authentication from the start when the browser can tell there is no mobile data (Chrome on Android supports the Network Information API; Safari on iOS doesn't).

## Relation to ADR 0008

ADR 0008 says that on Wi-Fi "Verify moves on to the SMS by itself". That's true, after 60 seconds. The `nextWorkflow()` endpoint and the `/login/callback` route described here make that fallback immediate. They refine the ADR without changing its decision.

## References

- [Silent Authentication best practices](https://developer.vonage.com/en/verify/guides/silent-authentication/best-practices) (Vonage): `next_workflow`, the 60-second timeout and retries on `409`.
- [Verify API reference](https://developer.vonage.com/en/api/verify.v2) (Vonage): `redirect_url` and `check_url`.
- [How the project uses Vonage](vonage.md).

[#31]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
[#33]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/33
