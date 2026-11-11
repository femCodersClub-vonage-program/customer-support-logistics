import type { Locale } from './locale.js';

export const AGENT_ROLES = ['agent'] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export interface Agent {
  id: string;
  email: string;
  name: string;
  role: AgentRole;
  locale: Locale;
}
