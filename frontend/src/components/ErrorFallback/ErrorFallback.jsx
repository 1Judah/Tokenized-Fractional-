import React from 'react';
import styles from './ErrorFallback.module.css';
import { UNEXPECTED_ERROR, ERROR_REPORTED, TRY_AGAIN } from '../../constants/errors';

/**
 * ErrorFallback — displays a user-friendly error message with recovery options.
 *
 * Props:
 *   - error: the Error object
 *   - errorInfo: error info from getDerivedStateFromError
 *   - componentStack: component stack trace
 *   - errorId: unique error identifier (for support reference)
 *   - timestamp: when the error occurred
 *   - severity: error severity ('error', 'warning', 'critical')
 *   - routeName: name of the route where error occurred
 *   - resetError: callback to reset error and retry
 */
export default function ErrorFallback({
  error,
  errorInfo,
  componentStack,
  errorId,
  timestamp,
  severity = 'error',
  routeName = 'this page',
  resetError,
}) {
  const isDev = import.meta.env.DEV;

  // Determine icon and styling based on severity
  const severityConfig = {
    critical: { icon: '⚠️', title: 'Critical Error', color: 'var(--color-danger, #d32f2f)' },
    error: { icon: '❌', title: 'Something Went Wrong', color: 'var(--color-danger, #d32f2f)' },
    warning: { icon: '⚡', title: 'Temporary Issue', color: 'var(--color-warning, #f57c00)' },
  };

  const config = severityConfig[severity] || severityConfig.error;

  // Extract user-friendly error message
  const errorMessage = error?.message || 'An unexpected error occurred';
  const isNetworkError = errorMessage.includes('Network') || errorMessage.includes('timeout');
  const isContractError = errorMessage.includes('contract') || errorMessage.includes('transaction');

  let helpText = ERROR_REPORTED;
  if (isNetworkError) {
    helpText = 'Network error detected. Check your connection and try again.';
  } else if (isContractError) {
    helpText = 'There was an issue with the blockchain interaction. Try again or contact support.';
  } else if (severity === 'warning') {
    helpText = 'A temporary issue occurred. This usually resolves on its own.';
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.iconWrapper} style={{ backgroundColor: `${config.color}20` }}>
          <span className={styles.icon} style={{ fontSize: '2rem' }}>
            {config.icon}
          </span>
        </div>

        <h2 className={styles.title}>{config.title}</h2>

        <p className={styles.subtitle}>{helpText}</p>

        {/* Route context */}
        {routeName && (
          <p className={styles.context}>
            Error location: <strong>{routeName}</strong>
          </p>
        )}

        {/* Error ID for support reference */}
        {errorId && (
          <p className={styles.errorId}>
            Error ID: <code>{errorId}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(errorId);
              }}
              title="Copy error ID"
              className={styles.copyButton}
              aria-label="Copy error ID to clipboard"
            >
              📋
            </button>
          </p>
        )}

        {/* Timestamp */}
        {timestamp && (
          <p className={styles.timestamp}>
            Occurred: {new Date(timestamp).toLocaleString()}
          </p>
        )}

        {/* Development-only error details */}
        {isDev && error && (
          <details className={styles.devDetails}>
            <summary>Error Details (Development Only)</summary>
            <div className={styles.devContent}>
              <div className={styles.errorMessage}>
                <strong>Message:</strong>
                <pre>{errorMessage}</pre>
              </div>
              {componentStack && (
                <div className={styles.componentStack}>
                  <strong>Component Stack:</strong>
                  <pre>{componentStack}</pre>
                </div>
              )}
              {error?.stack && (
                <div className={styles.stackTrace}>
                  <strong>Stack Trace:</strong>
                  <pre>{error.stack}</pre>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Action buttons */}
        <div className={styles.actions}>
          <button onClick={resetError} className={`${styles.button} ${styles.primary}`}>
            {TRY_AGAIN}
          </button>
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className={`${styles.button} ${styles.secondary}`}
          >
            Go to Home
          </button>
        </div>

        {/* Support info */}
        <p className={styles.support}>
          If the error persists, please contact support and reference your error ID above.
        </p>
      </div>
    </div>
  );
}
