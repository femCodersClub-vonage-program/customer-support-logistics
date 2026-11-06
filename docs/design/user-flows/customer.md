
# Customer User Flow

## Interface

Mobile PWA (`apps/client`).

## Main flow

| Step | Screen | Customer action | System response | Ticket state |
|---|---|---|---|---|
| 1 | `/login` | Enters phone number and verifies identity. | Verify v2 attempts silent authentication. | — |
| 2 | `/orders` | Selects the affected order. | Displays the customer's orders. | — |
| 3 | `/report/:orderId` | Describes the incident and attaches photos or video. | Creates an incident ticket. | `open` |
| 4 | `/incidents/:id` | Checks the incident progress. | Displays the ticket status and updates. | `open` / `notified` |
| 5 | `/call/:id` | Joins a mediation call when requested. | Connects the customer to the mediation. | `in_mediation` |
| 6 | `/incidents/:id` | Reviews the final outcome. | Displays the resolution or escalation. | `resolved` / `escalated` |

## Alternative paths

- **Silent authentication unavailable:** The customer receives an SMS verification code.
- **SMS verification fails:** The customer cannot continue until verification succeeds.
- **No mediation required:** The customer receives the resolution without joining a call.
- **Mediation unavailable:** The incident remains open for follow-up or is escalated.
- **Incident escalated:** The customer can check the updated ticket status.

## Notes

The customer only accesses orders and incidents associated with their verified identity.

The driver does not use the customer application.
