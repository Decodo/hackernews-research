export type DecodoTarget = 'universal';

export interface DecodoScrapeRequest {
  target?: DecodoTarget;
  url: string;
  locale?: string;
  headless?: 'html' | 'png';
  markdown?: boolean;
  proxy_pool?: 'premium';
}

export interface DecodoScrapeResponse {
  status: number;
  url: string;
  content: unknown;
  target?: DecodoTarget;
}
