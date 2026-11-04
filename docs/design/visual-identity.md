# Visual identity

Status: draft.

## Color palette

Components must use the semantic tokens below, never raw hex values.

### Brand and actions

| Token                   | Value     | Usage                      |
| ----------------------- | --------- | -------------------------- |
| `--color-primary`       | `#871eff` | Buttons, links             |
| `--color-primary-hover` | `#6405d1` | Hover state of actions     |
| `--color-primary-soft`  | `#f5f0fd` | Selected item backgrounds  |

### Surfaces and text

| Token                  | Value     | Usage                                 |
| ---------------------- | --------- | ------------------------------------- |
| `--color-bg`           | `#f2f2f2` | App background                        |
| `--color-surface`      | `#ffffff` | Cards                                 |
| `--color-text`         | `#0d0d0d` | Main text                             |
| `--color-text-muted`   | `#666666` | Secondary text (5.74:1 contrast)      |
| `--color-border`       | `#cccccc` | Dividers                              |
| `--color-border-input` | `#757575` | Form field borders (at least 3:1)     |
| `--color-border-card`  | `#e6e6e6` | Card borders                          |
| `--color-border-button-secondary` | `#929292` | Secondary button borders  |

### Ticket statuses

| Token                   | Status       | Text      | Background |
| ----------------------- | ------------ | --------- | ---------- |
| `--status-open`         | Open         | `#a64c03` | `#fdf5d4`  |
| `--status-notified`     | Notified     | `#0e65c2` | `#e8f4fb`  |
| `--status-in-mediation` | In mediation | `#871eff` | TBD        |
| `--status-resolved`     | Resolved     | `#167629` | `#e1f8e5`  |
| `--status-escalated`    | Escalated    | `#cd0d0d` | TBD        |

### Alert

| Token           | Value     | Usage                               |
| --------------- | --------- | ----------------------------------- |
| `--color-alert` | `#cd0d0d` | High priority, hang-up button       |

### Dark surfaces

Used for the call screen and the CRM header.

| Token                 | Value     | Usage                       |
| --------------------- | --------- | --------------------------- |
| `--color-dark-bg`     | `#191828` | Dark background             |
| `--color-dark-surface`| `#31304f` | Dark raised surface         |
| `--color-dark-accent` | `#cba1fa` | Accents on dark surfaces    |

### CSS definition

```css
:root {
  --color-primary: #871eff;
  --color-primary-hover: #6405d1;
  --color-primary-soft: #f5f0fd;

  --color-bg: #f2f2f2;
  --color-surface: #ffffff;
  --color-text: #0d0d0d;
  --color-text-muted: #666666;
  --color-border: #cccccc;
  --color-border-input: #757575;
  --color-border-card: #e6e6e6;
  --color-border-button-secondary: #929292;

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

### Accessibility

- Normal text: minimum contrast 4.5:1 (WCAG AA).
- UI elements (field borders, icons): minimum contrast 3:1.
- Ticket status must never rely on color alone: always pair it with text or an icon.

## Typography

TBD.
