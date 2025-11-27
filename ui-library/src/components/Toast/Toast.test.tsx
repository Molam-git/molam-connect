import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders with message', () => {
    render(<Toast message="Test message" onClose={() => {}} />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const handleClose = jest.fn();
    render(<Toast message="Test" onClose={handleClose} />);

    const closeButton = screen.getByLabelText('Close notification');
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('auto closes after duration', async () => {
    const handleClose = jest.fn();
    render(<Toast message="Test" onClose={handleClose} duration={100} />);

    await waitFor(() => expect(handleClose).toHaveBeenCalled(), { timeout: 200 });
  });

  it('does not auto close when duration is 0', async () => {
    const handleClose = jest.fn();
    render(<Toast message="Test" onClose={handleClose} duration={0} />);

    await new Promise(resolve => setTimeout(resolve, 200));
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('renders different variants', () => {
    const { rerender } = render(<Toast message="Info" variant="info" onClose={() => {}} />);
    expect(screen.getByText('ℹ️')).toBeInTheDocument();

    rerender(<Toast message="Success" variant="success" onClose={() => {}} />);
    expect(screen.getByText('✓')).toBeInTheDocument();

    rerender(<Toast message="Warning" variant="warning" onClose={() => {}} />);
    expect(screen.getByText('⚠️')).toBeInTheDocument();

    rerender(<Toast message="Error" variant="error" onClose={() => {}} />);
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('hides close button when closable is false', () => {
    render(<Toast message="Test" onClose={() => {}} closable={false} />);
    expect(screen.queryByLabelText('Close notification')).not.toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(<Toast message="Test" onClose={() => {}} />);
    const toast = screen.getByRole('alert');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });
});
