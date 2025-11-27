import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders when open', () => {
    render(
      <Modal open onClose={() => {}}>
        Modal content
      </Modal>
    );
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        Modal content
      </Modal>
    );
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('renders with title', () => {
    render(
      <Modal open onClose={() => {}} title="Modal Title">
        Content
      </Modal>
    );
    expect(screen.getByText('Modal Title')).toBeInTheDocument();
  });

  it('renders with footer', () => {
    render(
      <Modal open onClose={() => {}} footer={<button>Footer Button</button>}>
        Content
      </Modal>
    );
    expect(screen.getByText('Footer Button')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const handleClose = jest.fn();
    render(
      <Modal open onClose={handleClose} title="Modal">
        Content
      </Modal>
    );

    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop clicked', () => {
    const handleClose = jest.fn();
    render(
      <Modal open onClose={handleClose}>
        Content
      </Modal>
    );

    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when content clicked', () => {
    const handleClose = jest.fn();
    render(
      <Modal open onClose={handleClose}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.click(screen.getByText('Content'));
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('does not close on backdrop click when closeOnBackdrop is false', () => {
    const handleClose = jest.fn();
    render(
      <Modal open onClose={handleClose} closeOnBackdrop={false}>
        Content
      </Modal>
    );

    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const handleClose = jest.fn();
    render(
      <Modal open onClose={handleClose}>
        Content
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when closeOnEscape is false', () => {
    const handleClose = jest.fn();
    render(
      <Modal open onClose={handleClose} closeOnEscape={false}>
        Content
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('has correct accessibility attributes', () => {
    render(
      <Modal open onClose={() => {}} title="Test Modal">
        Content
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
  });

  it('applies different sizes', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} size="sm">
        Content
      </Modal>
    );
    expect(screen.getByText('Content').parentElement).toHaveClass('max-w-sm');

    rerender(
      <Modal open onClose={() => {}} size="md">
        Content
      </Modal>
    );
    expect(screen.getByText('Content').parentElement).toHaveClass('max-w-md');

    rerender(
      <Modal open onClose={() => {}} size="lg">
        Content
      </Modal>
    );
    expect(screen.getByText('Content').parentElement).toHaveClass('max-w-lg');
  });
});
