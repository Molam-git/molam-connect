import React from 'react';
import { render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('renders with logo', () => {
    render(<Topbar logo={<div>Logo</div>} />);
    expect(screen.getByText('Logo')).toBeInTheDocument();
  });

  it('renders with navigation', () => {
    render(<Topbar navigation={<nav>Navigation</nav>} />);
    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });

  it('renders with actions', () => {
    render(<Topbar actions={<button>Action</button>} />);
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('renders all slots together', () => {
    render(
      <Topbar
        logo={<div>Logo</div>}
        navigation={<nav>Nav</nav>}
        actions={<button>Actions</button>}
      />
    );
    expect(screen.getByText('Logo')).toBeInTheDocument();
    expect(screen.getByText('Nav')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders children as fallback', () => {
    render(<Topbar>Custom content</Topbar>);
    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });

  it('applies sticky class by default', () => {
    const { container } = render(<Topbar />);
    expect(container.querySelector('header')).toHaveClass('sticky');
  });

  it('removes sticky when sticky=false', () => {
    const { container } = render(<Topbar sticky={false} />);
    expect(container.querySelector('header')).not.toHaveClass('sticky');
  });

  it('applies shadow by default', () => {
    const { container } = render(<Topbar />);
    expect(container.querySelector('header')).toHaveClass('shadow-[var(--molam-shadow-sm)]');
  });

  it('removes shadow when shadow=false', () => {
    const { container } = render(<Topbar shadow={false} />);
    expect(container.querySelector('header')).not.toHaveClass('shadow-[var(--molam-shadow-sm)]');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLElement>();
    render(<Topbar ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
  });

  it('applies custom className', () => {
    const { container } = render(<Topbar className="custom-class" />);
    expect(container.querySelector('header')).toHaveClass('custom-class');
  });
});
