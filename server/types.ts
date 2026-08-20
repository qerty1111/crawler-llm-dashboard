export type UserRole = 'admin' | 'manager' | 'client';

export interface User {
  id: number;
  login: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_by?: number;
  created_at: string;
  last_login_at?: string;
}

export interface Session {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  ip?: string;
  user_agent?: string;
}

export interface Project {
  id: number;
  owner_user_id: number;
  name: string;
  description?: string;
  is_archived: boolean;
  created_at: string;
}

export interface QueryRecord {
  id: number;
  project_id: number;
  owner_user_id: number;
  text_orig: string;
  regions: string[]; // empty = wt-wt
  status: 'active' | 'paused' | 'done' | 'stopped';
  created_by?: number;
  created_at: string;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface UserSettings {
  user_id: number;
  score_threshold: number; // 0..10 (default 7)
  updated_at: string;
}

export interface Budget {
  user_id: number;
  raw_limit: number;
  llm_limit: number;
  raw_used: number;
  llm_used: number;
  updated_at: string;
}

export interface BudgetLedger {
  id: number;
  user_id: number;
  delta_raw: number;
  delta_llm: number;
  reason: 'topup' | 'consumption' | 'correction';
  actor_id?: number;
  actor_name?: string;
  created_at: string;
}

export interface ReferenceSite {
  domain: string;
  description: string;
}

export interface PromptBlocks {
  target_description: string;
  exclusions: string;
  categories: string[];
  reference_sites: ReferenceSite[];
}

export interface PromptProfile {
  id: number;
  owner_user_id?: number | null; // null = global default
  stage: 1 | 2;
  blocks: PromptBlocks;
  version: number;
  updated_by?: number;
  updated_at: string;
}

export interface PromptHistory {
  id: number;
  profile_id: number;
  stage: 1 | 2;
  blocks: PromptBlocks;
  version: number;
  actor_id?: number;
  actor_name?: string;
  created_at: string;
}

export interface FactClassified {
  id: number;
  raw_site_id: number;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  page_tags: string;
  category: string;
  score: number; // 0..10
  query_orig: string;
  query_sent: string;
  region: string;
  found_at: string;
  classified_at: string;
  owner_user_id: number;
  project_id: number;
  query_id: number;
}

export interface AggMinute {
  bucket: string; // ISO string start of minute
  owner_user_id: number; // 0 = all
  query_id: number; // 0 = all
  raw_found: number;
  s1_done: number;
  classified: number;
  queries_run: number;
  errors: number;
  llm_calls: number;
  proc_ms_sum: number;
  proc_cnt: number;
  score_hist: number[]; // array of 11 numbers for scores 0..10
}

export interface AggDay extends AggMinute {}

export interface GpuMetric {
  idx: number;
  name: string;
  util_pct: number;
  mem_used_mb: number;
  mem_total_mb: number;
  temp_c: number;
}

export interface HostMetrics {
  ts: string;
  cpu_pct: number;
  cpu_cores: number[];
  ram_pct: number;
  ram_used_mb: number;
  ram_total_mb: number;
  disk_pct: number;
  disk_free_gb: number;
  disk_total_gb: number;
  net_in_mb: number;
  net_out_mb: number;
  gpu: GpuMetric[];
}

export interface ServiceHealth {
  service: 'crawler' | 'targeted_crawler' | 'link_extractor' | 'scorer';
  name: string;
  state: 'running' | 'idle' | 'down';
  last_record_at: string;
  checked_at: string;
  extra?: {
    rate_per_min?: number;
    error_count_last_hour?: number;
    workers_active?: number;
    workers_total?: number;
    pid?: number;
  };
}

export interface OllamaInstance {
  port: number;
  status: 'healthy' | 'warning' | 'down';
  model: string;
  vram_mb: number;
  latency_ms: number;
  active_requests: number;
  total_evaluations: number;
}

export interface AuditLog {
  id: number;
  actor_id?: number;
  actor_name?: string;
  action: string;
  entity?: string;
  entity_id?: string;
  payload?: any;
  ip?: string;
  created_at: string;
}

export interface KpiTileData {
  title: string;
  value: number | string;
  formattedValue: string;
  unit?: string;
  deltaPct?: number; // e.g. +12.4 or -8.1
  deltaDirection?: 'up' | 'down' | 'neutral';
  deltaIsPositive?: boolean; // whether positive delta is good
  sparkline: number[];
  tooltip: string;
}

export interface KpiResponse {
  queriesRun: KpiTileData;
  rawFound: KpiTileData;
  classified: KpiTileData;
  suitable: KpiTileData;
  conversionPct: KpiTileData;
  inQueue: KpiTileData;
  errorsCount: KpiTileData;
  uniqueDomains: KpiTileData;
  speedPerMin: KpiTileData;
  avgProcessTime: KpiTileData;
}

export interface TimeseriesPoint {
  time: string; // HH:mm or YYYY-MM-DD HH:mm
  rawFound: number;
  suitable: number;
  classified: number;
  errors: number;
}

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
  stepPct: number; // conversion from previous step
  totalPct: number; // conversion from first step
  description: string;
}

export interface ScoreHistogramItem {
  score: number;
  count: number;
  isSuitable: boolean;
  pct: number;
}

export interface TopQueryItem {
  id: number;
  text_orig: string;
  project_name: string;
  raw_found: number;
  classified: number;
  suitable: number;
  conversion_pct: number;
}

export interface TopDomainItem {
  domain: string;
  category: string;
  suitable_count: number;
  avg_score: number;
  top_url: string;
}

export interface WorstQueryItem {
  id: number;
  text_orig: string;
  project_name: string;
  raw_found: number;
  classified: number;
  suitable: number;
}

export interface BreakdownItem {
  name: string;
  count: number;
  suitable_count: number;
  pct: number;
}

export interface WebSocketMessage {
  type: 'kpi_tick' | 'feed_item' | 'chart_point' | 'health' | 'pong';
  data: any;
  timestamp: string;
}
