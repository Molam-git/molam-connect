import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
    },
    hoverable: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Basic: Story = {
  args: {
    children: 'This is a basic card with some content.',
  },
};

export const WithTitle: Story = {
  args: {
    title: 'Card Title',
    children: 'This card has a title.',
  },
};

export const WithTitleAndSubtitle: Story = {
  args: {
    title: 'Card Title',
    subtitle: 'This is a subtitle or description',
    children: 'This card has both a title and subtitle.',
  },
};

export const SmallPadding: Story = {
  args: {
    padding: 'sm',
    children: 'This card has small padding.',
  },
};

export const LargePadding: Story = {
  args: {
    padding: 'lg',
    children: 'This card has large padding.',
  },
};

export const NoPadding: Story = {
  args: {
    padding: 'none',
    children: <div style={{ padding: '1rem' }}>This card has no padding (content is manually padded).</div>,
  },
};

export const Hoverable: Story = {
  args: {
    hoverable: true,
    title: 'Hoverable Card',
    children: 'Hover over this card to see the effect.',
  },
};

export const Clickable: Story = {
  args: {
    onClick: () => alert('Card clicked!'),
    title: 'Clickable Card',
    children: 'Click this card to trigger an action.',
  },
};

export const ComplexContent: Story = {
  args: {
    title: 'User Profile',
    subtitle: 'Active member since 2024',
    padding: 'lg',
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--molam-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold'
          }}>
            JD
          </div>
          <div>
            <div style={{ fontWeight: 'bold' }}>John Doe</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--molam-text-secondary)' }}>john@example.com</div>
          </div>
        </div>
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--molam-border)' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--molam-text-secondary)' }}>
            <strong>Role:</strong> Administrator
          </div>
        </div>
      </div>
    ),
  },
};

export const CardGrid: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
      <Card title="Analytics" subtitle="View your metrics">
        📊 Dashboard
      </Card>
      <Card title="Settings" subtitle="Configure your account">
        ⚙️ Preferences
      </Card>
      <Card title="Notifications" subtitle="3 new messages">
        🔔 Alerts
      </Card>
      <Card title="Help Center" subtitle="Get support">
        ❓ Documentation
      </Card>
    </div>
  ),
};
