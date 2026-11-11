# Visual identity — Customer PWA & Agent CRM

The proposed palette takes inspiration from Vonage Vivid design tokens while maintaining an independent product identity.

## 1. Colour palette

Components must use the semantic tokens below, never raw hex values.

### Brand and actions

| Token                   | Value     | Usage                                             |
| ----------------------- | --------- | ------------------------------------------------- |
| `--color-primary`       | `#871eff` | Buttons, links                                    |
| `--color-primary-hover` | `#6405d1` | Hover state of actions                            |
| `--color-primary-soft`  | `#f5f0fd` | Selected item backgrounds                         |
| `--color-secondary`     | `#d6219c` | Secondary brand colour (magenta)                  |
| `--color-accent`        | `#fa7454` | Decorative accent (orange). Not for text on white |

### Surfaces and text

| Token                             | Value     | Usage                             |
| --------------------------------- | --------- | --------------------------------- |
| `--color-bg`                      | `#f2f2f2` | App background                    |
| `--color-surface`                 | `#ffffff` | Cards                             |
| `--color-text`                    | `#0d0d0d` | Main text                         |
| `--color-text-muted`              | `#666666` | Secondary text (5.74:1 contrast)  |
| `--color-border`                  | `#cccccc` | Dividers                          |
| `--color-border-input`            | `#757575` | Form field borders (at least 3:1) |
| `--color-border-card`             | `#e6e6e6` | Card borders                      |
| `--color-border-button-secondary` | `#929292` | Secondary button borders          |

### Feedback (semantic)

| Token             | Value     | Usage               |
| ----------------- | --------- | ------------------- |
| `--color-success` | `#1c8731` | Success messages    |
| `--color-warning` | `#be5702` | Warnings            |
| `--color-error`   | `#cd0d0d` | Errors              |
| `--color-info`    | `#0276d5` | Informational notes |

### Ticket statuses

| Token                   | Status       | Text      | Background |
| ----------------------- | ------------ | --------- | ---------- |
| `--status-open`         | Open         | `#a64c03` | `#fdf5d4`  |
| `--status-notified`     | Notified     | `#0e65c2` | `#e8f4fb`  |
| `--status-in-mediation` | In mediation | `#871eff` | TBD        |
| `--status-resolved`     | Resolved     | `#167629` | `#e1f8e5`  |
| `--status-escalated`    | Escalated    | `#cd0d0d` | TBD        |

### Alert

| Token           | Value     | Usage                         |
| --------------- | --------- | ----------------------------- |
| `--color-alert` | `#cd0d0d` | High priority, hang-up button |

### Dark surfaces

Used for the in-call screen and the CRM header.

| Token                  | Value     | Usage                    |
| ---------------------- | --------- | ------------------------ |
| `--color-dark-bg`      | `#191828` | Dark background          |
| `--color-dark-surface` | `#31304f` | Dark raised surface      |
| `--color-dark-accent`  | `#cba1fa` | Accents on dark surfaces |

### CSS definition

```css
:root {
  --color-primary: #871eff;
  --color-primary-hover: #6405d1;
  --color-primary-soft: #f5f0fd;
  --color-secondary: #d6219c;
  --color-accent: #fa7454;

  --color-bg: #f2f2f2;
  --color-surface: #ffffff;
  --color-text: #0d0d0d;
  --color-text-muted: #666666;
  --color-border: #cccccc;
  --color-border-input: #757575;
  --color-border-card: #e6e6e6;
  --color-border-button-secondary: #929292;

  --color-success: #1c8731;
  --color-warning: #be5702;
  --color-error: #cd0d0d;
  --color-info: #0276d5;

  --status-open: #a64c03;
  --status-open-bg: #fdf5d4;
  --status-notified: #0e65c2;
  --status-notified-bg: #e8f4fb;
  --status-in-mediation: #871eff;
  --status-resolved: #167629;
  --status-resolved-bg: #e1f8e5;
  --status-escalated: #cd0d0d;

  --color-alert: #cd0d0d;

  --color-dark-bg: #191828;
  --color-dark-surface: #31304f;
  --color-dark-accent: #cba1fa;
}
```

## 2. Typography

**Recommended font:** Space Grotesk, sourced from Google Fonts under the SIL Open Font License 1.1.

Space Grotesk offers an open-source licence, commercial usage rights and self-hosting options.

### Typography scale

| Element    | Size | Weight |
| ---------- | ---: | -----: |
| H1         | 32px |    600 |
| H2         | 24px |    600 |
| H3         | 20px |    600 |
| Body       | 16px |    400 |
| Small text | 14px |    400 |
| Caption    | 12px |    400 |

Use one font family and a maximum of three font weights to help minimise font loading and improve performance, particularly on mobile devices.

## 3. Accessibility

The visual identity must target WCAG 2.1 Level AA compliance.

- Normal text: minimum contrast ratio of 4.5:1.
- Large text: minimum contrast ratio of 3:1.
- UI elements (field borders, icons, graphical elements): minimum contrast ratio of 3:1 against adjacent colours.
- Ticket status must never rely on colour alone: always pair it with text or an icon.

### Initial contrast checks

| Combination     |   Ratio | Result |
| --------------- | ------: | ------ |
| Black / White   | 19.44:1 | Pass   |
| Purple / White  |  5.74:1 | Pass   |
| Magenta / White |  4.61:1 | Pass   |
| Green / White   |  4.61:1 | Pass   |
| Orange / White  |  2.73:1 | Fail   |

Orange must not be used for normal text on white backgrounds without an adjusted colour or a suitable alternative combination.

All final foreground/background combinations, including buttons, links, borders, focus indicators and semantic states, must be validated before implementation.

## 4. Shared design language

The Customer PWA (`apps/client`) and Agent CRM (`apps/crm`) will share:

- Colour palette and design tokens.
- Typography and text styles.
- Semantic colours for success, warning, error and information.
- Consistent component styling and interaction states.
- Source of truth for design tokens: `packages/design-tokens/src/tokens.css`.

## 5. Dark mode

- **MVP:** Light mode by default.
- **In-call screen:** Dark interface, following the existing mockups.
- **Full application dark mode:** Deferred until after the MVP.

## References

- [Vonage Vivid](https://github.com/Vonage/vivid)
- [Space Grotesk — Google Fonts](https://fonts.google.com/specimen/Space+Grotesk)
- [SIL Open Font License](https://openfontlicense.org/)
- [WCAG 2.1 — W3C](https://www.w3.org/TR/WCAG21/)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0/)
