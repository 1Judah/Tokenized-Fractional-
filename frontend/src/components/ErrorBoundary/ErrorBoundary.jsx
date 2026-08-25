import { Component } from 'react';
import * as Sentry from '@sentry/react';

/**
 * Enhanced React Error Boundary — catches render-phase errors and logs to Sentry.
 *
 * Props:
 *   - fallback: React component to render when error is caught
 *   - routeName: (optional) name of the route for context (e.g., "Marketplace", "Portfolio")
 *   - onError: (optional) callback when error occurs
 *   - children: JSX to wrap
 *
 * Features:
 *   - Captures errors and logs to Sentry with context
 *   - Includes component stack trace, route info, and breadcrumbs
 *   - Provides error severity classification
 *   - Captures user/environment context for debugging
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      componentStack: null,
      errorId: null,
      timestamp: null,
      severity: 'error',
    };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      timestamp: new Date().toISOString(),
    };
  }

  componentDidCatch(error, info) {
    // Generate unique error ID for correlation
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const componentStack = info.componentStack;

    // Classify severity based on error type
    let severity = 'error';
    if (error?.message?.includes('NetworkError') || error?.message?.includes('timeout')) {
      severity = 'warning';
    } else if (error?.message?.includes('OutOfMemory') || error?.message?.includes('SecurityError')) {
      severity = 'critical';
    }

    this.setState({ errorInfo: info, componentStack, errorId, severity });

    // Log to console in development
    console.error('[ErrorBoundary] Caught error:', {
      errorId,
      error,
      componentStack,
      routeName: this.props.routeName,
      timestamp: this.state.timestamp,
    });

    // Capture breadcrumbs for error context
    if (Sentry) {
      Sentry.addBreadcrumb({
        category: 'react.error',
        level: 'error',
        message: `Error in ${this.props.routeName || 'component'}`,
        data: {
          errorId,
          routeName: this.props.routeName,
        },
      });

      // Capture exception with full context
      Sentry.captureException(error, {
        contexts: {
          react: {
            errorId,
            routeName: this.props.routeName,
            componentStack,
            severity,
          },
        },
        tags: {
          error_boundary: 'true',
          route: this.props.routeName || 'unknown',
          severity,
        },
        level: severity === 'critical' ? 'fatal' : severity === 'warning' ? 'warning' : 'error',
      });
    }

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorId);
    }
  }

  resetError() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      componentStack: null,
      errorId: null,
      timestamp: null,
    });
  }

  render() {
    if (this.state.hasError) {
      const Fallback = this.props.fallback;
      return (
        <Fallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          timestamp={this.state.timestamp}
          severity={this.state.severity}
          routeName={this.props.routeName}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}
