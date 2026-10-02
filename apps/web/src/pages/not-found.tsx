import { Link } from 'react-router';
import { EmptyState } from '@/components/bits';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <EmptyState
      mascot="sniffing"
      title="Nothing buried here"
      action={
        <Button variant="ball" asChild>
          <Link to="/">Back to the kennel</Link>
        </Button>
      }
    >
      I sniffed everywhere, but this page doesn’t exist.
    </EmptyState>
  );
}
