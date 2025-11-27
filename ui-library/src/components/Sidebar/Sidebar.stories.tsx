import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar, SidebarItem } from './Sidebar';
import { Button } from '../Button/Button';

const meta: Meta<typeof Sidebar> = {
  title: 'Components/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

const DashboardIcon = () => <span>📊</span>;
const PaymentsIcon = () => <span>💳</span>;
const UsersIcon = () => <span>👥</span>;
const SettingsIcon = () => <span>⚙️</span>;

export const Basic: Story = {
  render: () => (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar>
        <SidebarItem icon={<DashboardIcon />} label="Dashboard" active />
        <SidebarItem icon={<PaymentsIcon />} label="Payments" />
        <SidebarItem icon={<UsersIcon />} label="Users" />
        <SidebarItem icon={<SettingsIcon />} label="Settings" />
      </Sidebar>
      <main style={{ flex: 1, padding: '2rem' }}>
        <h1>Main Content</h1>
      </main>
    </div>
  ),
};

export const WithHeaderAndFooter: Story = {
  render: () => (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar
        header={
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
            <span style={{ fontWeight: 'bold' }}>Molam</span>
          </div>
        }
        footer={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                fontSize: '0.75rem',
                fontWeight: 'bold',
              }}
            >
              JD
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>John Doe</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--molam-text-secondary)' }}>Admin</div>
            </div>
          </div>
        }
      >
        <SidebarItem icon={<DashboardIcon />} label="Dashboard" active />
        <SidebarItem icon={<PaymentsIcon />} label="Payments" />
        <SidebarItem icon={<UsersIcon />} label="Users" />
        <SidebarItem icon={<SettingsIcon />} label="Settings" />
      </Sidebar>
      <main style={{ flex: 1, padding: '2rem' }}>
        <h1>Main Content</h1>
      </main>
    </div>
  ),
};

export const Collapsible: Story = {
  render: () => {
    const [collapsed, setCollapsed] = useState(false);

    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar
          collapsed={collapsed}
          header={
            <div style={{ fontWeight: 'bold' }}>
              {collapsed ? 'M' : 'Molam'}
            </div>
          }
        >
          <SidebarItem icon={<DashboardIcon />} label="Dashboard" collapsed={collapsed} active />
          <SidebarItem icon={<PaymentsIcon />} label="Payments" collapsed={collapsed} />
          <SidebarItem icon={<UsersIcon />} label="Users" collapsed={collapsed} />
          <SidebarItem icon={<SettingsIcon />} label="Settings" collapsed={collapsed} />
        </Sidebar>
        <main style={{ flex: 1, padding: '2rem' }}>
          <Button onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? 'Expand' : 'Collapse'} Sidebar
          </Button>
          <h1 style={{ marginTop: '2rem' }}>Main Content</h1>
        </main>
      </div>
    );
  },
};

export const RightPosition: Story = {
  render: () => (
    <div style={{ display: 'flex', height: '100vh' }}>
      <main style={{ flex: 1, padding: '2rem' }}>
        <h1>Main Content</h1>
        <p>Sidebar is positioned on the right</p>
      </main>
      <Sidebar position="right">
        <SidebarItem icon={<DashboardIcon />} label="Dashboard" active />
        <SidebarItem icon={<PaymentsIcon />} label="Payments" />
        <SidebarItem icon={<UsersIcon />} label="Users" />
        <SidebarItem icon={<SettingsIcon />} label="Settings" />
      </Sidebar>
    </div>
  ),
};

export const CustomWidth: Story = {
  render: () => (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar width="320px">
        <SidebarItem icon={<DashboardIcon />} label="Dashboard" active />
        <SidebarItem icon={<PaymentsIcon />} label="Payments" />
        <SidebarItem icon={<UsersIcon />} label="Users" />
        <SidebarItem icon={<SettingsIcon />} label="Settings" />
      </Sidebar>
      <main style={{ flex: 1, padding: '2rem' }}>
        <h1>Main Content</h1>
        <p>Sidebar has custom width of 320px</p>
      </main>
    </div>
  ),
};

export const WithSections: Story = {
  render: () => (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar
        header={<div style={{ fontWeight: 'bold' }}>Molam</div>}
      >
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            padding: '0.5rem 1rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--molam-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Main
          </div>
          <SidebarItem icon={<DashboardIcon />} label="Dashboard" active />
          <SidebarItem icon={<PaymentsIcon />} label="Payments" />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            padding: '0.5rem 1rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--molam-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Management
          </div>
          <SidebarItem icon={<UsersIcon />} label="Users" />
          <SidebarItem icon={<SettingsIcon />} label="Settings" />
        </div>
      </Sidebar>
      <main style={{ flex: 1, padding: '2rem' }}>
        <h1>Main Content</h1>
      </main>
    </div>
  ),
};
