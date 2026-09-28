import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Clock, Search, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueriesQuery } from '@/features/queries/api/useQueriesApi';

export const Route = createFileRoute('/_layout/dashboard')({ component: DashboardPage });

function DashboardPage() {
  const { data: queries, isLoading } = useQueriesQuery();
  const recentQueries = queries?.slice(0, 3) ?? [];
  const totalAnalyses = queries?.length ?? 0;

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Hacker News developer intelligence, powered by Decodo</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium">Start a new analysis</p>
            <p className="text-sm text-muted-foreground">Analyze current Hacker News discussions and selected pages behind them.</p>
          </div>
          <Button asChild className="w-full shrink-0 sm:w-auto">
            <Link to="/tracker"><Zap className="mr-2 h-4 w-4" />New analysis</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total analyses</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <p className="text-3xl font-bold">{totalAnalyses}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Most recent</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-5 w-32" /> : queries?.[0] ? <p className="truncate text-sm font-medium">{queries[0].prompt}</p> : <p className="text-sm text-muted-foreground">No analyses yet</p>}</CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent analyses</h2>
          {totalAnalyses > 3 && <Button asChild variant="ghost" size="sm" className="text-xs"><Link to="/history">View all<ArrowRight className="ml-1 h-3 w-3" /></Link></Button>}
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
        ) : recentQueries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No analyses yet.</p>
              <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/tracker">Run your first analysis</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentQueries.map((query) => (
              <Card key={query._id} className="transition-colors hover:bg-muted/30">
                <CardContent className="flex items-center gap-3 py-3">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Link to="/history/$id" params={{ id: query._id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{query.prompt}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(query.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <Badge variant="outline" className="px-1.5 py-0 text-xs">{query.plan.depth}</Badge>
                    </div>
                  </Link>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
