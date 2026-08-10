interface PageStatusProps {
  loading: boolean;
  error: Error | undefined;
}
export function PageStatus({ loading, error }: PageStatusProps) {
  if (loading) {
    return (
      <div className="text-center py-8 text-on-surface-variant">Loading...</div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-error">Error: {error.message}</div>
    );
  }
}
