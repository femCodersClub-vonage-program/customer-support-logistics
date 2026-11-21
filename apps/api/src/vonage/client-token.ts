import { tokenGenerate } from '@vonage/jwt';

import type { ACL } from '@vonage/jwt';

export const CLIENT_TOKEN_TTL_SECONDS = 15 * 60;

export const CLIENT_TOKEN_ACL: ACL = {
  paths: {
    '/*/sessions/**': { methods: ['POST'] },
    '/*/conversations/*': { methods: ['GET'] },
    '/*/conversations/*/rtc/*/answer': { methods: ['POST'] },
    '/*/conversations/*/rtc/*/offer/*': { methods: ['POST'] },
    '/*/conversations/*/members/*': { methods: ['PUT', 'DELETE'] },
    '/*/conversations/*/events/*': { methods: ['POST', 'GET'] },
    '/*/knocking/**': { methods: ['POST', 'DELETE'] },
    '/*/legs/**': { methods: ['POST', 'GET'] },
    '/*/v2/rtc/**': { methods: ['POST', 'GET'] },
  },
};

export interface ClientToken {
  token: string;
  expiresAt: Date;
}

export type ClientTokenSigner = (userName: string) => ClientToken;

export function createClientTokenSigner(
  { applicationId, privateKey }: { applicationId: string; privateKey: string },
  now: () => Date = () => new Date(),
): ClientTokenSigner {
  return (userName) => {
    const issuedAt = Math.floor(now().getTime() / 1000);
    const exp = issuedAt + CLIENT_TOKEN_TTL_SECONDS;

    return {
      token: tokenGenerate(applicationId, privateKey, {
        subject: userName,
        acl: CLIENT_TOKEN_ACL,
        issued_at: issuedAt,
        exp,
      }),
      expiresAt: new Date(exp * 1000),
    };
  };
}
