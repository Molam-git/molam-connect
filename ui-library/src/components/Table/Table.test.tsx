import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Table } from './Table';

const mockData = [
  { id: 1, name: 'John Doe', email: 'john@example.com', status: 'Active' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'Inactive' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', status: 'Active' },
];

const mockColumns = [
  { header: 'Name', accessor: 'name' as const },
  { header: 'Email', accessor: 'email' as const },
  { header: 'Status', accessor: 'status' as const },
];

describe('Table', () => {
  it('renders table with data', () => {
    render(<Table columns={mockColumns} data={mockData} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<Table columns={mockColumns} data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(<Table columns={mockColumns} data={[]} emptyMessage="No users found" />);
    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<Table columns={mockColumns} data={mockData} loading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('handles row clicks', () => {
    const handleRowClick = jest.fn();
    render(<Table columns={mockColumns} data={mockData} onRowClick={handleRowClick} />);

    const firstRow = screen.getByText('John Doe').closest('tr');
    fireEvent.click(firstRow!);
    expect(handleRowClick).toHaveBeenCalledWith(mockData[0], 0);
  });

  it('handles keyboard navigation on rows', () => {
    const handleRowClick = jest.fn();
    render(<Table columns={mockColumns} data={mockData} onRowClick={handleRowClick} />);

    const firstRow = screen.getByText('John Doe').closest('tr');
    fireEvent.keyDown(firstRow!, { key: 'Enter' });
    expect(handleRowClick).toHaveBeenCalledWith(mockData[0], 0);
  });

  it('renders with custom accessor functions', () => {
    const customColumns = [
      { header: 'Name', accessor: 'name' as const },
      {
        header: 'Status',
        accessor: (row: typeof mockData[0]) => <span data-testid="custom-cell">{row.status}</span>,
      },
    ];

    render(<Table columns={customColumns} data={mockData} />);
    expect(screen.getAllByTestId('custom-cell')).toHaveLength(3);
  });

  it('applies striped rows', () => {
    render(<Table columns={mockColumns} data={mockData} striped />);
    const rows = screen.getAllByRole('row');
    // Skip header row (index 0), check data rows
    expect(rows[2]).toHaveClass('bg-[var(--molam-surface)]');
  });

  it('applies hoverable styles', () => {
    render(<Table columns={mockColumns} data={mockData} hoverable />);
    const firstDataRow = screen.getByText('John Doe').closest('tr');
    expect(firstDataRow).toHaveClass('hover:bg-[var(--molam-surface)]');
  });

  it('applies bordered style', () => {
    render(<Table columns={mockColumns} data={mockData} bordered />);
    const table = screen.getByRole('table');
    expect(table).toHaveClass('border');
  });

  it('applies column alignment', () => {
    const alignedColumns = [
      { header: 'Left', accessor: 'name' as const, align: 'left' as const },
      { header: 'Center', accessor: 'email' as const, align: 'center' as const },
      { header: 'Right', accessor: 'status' as const, align: 'right' as const },
    ];

    render(<Table columns={alignedColumns} data={mockData} />);

    expect(screen.getByText('Left')).toHaveClass('text-left');
    expect(screen.getByText('Center')).toHaveClass('text-center');
    expect(screen.getByText('Right')).toHaveClass('text-right');
  });

  it('applies column widths', () => {
    const columnsWithWidth = [
      { header: 'Name', accessor: 'name' as const, width: '200px' },
      { header: 'Email', accessor: 'email' as const },
    ];

    render(<Table columns={columnsWithWidth} data={mockData} />);
    const nameHeader = screen.getByText('Name');
    expect(nameHeader).toHaveStyle({ width: '200px' });
  });

  it('makes rows keyboard accessible when clickable', () => {
    const handleRowClick = jest.fn();
    render(<Table columns={mockColumns} data={mockData} onRowClick={handleRowClick} />);

    const firstRow = screen.getByText('John Doe').closest('tr');
    expect(firstRow).toHaveAttribute('role', 'button');
    expect(firstRow).toHaveAttribute('tabIndex', '0');
  });
});
