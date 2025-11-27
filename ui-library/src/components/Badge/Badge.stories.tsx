import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'success', 'warning', 'error', 'neutral'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    dot: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Primary: Story = {
  args: {
    children: 'Primary',
    variant: 'primary',
  },
};

export const Success: Story = {
  args: {
    children: 'Success',
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    children: 'Warning',
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    children: 'Error',
    variant: 'error',
  },
};

export const Neutral: Story = {
  args: {
    children: 'Neutral',
    variant: 'neutral',
  },
};

export const Small: Story = {
  args: {
    children: 'Small',
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    children: 'Medium',
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    children: 'Large',
    size: 'lg',
  },
};

export const DotIndicator: Story = {
  args: {
    dot: true,
    variant: 'success',
    children: 'Online',
  },
};

export const DotOnly: Story = {
  args: {
    dot: true,
    variant: 'error',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <Badge variant="primary">Primary</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="error">Error</Badge>
        <Badge variant="neutral">Neutral</Badge>
      </div>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <Badge size="sm" variant="primary">Small</Badge>
      <Badge size="md" variant="primary">Medium</Badge>
      <Badge size="lg" variant="primary">Large</Badge>
    </div>
  ),
};

export const WithDots: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
      <Badge dot variant="success">Online</Badge>
      <Badge dot variant="warning">Away</Badge>
      <Badge dot variant="error">Offline</Badge>
      <Badge dot variant="neutral">Unknown</Badge>
    </div>
  ),
};

export const StatusExamples: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Payment:</span>
        <Badge variant="success" size="sm">Completed</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Status:</span>
        <Badge variant="warning" size="sm">Pending</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Transaction:</span>
        <Badge variant="error" size="sm">Failed</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Account:</span>
        <Badge dot variant="success">Active</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>User:</span>
        <Badge dot variant="neutral">Inactive</Badge>
      </div>
    </div>
  ),
};

export const InTable: Story = {
  render: () => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--molam-border)' }}>
          <th style={{ padding: '0.75rem', textAlign: 'left' }}>User</th>
          <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
          <th style={{ padding: '0.75rem', textAlign: 'left' }}>Role</th>
        </tr>
      </thead>
      <tbody>
        <tr style={{ borderBottom: '1px solid var(--molam-border)' }}>
          <td style={{ padding: '0.75rem' }}>John Doe</td>
          <td style={{ padding: '0.75rem' }}>
            <Badge dot variant="success">Active</Badge>
          </td>
          <td style={{ padding: '0.75rem' }}>
            <Badge variant="primary" size="sm">Admin</Badge>
          </td>
        </tr>
        <tr style={{ borderBottom: '1px solid var(--molam-border)' }}>
          <td style={{ padding: '0.75rem' }}>Jane Smith</td>
          <td style={{ padding: '0.75rem' }}>
            <Badge dot variant="warning">Away</Badge>
          </td>
          <td style={{ padding: '0.75rem' }}>
            <Badge variant="neutral" size="sm">User</Badge>
          </td>
        </tr>
        <tr>
          <td style={{ padding: '0.75rem' }}>Bob Johnson</td>
          <td style={{ padding: '0.75rem' }}>
            <Badge dot variant="error">Offline</Badge>
          </td>
          <td style={{ padding: '0.75rem' }}>
            <Badge variant="neutral" size="sm">User</Badge>
          </td>
        </tr>
      </tbody>
    </table>
  ),
};
