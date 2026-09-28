import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { CalendarClock, Clock, Play, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonitorsQuery } from '@/features/monitors/api/useMonitorsApi';
import { useDeleteQueryMutation, useQueriesQuery } from '@/features/queries/api/useQueriesApi';
import type { HnSource, StoredQuery } from '@/features/tracker/tracker.types';

export const Route = createFileRoute('/_layout/history')({ component: HistoryPage });

const sourceLabel = (source: HnSource) => {
  if (source === 'top') return 'Front page';
  if (source === 'new') return 'New HN submissions';
  if (source === 'ask') return 'Ask HN';
  return 'Show HN';
};

const monitorOrigin = (query: StoredQuery, monitorName?: string) => {
  if (query.runType === 'scheduled') {
    return { label: `Scheduled · ${monitorName || 'Monitor'}`, icon: CalendarClock };
  }
  if (query.runType === 'manual-monitor') {
    return { label: `Monitor run · ${monitorName || 'Monitor'}`, icon: Play };
  }
  return undefined;
};

const runDetails = (query: StoredQuery) => [
  `${query.plan.depth[0].toUpperCase()}${query.plan.depth.slice(1)} research`,
  query.plan.sources.map(sourceLabel).join(' + '),
  query.stats ? `${query.stats.selectedStories} stories investigated` : undefined,
].filter((value): value is string => Boolean(value));

function HistoryPage() {
  const { pathname } = useLocation();
  const { data, isLoading } = useQueriesQuery();
  const { data: monitors } = useMonitorsQuery();
  const remove = useDeleteQueryMutation();
  const monitorNames = new Map((monitors ?? []).map((monitor) => [monitor._id, monitor.name]));

  if (pathname !== '/history') return <Outlet />;
  if (isLoading) return <div className="py-6"><Skeleton className="h-20 w-full" /></div>;

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">History</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Past Hacker News intelligence reports</p>
      </div>
      {!data?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
            <p className="text-sm">No research runs yet</p>
            <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/tracker">Go to Research</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((query) => {
            const currentMonitorName = query.monitorId ? monitorNames.get(query.monitorId) : undefined;
            const origin = monitorOrigin(query, query.monitorName ?? currentMonitorName);
            const OriginIcon = origin?.icon;
            return (
              <Card key={query._id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Link to="/history/$id" params={{ id: query._id }} className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{query.prompt}</p>
                      {origin && OriginIcon && (
                        <Badge variant={query.runType === 'scheduled' ? 'secondary' : 'outline'} className="h-5 gap-1 px-1.5 text-[10px] font-normal">
                          <OriginIcon className="h-3 w-3" />
                          {origin.label}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {runDetails(query).map((detail) => <span key={detail}>{detail}</span>)}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{new Date(query.createdAt).toLocaleString()}</p>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(query._id)} aria-label="Delete history entry">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
