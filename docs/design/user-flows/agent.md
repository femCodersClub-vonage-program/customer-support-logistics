
# Agent User Flow

## Interface

Desktop CRM (`apps/crm`).

## Main flow

| Step | Screen | Agent action | System response | Ticket state |
|---|---|---|---|---|
| 1 | `/inbox` | Reviews incoming incidents. | Displays reported incidents. | `open` |
| 2 | `/incidents/[id]` | Opens a case and reviews the evidence. | Displays the incident details and attachments. | `open` |
| 3 | `/incidents/[id]` | Requests contact with the driver. | Sends an incident notification by SMS. | `notified` |
| 4 | `/incidents/[id]` | Reviews the driver's response. | Displays the response or contact failure. | `notified` |
| 5 | `/incidents/[id]` | Determines whether three-way mediation is needed. | Continues with direct resolution or mediation. | `notified` |
| 6 | `/incidents/[id]/mediation` | Starts three-way mediation when required. | Sends an advance SMS and calls the driver. | `in_mediation` |
| 7 | `/incidents/[id]/mediation` | Moderates the conversation. | Connects customer and agent via WebRTC and driver via PSTN. | `in_mediation` |
| 8 | `/incidents/[id]` | Records the outcome. | Updates the ticket and notifies the customer. | `resolved` / `escalated` |

## Alternative paths

- **No mediation needed:** The agent records the resolution and closes the incident.
- **Driver does not respond to the initial SMS:** The contact attempt is recorded and the incident remains pending further handling.
- **Driver does not answer the mediation call or press 1:** Two retries are made, 60 seconds apart, followed by a fallback SMS.
- **Mediation cannot proceed:** The agent reschedules or escalates the incident.
- **Driver calls or texts the virtual number:** The system associates the contact with the active incident or logs it and notifies the agent.
- **Escalation:** The agent can escalate an unresolved incident before it reaches `resolved`.

## Notes

The agent manages the incident through the CRM. The driver does not need access to the application.

The initial SMS response options follow the team-approved incident flow diagram.
