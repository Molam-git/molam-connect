/**
 * Header Component Tests
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Header } from './Header';
import { UIConfigProvider } from '../context/UIConfigContext';

const defaultProps = {
  role: 'owner' as const,
  userName: 'Amadou Diallo',
  userEmail: 'amadou@molam.io'
};

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<UIConfigProvider>{ui}</UIConfigProvider>);
};

describe('Header Component', () => {
  describe('Rendering', () => {
    it('renders the header with logo', () => {
      renderWithProvider(<Header {...defaultProps} />);
      expect(screen.getByText('Molam Pay')).toBeInTheDocument();
    });

    it('displays user name', () => {
      renderWithProvider(<Header {...defaultProps} />);
      expect(screen.getByText('Amadou Diallo')).toBeInTheDocument();
    });

    it('displays user email', () => {
      renderWithProvider(<Header {...defaultProps} />);
      expect(screen.getByText('amadou@molam.io')).toBeInTheDocument();
    });

    it('displays user initial in avatar', () => {
      renderWithProvider(<Header {...defaultProps} />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });
  });

  describe('RBAC - Role-Based Access Control', () => {
    it('shows notifications for owner role', () => {
      renderWithProvider(
        <Header
          {...defaultProps}
          role="owner"
          notifications={[
            {
              id: '1',
              title: 'Test',
              message: 'Test message',
              type: 'info',
              timestamp: new Date().toISOString(),
              read: false
            }
          ]}
        />
      );
      expect(screen.getByLabelText(/Notifications/i)).toBeInTheDocument();
    });

    it('shows notifications for ops role', () => {
      renderWithProvider(
        <Header
          {...defaultProps}
          role="ops"
          notifications={[
            {
              id: '1',
              title: 'Test',
              message: 'Test message',
              type: 'info',
              timestamp: new Date().toISOString(),
              read: false
            }
          ]}
        />
      );
      expect(screen.getByLabelText(/Notifications/i)).toBeInTheDocument();
    });

    it('hides notifications for customer role', () => {
      renderWithProvider(
        <Header
          {...defaultProps}
          role="customer"
          notifications={[
            {
              id: '1',
              title: 'Test',
              message: 'Test message',
              type: 'info',
              timestamp: new Date().toISOString(),
              read: false
            }
          ]}
        />
      );
      expect(screen.queryByLabelText(/Notifications/i)).not.toBeInTheDocument();
    });

    it('shows settings for all roles except customer', () => {
      const roles: Array<'owner' | 'ops' | 'finance' | 'merchant'> = [
        'owner',
        'ops',
        'finance',
        'merchant'
      ];

      roles.forEach(role => {
        const { unmount } = renderWithProvider(
          <Header {...defaultProps} role={role} />
        );
        expect(screen.getByLabelText(/Paramètres/i)).toBeInTheDocument();
        unmount();
      });
    });

    it('hides settings for customer role', () => {
      renderWithProvider(<Header {...defaultProps} role="customer" />);
      expect(screen.queryByLabelText(/Paramètres/i)).not.toBeInTheDocument();
    });
  });

  describe('Settings Menu', () => {
    it('opens settings menu on click', () => {
      renderWithProvider(<Header {...defaultProps} role="owner" />);

      const settingsButton = screen.getByLabelText(/Paramètres/i);
      fireEvent.click(settingsButton);

      // Settings menu should be open
      expect(screen.getByRole('menu', { name: /Menu des paramètres/i })).toBeInTheDocument();
    });

    it('closes settings menu on close button click', () => {
      renderWithProvider(<Header {...defaultProps} role="owner" />);

      // Open menu
      const settingsButton = screen.getByLabelText(/Paramètres/i);
      fireEvent.click(settingsButton);

      // Close menu
      const closeButton = screen.getByLabelText(/Fermer les paramètres/i);
      fireEvent.click(closeButton);

      // Menu should be closed
      expect(screen.queryByRole('menu', { name: /Menu des paramètres/i })).not.toBeInTheDocument();
    });

    it('toggles settings menu on button click', () => {
      renderWithProvider(<Header {...defaultProps} role="owner" />);

      const settingsButton = screen.getByLabelText(/Paramètres/i);

      // First click - open
      fireEvent.click(settingsButton);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Second click - close
      fireEvent.click(settingsButton);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('Mobile Menu', () => {
    it('shows mobile menu button when onMobileMenuToggle is provided', () => {
      const onMobileMenuToggle = jest.fn();
      renderWithProvider(
        <Header {...defaultProps} onMobileMenuToggle={onMobileMenuToggle} />
      );

      expect(screen.getByLabelText(/Ouvrir le menu/i)).toBeInTheDocument();
    });

    it('calls onMobileMenuToggle when mobile menu button is clicked', () => {
      const onMobileMenuToggle = jest.fn();
      renderWithProvider(
        <Header {...defaultProps} onMobileMenuToggle={onMobileMenuToggle} />
      );

      const mobileMenuButton = screen.getByLabelText(/Ouvrir le menu/i);
      fireEvent.click(mobileMenuButton);

      expect(onMobileMenuToggle).toHaveBeenCalledTimes(1);
    });

    it('hides mobile menu button when onMobileMenuToggle is not provided', () => {
      renderWithProvider(<Header {...defaultProps} />);
      expect(screen.queryByLabelText(/Ouvrir le menu/i)).not.toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('calls custom onNavigate when provided', () => {
      const onNavigate = jest.fn();
      renderWithProvider(
        <Header {...defaultProps} role="owner" onNavigate={onNavigate} />
      );

      // Open settings menu
      const settingsButton = screen.getByLabelText(/Paramètres/i);
      fireEvent.click(settingsButton);

      // Click on a menu item (e.g., "Profil utilisateur")
      const profileItem = screen.getByText(/Profil utilisateur/i);
      fireEvent.click(profileItem);

      expect(onNavigate).toHaveBeenCalledWith('/settings/profile');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      renderWithProvider(<Header {...defaultProps} role="owner" />);

      expect(screen.getByLabelText(/Molam Pay - Accueil/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Paramètres/i)).toBeInTheDocument();
    });

    it('settings button has aria-expanded attribute', () => {
      renderWithProvider(<Header {...defaultProps} role="owner" />);

      const settingsButton = screen.getByLabelText(/Paramètres/i);

      // Initially closed
      expect(settingsButton).toHaveAttribute('aria-expanded', 'false');

      // Open menu
      fireEvent.click(settingsButton);
      expect(settingsButton).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('Custom styling', () => {
    it('applies custom className', () => {
      const { container } = renderWithProvider(
        <Header {...defaultProps} className="custom-header" />
      );

      const header = container.querySelector('header');
      expect(header).toHaveClass('custom-header');
    });
  });
});
