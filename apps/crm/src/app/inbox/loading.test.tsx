import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../../test/render';

import InboxLoading from './loading';

describe('InboxLoading', () => {
  it('announces that the incidents are loading', () => {
    renderWithIntl(<InboxLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading incidents…');
  });
});
