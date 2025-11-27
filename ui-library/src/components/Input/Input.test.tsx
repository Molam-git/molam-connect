import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label="Username" />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('renders with helper text', () => {
    render(<Input helperText="Enter your username" />);
    expect(screen.getByText('Enter your username')).toBeInTheDocument();
  });

  it('renders with error message', () => {
    render(<Input error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('shows required asterisk when required', () => {
    render(<Input label="Email" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('handles value changes', () => {
    const handleChange = jest.fn();
    render(<Input onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('applies different sizes', () => {
    const { rerender } = render(<Input inputSize="sm" />);
    expect(screen.getByRole('textbox')).toHaveClass('px-3');

    rerender(<Input inputSize="md" />);
    expect(screen.getByRole('textbox')).toHaveClass('px-4');

    rerender(<Input inputSize="lg" />);
    expect(screen.getByRole('textbox')).toHaveClass('px-4');
  });

  it('renders with start icon', () => {
    render(<Input startIcon={<span data-testid="start-icon">🔍</span>} />);
    expect(screen.getByTestId('start-icon')).toBeInTheDocument();
  });

  it('renders with end icon', () => {
    render(<Input endIcon={<span data-testid="end-icon">✓</span>} />);
    expect(screen.getByTestId('end-icon')).toBeInTheDocument();
  });

  it('disables input when disabled prop is true', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('has correct aria attributes for errors', () => {
    render(<Input error="Error message" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('has correct aria attributes for helper text', () => {
    render(<Input helperText="Helper text" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('applies full width', () => {
    render(<Input fullWidth label="Full Width" />);
    const container = screen.getByLabelText('Full Width').parentElement?.parentElement;
    expect(container).toHaveClass('w-full');
  });

  it('supports different input types', () => {
    const { rerender } = render(<Input type="email" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');

    rerender(<Input type="password" />);
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();

    rerender(<Input type="number" />);
    expect(document.querySelector('input[type="number"]')).toBeInTheDocument();
  });
});
