import { useState, type FormEvent } from 'react';
import { CalendarClock, Clock3, Flame, MessageCircleQuestion, Presentation, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HnSource, MonitorCadence, ResearchConfig, ResearchDepth } from '../tracker.types';

export type ResearchFormAction = 'research' | 'create-monitor' | 'create-monitor-and-run';

export interface ResearchFormSubmission {
  config: ResearchConfig;
  schedule?: { name: string; cadence: MonitorCadence; intervalHours?: number };
  action: ResearchFormAction;
}

interface Props {
  onSubmit: (submission: ResearchFormSubmission) => void;
  isLoading: boolean;
  defaultSchedule?: boolean;
}

const sourceOptions = [
  { value: 'top', icon: Flame, title: 'Front page', description: 'Stories currently ranking on HN' },
  { value: 'new', icon: Clock3, title: 'New HN submissions', description: 'Newly submitted to Hacker News, not necessarily newly published' },
  { value: 'ask', icon: MessageCircleQuestion, title: 'Ask HN', description: 'Developer questions and problems' },
  { value: 'show', icon: Presentation, title: 'Show HN', description: 'Projects and tools people are sharing' },
] as const;

const formatSourceTitles = (titles: string[]) => {
  if (titles.length <= 1) return titles[0] ?? '';
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles.slice(0, -1).join(', ')}, and ${titles.at(-1)}`;
};

const depthDescriptions: Record<ResearchDepth, string> = {
  quick: 'Ballpark: 20–30 candidate stories and usually 3–5 research leads. Quick favors signal density and skips HN-native stories with no external URL and zero comments.',
  standard: 'Ballpark: 50–60 candidate stories and usually 6–10 research leads. Every selected lead with an external URL is attempted.',
  deep: 'Ballpark: 80–100 candidate stories and usually 10–16 research leads. Every selected lead with an external URL is attempted.',
};

export const PromptForm = ({ onSubmit, isLoading, defaultSchedule = false }: Props) => {
  const [sources, setSources] = useState<HnSource[]>(['top', 'new', 'ask', 'show']);
  const [depth, setDepth] = useState<ResearchDepth>('standard');
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [cadence, setCadence] = useState<MonitorCadence>('weekly');
  const [intervalHours, setIntervalHours] = useState('6');
  const [monitorName, setMonitorName] = useState('');

  const toggleSource = (source: HnSource) => {
    setSources((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source],
    );
  };

  const selectedSourceTitles = sourceOptions
    .filter(({ value }) => sources.includes(value))
    .map(({ title }) => title);

  const sourceSummary = selectedSourceTitles.length
    ? `Included in this research: ${formatSourceTitles(selectedSourceTitles)}.`
    : 'No Hacker News sources selected. Select at least one source to run research.';

  const buildSubmission = (action: ResearchFormAction): ResearchFormSubmission => ({
    config: { sources, depth },
    schedule: schedule
      ? {
          name: monitorName.trim() || `HN ${depth} research`,
          cadence,
          intervalHours: cadence === 'custom-hours' ? Number(intervalHours) : undefined,
        }
      : undefined,
    action,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!sources.length) return;
    onSubmit(buildSubmission(schedule ? 'create-monitor-and-run' : 'research'));
  };

  const createMonitorOnly = () => {
    if (!schedule || !sources.length) return;
    onSubmit(buildSubmission('create-monitor'));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Hacker News sources</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {sourceOptions.map(({ value, icon: Icon, title, description }) => {
            const selected = sources.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleSource(value)}
                disabled={isLoading}
                className={`flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors ${selected ? 'border-primary bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]' : 'border-border hover:border-primary/40 hover:bg-muted/60'}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-4">{title}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p
          className={`text-[11px] ${sources.length ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {sourceSummary}{' '}
          {sources.length === sourceOptions.length &&
            'All four sources are selected by default. Deselect any source to narrow the scope.'}
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Research depth</Label>
        <Select value={depth} onValueChange={(value) => setDepth(value as ResearchDepth)} disabled={isLoading}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quick">Quick</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="deep">Deep</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">{depthDescriptions[depth]}</p>
        <p className="text-[11px] text-muted-foreground">
          These are research budgets, not quotas. Actual counts depend on source overlap and LLM triage. Candidate triage uses a lower-cost model; selected leads are analyzed individually before a concise final synthesis.
        </p>
      </div>

      <div className="space-y-2.5 rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule}
            onChange={(event) => setSchedule(event.target.checked)}
            disabled={isLoading}
          />
          Save as recurring monitor
        </label>
        {schedule && (
          <div className="grid gap-2.5 border-t border-border pt-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Cadence</Label>
              <Select
                value={cadence}
                onValueChange={(value) => setCadence(value as MonitorCadence)}
                disabled={isLoading}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom-hours">Every N hours</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cadence === 'custom-hours' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Interval in hours</Label>
                <Input
                  type="number"
                  min="1"
                  max="720"
                  value={intervalHours}
                  onChange={(event) => setIntervalHours(event.target.value)}
                  disabled={isLoading}
                  className="h-8"
                />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Monitor name</Label>
              <Input
                value={monitorName}
                onChange={(event) => setMonitorName(event.target.value)}
                placeholder="Optional"
                disabled={isLoading}
                className="h-8"
              />
            </div>
          </div>
        )}
      </div>

      {schedule ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading || !sources.length}
            onClick={createMonitorOnly}
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Create monitor
          </Button>
          <Button type="submit" size="sm" disabled={isLoading || !sources.length}>
            <Search className="mr-2 h-4 w-4" />
            Create & run now
          </Button>
        </div>
      ) : (
        <Button type="submit" size="sm" disabled={isLoading || !sources.length} className="w-full">
          <Search className="mr-2 h-4 w-4" />
          Research Hacker News
        </Button>
      )}
    </form>
  );
};
