import React from 'react';
import clsx from 'clsx';

export interface TableColumn<T = any> {
  /**
   * Column header label
   */
  header: string;

  /**
   * Accessor key for the data
   */
  accessor: keyof T | ((row: T) => React.ReactNode);

  /**
   * Column width (CSS value)
   */
  width?: string;

  /**
   * Text alignment
   * @default 'left'
   */
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T = any> {
  /**
   * Table columns configuration
   */
  columns: TableColumn<T>[];

  /**
   * Table data rows
   */
  data: T[];

  /**
   * Callback when a row is clicked
   */
  onRowClick?: (row: T, index: number) => void;

  /**
   * Enable striped rows
   * @default false
   */
  striped?: boolean;

  /**
   * Enable hover effect on rows
   * @default true
   */
  hoverable?: boolean;

  /**
   * Show table borders
   * @default false
   */
  bordered?: boolean;

  /**
   * Message to show when data is empty
   * @default 'No data available'
   */
  emptyMessage?: string;

  /**
   * Loading state
   * @default false
   */
  loading?: boolean;
}

/**
 * Table component - Data table with sorting and customization
 *
 * @example
 * const columns = [
 *   { header: 'Name', accessor: 'name' },
 *   { header: 'Email', accessor: 'email' },
 *   { header: 'Status', accessor: (row) => <Badge>{row.status}</Badge> }
 * ];
 *
 * <Table columns={columns} data={users} />
 */
export function Table<T = any>({
  columns,
  data,
  onRowClick,
  striped = false,
  hoverable = true,
  bordered = false,
  emptyMessage = 'No data available',
  loading = false,
  ...rest
}: TableProps<T> & React.HTMLAttributes<HTMLTableElement>) {
  const getCellValue = (row: T, column: TableColumn<T>) => {
    if (typeof column.accessor === 'function') {
      return column.accessor(row);
    }
    return row[column.accessor] as React.ReactNode;
  };

  const getAlignClass = (align?: string) => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  if (loading) {
    return (
      <div className="w-full p-8 text-center text-[var(--molam-text-secondary)]">
        <div className="inline-block animate-spin h-8 w-8 border-4 border-[var(--molam-primary)] border-t-transparent rounded-full" />
        <p className="mt-4">Loading...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full p-8 text-center text-[var(--molam-text-secondary)] border border-[var(--molam-border)] rounded-[var(--molam-radius)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table
        className={clsx(
          'w-full border-collapse',
          bordered && 'border border-[var(--molam-border)] rounded-[var(--molam-radius)]'
        )}
        {...rest}
      >
        <thead>
          <tr className="bg-[var(--molam-surface)] border-b-2 border-[var(--molam-border)]">
            {columns.map((column, index) => (
              <th
                key={index}
                className={clsx(
                  'px-4 py-3 text-sm font-semibold text-[var(--molam-text)]',
                  getAlignClass(column.align)
                )}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={clsx(
                'border-b border-[var(--molam-border)] transition-colors',
                striped && rowIndex % 2 === 1 && 'bg-[var(--molam-surface)]',
                hoverable && 'hover:bg-[var(--molam-surface)]',
                onRowClick && 'cursor-pointer active:bg-[var(--molam-border)]'
              )}
              onClick={() => onRowClick?.(row, rowIndex)}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onRowClick(row, rowIndex);
                }
              }}
            >
              {columns.map((column, colIndex) => (
                <td
                  key={colIndex}
                  className={clsx(
                    'px-4 py-3 text-sm text-[var(--molam-text)]',
                    getAlignClass(column.align)
                  )}
                >
                  {getCellValue(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Table.displayName = 'Table';
