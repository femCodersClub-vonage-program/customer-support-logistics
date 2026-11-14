export type HealthStatus = 'ok';

export interface HealthResponse {
  status: HealthStatus;
  version: string;
}

export type ReadinessStatus = 'ok' | 'error';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessResponse {
  status: ReadinessStatus;
  database: DependencyStatus;
}
