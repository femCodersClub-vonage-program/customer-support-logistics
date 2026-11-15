
# Driver User Flow

## Interface

SMS and phone calls (PSTN). No application required.

## Main flow

| Step | Channel | Driver action | System response | Ticket state |
|---|---|---|---|---|
| 1 | SMS | Receives an incident notification. | Sends the incident details and response options. | `notified` |
| 2 | SMS | Replies with option 1 or 2. | Records the response and informs the agent. | `notified` |
| 3A | Phone | Option 1: Communicates with the store to resolve the incident. | Agent records the outcome and notifies the customer. | `resolved` if solved |
| 3B | SMS | Option 2: Requests three-way mediation. | Sends an SMS announcing a call in 2 minutes. | `notified` |
| 4 | Phone | Answers the automatic call and presses 1. | Connects the driver to the customer and agent. | `in_mediation` |
| 5 | Phone | Participates in the mediation. | Keeps the three participants connected. | `in_mediation` |

## Alternative paths

- **No response (option 3 in the approved flow):** Up to two additional contact attempts are made. If unsuccessful, the incident remains pending.
- **SMS not delivered:** The system reports the delivery failure to the CRM.
- **Mediation call unanswered or 1 not pressed:** Two retries are made, 60 seconds apart, followed by a fallback SMS.
- **Driver calls back:** The system associates the call with the active incident when possible.
- **Driver sends an SMS to the virtual number:** The message is associated with the incident or logged for agent follow-up.
- **Mediation cannot proceed:** The agent may reschedule or escalate the incident.

## Notes

- The driver should only answer or return calls when it is safe to do so.
- Option 1 means store-driver resolution.
- Option 2 means three-way mediation.
- Option 3 represents no response, not an SMS reply.
- The incident flow follows the diagram validated by the team.
