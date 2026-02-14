/**
 * LoadingFallback - Loading indicator for lazy-loaded components
 *
 * Used as Suspense fallback for code-split modals and heavy components.
 * Keeps the dark theme consistent with the rest of the app.
 *
 * @version 1.0.0 - T018 Code Splitting
 */

interface LoadingFallbackProps {
  /** Optional message to display */
  message?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
}

export function LoadingFallback({
  message = 'Loading...',
  size = 'medium'
}: LoadingFallbackProps) {
  const sizeClasses = {
    small: 'p-4 text-xs',
    medium: 'p-6 text-sm',
    large: 'p-8 text-base',
  };

  const spinnerSizes = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
    large: 'w-8 h-8',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center ${sizeClasses[size]}`}
      style={{ color: '#8b5cf6' }}
    >
      {/* Spinner */}
      <div
        className={`${spinnerSizes[size]} border-2 border-current border-t-transparent rounded-full animate-spin`}
        style={{ borderTopColor: 'transparent' }}
      />
      {/* Message */}
      <span className="mt-3 text-gray-400">{message}</span>
    </div>
  );
}

/**
 * Full-screen loading fallback for route-level code splitting
 */
export function FullPageLoadingFallback() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: '#1a1a2e' }}
    >
      <LoadingFallback size="large" message="Loading application..." />
    </div>
  );
}

/**
 * Modal loading fallback - centered in modal area
 */
export function ModalLoadingFallback() {
  return (
    <div
      className="flex items-center justify-center min-h-[200px]"
      style={{ backgroundColor: 'rgba(26, 26, 46, 0.95)' }}
    >
      <LoadingFallback size="medium" />
    </div>
  );
}

export default LoadingFallback;
