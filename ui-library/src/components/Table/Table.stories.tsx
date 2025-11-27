import type { Meta, StoryObj } from '@storybook/react';
import { Table } from './Table';
import { Button } from '../Button/Button';

const sampleData = [
  { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Admin', status: 'Active' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'User', status: 'Active' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', role: 'User', status: 'Inactive' },
  { id: 4, name: 'Alice Brown', email: 'alice@example.com', role: 'Editor', status: 'Active' },
  { id: 5, name: 'Charlie Wilson', email: 'charlie@example.com', role: 'User', status: 'Active' },
];

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Table>;

const basicColumns = [
  { header: 'Name', accessor: 'name' as const },
  { header: 'Email', accessor: 'email' as const },
  { header: 'Role', accessor: 'role' as const },
];

export const Basic: Story = {
  args: {
    columns: basicColumns,
    data: sampleData,
  },
};

export const Striped: Story = {
  args: {
    columns: basicColumns,
    data: sampleData,
    striped: true,
  },
};

export const Bordered: Story = {
  args: {
    columns: basicColumns,
    data: sampleData,
    bordered: true,
  },
};

export const Clickable: Story = {
  args: {
    columns: basicColumns,
    data: sampleData,
    onRowClick: (row) => alert(`Clicked: ${row.name}`),
  },
};

export const Empty: Story = {
  args: {
    columns: basicColumns,
    data: [],
  },
};

export const Loading: Story = {
  args: {
    columns: basicColumns,
    data: sampleData,
    loading: true,
  },
};

export const CustomEmptyMessage: Story = {
  args: {
    columns: basicColumns,
    data: [],
    emptyMessage: 'No users found. Try adjusting your filters.',
  },
};

export const WithAlignment: Story = {
  args: {
    columns: [
      { header: 'Name', accessor: 'name' as const, align: 'left' as const },
      { header: 'Email', accessor: 'email' as const, align: 'center' as const },
      { header: 'Role', accessor: 'role' as const, align: 'right' as const },
    ],
    data: sampleData,
  },
};

export const WithCustomWidth: Story = {
  args: {
    columns: [
      { header: 'ID', accessor: 'id' as const, width: '60px' },
      { header: 'Name', accessor: 'name' as const, width: '200px' },
      { header: 'Email', accessor: 'email' as const },
      { header: 'Role', accessor: 'role' as const, width: '100px' },
    ],
    data: sampleData,
  },
};

export const WithCustomRendering: Story = {
  args: {
    columns: [
      { header: 'Name', accessor: 'name' as const },
      { header: 'Email', accessor: 'email' as const },
      {
        header: 'Status',
        accessor: (row: any) => (
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: row.status === 'Active' ? 'var(--molam-success)' : 'var(--molam-border)',
              color: row.status === 'Active' ? 'white' : 'var(--molam-text)',
            }}
          >
            {row.status}
          </span>
        ),
      },
    ],
    data: sampleData,
  },
};

export const WithActions: Story = {
  args: {
    columns: [
      { header: 'Name', accessor: 'name' as const },
      { header: 'Email', accessor: 'email' as const },
      { header: 'Role', accessor: 'role' as const },
      {
        header: 'Actions',
        accessor: (row: any) => (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                alert(`Edit ${row.name}`);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => {
                e.stopPropagation();
                alert(`Delete ${row.name}`);
              }}
            >
              Delete
            </Button>
          </div>
        ),
        align: 'right' as const,
      },
    ],
    data: sampleData,
    hoverable: true,
  },
};

export const ComplexExample: Story = {
  args: {
    columns: [
      {
        header: 'User',
        accessor: (row: any) => (
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
                fontWeight: 'bold',
                fontSize: '0.75rem',
              }}
            >
              {row.name.split(' ').map((n: string) => n[0]).join('')}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{row.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--molam-text-secondary)' }}>
                {row.email}
              </div>
            </div>
          </div>
        ),
      },
      { header: 'Role', accessor: 'role' as const },
      {
        header: 'Status',
        accessor: (row: any) => (
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: row.status === 'Active' ? 'var(--molam-success)' : 'var(--molam-border)',
              color: row.status === 'Active' ? 'white' : 'var(--molam-text)',
            }}
          >
            {row.status}
          </span>
        ),
      },
    ],
    data: sampleData,
    striped: true,
    hoverable: true,
  },
};
