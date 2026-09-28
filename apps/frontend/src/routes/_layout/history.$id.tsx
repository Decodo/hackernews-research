import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportView } from '@/features/tracker/components/ReportView';
import { useQueryDetailQuery } from '@/features/queries/api/useQueriesApi';

export const Route = createFileRoute('/_layout/history/$id')({ component: HistoryDetailPage });

function HistoryDetailPage() {
  const { id } = Route.useParams();
  const { data: query, isLoading, isError } = useQueryDetailQuery(id);

  return (
    <div className="space-y-6 py-6">
      <Button asChild variant="ghost" size="sm"><Link to="/history"><ArrowLeft className="mr-2 h-4 w-4" />History</Link></Button>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {isError && <p className="text-sm text-muted-foreground">Failed to load this research run.</p>}
      {query && (
        <ReportView
          result={{
            id: query._id,
            generatedAt: query.createdAt,
            sourceUrls: [],
            plan: query.plan,
            stories: query.stories ?? [],
            stats: query.stats,
            report: query.report,
          }}
        />
      )}
    </div>
  );
}
