import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

export const APP_OPTIONS: NestApplicationOptions = { rawBody: true };

export interface AppSettings {
  clientIpHeader: string | undefined;
}

export function configureApp(app: NestExpressApplication, { clientIpHeader }: AppSettings): void {
  if (!clientIpHeader) {
    return;
  }

  app.use((request: Request, _response: Response, next: NextFunction) => {
    const clientIp = request.headers[clientIpHeader];

    if (typeof clientIp === 'string' && clientIp.trim() !== '') {
      Object.defineProperty(request, 'ip', { value: clientIp.trim(), configurable: true });
    }

    next();
  });
}
