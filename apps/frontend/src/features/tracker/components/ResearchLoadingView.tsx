import { Check, Database, FileSearch, LoaderCircle, MessageSquareText, Search, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ResearchProgressStage } from '../api/useTrackerApi';

const steps: Array<{
  stage: ResearchProgressStage;
  icon: typeof Search;
  title: string;
  detail: string;
}> = [
  { stage: 'collecting', icon: Search, title: 'Collecting Hacker News stories', detail: 'Reading current story metadata from the official Hacker News API' },
  { stage: 'triaging', icon: FileSearch, title: 'Selecting research leads', detail: 'Using a lightweight triage pass to rank stories by developer relevance, novelty, and research value' },
  { stage: 'discussing', icon: MessageSquareText, title: 'Reading selected discussions', detail: 'Collecting representative HN comments only for the shortlisted research leads' },
  { stage: 'scraping', icon: Database, title: 'Scraping linked pages', detail: 'Attempting every shortlisted external page as Markdown through Decodo Web Scraping API' },
  { stage: 'analyzing', icon: Sparkles, title: 'Analyzing and synthesizing', detail: 'Analyzing each lead in isolation, then synthesizing concise evidence-scoped findings across the run' },
];

export const ResearchLoadingView = ({ stage }: { stage: ResearchProgressStage }) => {
  const activeIndex = stage === 'saving' ? steps.length : Math.max(0, steps.findIndex((step) => step.stage === stage));

  return (
    <div className="py-1">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-lg font-semibold">Building your Hacker News intelligence report</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Research depth affects how many discussions and linked pages are investigated.
        </p>
      </div>
      <Card className="mx-auto mt-4 max-w-2xl">
        <CardContent className="px-4 py-1">
          {steps.map(({ stage: stepStage, icon: Icon, title, detail }, index) => {
            const complete = index < activeIndex;
            const active = index === activeIndex;
            return (
              <div key={stepStage} className="flex gap-2.5 border-b border-border py-2.5 last:border-0">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-primary/10 text-primary' : complete ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-muted/50 text-muted-foreground'}`}
                >
                  {complete ? (
                    <Check className="h-4 w-4" />
                  ) : active ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="text-[13px] font-medium leading-4">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{detail}</p>
                  {active && <p className="mt-0.5 text-[10px] text-primary">In progress</p>}
                  {complete && <p className="mt-0.5 text-[10px] text-[var(--success)]">Complete</p>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};
