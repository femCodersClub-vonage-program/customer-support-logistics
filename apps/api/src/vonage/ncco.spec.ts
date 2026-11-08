import { describe, expect, it } from 'vitest';

import { buildDriverPromptNcco } from './ncco.js';

const inputUrl = 'https://example.test/webhooks/voice/input?incident=1234';

describe('buildDriverPromptNcco', () => {
  it('announces the incident in Spanish with a Spanish voice and waits for one digit', () => {
    expect(buildDriverPromptNcco({ locale: 'es', orderId: '1234', inputUrl })).toEqual([
      {
        action: 'talk',
        text: 'Incidencia en el pedido 1234. Pulse 1 para conectar con soporte.',
        language: 'es-ES',
      },
      {
        action: 'input',
        type: ['dtmf'],
        dtmf: { maxDigits: 1, timeOut: 8 },
        eventUrl: [inputUrl],
      },
    ]);
  });

  it('uses the English text and voice for an English-speaking driver', () => {
    const [talk] = buildDriverPromptNcco({ locale: 'en', orderId: '1234', inputUrl });

    expect(talk).toEqual({
      action: 'talk',
      text: 'Incident on order 1234. Press 1 to connect with support.',
      language: 'en-GB',
    });
  });
});
