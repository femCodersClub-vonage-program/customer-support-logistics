# 0006. Internationalisation with next-intl and use-intl

- **Status:** proposed
- **Date:** 2026-11-08

## Context

All copy is hard-coded in English today, but most of our users (customers, drivers and agents) speak Spanish, and some don't. Every screen is still a placeholder, so adding i18n now is cheap; adding it after the user flows ([#18][i18]) means touching every component. See [#26][i26].

Language is not only a UI concern. The driver has no interface: they get SMS and a voice call (NCCO `talk` with text-to-speech), and the customer gets the Verify code by SMS. The API has to know each person's language and choose the message by it.

Constraints:

- Two languages now, `es` (default and fallback) and `en`, with BCP 47 codes. Adding a language must mean adding files, not changing code.
- Three runtimes: React + Vite (client), Next.js App Router (CRM) and NestJS (API). See [ADR 0002](0002-application-stack.md).
- The same message syntax everywhere, with plurals and variables: ICU MessageFormat.
- A missing or misspelled key must be a TypeScript error, not a blank string at runtime.

## Options considered

### `react-i18next` / `i18next`

The most used library, with a plain Node.js core for the API.

- **Pros:** large ecosystem; works in all three apps; mature lint plugin.
- **Cons:** its own message format by default (ICU needs `i18next-icu`); Server Component support in the App Router needs extra setup; typed keys need a separate declaration per app.

### `react-intl` (FormatJS)

ICU-native, built on `intl-messageformat`.

- **Pros:** reference implementation of ICU in JavaScript; the core works in Node.js.
- **Cons:** no first-class App Router integration (Server Components, metadata); message ids are flat strings, and typing them needs extra tooling.

### Lingui

Macros that extract messages from the source code.

- **Pros:** ICU; small runtime; extraction finds unused keys.
- **Cons:** needs a compile step (SWC/Babel macro) in Vite, Next.js and NestJS; the least known of the options in the team.

### `next-intl` / `use-intl`

`next-intl` is the App Router integration of `use-intl`, which has no Next.js dependency. `use-intl/core` exports `createTranslator`, which needs no React.

- **Pros:** ICU everywhere; the same `useTranslations` API in the client and the CRM, and the same translator in the API; Server Components and `generateMetadata` supported; typed keys from the message files through `AppConfig` module augmentation; works without locale prefixes in the URL.
- **Cons:** one maintainer behind both packages; no official NestJS integration, so we write a small service around `createTranslator`.

### For the API only: `nestjs-i18n`

- **Pros:** NestJS module with resolvers and decorators.
- **Cons:** its own format by default, not ICU; most of its features (resolving the locale from the request) don't apply, because the API translates by the recipient's stored `locale`, not by who calls it.

## Decision

Use the `next-intl` family in the three apps:

| App    | Library                                 |
| ------ | --------------------------------------- |
| CRM    | `next-intl`, without i18n routing       |
| Client | `use-intl`                              |
| API    | `createTranslator` from `use-intl/core` |

The main reason is a single message syntax (ICU), a single typing mechanism and a single API for the whole team.

### Where things live

- `@csl/shared-types` defines `SUPPORTED_LOCALES`, `Locale` and `DEFAULT_LOCALE`, and `Customer` and `Driver` get a `locale: Locale` field. They are part of the API contract ([ADR 0004](0004-shared-types-as-api-contract.md)).
- A new `@csl/i18n` package holds what is common: labels for shared enums (incident statuses and types, order statuses) in `es` and `en`, and a helper that picks a supported locale from a list of preferred languages. Enum **values** stay in English in code and in the database; only their labels are translated.
- Each app keeps its own messages in `messages/es.json` and `messages/en.json`, and merges the common ones.

### How each app picks the locale

- **Client:** the user's saved choice (`localStorage`), then `navigator.languages`, then `es`. Changing it updates the state and `<html lang>`, without a reload.
- **CRM:** an internal tool doesn't need localised URLs, so there is no `/es/...` prefix. The locale comes from the `NEXT_LOCALE` cookie, then `Accept-Language`, then `es`. Changing it sets the cookie with a Server Action; Next.js then re-renders the current page on the server and keeps the client state, so there is no reload. Reading the cookie makes every CRM route dynamic, which is fine for an app behind a login.
- **API:** always the `locale` stored on the recipient (customer or driver), never the request. The Vonage formats are mapped from it: TTS `language` (`es-ES`, `en-GB`) and Verify v2 `locale` (`es-es`, `en-gb`).

### PWA manifest

The web app manifest only holds one language and browsers don't support localised manifests in practice. It stays in `es`, the default language; the app itself switches language once open.

### SMS encoding

GSM-7 includes `ñ`, `é`, `ü`, `¿` and `¡`, but not `á`, `í`, `ó` or `ú`. One of those switches the whole SMS to UCS-2: 70 characters for a single segment (67 per segment when split) instead of 160 (153). We keep correct Spanish spelling and keep templates short instead: a unit test measures the encoding and segment count of each template in each locale, and the results are documented in `docs/i18n.md`.

Driver replies (1, 2, 3) stay numeric, so parsing them doesn't depend on the language.

### Quality

- A test in each package fails if a key exists in one language and not in the other, so CI catches it.
- `eslint-plugin-i18next` warns on hard-coded text in JSX in the client and the CRM.
- Tests render pages in both languages.

## Consequences

- Every user-facing string goes through `t(...)`; new screens are built translated from the start.
- Adding a language means adding its code to `SUPPORTED_LOCALES`, a JSON file per app and package, and its Vonage TTS and Verify codes in the API. TypeScript points to every place that is missing.
- The `locale` column in the database is added with the database layer ([#23][i23]).
- Free text written by users (incident descriptions, agent notes) is not translated.
- If we ever need SEO or shareable localised URLs in the CRM, `next-intl` supports prefix routing without changing the messages.
- If `next-intl` stops being maintained, the messages are plain ICU JSON and can be moved to FormatJS.

[i18]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/18
[i23]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/23
[i26]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/26
