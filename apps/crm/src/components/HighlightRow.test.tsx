import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { highlight, resetHighlights } from '../lib/events/highlights';

import { HighlightRow } from './HighlightRow';

function renderRow() {
  render(
    <table>
      <tbody>
        <HighlightRow incidentId="a">
          <td>cell</td>
        </HighlightRow>
      </tbody>
    </table>,
  );

  return screen.getByRole('row');
}

beforeEach(() => {
  resetHighlights();
});

describe('HighlightRow', () => {
  it('is not highlighted by default', () => {
    expect(renderRow()).not.toHaveAttribute('data-highlight');
  });

  it('is highlighted when its incident changes', () => {
    const row = renderRow();

    act(() => highlight(['a']));

    expect(row).toHaveAttribute('data-highlight', 'true');
  });

  it('ignores other incidents', () => {
    const row = renderRow();

    act(() => highlight(['b']));

    expect(row).not.toHaveAttribute('data-highlight');
  });
});
