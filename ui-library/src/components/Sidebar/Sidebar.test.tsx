import React from 'react';
import { render, screen } from '@testing-library/react';
import { Sidebar, SidebarItem } from './Sidebar';

describe('Sidebar', () => {
  it('renders children', () => {
    render(<Sidebar>Sidebar content</Sidebar>);
    expect(screen.getByText('Sidebar content')).toBeInTheDocument();
  });

  it('renders with header', () => {
    render(<Sidebar header={<div>Header</div>}>Content</Sidebar>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('renders with footer', () => {
    render(<Sidebar footer={<div>Footer</div>}>Content</Sidebar>);
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies custom width', () => {
    const { container } = render(<Sidebar width="300px">Content</Sidebar>);
    const sidebar = container.querySelector('aside');
    expect(sidebar).toHaveStyle({ width: '300px' });
  });

  it('collapses to narrow width', () => {
    const { container } = render(<Sidebar collapsed>Content</Sidebar>);
    const sidebar = container.querySelector('aside');
    expect(sidebar).toHaveStyle({ width: '64px' });
  });

  it('positions on left by default', () => {
    const { container } = render(<Sidebar>Content</Sidebar>);
    expect(container.querySelector('aside')).toHaveClass('border-r');
  });

  it('positions on right when specified', () => {
    const { container } = render(<Sidebar position="right">Content</Sidebar>);
    expect(container.querySelector('aside')).toHaveClass('border-l');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLElement>();
    render(<Sidebar ref={ref}>Content</Sidebar>);
    expect(ref.current).toBeInstanceOf(HTMLElement);
  });
});

describe('SidebarItem', () => {
  it('renders with label', () => {
    render(<SidebarItem label="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders with icon', () => {
    render(<SidebarItem icon={<span data-testid="icon">📊</span>} label="Analytics" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies active state', () => {
    render(<SidebarItem label="Active Item" active />);
    expect(screen.getByText('Active Item')).toHaveClass('bg-[var(--molam-primary)]');
  });

  it('hides label when collapsed', () => {
    render(<SidebarItem label="Item" collapsed />);
    expect(screen.queryByText('Item')).not.toBeInTheDocument();
  });

  it('renders children as fallback', () => {
    render(<SidebarItem>Custom content</SidebarItem>);
    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLAnchorElement>();
    render(<SidebarItem ref={ref} label="Item" />);
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });

  it('acts as link element', () => {
    render(<SidebarItem label="Link" href="/dashboard" />);
    const link = screen.getByText('Link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
