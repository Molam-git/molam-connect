import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Toast, ToastProps } from './Toast';
import { Button } from '../Button/Button';

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Info: Story = {
  render: () => {
    const [show, setShow] = useState(false);
    return (
      <div>
        <Button onClick={() => setShow(true)}>Show Info Toast</Button>
        {show && (
          <Toast
            message="This is an informational message"
            variant="info"
            onClose={() => setShow(false)}
          />
        )}
      </div>
    );
  },
};

export const Success: Story = {
  render: () => {
    const [show, setShow] = useState(false);
    return (
      <div>
        <Button onClick={() => setShow(true)}>Show Success Toast</Button>
        {show && (
          <Toast
            message="Operation completed successfully!"
            variant="success"
            onClose={() => setShow(false)}
          />
        )}
      </div>
    );
  },
};

export const Warning: Story = {
  render: () => {
    const [show, setShow] = useState(false);
    return (
      <div>
        <Button onClick={() => setShow(true)}>Show Warning Toast</Button>
        {show && (
          <Toast
            message="Warning: This action cannot be undone"
            variant="warning"
            onClose={() => setShow(false)}
          />
        )}
      </div>
    );
  },
};

export const Error: Story = {
  render: () => {
    const [show, setShow] = useState(false);
    return (
      <div>
        <Button onClick={() => setShow(true)}>Show Error Toast</Button>
        {show && (
          <Toast
            message="An error occurred while processing your request"
            variant="error"
            onClose={() => setShow(false)}
          />
        )}
      </div>
    );
  },
};

export const NoDismiss: Story = {
  render: () => {
    const [show, setShow] = useState(false);
    return (
      <div>
        <Button onClick={() => setShow(true)}>Show Non-Closable Toast</Button>
        {show && (
          <Toast
            message="This toast cannot be manually dismissed"
            variant="info"
            onClose={() => setShow(false)}
            closable={false}
            duration={3000}
          />
        )}
      </div>
    );
  },
};

export const NoAutoClose: Story = {
  render: () => {
    const [show, setShow] = useState(false);
    return (
      <div>
        <Button onClick={() => setShow(true)}>Show Persistent Toast</Button>
        {show && (
          <Toast
            message="This toast will not auto-close. Click X to dismiss."
            variant="info"
            onClose={() => setShow(false)}
            duration={0}
          />
        )}
      </div>
    );
  },
};

export const DifferentPositions: Story = {
  render: () => {
    const [toasts, setToasts] = useState<Array<{ id: number; position: ToastProps['position'] }>>([]);

    const showToast = (position: ToastProps['position']) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, position }]);
    };

    const removeToast = (id: number) => {
      setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          <Button size="sm" onClick={() => showToast('top-left')}>Top Left</Button>
          <Button size="sm" onClick={() => showToast('top-center')}>Top Center</Button>
          <Button size="sm" onClick={() => showToast('top-right')}>Top Right</Button>
          <Button size="sm" onClick={() => showToast('bottom-left')}>Bottom Left</Button>
          <Button size="sm" onClick={() => showToast('bottom-center')}>Bottom Center</Button>
          <Button size="sm" onClick={() => showToast('bottom-right')}>Bottom Right</Button>
        </div>

        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={`Toast at ${toast.position}`}
            variant="success"
            position={toast.position}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    );
  },
};

export const MultipleToasts: Story = {
  render: () => {
    const [toasts, setToasts] = useState<Array<{ id: number; message: string; variant: ToastProps['variant'] }>>([]);

    const addToast = (message: string, variant: ToastProps['variant']) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, variant }]);
    };

    const removeToast = (id: number) => {
      setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button size="sm" onClick={() => addToast('Info message', 'info')}>Add Info</Button>
          <Button size="sm" onClick={() => addToast('Success!', 'success')}>Add Success</Button>
          <Button size="sm" onClick={() => addToast('Warning!', 'warning')}>Add Warning</Button>
          <Button size="sm" onClick={() => addToast('Error!', 'error')}>Add Error</Button>
        </div>

        <div style={{ position: 'fixed', top: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 1000 }}>
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              message={toast.message}
              variant={toast.variant}
              position="top-right"
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </div>
    );
  },
};
