import { SwaggerModule } from '@nestjs/swagger';

import { createOpenApiDocument } from './openapi.document.js';

import type { Env } from '../config/env.schema.js';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

export const OPENAPI_PATH = 'docs';

export function setupOpenApi(app: INestApplication, nodeEnv: Env['NODE_ENV']): boolean {
  if (nodeEnv === 'production') {
    return false;
  }

  const document = createOpenApiDocument() as unknown as OpenAPIObject;

  SwaggerModule.setup(OPENAPI_PATH, app, document, { jsonDocumentUrl: `${OPENAPI_PATH}/json` });

  return true;
}
