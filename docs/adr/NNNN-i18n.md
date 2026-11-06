# NNNN. Internationalization (i18n)

## Context

All copy is hard-coded in English. Our users (customers, drivers and agents) will mostly speak Spanish, and some won't. The driver only receives SMS and voice calls, and the customer receives the Verify code by SMS, so the backend must know each person's language.

Languages: `es` (default and fallback) and `en`, using BCP 47 codes. Adding a language must mean adding files, not changing code.

## Decision

- **Message format:** ICU MessageFormat everywhere (plurals and variables with the same syntax).
- **Client (React + Vite):** `i18next` + `react-i18next` + `i18next-icu`.
- **CRM (Next.js):** `next-intl`, without a URL prefix. The locale comes from the cookie, then `Accept-Language`, and finally `es`.
- **API (NestJS):** plain `i18next` with our own service. `nestjs-i18n` is rejected because it resolves the language from the request and does not use ICU.
- **Where translations live:** screen copy in each app; SMS and voice templates in the API; labels for shared enums (statuses, incident types) in a `@csl/i18n` package.
- **Constants:** `SUPPORTED_LOCALES`, `DEFAULT_LOCALE` and the `Locale` type are defined once in `@csl/shared-types`.
- **Typed keys:** a missing key is a TypeScript error. Enum values stay in English; only labels are translated.
- **Backend:** add `locale` to `Customer` and `Driver`. SMS, voice (NCCO) and Verify always use the recipient's locale. Driver replies (1/2/3) stay numeric.
- **PWA manifest:** static, in `es`.
- **SMS:** characters such as á, í, ó, ú, ¿ and ¡ switch the SMS to UCS-2 (70 characters per segment instead of 160). Keep templates short and test segment count per locale.
- **Quality:** CI check comparing `es` and `en` keys, lint against hard-coded strings in JSX, and tests in both languages.

## Consequences

- **Pros:** a single format, translation errors caught in CI, and SMS/voice in each user's language.
- **Cons:** two different libraries on the frontend, some SMS cost more segments, and the manifest stays single-language.

## Open questions

1. `react-i18next` or `react-intl` in the client?
2. Do we avoid UCS-2 characters in SMS or accept the cost?
3. How is the initial `locale` set for customers and drivers?
