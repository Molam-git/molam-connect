/**
 * Example usage of Molam Header Component
 * Demonstrates RBAC, notifications, settings menu
 */
import React, { useState } from 'react';
import {
  Header,
  ScrollToTopButton,
  UIConfigProvider,
  type Notification
} from '../src';

// Example: Custom UI config (optional)
const customConfig = {
  theme: {
    primaryColor: '#3B82F6',
    headerHeight: 64
  },
  features: {
    showNotifications: true,
    showSettings: true
  },
  notifications: {
    maxDisplayed: 5
  }
};

function App() {
  // User state - in real app, this comes from auth context
  const [userRole] = useState<'owner' | 'ops' | 'finance' | 'merchant' | 'customer'>('owner');
  const [userName] = useState('Amadou Diallo');
  const [userEmail] = useState('amadou@molam.io');

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'Nouveau paiement reçu',
      message: 'Paiement de 50 000 XOF de Client ABC',
      type: 'success',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      read: false,
      link: '/transactions/1234'
    },
    {
      id: '2',
      title: 'Virement en attente',
      message: 'Virement de 200 000 XOF vers compte Banque X',
      type: 'warning',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      read: false
    },
    {
      id: '3',
      title: 'Connexion depuis nouvel appareil',
      message: 'Connexion détectée depuis un iPhone 15',
      type: 'info',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      read: true
    },
    {
      id: '4',
      title: 'Échec de webhook',
      message: 'Le webhook vers votre endpoint a échoué 3 fois',
      type: 'error',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      read: true,
      link: '/settings/webhooks'
    }
  ]);

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Mark notification as read
  const handleMarkAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
  };

  // Mark all as read
  const handleMarkAllAsRead = () => {
    setNotifications(prev =>
      prev.map(notif => ({ ...notif, read: true }))
    );
  };

  // Handle navigation
  const handleNavigate = (path: string) => {
    console.log('Navigate to:', path);
    // In real app: router.push(path)
  };

  return (
    <UIConfigProvider config={customConfig}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <Header
          role={userRole}
          userName={userName}
          userEmail={userEmail}
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onNavigate={handleNavigate}
          onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        {/* Main content */}
        <main className="pt-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Hero section */}
            <section className="py-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                Bienvenue sur Molam Pay
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                Plateforme de paiement sécurisée pour l'Afrique de l'Ouest
              </p>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Informations utilisateur
                </h2>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Nom</dt>
                    <dd className="text-base text-gray-900">{userName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="text-base text-gray-900">{userEmail}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Rôle</dt>
                    <dd className="text-base text-gray-900 capitalize">{userRole}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Notifications non lues</dt>
                    <dd className="text-base text-gray-900">
                      {notifications.filter(n => !n.read).length}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            {/* Features */}
            <section className="py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Fonctionnalités du Header
              </h2>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    RBAC Strict
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Chaque bouton et outil n'apparaît que si l'utilisateur a les droits nécessaires.
                    Testez avec différents rôles: owner, ops, finance, merchant, customer.
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Configuration JSON
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Le menu Paramètres est configurable via settingsMenu.json.
                    Les Ops peuvent ajouter/retirer des outils sans coder.
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Design Apple-like
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Interface minimale, claire, espaces généreux, coins arrondis (12px),
                    transitions fluides (300ms), palette sobre.
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Notifications
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Badge avec compteur, dropdown avec liste, marquer comme lu,
                    couleurs par type (success, warning, error, info).
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Scroll to Top
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Bouton toujours accessible, apparaît après 200px de scroll,
                    scroll fluide vers le haut, respecte les préférences d'accessibilité.
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Multi-langues
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Support Français, English, Wolof, Arabe.
                    Multi-devises: XOF, XAF, EUR, USD, GBP.
                  </p>
                </div>
              </div>
            </section>

            {/* Long content to test scroll */}
            <section className="py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Contenu de test (pour le scroll)
              </h2>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Section {i + 1}
                  </h3>
                  <p className="text-gray-600">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                    incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
                    exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              ))}
            </section>
          </div>
        </main>

        {/* Scroll to top button */}
        <ScrollToTopButton />
      </div>
    </UIConfigProvider>
  );
}

export default App;
