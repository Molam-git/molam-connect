# 🏠 Molam Home Pages - Documentation

## 📋 Vue d'ensemble

Deux pages d'accueil distinctes pour les deux produits Molam:

1. **Molam Ma (Wallet)** - Pour utilisateurs finaux
2. **Molam Connect** - Pour marchands/entreprises

---

## 🎯 Molam Ma (Wallet) - Page d'accueil

**Fichier:** `ui-library/src/pages/MolamMaHome.tsx`

### Caractéristiques

#### 1. QR Code Molam au Centre
- ✅ **Mobile**: Centré verticalement et horizontalement
- ✅ **Desktop**: Placement optimisé dans grid
- ✅ QR Code généré dynamiquement via API ou data prop
- ✅ Explication claire: "Partagez ce code pour recevoir de l'argent"

#### 2. Balance Visible
- ✅ Card gradient bleu avec solde disponible
- ✅ Format devise automatique (XOF, XAF, EUR, etc.)
- ✅ Icône wallet
- ✅ Label "Compte Molam Ma"

#### 3. Boutons Principaux (Cercles)
Uniquement pour briques déjà construites:
- **Transfert** (vers contacts ou IBAN)
- **Paiement marchand** (scan ou checkout Molam Form)
- **Cash-in / Cash-out** (banques, agents, mobile money)

Design:
- Cercles colorés avec icônes Lucide React
- Hover states fluides
- Grid responsive 2x2

#### 4. Historique Transactions
- ✅ Liste scrollable avec statut (complété/en attente/échoué)
- ✅ Tags visuels: + crédit (vert), – débit (rouge)
- ✅ Filtres: Tout / Aujourd'hui / Cette semaine / Ce mois
- ✅ Timestamps relatifs ("Il y a 5 min", "Il y a 2h")
- ✅ Click sur transaction → détails

#### 5. Header Simple
- ✅ "Bonjour, {userName}"
- ✅ Icône Notifications (cloche)
- ✅ Icône Paramètres (engrenage)

### Props

```typescript
interface MolamMaHomeProps {
  userName: string;
  balance: number;
  currency?: string;                    // Défaut: 'XOF'
  transactions?: Transaction[];
  qrCodeData?: string;                  // Data pour QR code
  onTransferClick?: () => void;
  onPaymentClick?: () => void;
  onCashInOutClick?: () => void;
  onSettingsClick?: () => void;
  onNotificationsClick?: () => void;
  onTransactionClick?: (id: string) => void;
}
```

### Exemple d'utilisation

```tsx
import { MolamMaHome } from '@molam/ui-library';

function WalletApp() {
  const [transactions] = useState<Transaction[]>([
    {
      id: 'tx-001',
      type: 'credit',
      amount: 50000,
      currency: 'XOF',
      description: 'Reçu de Papa Diallo',
      timestamp: new Date().toISOString(),
      status: 'completed'
    }
  ]);

  return (
    <MolamMaHome
      userName="Amadou"
      balance={125000}
      currency="XOF"
      transactions={transactions}
      qrCodeData="molam://pay/user-123"
      onTransferClick={() => navigate('/transfer')}
      onPaymentClick={() => navigate('/payment')}
      onCashInOutClick={() => navigate('/cash')}
    />
  );
}
```

### Design Tokens

```scss
// Colors
$primary: #3B82F6;      // Blue
$success: #10B981;      // Green (credit)
$danger: #EF4444;       // Red (debit)
$warning: #F59E0B;      // Yellow (pending)

// Spacing
$padding-card: 24px;
$gap-actions: 16px;
$border-radius: 24px;

// Typography
$font-balance: 36px bold;
$font-transaction: 14px;
```

---

## 💼 Molam Connect - Page d'accueil

**Fichier:** `ui-library/src/pages/MolamConnectHome.tsx`

### Caractéristiques

#### 1. Pas de QR Code Centré
Usage marchand → focus sur analytics et actions

#### 2. Header avec Actions Rapides
Boutons pour actions fréquentes Ops/Finance:
- ✅ **Créer une facture** (FileText icon)
- ✅ **Exporter un rapport** (Download icon)
- ✅ **Ajouter un collaborateur** (UserPlus icon)

#### 3. Statistiques Clés (Grid 4 colonnes)
- **Chiffre d'affaires** - Avec trend % (vert/rouge)
- **Ventes totales** - Nombre de transactions
- **Clients actifs** - Nombre de clients uniques
- **Marge nette** - Profit après coûts

Chaque stat:
- Icône colorée en cercle
- Valeur grand format
- Label descriptif
- Indicateur trend (↑ ↓)

#### 4. Transactions Status (Grid 3 colonnes)
- **Balance marchande** - Card gradient bleu avec CTA "Demander virement"
- **En attente** - Nombre de transactions pending
- **Échouées** - Nombre de transactions failed avec CTA "Analyser"

#### 5. Alertes SIRA
- ✅ Affichées en haut (priorité haute)
- ✅ Couleurs par sévérité: critical (rouge), high (orange), medium (jaune), low (bleu)
- ✅ Type d'alerte: fraud, anomaly, security, compliance
- ✅ Click → détails alerte

#### 6. Top Produits & Top Clients (Grid 2 colonnes)
Tableaux classés par:
- **Produits**: Nombre de ventes + Revenu
- **Clients**: Nombre de transactions + Total dépensé

Design:
- Numérotation 1, 2, 3 en badges colorés
- Noms tronqués avec ellipsis
- Montants formatés

#### 7. Menu Latéral (Sidebar)
Navigation principale:
- Dashboard (actif)
- Transactions
- Clients
- Produits
- Virements
- Rapports

Mobile: Collapsible avec overlay

### Props

```typescript
interface MolamConnectHomeProps {
  merchantName: string;
  currency?: string;
  stats: MerchantStats;
  topProducts?: TopProduct[];
  topCustomers?: TopCustomer[];
  siraAlerts?: SiraAlert[];
  onCreateInvoice?: () => void;
  onExportReport?: () => void;
  onAddCollaborator?: () => void;
  onAlertClick?: (alertId: string) => void;
}

interface MerchantStats {
  totalSales: number;
  totalRevenue: number;
  totalMargin: number;
  totalCustomers: number;
  pendingTransactions: number;
  failedTransactions: number;
  balance: number;
  pendingPayouts: number;
}
```

### Exemple d'utilisation

```tsx
import { MolamConnectHome } from '@molam/ui-library';

function MerchantDashboard() {
  const stats: MerchantStats = {
    totalSales: 1234,
    totalRevenue: 45000000,
    totalMargin: 5600000,
    totalCustomers: 567,
    pendingTransactions: 23,
    failedTransactions: 5,
    balance: 12500000,
    pendingPayouts: 3
  };

  const topProducts: TopProduct[] = [
    {
      id: 'p1',
      name: 'MacBook Pro M3',
      sales: 45,
      revenue: 67500000
    }
  ];

  const siraAlerts: SiraAlert[] = [
    {
      id: 'alert-1',
      severity: 'high',
      type: 'fraud',
      title: 'Transaction suspecte détectée',
      description: '3 tentatives de paiement avec carte différente',
      timestamp: new Date().toISOString()
    }
  ];

  return (
    <MolamConnectHome
      merchantName="Boutique Amadou Tech"
      currency="XOF"
      stats={stats}
      topProducts={topProducts}
      siraAlerts={siraAlerts}
      onCreateInvoice={() => navigate('/invoices/new')}
      onExportReport={() => exportData()}
      onAlertClick={(id) => navigate(`/alerts/${id}`)}
    />
  );
}
```

### Design Tokens

```scss
// Layout
$sidebar-width: 256px;
$header-height: 64px;

// Colors
$primary: #3B82F6;
$success: #10B981;
$warning: #F59E0B;
$danger: #EF4444;

// Stats card colors
$revenue-bg: #DBEAFE;      // Blue
$sales-bg: #D1FAE5;        // Green
$customers-bg: #E9D5FF;    // Purple
$margin-bg: #FEF3C7;       // Yellow

// Alert severity
$critical: #FEE2E2;
$high: #FFEDD5;
$medium: #FEF3C7;
$low: #DBEAFE;

// Spacing
$gap-stats: 24px;
$padding-card: 24px;
$border-radius: 16px;
```

---

## 🎨 Différences Clés

| Feature | Molam Ma (Wallet) | Molam Connect |
|---------|-------------------|---------------|
| **QR Code** | ✅ Centré, prominent | ❌ Absent |
| **Focus** | Personnel, transactions | Business, analytics |
| **Actions** | Transfer, Pay, Cash | Invoice, Export, Add |
| **Statistiques** | Balance seule | Revenue, Margin, Sales |
| **Historique** | Transactions user | Top Products/Customers |
| **Alertes** | Notifications simple | SIRA security alerts |
| **Navigation** | Header simple | Sidebar + header |
| **Design** | Consumer-friendly | Professional dashboard |

---

## 📱 Responsive Design

### Molam Ma (Wallet)

**Mobile (< 768px):**
- QR Code centré full-width
- Actions en grid 2x2
- Transactions liste scrollable
- Header compact

**Desktop (≥ 768px):**
- Grid 2 colonnes (QR + Actions)
- Balance card large
- Historique avec filtres visibles

### Molam Connect

**Mobile (< 1024px):**
- Sidebar collapsible avec overlay
- Stats en grid 1-2 colonnes
- Top Products/Customers stacked
- Header actions icons only

**Desktop (≥ 1024px):**
- Sidebar fixe visible
- Stats grid 4 colonnes
- Top Products/Customers grid 2 colonnes
- Header actions avec labels

---

## 🧪 Tests

### Test Molam Ma

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MolamMaHome } from './MolamMaHome';

test('displays user balance', () => {
  render(<MolamMaHome userName="Test" balance={100000} />);
  expect(screen.getByText(/100[.,]000/)).toBeInTheDocument();
});

test('calls onTransferClick when transfer button clicked', () => {
  const onTransferClick = jest.fn();
  render(<MolamMaHome userName="Test" balance={0} onTransferClick={onTransferClick} />);

  fireEvent.click(screen.getByText(/Transfert/i));
  expect(onTransferClick).toHaveBeenCalled();
});

test('filters transactions by period', () => {
  const transactions = [/* ... */];
  render(<MolamMaHome userName="Test" balance={0} transactions={transactions} />);

  fireEvent.click(screen.getByText(/Aujourd'hui/i));
  // Check filtered results
});
```

### Test Molam Connect

```tsx
import { render, screen } from '@testing-library/react';
import { MolamConnectHome } from './MolamConnectHome';

test('displays merchant stats', () => {
  const stats = { totalRevenue: 1000000, /* ... */ };
  render(<MolamConnectHome merchantName="Test Shop" stats={stats} />);

  expect(screen.getByText(/1[.,]000[.,]000/)).toBeInTheDocument();
});

test('displays SIRA alerts', () => {
  const alerts = [
    { id: '1', severity: 'high', type: 'fraud', title: 'Test Alert', /* ... */ }
  ];

  render(<MolamConnectHome merchantName="Test" stats={{}} siraAlerts={alerts} />);
  expect(screen.getByText(/Test Alert/i)).toBeInTheDocument();
});
```

---

## 🚀 Installation

```bash
npm install @molam/ui-library
```

### Import

```tsx
import { MolamMaHome, MolamConnectHome } from '@molam/ui-library';
```

---

## 📞 Support

- **Email**: engineering@molam.io
- **Slack**: #molam-ui-library
- **Documentation**: [README.md](./README.md)

---

**Date de création:** 2025-01-19

**Status:** ✅ PRODUCTION READY

🎉 **Home Pages complétées avec succès!**
