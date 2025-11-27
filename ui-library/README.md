# Molam UI - Design System

Apple-inspired component library built with React, TypeScript, and Tailwind CSS.

## Features

- 🎨 **Apple-like Design** - Clean, modern aesthetics with generous spacing and smooth animations
- ♿ **Accessibility First** - WCAG 2.1 compliant with full keyboard navigation and ARIA support
- 🌗 **Light/Dark Theme** - Seamless theme switching with CSS variables
- 📦 **Zero Runtime Dependencies** - Only `clsx` for conditional styling
- 🔒 **Type Safe** - Full TypeScript support with comprehensive type definitions
- 🧪 **Fully Tested** - Jest + React Testing Library with 80%+ coverage
- 📖 **Storybook** - Interactive component documentation and visual catalog
- 🚀 **Production Ready** - Optimized builds with tree-shaking support

## Installation

```bash
npm install @molam/ui
# or
yarn add @molam/ui
```

### Peer Dependencies

```bash
npm install react react-dom tailwindcss
```

## Quick Start

### 1. Import CSS Tokens

Import the CSS tokens in your app's entry point:

```tsx
import '@molam/ui/dist/styles.css';
```

### 2. Configure Tailwind (Optional)

If you're using Tailwind CSS in your project, extend your `tailwind.config.js`:

```js
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './node_modules/@molam/ui/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        molam: {
          primary: 'var(--molam-primary)',
          bg: 'var(--molam-bg)',
          surface: 'var(--molam-surface)',
          text: 'var(--molam-text)',
        },
      },
    },
  },
};
```

### 3. Use Components

```tsx
import { Button, Card, Input, Modal } from '@molam/ui';

function App() {
  return (
    <Card title="Welcome" subtitle="Get started with Molam UI">
      <Input label="Email" type="email" placeholder="you@example.com" />
      <Button variant="primary">Submit</Button>
    </Card>
  );
}
```

## Components

### Button

Interactive button with multiple variants and sizes.

```tsx
import { Button } from '@molam/ui';

<Button variant="primary" size="md" onClick={() => console.log('clicked')}>
  Click me
</Button>
```

**Props:**
- `variant`: `'primary' | 'ghost' | 'outline' | 'danger'` (default: `'primary'`)
- `size`: `'sm' | 'md' | 'lg'` (default: `'md'`)
- `loading`: `boolean` (default: `false`)
- `fullWidth`: `boolean` (default: `false`)
- `startIcon`, `endIcon`: `ReactNode`

### Card

Container component with optional header.

```tsx
import { Card } from '@molam/ui';

<Card
  title="Card Title"
  subtitle="Description"
  padding="md"
  hoverable
>
  Card content
</Card>
```

### Input

Text input with label, helper text, and error states.

```tsx
import { Input } from '@molam/ui';

<Input
  label="Email"
  type="email"
  placeholder="you@example.com"
  helperText="We'll never share your email"
  error="This field is required"
  required
/>
```

### Modal

Accessible dialog with backdrop and keyboard navigation.

```tsx
import { Modal } from '@molam/ui';

<Modal
  open={isOpen}
  onClose={() => setOpen(false)}
  title="Modal Title"
  size="md"
  footer={
    <>
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleSubmit}>Confirm</Button>
    </>
  }
>
  Modal content
</Modal>
```

### Table

Data table with sorting and customization.

```tsx
import { Table } from '@molam/ui';

const columns = [
  { header: 'Name', accessor: 'name' },
  { header: 'Email', accessor: 'email' },
  { header: 'Status', accessor: (row) => <Badge>{row.status}</Badge> }
];

<Table
  columns={columns}
  data={users}
  striped
  hoverable
  onRowClick={(row) => console.log(row)}
/>
```

### Topbar

Application header with logo, navigation, and actions.

```tsx
import { Topbar } from '@molam/ui';

<Topbar
  logo={<Logo />}
  navigation={<Navigation />}
  actions={<UserMenu />}
  sticky
/>
```

### Sidebar

Vertical navigation sidebar.

```tsx
import { Sidebar, SidebarItem } from '@molam/ui';

<Sidebar
  header={<Logo />}
  footer={<UserInfo />}
  collapsed={isCollapsed}
>
  <SidebarItem icon={<DashboardIcon />} label="Dashboard" active />
  <SidebarItem icon={<SettingsIcon />} label="Settings" />
</Sidebar>
```

### Toast

Notification messages.

```tsx
import { Toast } from '@molam/ui';

<Toast
  message="Operation successful!"
  variant="success"
  duration={5000}
  onClose={() => setToast(null)}
  position="top-right"
/>
```

### Badge

Status indicators and labels.

```tsx
import { Badge } from '@molam/ui';

<Badge variant="success" size="sm">Active</Badge>
<Badge dot variant="error">Offline</Badge>
```

## Theme

### Using the Theme Hook

```tsx
import { useTheme } from '@molam/ui';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      Toggle Theme
    </button>
  );
}
```

### CSS Variables

All components use CSS variables for theming:

```css
:root {
  --molam-primary: #0A84FF;
  --molam-on-primary: #ffffff;
  --molam-bg: #ffffff;
  --molam-surface: #f9fafb;
  --molam-text: #0b1220;
  --molam-text-secondary: #64748b;
  --molam-border: #e2e8f0;
  --molam-success: #34c759;
  --molam-warning: #ff9f0a;
  --molam-error: #ff3b30;
  --molam-info: #5ac8fa;
  --molam-radius: 12px;
}

[data-theme='dark'] {
  --molam-bg: #0b1220;
  --molam-surface: #0f1724;
  --molam-text: #e6eef8;
  /* ... */
}
```

## Development

### Running Storybook

```bash
npm run storybook
```

### Running Tests

```bash
npm test
npm run test:coverage
```

### Building

```bash
npm run build
```

## Accessibility

All components are built with accessibility in mind:

- ✅ ARIA attributes
- ✅ Keyboard navigation
- ✅ Focus management
- ✅ Screen reader support
- ✅ Color contrast compliance

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT © Molam Team

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.
