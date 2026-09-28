import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CalendarClock, ExternalLink, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteMonitorMutation,
  useMonitorsQuery,
  useRunMonitorMutation,
  useUpdateMonitorMutation,
} from '@/features/monitors/api/useMonitorsApi';
import type { HnSource, ResearchConfig } from '@/features/tracker/tracker.types';

export const Route = createFileRoute('/_layout/monitors')({ component: MonitorsPage });

const cadenceLabel = (cadence: string, hours?: number) =>
  cadence === 'custom-hours' ? `Every ${hours ?? 1} hours` : cadence[0].toUpperCase() + cadence.slice(1);

const sourceLabel = (source: HnSource) => {
  if (source === 'top') return 'Front page';
  if (source === 'new') return 'New HN submissions';
  if (source === 'ask') return 'Ask HN';
  return 'Show HN';
};

const planLabel = (plan: ResearchConfig) =>
  `${plan.depth[0].toUpperCase()}${plan.depth.slice(1)} · ${plan.sources.map(sourceLabel).join(' + ')}`;

function MonitorsPage() {
  const { data: monitors, isLoading } = useMonitorsQuery();
  const update = useUpdateMonitorMutation();
  const remove = useDeleteMonitorMutation();
  const run = useRunMonitorMutation();
  const navigate = useNavigate();

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">Monitors</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Recurring Hacker News research runs</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full" />)}</div>
      ) : !monitors?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CalendarClock className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
            <p className="text-sm font-medium">No recurring monitors yet</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/tracker" search={{ createMonitor: true }}>Create a monitor</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {monitors.map((monitor) => {
            const running = Boolean(monitor.currentRunStartedAt) || (run.isPending && run.variables === monitor._id);
            return (
              <Card key={monitor._id}>
                <CardContent className="space-y-2.5 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{monitor.name}</p>
                        <Badge variant={monitor.enabled ? 'secondary' : 'outline'}>
                          {running
                            ? monitor.enabled ? 'Running…' : 'Running · paused after this run'
                            : monitor.enabled ? cadenceLabel(monitor.cadence, monitor.intervalHours) : 'Paused'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{planLabel(monitor.plan)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={running}
                        onClick={() => run.mutate(monitor._id, {
                          onSuccess: (result) => void navigate({ to: '/history/$id', params: { id: result.id } }),
                        })}
                      >
                        {running ? (
                          <><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />Running…</>
                        ) : (
                          <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Run now</>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: monitor._id, enabled: !monitor.enabled })}>
                        {monitor.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(monitor._id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-5 text-xs text-muted-foreground">
                    {monitor.enabled && <span>Next run · {new Date(monitor.nextRunAt).toLocaleString()}</span>}
                    {running && <span>{monitor.enabled ? 'Research is running' : 'Current research will finish; future scheduled runs are paused'}</span>}
                    {monitor.lastRunAt && <span>Last run · {new Date(monitor.lastRunAt).toLocaleString()}</span>}
                    {monitor.lastQueryId && (
                      <Link to="/history/$id" params={{ id: monitor.lastQueryId }} className="inline-flex items-center gap-1">
                        Latest report <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  {monitor.lastError && <p className="text-xs text-destructive">Last run failed · {monitor.lastError}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Automatic runs occur only while the backend process is running.</p>
    </div>
  );
}
