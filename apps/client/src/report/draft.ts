import { INCIDENT_TYPES } from '@csl/shared-types';

import type { IncidentType } from '@csl/shared-types';

export interface ReportDraft {
  type: IncidentType | null;
  description: string;
}

const EMPTY_DRAFT: ReportDraft = { type: null, description: '' };

export function draftKey(orderId: string): string {
  return `report-draft:${orderId}`;
}

export function loadDraft(orderId: string): ReportDraft {
  try {
    const stored = localStorage.getItem(draftKey(orderId));

    if (stored === null) {
      return EMPTY_DRAFT;
    }

    const { type, description } = JSON.parse(stored) as Partial<
      Record<keyof ReportDraft, unknown>
    >;

    return {
      type: INCIDENT_TYPES.find((candidate) => candidate === type) ?? null,
      description: typeof description === 'string' ? description : '',
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(orderId: string, draft: ReportDraft): void {
  try {
    if (draft.type === null && draft.description === '') {
      localStorage.removeItem(draftKey(orderId));
    } else {
      localStorage.setItem(draftKey(orderId), JSON.stringify(draft));
    }
  } catch {
    // The draft is a convenience: if the storage is full or blocked, the form still works.
  }
}

export function clearDraft(orderId: string): void {
  try {
    localStorage.removeItem(draftKey(orderId));
  } catch {
    // Same as saveDraft: nothing to do if the storage is not available.
  }
}