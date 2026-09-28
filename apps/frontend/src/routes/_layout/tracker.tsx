import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PromptForm,
  type ResearchFormAction,
  type ResearchFormSubmission,
} from '@/features/tracker/components/PromptForm';
import { ReportView } from '@/features/tracker/components/ReportView';
import { ResearchLoadingView } from '@/features/tracker/components/ResearchLoadingView';
import { useResearchMutation, type ResearchProgressStage } from '@/features/tracker/api/useTrackerApi';
import { useCreateMonitorMutation } from '@/features/monitors/api/useMonitorsApi';
import type { ResearchResult } from '@/features/tracker/tracker.types';

export const Route = createFileRoute('/_layout/tracker')({
  validateSearch: (search: Record<string, unknown>): { createMonitor?: boolean } => {
    const createMonitor = search.createMonitor === true || search.createMonitor === 'true';
    return createMonitor ? { createMonitor: true } : {};
  },
  component: TrackerPage,
});

const message = (error: unknown) => {
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate.response?.data?.message ?? candidate.message ?? String(error);
};

function TrackerPage() {
  const { createMonitor } = Route.useSearch();
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [progressStage, setProgressStage] = useState<ResearchProgressStage>('collecting');
  const [pendingAction, setPendingAction] = useState<ResearchFormAction | null>(null);
  const research = useResearchMutation(setProgressStage);
  const monitor = useCreateMonitorMutation();
  const navigate = useNavigate();
  const isLoading = research.isPending || monitor.isPending;

  const submit = async ({ config, schedule, action }: ResearchFormSubmission) => {
    setPendingAction(action);
    setProgressStage('collecting');
    try {
      if (action === 'create-monitor') {
        if (!schedule) return;
        await monitor.mutateAsync({ ...config, ...schedule });
        await navigate({ to: '/monitors' });
        return;
      }

      let monitorId: string | undefined;
      let monitorName: string | undefined;
      if (action === 'create-monitor-and-run' && schedule) {
        const createdMonitor = await monitor.mutateAsync({ ...config, ...schedule });
        monitorId = createdMonitor._id;
        monitorName = createdMonitor.name;
      }
      const response = await research.mutateAsync({ ...config, monitorId, monitorName });
      setResult(response);
    } catch {
      // Mutation state renders the error.
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className={result ? 'py-6' : 'py-4'}>
      <div className={`mx-auto ${result ? 'max-w-6xl space-y-6' : 'max-w-4xl space-y-4'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={result ? 'text-2xl font-semibold' : 'text-xl font-semibold'}>Hacker News Intelligence</h1>
            <p className={result ? 'mt-1 text-sm text-muted-foreground' : 'mt-0.5 text-xs text-muted-foreground'}>
              {result
                ? 'Developer-intelligence report from Hacker News discussions and the pages behind them'
                : 'Research what developers are currently discussing, sharing, and finding interesting on Hacker News'}
            </p>
          </div>
          {result && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setResult(null);
                research.reset();
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />Start over
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className={result ? 'pb-4' : 'p-4 pb-3'}>
            <CardTitle className="text-base">{result ? 'Report' : 'Research Hacker News'}</CardTitle>
          </CardHeader>
          <CardContent className={result ? undefined : 'p-4 pt-0'}>
            {result ? (
              <ReportView result={result} />
            ) : (
              <>
                <div className={isLoading ? 'hidden' : undefined}>
                  <PromptForm onSubmit={submit} isLoading={isLoading} defaultSchedule={createMonitor} />
                </div>
                {isLoading && pendingAction === 'create-monitor' ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Creating monitor…</div>
                ) : (
                  isLoading && <ResearchLoadingView stage={progressStage} />
                )}
              </>
            )}
            {(research.isError || monitor.isError) && !isLoading && (() => {
              const errorMessage = message(research.error ?? monitor.error);
              const credentialTarget = /ANTHROPIC_API_KEY/i.test(errorMessage)
                ? 'anthropic-credentials'
                : /OPENAI_API_KEY/i.test(errorMessage)
                  ? 'openai-credentials'
                  : /GEMINI_API_KEY/i.test(errorMessage)
                    ? 'gemini-credentials'
                    : /DECODO_AUTH_TOKEN|Decodo Web Scraping API/i.test(errorMessage)
                      ? 'decodo-credentials'
                      : undefined;
              return (
                <p className="mt-4 text-sm text-destructive">
                  {errorMessage}
                  {credentialTarget && (
                    <>
                      {' '}
                      <a
                        href={`/settings#${credentialTarget}`}
                        className="font-medium underline underline-offset-2"
                      >
                        Fix in Settings
                      </a>
                    </>
                  )}
                </p>
              );
            })()}
          </CardContent>
        </Card>

        {!result && (
          <p className="text-center text-xs text-muted-foreground">
            Need to configure Decodo or an LLM API key?{' '}
            <Link to="/settings" className="underline underline-offset-2">Go to Settings</Link>
          </p>
        )}
      </div>
    </div>
  );
}
