// Condition evaluator for reconciliation rules DSL
// Evaluates JSON condition trees against statement lines

export interface Condition {
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
  field?: string;
  op?: Operator;
  value?: any;
}

export type Operator =
  | 'equals'
  | 'not_equals'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between'
  | 'in'
  | 'regex'
  | 'contains'
  | 'starts_with'
  | 'ends_with';

export interface EvaluationContext {
  line: any; // bank_statement_line
  payouts?: any[]; // candidate payouts
  metadata?: Record<string, any>;
}

/**
 * Main evaluation function
 * Recursively evaluates condition tree against context
 */
export function evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
  try {
    // Logical operators
    if (condition.all) {
      return condition.all.every((c) => evaluateCondition(c, context));
    }

    if (condition.any) {
      return condition.any.some((c) => evaluateCondition(c, context));
    }

    if (condition.not) {
      return !evaluateCondition(condition.not, context);
    }

    // Leaf condition
    if (condition.field && condition.op) {
      return evaluateLeafCondition(condition, context);
    }

    // Invalid condition
    console.warn('Invalid condition structure:', condition);
    return false;
  } catch (error: any) {
    console.error('Condition evaluation error:', error);
    return false;
  }
}

/**
 * Evaluate leaf condition (field op value)
 */
function evaluateLeafCondition(condition: Condition, context: EvaluationContext): boolean {
  const { field, op, value } = condition;

  if (!field || !op) {
    return false;
  }

  // Resolve field value from context
  const fieldValue = resolveField(field, context);

  // Apply operator
  switch (op) {
    case 'equals':
      return compareEquals(fieldValue, value);

    case 'not_equals':
      return !compareEquals(fieldValue, value);

    case 'lt':
      return compareNumeric(fieldValue, value, (a, b) => a < b);

    case 'lte':
      return compareNumeric(fieldValue, value, (a, b) => a <= b);

    case 'gt':
      return compareNumeric(fieldValue, value, (a, b) => a > b);

    case 'gte':
      return compareNumeric(fieldValue, value, (a, b) => a >= b);

    case 'between':
      if (!Array.isArray(value) || value.length !== 2) {
        return false;
      }
      const numVal = toNumber(fieldValue);
      return numVal >= toNumber(value[0]) && numVal <= toNumber(value[1]);

    case 'in':
      if (!Array.isArray(value)) {
        return false;
      }
      return value.some((v) => compareEquals(fieldValue, v));

    case 'regex':
      return matchRegex(fieldValue, value);

    case 'contains':
      return toString(fieldValue).toLowerCase().includes(toString(value).toLowerCase());

    case 'starts_with':
      return toString(fieldValue).toLowerCase().startsWith(toString(value).toLowerCase());

    case 'ends_with':
      return toString(fieldValue).toLowerCase().endsWith(toString(value).toLowerCase());

    default:
      console.warn('Unknown operator:', op);
      return false;
  }
}

/**
 * Resolve field value from context
 * Supports dot notation: 'line.amount', 'metadata.bank_code'
 */
function resolveField(fieldPath: string, context: EvaluationContext): any {
  const parts = fieldPath.split('.');

  // Special handling for common paths
  if (parts[0] === 'line' && context.line) {
    return resolvePath(context.line, parts.slice(1));
  }

  if (parts[0] === 'metadata' && context.metadata) {
    return resolvePath(context.metadata, parts.slice(1));
  }

  if (parts[0] === 'payouts' && context.payouts) {
    // Special: payouts[0].amount
    const match = parts[0].match(/payouts\[(\d+)\]/);
    if (match) {
      const index = parseInt(match[1]);
      if (context.payouts[index]) {
        return resolvePath(context.payouts[index], parts.slice(1));
      }
    }
    return null;
  }

  // Default: try to resolve from line
  return resolvePath(context.line, parts);
}

/**
 * Resolve path in object
 */
function resolvePath(obj: any, path: string[]): any {
  let current = obj;

  for (const part of path) {
    if (current == null) {
      return null;
    }

    // Handle array indices
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index)];
      } else {
        return null;
      }
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Compare equality (type-coerced)
 */
function compareEquals(a: any, b: any): boolean {
  // Null/undefined equality
  if (a == null && b == null) {
    return true;
  }

  if (a == null || b == null) {
    return false;
  }

  // Try numeric comparison
  const numA = toNumber(a);
  const numB = toNumber(b);
  if (!isNaN(numA) && !isNaN(numB)) {
    return Math.abs(numA - numB) < 0.0001; // Float precision
  }

  // String comparison (case-insensitive)
  return toString(a).toLowerCase() === toString(b).toLowerCase();
}

/**
 * Compare numeric values
 */
function compareNumeric(a: any, b: any, comparator: (a: number, b: number) => boolean): boolean {
  const numA = toNumber(a);
  const numB = toNumber(b);

  if (isNaN(numA) || isNaN(numB)) {
    return false;
  }

  return comparator(numA, numB);
}

/**
 * Match regex pattern
 */
function matchRegex(value: any, pattern: string): boolean {
  try {
    const str = toString(value);
    const regex = new RegExp(pattern, 'i'); // Case-insensitive by default
    return regex.test(str);
  } catch (error) {
    console.error('Invalid regex pattern:', pattern, error);
    return false;
  }
}

/**
 * Convert value to number
 */
function toNumber(value: any): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    // Handle amounts like "1,234.56"
    const cleaned = value.replace(/,/g, '');
    return parseFloat(cleaned);
  }

  return NaN;
}

/**
 * Convert value to string
 */
function toString(value: any): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

/**
 * Extract regex capture groups
 * Useful for extracting references from descriptions
 */
export function extractRegexGroups(value: string, pattern: string): string[] | null {
  try {
    const regex = new RegExp(pattern, 'i');
    const match = value.match(regex);

    if (!match) {
      return null;
    }

    // Return all capture groups (excluding full match at index 0)
    return match.slice(1);
  } catch (error) {
    console.error('Regex extraction error:', error);
    return null;
  }
}

/**
 * Validate condition structure
 * Returns array of validation errors (empty if valid)
 */
export function validateCondition(condition: Condition): string[] {
  const errors: string[] = [];

  if (!condition || typeof condition !== 'object') {
    errors.push('Condition must be an object');
    return errors;
  }

  // Check for exactly one root key
  const rootKeys = Object.keys(condition).filter((k) => ['all', 'any', 'not', 'field'].includes(k));

  if (rootKeys.length === 0) {
    errors.push('Condition must have one of: all, any, not, or field');
    return errors;
  }

  if (rootKeys.length > 1) {
    errors.push('Condition can only have one of: all, any, not, or field');
    return errors;
  }

  // Validate logical operators
  if (condition.all) {
    if (!Array.isArray(condition.all)) {
      errors.push('"all" must be an array');
    } else {
      condition.all.forEach((c, idx) => {
        const subErrors = validateCondition(c);
        subErrors.forEach((err) => errors.push(`all[${idx}]: ${err}`));
      });
    }
  }

  if (condition.any) {
    if (!Array.isArray(condition.any)) {
      errors.push('"any" must be an array');
    } else {
      condition.any.forEach((c, idx) => {
        const subErrors = validateCondition(c);
        subErrors.forEach((err) => errors.push(`any[${idx}]: ${err}`));
      });
    }
  }

  if (condition.not) {
    const subErrors = validateCondition(condition.not);
    subErrors.forEach((err) => errors.push(`not: ${err}`));
  }

  // Validate leaf condition
  if (condition.field) {
    if (!condition.op) {
      errors.push('Leaf condition must have "op" (operator)');
    }

    if (condition.value === undefined) {
      errors.push('Leaf condition must have "value"');
    }

    const validOperators: Operator[] = [
      'equals',
      'not_equals',
      'lt',
      'lte',
      'gt',
      'gte',
      'between',
      'in',
      'regex',
      'contains',
      'starts_with',
      'ends_with',
    ];

    if (condition.op && !validOperators.includes(condition.op as Operator)) {
      errors.push(`Invalid operator: ${condition.op}`);
    }

    // Validate value type for specific operators
    if (condition.op === 'between' && !Array.isArray(condition.value)) {
      errors.push('Operator "between" requires array value [min, max]');
    }

    if (condition.op === 'in' && !Array.isArray(condition.value)) {
      errors.push('Operator "in" requires array value');
    }
  }

  return errors;
}

/**
 * Compile condition for better performance
 * (Future optimization: pre-compile regex, cache field paths)
 */
export function compileCondition(condition: Condition): Condition {
  // TODO: Implement compilation optimizations
  // - Pre-compile regex patterns
  // - Cache field path resolution
  // - Optimize comparison functions
  return condition;
}
