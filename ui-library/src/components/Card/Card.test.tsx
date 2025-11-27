import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children content', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders with title', () => {
    render(<Card title="Card Title">Content</Card>);
    expect(screen.getByText('Card Title')).toBeInTheDocument();
  });

  it('renders with title and subtitle', () => {
    render(
      <Card title="Card Title" subtitle="Card subtitle">
        Content
      </Card>
    );
    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card subtitle')).toBeInTheDocument();
  });

  it('applies different padding sizes', () => {
    const { rerender } = render(<Card padding="sm">Content</Card>);
    expect(screen.getByText('Content').parentElement).toHaveClass('p-3');

    rerender(<Card padding="md">Content</Card>);
    expect(screen.getByText('Content').parentElement).toHaveClass('p-4');

    rerender(<Card padding="lg">Content</Card>);
    expect(screen.getByText('Content').parentElement).toHaveClass('p-6');

    rerender(<Card padding="none">Content</Card>);
    expect(screen.getByText('Content').parentElement).not.toHaveClass('p-3');
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Card onClick={handleClick}>Clickable card</Card>);

    fireEvent.click(screen.getByText('Clickable card'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard interaction when clickable', () => {
    const handleClick = jest.fn();
    render(<Card onClick={handleClick}>Clickable card</Card>);

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(card, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('has role="button" when clickable', () => {
    const handleClick = jest.fn();
    render(<Card onClick={handleClick}>Clickable card</Card>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('is keyboard accessible when clickable', () => {
    const handleClick = jest.fn();
    render(<Card onClick={handleClick}>Clickable card</Card>);
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('tabIndex', '0');
  });

  it('applies hoverable styles', () => {
    render(<Card hoverable>Hoverable card</Card>);
    expect(screen.getByText('Hoverable card').parentElement).toHaveClass('cursor-pointer');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>Card</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
