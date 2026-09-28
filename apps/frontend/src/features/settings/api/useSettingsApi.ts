import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CredentialSource = 'settings' | 'environment' | 'none';
export type CredentialTarget = 'anthropic' | 'openai' | 'gemini' | 'decodo';

export interface SettingsStatus {
  provider: string;
  model: string;
  decodoKeySet: boolean;
  anthropicKeySet: boolean;
  openaiKeySet: boolean;
  geminiKeySet: boolean;
  decodoKeySource: CredentialSource;
  anthropicKeySource: CredentialSource;
  openaiKeySource: CredentialSource;
  geminiKeySource: CredentialSource;
}

export interface UpdateSettingsInput {
  provider?: string;
  model?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  decodoAuthToken?: string;
  clearAnthropicApiKey?: boolean;
  clearOpenaiApiKey?: boolean;
  clearGeminiApiKey?: boolean;
  clearDecodoAuthToken?: boolean;
}

export interface TestCredentialInput {
  target: CredentialTarget;
  credential?: string;
}

export interface CredentialTestResult {
  ok: boolean;
  target: CredentialTarget;
  message: string;
}

const SETTINGS_KEY = ['settings'] as const;

const fetchSettings = async (): Promise<SettingsStatus> => {
  const { data } = await api.get<SettingsStatus>('/settings');
  return data;
};

const updateSettings = async (input: UpdateSettingsInput): Promise<SettingsStatus> => {
  const { data } = await api.patch<SettingsStatus>('/settings', input);
  return data;
};

const testCredential = async (input: TestCredentialInput): Promise<CredentialTestResult> => {
  const { data } = await api.post<CredentialTestResult>('/settings/test', input);
  return data;
};

export const useSettingsQuery = () => useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchSettings });

export const useUpdateSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_KEY, data);
    },
  });
};

export const useTestCredentialMutation = () =>
  useMutation({
    mutationFn: testCredential,
  });
