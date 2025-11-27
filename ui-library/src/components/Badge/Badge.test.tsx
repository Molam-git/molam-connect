import React from 'react';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders with text', () => {
    render(<Badge>Badge text</Badge>);
    expect(screen.getByText('Badge text')).toBeInTheDocument();
  });

  it('renders different variants', () => {
    const { rerender } = render(<Badge variant="primary">Primary</Badge>);
    expect(screen.getByText('Primary')).toHaveClass('bg-[var(--molam-primary)]');

    rerender(<Badge variant="success">Success</Badge>);
    expect(screen.getByText('Success')).toHaveClass('bg-[var(--molam-success)]');

    rerender(<Badge variant="warning">Warning</Badge>);
    expect(screen.getByText('Warning')).toHaveClass('bg-[var(--molam-warning)]');

    rerender(<Badge variant="error">Error</Badge>);
    expect(screen.getByText('Error')).toHaveClass('bg-[var(--molam-error)]');

    rerender(<Badge variant="neutral">Neutral</Badge>);
    expect(screen.getByText('Neutral')).toHaveClass('bg-[var(--molam-border)]');
  });

  it('renders different sizes', () => {
    const { rerender } = render(<Badge size="sm">Small</Badge>);
    expect(screen.getByText('Small')).toHaveClass('px-2');

    rerender(<Badge size="md">Medium</Badge>);
    expect(screen.getByText('Medium')).toHaveClass('px-2.5');

    rerender(<Badge size="lg">Large</Badge>);
    expect(screen.getByText('Large')).toHaveClass('px-3');
  });

  it('renders as dot indicator', () => {
    const { container } = render(<Badge dot variant="success">Active</Badge>);
    const dot = container.querySelector('.w-2.h-2');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-[var(--molam-success)]');
  });

  it('renders dot without label', () => {
    const { container } = render(<Badge dot variant="primary" />);
    const dot = container.querySelector('.w-2.h-2');
    expect(dot).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLSpanElement>();
    render(<Badge ref={ref}>Badge</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Badge</Badge>);
    expect(screen.getByText('Badge')).toHaveClass('custom-class');
  });
});
