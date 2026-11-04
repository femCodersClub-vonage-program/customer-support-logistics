# Visual Identity — Customer PWA & Agent CRM

## 1. Colour Palette

The proposed palette takes inspiration from Vonage Vivid design tokens while maintaining an independent product identity.

| Role | HEX |
|---|---|
| Primary — Purple | `#871EFF` |
| Secondary — Magenta | `#D6219C` |
| Accent — Orange | `#FA7454` |
| Success — Green | `#1C8731` |
| Warning | `#BE5702` |
| Error | `#CD0D0D` |
| Information — Blue | `#0276D5` |

### Neutral Colours

| Usage | HEX |
|---|---|
| Background | `#FFFFFF` |
| Secondary background | `#F2F2F2` |
| Surface | `#FFFFFF` |
| Primary text | `#0D0D0D` |
| Secondary text | `#666666` |
| Border | `#929292` |

The palette is provisional and requires approval before implementation.

## 2. Typography

**Recommended font:** Space Grotesk, sourced from Google Fonts under the SIL Open Font License 1.1.

Space Grotesk offers an open-source licence, commercial usage rights and self-hosting options.

### Typography Scale

| Element | Size | Weight |
|---|---:|---:|
| H1 | 32px | 600 |
| H2 | 24px | 600 |
| H3 | 20px | 600 |
| Body | 16px | 400 |
| Small text | 14px | 400 |
| Caption | 12px | 400 |

Use one font family and a maximum of three font weights to help minimise font loading and improve performance, particularly on mobile devices.

## 3. Accessibility

The visual identity must target WCAG 2.1 Level AA compliance.

- Normal text: minimum contrast ratio of 4.5:1.
- Large text: minimum contrast ratio of 3:1.
- Relevant UI components and graphical elements: minimum contrast ratio of 3:1 against adjacent colours.

### Initial Contrast Checks

| Combination | Ratio | Result |
|---|---:|---|
| Black / White | 19.44:1 | Pass |
| Purple / White | 5.74:1 | Pass |
| Magenta / White | 4.61:1 | Pass |
| Green / White | 4.61:1 | Pass |
| Orange / White | 2.73:1 | Fail |

Orange must not be used for normal text on white backgrounds without an adjusted colour or a suitable alternative combination.

All final foreground/background combinations, including buttons, links, borders, focus indicators and semantic states, must be validated before implementation.

## 4. Shared Design Language

The Customer PWA (`apps/client`) and Agent CRM (`apps/crm`) will share:

- Colour palette and design tokens.
- Typography and text styles.
- Semantic colours for success, warning, error and information.
- Consistent component styling and interaction states.

Layouts, navigation and component arrangements may differ according to the needs of customers and agents.

The goal is a consistent product identity across both applications without forcing identical user experiences.

## 5. Dark Mode

- **MVP:** Light mode by default.
- **In-call screen:** Dark interface, following the existing mockups.
- **Full application dark mode:** Deferred until after the MVP.

## 6. Branding & Identity

- Use an independent application name and logo.
- Use Vonage Vivid as a design reference without copying its complete brand identity.
- Do not use the official Vonage logo without appropriate authorisation.
- Use of the phrase "Powered by Vonage" is subject to brand permission.

Reference design system: [Vonage Vivid — GitHub](https://github.com/Vonage/vivid)

### References

- [Vonage Vivid](https://github.com/Vonage/vivid)
- [Space Grotesk — Google Fonts](https://fonts.google.com/specimen/Space+Grotesk)
- [SIL Open Font License](https://openfontlicense.org/)
- [WCAG 2.1 — W3C](https://www.w3.org/TR/WCAG21/)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0/)