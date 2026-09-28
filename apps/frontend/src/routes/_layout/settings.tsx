import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, Circle, RotateCcw, Save, TestTube2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  type CredentialSource,
  type CredentialTarget,
  useSettingsQuery,
  useTestCredentialMutation,
  useUpdateSettingsMutation,
} from '@/features/settings/api/useSettingsApi';

export const Route = createFileRoute('/_layout/settings')({
  component: SettingsPage,
});

type Provider = 'claude' | 'openai' | 'gemini';

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'GPT (OpenAI)',
  gemini: 'Gemini (Google)',
};

const PROVIDER_DEFAULT_MODELS: Record<Provider, string> = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
};

const sourceLabel = (source?: CredentialSource) => {
  if (source === 'settings') return 'Saved in Settings';
  if (source === 'environment') return 'Using .env fallback';
  return 'Not configured';
};

const CredentialStatus = ({
  source,
  isLoading,
}: {
  source?: CredentialSource;
  isLoading: boolean;
}) => {
  if (isLoading) return <Skeleton className="h-4 w-24" />;
  if (source && source !== 'none') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCircle className="h-3.5 w-3.5" />
        {sourceLabel(source)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Circle className="h-3.5 w-3.5" />
      Not configured
    </span>
  );
};

interface CredentialRowProps {
  id: string;
  label: string;
  description: string;
  target: CredentialTarget;
  value: string;
  onChange: (value: string) => void;
  source?: CredentialSource;
  isLoading: boolean;
  isTesting: boolean;
  onTest: () => void;
  onUseEnvironment: () => void;
  clearing: boolean;
}

const CredentialRow = ({
  id,
  label,
  description,
  value,
  onChange,
  source,
  isLoading,
  isTesting,
  onTest,
  onUseEnvironment,
  clearing,
}: CredentialRowProps) => (
  <div id={id} className="scroll-mt-20 space-y-2 border-b py-3 last:border-b-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <Label htmlFor={`${id}-input`} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <CredentialStatus source={source} isLoading={isLoading} />
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        id={`${id}-input`}
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          source === 'settings'
            ? 'Paste a new value to replace the saved credential'
            : source === 'environment'
              ? 'Paste a value to override the .env credential'
              : 'Paste credential'
        }
        disabled={isLoading || clearing}
        className="h-8 flex-1 font-mono text-xs"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onTest}
        disabled={isLoading || isTesting || clearing || (!value.trim() && source === 'none')}
        className="shrink-0"
      >
        <TestTube2 className="mr-2 h-3.5 w-3.5" />
        {isTesting ? 'Testing…' : 'Test connection'}
      </Button>
      {source === 'settings' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUseEnvironment}
          disabled={isLoading || clearing || isTesting}
          className="shrink-0"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          {clearing ? 'Clearing…' : 'Use .env fallback'}
        </Button>
      )}
    </div>
  </div>
);

function SettingsPage() {
  const { data: status, isLoading } = useSettingsQuery();
  const updateMutation = useUpdateSettingsMutation();
  const testMutation = useTestCredentialMutation();

  const [provider, setProvider] = useState<Provider>('claude');
  const [model, setModel] = useState('');
  const [syncedStatus, setSyncedStatus] = useState<typeof status | null>(null);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [decodoAuthToken, setDecodoAuthToken] = useState('');
  const [testingTarget, setTestingTarget] = useState<CredentialTarget | null>(null);
  const [clearingTarget, setClearingTarget] = useState<CredentialTarget | null>(null);

  if (status && status !== syncedStatus) {
    setSyncedStatus(status);
    setProvider((status.provider as Provider) || 'claude');
    setModel(status.model || '');
  }

  const llmKeySet =
    provider === 'openai'
      ? status?.openaiKeySet
      : provider === 'gemini'
        ? status?.geminiKeySet
        : status?.anthropicKeySet;

  const missingDecodo = !isLoading && status && !status.decodoKeySet;
  const missingLlmKey = !isLoading && status && !llmKeySet;

  const providerDirty =
    status !== undefined && (provider !== status.provider || model !== (status.model ?? ''));
  const credentialsDirty = Boolean(
    anthropicApiKey.trim() || openaiApiKey.trim() || geminiApiKey.trim() || decodoAuthToken.trim(),
  );

  const handleSaveProvider = () => {
    updateMutation.mutate(
      { provider, model },
      {
        onSuccess: () => toast.success('LLM settings saved'),
        onError: () => toast.error('Failed to save LLM settings'),
      },
    );
  };

  const handleSaveCredentials = () => {
    updateMutation.mutate(
      {
        ...(anthropicApiKey.trim() ? { anthropicApiKey } : {}),
        ...(openaiApiKey.trim() ? { openaiApiKey } : {}),
        ...(geminiApiKey.trim() ? { geminiApiKey } : {}),
        ...(decodoAuthToken.trim() ? { decodoAuthToken } : {}),
      },
      {
        onSuccess: () => {
          setAnthropicApiKey('');
          setOpenaiApiKey('');
          setGeminiApiKey('');
          setDecodoAuthToken('');
          toast.success('Credentials saved');
        },
        onError: () => toast.error('Failed to save credentials'),
      },
    );
  };

  const handleTest = (target: CredentialTarget, credential: string) => {
    setTestingTarget(target);
    testMutation.mutate(
      { target, ...(credential.trim() ? { credential } : {}) },
      {
        onSuccess: (result) => {
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        },
        onError: () => toast.error('Connection test failed'),
        onSettled: () => setTestingTarget(null),
      },
    );
  };

  const handleUseEnvironment = (target: CredentialTarget) => {
    setClearingTarget(target);
    const clearInput =
      target === 'anthropic'
        ? { clearAnthropicApiKey: true }
        : target === 'openai'
          ? { clearOpenaiApiKey: true }
          : target === 'gemini'
            ? { clearGeminiApiKey: true }
            : { clearDecodoAuthToken: true };

    updateMutation.mutate(clearInput, {
      onSuccess: () => {
        if (target === 'anthropic') setAnthropicApiKey('');
        if (target === 'openai') setOpenaiApiKey('');
        if (target === 'gemini') setGeminiApiKey('');
        if (target === 'decodo') setDecodoAuthToken('');
        toast.success('Saved override cleared. Environment fallback is now active if configured.');
      },
      onError: () => toast.error('Failed to clear saved credential'),
      onSettled: () => setClearingTarget(null),
    });
  };

  return (
    <div className="max-w-3xl space-y-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Configure the LLM and Decodo credentials used by research runs. Credentials saved here
          override server environment variables and are never returned to the browser.
        </p>
      </div>

      {(missingDecodo || missingLlmKey) && (
        <div className="space-y-2">
          {missingDecodo && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Decodo Web Scraping API is not configured. Add a Basic Auth token below to enable
                linked-page enrichment.
              </span>
            </div>
          )}
          {missingLlmKey && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No API key is configured for {PROVIDER_LABELS[provider]}. Add one below before
                starting research with this provider.
              </span>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-sm">LLM Provider</CardTitle>
          <CardDescription>
            Choose the provider and optionally override its default research model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={provider}
                onValueChange={(value) => {
                  setProvider(value as Provider);
                  setModel('');
                }}
                disabled={isLoading}
              >
                <SelectTrigger id="provider" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PROVIDER_LABELS) as [Provider, string][]).map(([key, label]) => {
                    const keySet =
                      key === 'openai'
                        ? status?.openaiKeySet
                        : key === 'gemini'
                          ? status?.geminiKeySet
                          : status?.anthropicKeySet;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          {label}
                          {keySet && <CheckCircle className="h-3 w-3 text-green-500" />}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model">Model override</Label>
              <Input
                id="model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={`Default: ${PROVIDER_DEFAULT_MODELS[provider]}`}
                disabled={isLoading}
                className="h-8"
              />
            </div>
          </div>

          <Button
            onClick={handleSaveProvider}
            disabled={!providerDirty || updateMutation.isPending || isLoading}
            size="sm"
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            {updateMutation.isPending ? 'Saving…' : 'Save LLM settings'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Credentials</CardTitle>
          <CardDescription>
            Paste a new value to save or replace a credential. Blank fields leave the current value
            unchanged. Saved credentials take precedence over <code className="font-mono text-xs">.env</code> values.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <CredentialRow
            id="anthropic-credentials"
            label="Anthropic API key"
            description="Used when Claude is the selected LLM provider."
            target="anthropic"
            value={anthropicApiKey}
            onChange={setAnthropicApiKey}
            source={status?.anthropicKeySource}
            isLoading={isLoading}
            isTesting={testingTarget === 'anthropic'}
            onTest={() => handleTest('anthropic', anthropicApiKey)}
            onUseEnvironment={() => handleUseEnvironment('anthropic')}
            clearing={clearingTarget === 'anthropic'}
          />
          <CredentialRow
            id="openai-credentials"
            label="OpenAI API key"
            description="Used when OpenAI is the selected LLM provider."
            target="openai"
            value={openaiApiKey}
            onChange={setOpenaiApiKey}
            source={status?.openaiKeySource}
            isLoading={isLoading}
            isTesting={testingTarget === 'openai'}
            onTest={() => handleTest('openai', openaiApiKey)}
            onUseEnvironment={() => handleUseEnvironment('openai')}
            clearing={clearingTarget === 'openai'}
          />
          <CredentialRow
            id="gemini-credentials"
            label="Gemini API key"
            description="Used when Gemini is the selected LLM provider."
            target="gemini"
            value={geminiApiKey}
            onChange={setGeminiApiKey}
            source={status?.geminiKeySource}
            isLoading={isLoading}
            isTesting={testingTarget === 'gemini'}
            onTest={() => handleTest('gemini', geminiApiKey)}
            onUseEnvironment={() => handleUseEnvironment('gemini')}
            clearing={clearingTarget === 'gemini'}
          />
          <CredentialRow
            id="decodo-credentials"
            label="Decodo Web Scraping API Basic Auth token"
            description="Paste the Basic Auth token only, without the word “Basic”. Used for linked-page Markdown enrichment."
            target="decodo"
            value={decodoAuthToken}
            onChange={setDecodoAuthToken}
            source={status?.decodoKeySource}
            isLoading={isLoading}
            isTesting={testingTarget === 'decodo'}
            onTest={() => handleTest('decodo', decodoAuthToken)}
            onUseEnvironment={() => handleUseEnvironment('decodo')}
            clearing={clearingTarget === 'decodo'}
          />

          <div className="pt-3">
            <Button
              onClick={handleSaveCredentials}
              disabled={!credentialsDirty || updateMutation.isPending || isLoading}
              size="sm"
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              {updateMutation.isPending ? 'Saving…' : 'Save credentials'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs leading-5 text-muted-foreground">
        Credentials saved in Settings are stored in this app's MongoDB document with secret fields
        excluded from normal reads. The API exposes only whether a credential is configured and
        whether it comes from Settings or the environment; it never returns the credential value.
      </p>
    </div>
  );
}
