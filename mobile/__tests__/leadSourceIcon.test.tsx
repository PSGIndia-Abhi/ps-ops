import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { LeadSourceIcon } from '../src/crm/ui/StatusBadge';
import type { LeadSource } from '../src/crm/types';

function labelFor(source: LeadSource | null): string {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<LeadSourceIcon source={source} />);
  });
  return tree.root.findByProps({ accessible: true }).props.accessibilityLabel;
}

describe('LeadSourceIcon', () => {
  it('names a source the app knows', () => {
    expect(labelFor('google')).toBe('Google');
  });

  it('handles a lead with no source', () => {
    expect(labelFor(null)).toBe('Source not set');
  });

  // A lead submitted through the web provider portal is stored with a source name this app
  // has no entry for. It used to crash the whole Commercial list ("Cannot read property 'tone'").
  it('does not crash on a source from outside the app, and announces it by name', () => {
    expect(labelFor('Lead Provider' as LeadSource)).toBe('Lead Provider');
    expect(labelFor('Field Visit' as LeadSource)).toBe('Field Visit');
  });
});
