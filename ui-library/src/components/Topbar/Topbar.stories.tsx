import type { Meta, StoryObj } from '@storybook/react';
import { Topbar } from './Topbar';
import { Button } from '../Button/Button';

const meta: Meta<typeof Topbar> = {
  title: 'Components/Topbar',
  component: Topbar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Topbar>;

export const Basic: Story = {
  args: {
    logo: <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Molam</div>,
  },
};

export const WithNavigation: Story = {
  args: {
    logo: <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Molam</div>,
    navigation: (
      <nav style={{ display: 'flex', gap: '2rem' }}>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text)' }}>Dashboard</a>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text-secondary)' }}>Payments</a>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text-secondary)' }}>Analytics</a>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text-secondary)' }}>Settings</a>
      </nav>
    ),
  },
};

export const WithActions: Story = {
  args: {
    logo: <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Molam</div>,
    actions: (
      <>
        <Button variant="ghost" size="sm">Sign In</Button>
        <Button size="sm">Get Started</Button>
      </>
    ),
  },
};

export const Complete: Story = {
  args: {
    logo: (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--molam-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
          }}
        >
          M
        </div>
        <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Molam</span>
      </div>
    ),
    navigation: (
      <nav style={{ display: 'flex', gap: '2rem' }}>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text)' }}>Dashboard</a>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text-secondary)' }}>Payments</a>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text-secondary)' }}>Analytics</a>
        <a href="#" style={{ fontWeight: 500, color: 'var(--molam-text-secondary)' }}>Settings</a>
      </nav>
    ),
    actions: (
      <>
        <button
          style={{
            padding: '0.5rem',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--molam-text-secondary)',
          }}
          aria-label="Notifications"
        >
          🔔
        </button>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--molam-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          JD
        </div>
      </>
    ),
  },
};

export const NonSticky: Story = {
  args: {
    logo: <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Molam</div>,
    sticky: false,
  },
  render: (args) => (
    <div>
      <Topbar {...args} />
      <div style={{ padding: '2rem', height: '200vh' }}>
        <h1>Scroll down to see non-sticky behavior</h1>
        <p>The topbar will scroll away with the content.</p>
      </div>
    </div>
  ),
};

export const NoShadow: Story = {
  args: {
    logo: <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Molam</div>,
    shadow: false,
  },
};
