// ============================================================================
// Brique 121 — Circuit Breaker & Retry Logic
// ============================================================================
// Purpose: Prevent cascading failures, exponential backoff with jitter
// Pattern: Circuit breaker (closed -> open -> half-open)
// ============================================================================

import { EventEmitter } from 'events';
import { RetryPolicy, CircuitBreakerConfig, CircuitBreakerState } from '../types';

/**
 * Circuit breaker states
 */
export enum State {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Failing, reject requests immediately
  HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker events
 */
export interface CircuitBreakerEvents {
  'state-change': (from: State, to: State) => void;
  'success': (duration: number) => void;
  'failure': (error: Error) => void;
  'timeout': () => void;
  'open': () => void;
  'half-open': () => void;
  'closed': () => void;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: State = State.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private halfOpenCallsInProgress: number = 0;

  constructor(private config: CircuitBreakerConfig) {
    super();
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === State.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error('Circuit breaker is OPEN');
        (error as any).code = 'CIRCUIT_OPEN';
        throw error;
      }
      // Transition to half-open
      this.transitionTo(State.HALF_OPEN);
    }

    if (this.state === State.HALF_OPEN) {
      if (this.halfOpenCallsInProgress >= this.config.half_open_max_calls) {
        const error = new Error('Circuit breaker is HALF_OPEN - max calls reached');
        (error as any).code = 'CIRCUIT_HALF_OPEN';
        throw error;
      }
      this.halfOpenCallsInProgress++;
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      this.onSuccess(Date.now() - startTime);
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    } finally {
      if (this.state === State.HALF_OPEN) {
        this.halfOpenCallsInProgress--;
      }
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(duration: number): void {
    this.emit('success', duration);

    if (this.state === State.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.success_threshold) {
        this.transitionTo(State.CLOSED);
      }
    } else if (this.state === State.CLOSED) {
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.emit('failure', error);
    this.failureCount++;

    if (this.state === State.HALF_OPEN) {
      this.transitionTo(State.OPEN);
    } else if (this.state === State.CLOSED) {
      if (this.failureCount >= this.config.failure_threshold) {
        this.transitionTo(State.OPEN);
      }
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: State): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    switch (newState) {
      case State.OPEN:
        this.nextAttempt = Date.now() + this.config.timeout_ms;
        this.successCount = 0;
        this.emit('open');
        break;
      case State.HALF_OPEN:
        this.successCount = 0;
        this.halfOpenCallsInProgress = 0;
        this.emit('half-open');
        break;
      case State.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.emit('closed');
        break;
    }

    this.emit('state-change', oldState, newState);
  }

  /**
   * Get current state
   */
  getState(): State {
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get success count
   */
  getSuccessCount(): number {
    return this.successCount;
  }

  /**
   * Force open the circuit
   */
  forceOpen(): void {
    this.transitionTo(State.OPEN);
  }

  /**
   * Force close the circuit
   */
  forceClose(): void {
    this.transitionTo(State.CLOSED);
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCallsInProgress = 0;
    this.transitionTo(State.CLOSED);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.state === State.OPEN ? new Date(this.nextAttempt) : null
    };
  }
}

/**
 * Retry with exponential backoff and jitter
 */
export class RetryExecutor {
  constructor(private policy: RetryPolicy) {}

  /**
   * Execute function with retries
   */
  async execute<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: any, attempt: number) => boolean = () => true
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < this.policy.max_attempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Check if we should retry
        if (attempt >= this.policy.max_attempts - 1 || !shouldRetry(error, attempt)) {
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    let delay = this.policy.initial_delay_ms * Math.pow(this.policy.backoff_multiplier, attempt);

    // Cap at max delay
    delay = Math.min(delay, this.policy.max_delay_ms);

    // Add jitter if enabled
    if (this.policy.jitter) {
      const jitter = Math.random() * delay * 0.1; // 10% jitter
      delay += jitter;
    }

    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Combined circuit breaker + retry executor
 */
export class ResilientExecutor {
  private circuitBreaker: CircuitBreaker;
  private retryExecutor: RetryExecutor;

  constructor(
    circuitBreakerConfig: CircuitBreakerConfig,
    retryPolicy: RetryPolicy
  ) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.retryExecutor = new RetryExecutor(retryPolicy);
  }

  /**
   * Execute with both circuit breaker and retries
   */
  async execute<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: any, attempt: number) => boolean = (error) => {
      // Don't retry if circuit is open
      if (error.code === 'CIRCUIT_OPEN' || error.code === 'CIRCUIT_HALF_OPEN') {
        return false;
      }
      // Retry on network errors, timeouts
      return error.retryable === true || error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR';
    }
  ): Promise<T> {
    return this.retryExecutor.execute(
      () => this.circuitBreaker.execute(fn),
      shouldRetry
    );
  }

  /**
   * Get circuit breaker
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Get retry executor
   */
  getRetryExecutor(): RetryExecutor {
    return this.retryExecutor;
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create circuit breaker
   */
  getOrCreate(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(config);
      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get circuit breaker
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): void {
    this.breakers.delete(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/**
 * Default configurations
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failure_threshold: 5,
  success_threshold: 2,
  timeout_ms: 60000, // 1 minute
  half_open_max_calls: 3
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_attempts: 3,
  initial_delay_ms: 1000,
  max_delay_ms: 30000,
  backoff_multiplier: 2,
  jitter: true
};

/**
 * Singleton registry
 */
let circuitBreakerRegistry: CircuitBreakerRegistry | null = null;

/**
 * Get circuit breaker registry
 */
export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!circuitBreakerRegistry) {
    circuitBreakerRegistry = new CircuitBreakerRegistry();
  }
  return circuitBreakerRegistry;
}

/**
 * Create resilient executor with default config
 */
export function createResilientExecutor(
  name?: string,
  circuitBreakerConfig: Partial<CircuitBreakerConfig> = {},
  retryPolicy: Partial<RetryPolicy> = {}
): ResilientExecutor {
  return new ResilientExecutor(
    { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitBreakerConfig },
    { ...DEFAULT_RETRY_POLICY, ...retryPolicy }
  );
}

// ============================================================================
// End of circuit breaker & retry logic
// ============================================================================
