import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDraft, draftKey, loadDraft, saveDraft } from './draft.ts';

const ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000001';
const OTHER_ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000002';

describe('report draft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts empty', () => {
    expect(loadDraft(ORDER_ID)).toEqual({ type: null, description: '' });
  });

  it('keeps the type and the description', () => {
    saveDraft(ORDER_ID, { type: 'damaged', description: 'The box was crushed' });

    expect(loadDraft(ORDER_ID)).toEqual({ type: 'damaged', description: 'The box was crushed' });
  });

  it('keeps one draft per order', () => {
    saveDraft(ORDER_ID, { type: 'delayed', description: '' });

    expect(loadDraft(OTHER_ORDER_ID)).toEqual({ type: null, description: '' });
  });

  it('forgets the draft when it is cleared', () => {
    saveDraft(ORDER_ID, { type: 'delayed', description: 'Two days late' });
    clearDraft(ORDER_ID);

    expect(loadDraft(ORDER_ID)).toEqual({ type: null, description: '' });
  });

  it('stores nothing when both fields are empty', () => {
    saveDraft(ORDER_ID, { type: 'delayed', description: '' });
    saveDraft(ORDER_ID, { type: null, description: '' });

    expect(localStorage).toHaveLength(0);
  });

  it('ignores a corrupted draft', () => {
    localStorage.setItem(draftKey(ORDER_ID), 'not json');

    expect(loadDraft(ORDER_ID)).toEqual({ type: null, description: '' });
  });

  it('ignores a draft that is not an object', () => {
    localStorage.setItem(draftKey(ORDER_ID), 'null');

    expect(loadDraft(ORDER_ID)).toEqual({ type: null, description: '' });
  });

  it('ignores a type that does not exist and keeps the description', () => {
    localStorage.setItem(draftKey(ORDER_ID), JSON.stringify({ type: 'bogus', description: 'Hi' }));

    expect(loadDraft(ORDER_ID)).toEqual({ type: null, description: 'Hi' });
  });

  it('does not fail when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => {
      saveDraft(ORDER_ID, { type: 'damaged', description: 'Hi' });
    }).not.toThrow();
    expect(loadDraft(ORDER_ID)).toEqual({ type: null, description: '' });
  });
});
