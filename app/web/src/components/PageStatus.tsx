interface PageStatusProps {
  loading: boolean;
  error: Error | undefined;
}
export function PageStatus({ loading, error }: PageStatusProps) {
  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Error: {error.message}
      </div>
    );
  }
}
