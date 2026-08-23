import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import {
  User, Session, Project, QueryRecord, UserSettings, Budget, BudgetLedger,
  PromptProfile, PromptHistory, FactClassified, AggMinute, AggDay,
  HostMetrics, ServiceHealth, OllamaInstance, AuditLog, PromptBlocks, GpuMetric
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Default initial password hash for 'admin123', 'manager123', 'client123'
const PASSWORD_HASH = bcrypt.hashSync('admin123', 10);

export const REGIONS_LIST = [
  'wt-wt', 'us', 'gb', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'se', 'no', 'dk',
  'fi', 'ch', 'at', 'cz', 'pt', 'gr', 'tr', 'ae', 'sa', 'jp', 'kr', 'sg',
  'au', 'nz', 'ca', 'br', 'mx', 'in'
];

export const CATEGORIES_LIST = [
  'PMS', 'Channel Manager', 'Booking Engine', 'RMS', 'OTA', 'Unrelated'
];

const SAMPLE_DOMAINS = [
  { domain: 'cloudbeds.com', cat: 'PMS', scoreRange: [8, 10], title: 'Cloudbeds: Award-Winning Hotel Management Software & PMS' },
  { domain: 'mews.com', cat: 'PMS', scoreRange: [8, 10], title: 'Mews Hospitality Cloud | Modern Hotel PMS Platform' },
  { domain: 'siteminder.com', cat: 'Channel Manager', scoreRange: [8, 10], title: 'SiteMinder - #1 Hotel Channel Manager & Distribution Tech' },
  { domain: 'stayntouch.com', cat: 'PMS', scoreRange: [7, 9], title: 'Stayntouch PMS | Mobile Cloud Hotel Management' },
  { domain: 'guesty.com', cat: 'Channel Manager', scoreRange: [7, 9], title: 'Guesty - All-in-One Short-Term Property Management' },
  { domain: 'roomkeypms.com', cat: 'PMS', scoreRange: [7, 8], title: 'RoomKeyPMS Cloud Hotel Property Management' },
  { domain: 'sirvoy.com', cat: 'Booking Engine', scoreRange: [7, 9], title: 'Sirvoy Hotel Booking System & Channel Manager' },
  { domain: 'hostaway.com', cat: 'Channel Manager', scoreRange: [7, 9], title: 'Hostaway: Vacation Rental Channel Manager & PMS' },
  { domain: 'hotelogix.com', cat: 'PMS', scoreRange: [6, 8], title: 'Hotelogix Cloud Hotel PMS & Frontdesk Operations' },
  { domain: 'synxis.sabre.com', cat: 'Booking Engine', scoreRange: [8, 10], title: 'SynXis Central Reservations & Booking Engine Sabre' },
  { domain: 'duettocloud.com', cat: 'RMS', scoreRange: [8, 10], title: 'Duetto: Hotel Revenue Strategy & Dynamic Pricing RMS' },
  { domain: 'ideas.com', cat: 'RMS', scoreRange: [8, 10], title: 'IDeaS Revenue Solutions | Hospitality RMS Software' },
  { domain: 'profitroom.com', cat: 'Booking Engine', scoreRange: [7, 9], title: 'Profitroom - Direct Booking Engine for Hotels' },
  { domain: 'yieldplanet.com', cat: 'Channel Manager', scoreRange: [7, 8], title: 'YieldPlanet - Hotel Channel Manager & Price Optimizer' },
  { domain: 'booking.com', cat: 'OTA', scoreRange: [2, 4], title: 'Booking.com: Hotels and Vacation Rentals Worldwide' },
  { domain: 'expedia.com', cat: 'OTA', scoreRange: [2, 4], title: 'Expedia Travel: Vacation Homes, Hotels, Flights' },
  { domain: 'tripadvisor.com', cat: 'OTA', scoreRange: [1, 3], title: 'Tripadvisor: Over 1 Billion Reviews & Hotel Search' },
  { domain: 'hotelmanagement.net', cat: 'Unrelated', scoreRange: [3, 5], title: 'Hotel Management Magazine & Hospitality Industry News' },
  { domain: 'travelandleisure.com', cat: 'Unrelated', scoreRange: [1, 2], title: 'Travel + Leisure: Destination Guides & Best Resorts' },
  { domain: 'airbnb.com', cat: 'OTA', scoreRange: [2, 4], title: 'Airbnb: Vacation Rentals, Cabins, Beach Houses' },
  { domain: 'clock-software.com', cat: 'PMS', scoreRange: [7, 9], title: 'Clock PMS+: Next Gen Cloud Hotel Operations System' },
  { domain: 'webrezpro.com', cat: 'PMS', scoreRange: [6, 8], title: 'WebRezPro Cloud PMS for Independent Hotels & Inns' },
  { domain: 'innroad.com', cat: 'PMS', scoreRange: [6, 8], title: 'innRoad | Property Management Software for Boutiques' },
  { domain: 'rateconnect.trivago.com', cat: 'Booking Engine', scoreRange: [6, 8], title: 'trivago Rate Connect: Direct Bookings Marketing' }
];

export class DatabaseStore {
  public users: User[] = [];
  public sessions: Session[] = [];
  public projects: Project[] = [];
  public queries: QueryRecord[] = [];
  public userSettings: Map<number, UserSettings> = new Map();
  public budgets: Map<number, Budget> = new Map();
  public budgetLedger: BudgetLedger[] = [];
  public promptProfiles: PromptProfile[] = [];
  public promptHistory: PromptHistory[] = [];
  public factClassified: FactClassified[] = [];
  public aggMinute: Map<string, AggMinute> = new Map();
  public aggDay: Map<string, AggDay> = new Map();
  public hostMetricsHistory: HostMetrics[] = [];
  public serviceHealth: Map<string, ServiceHealth> = new Map();
  public ollamaInstances: OllamaInstance[] = [];
  public auditLogs: AuditLog[] = [];
  public failedLoginAttempts: Map<string, { count: number; lockedUntil: number }> = new Map();

  private nextFactId = 1;
  private nextQueryId = 1;
  private nextProjectId = 1;
  private nextAuditId = 1;
  private nextLedgerId = 1;

  constructor() {
    this.ensureDataDir();
    if (!this.loadFromDisk()) {
      this.seedInitialData();
      this.saveToDisk();
    }
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  public saveToDisk() {
    try {
      const activeSessions = this.sessions.filter(s => new Date(s.expires_at) > new Date());
      const data = {
        users: this.users,
        sessions: activeSessions,
        projects: this.projects,
        queries: this.queries,
        userSettings: Array.from(this.userSettings.entries()),
        budgets: Array.from(this.budgets.entries()),
        budgetLedger: this.budgetLedger,
        promptProfiles: this.promptProfiles,
        promptHistory: this.promptHistory,
        auditLogs: this.auditLogs.slice(0, 500),
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save db to disk', err);
    }
  }

  private loadFromDisk(): boolean {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);

        this.users = data.users || [];
        this.sessions = (data.sessions || []).filter((s: Session) => new Date(s.expires_at) > new Date());
        this.projects = data.projects || [];
        this.queries = data.queries || [];
        this.userSettings = new Map(data.userSettings || []);
        this.budgets = new Map(data.budgets || []);
        this.budgetLedger = data.budgetLedger || [];
        this.promptProfiles = data.promptProfiles || [];
        this.promptHistory = data.promptHistory || [];
        this.auditLogs = data.auditLogs || [];

        this.seedRuntimeData();
        return true;
      }
    } catch (err) {
      console.error('Failed to load db from disk, re-seeding', err);
    }
    return false;
  }

  private seedRuntimeData() {
    // 1. Service Health
    this.serviceHealth.set('crawler', {
      service: 'crawler',
      name: 'Google & Bing Parser (crawler.py)',
      state: 'running',
      last_record_at: new Date(Date.now() - 25000).toISOString(),
      checked_at: new Date().toISOString(),
      extra: { rate_per_min: 420, error_count_last_hour: 4, workers_active: 8, workers_total: 8, pid: 14220 },
    });

    this.serviceHealth.set('targeted_crawler', {
      service: 'targeted_crawler',
      name: 'Targeted Deep Crawler (targeted_crawler.py)',
      state: 'running',
      last_record_at: new Date(Date.now() - 40000).toISOString(),
      checked_at: new Date().toISOString(),
      extra: { rate_per_min: 180, error_count_last_hour: 1, workers_active: 4, workers_total: 4, pid: 14224 },
    });

    this.serviceHealth.set('link_extractor', {
      service: 'link_extractor',
      name: 'Link & Content Extractor (link_extractor.py)',
      state: 'running',
      last_record_at: new Date(Date.now() - 15000).toISOString(),
      checked_at: new Date().toISOString(),
      extra: { rate_per_min: 350, error_count_last_hour: 0, workers_active: 12, workers_total: 12, pid: 14230 },
    });

    this.serviceHealth.set('scorer', {
      service: 'scorer',
      name: 'Two-Stage LLM Scorer (scorer.py)',
      state: 'running',
      last_record_at: new Date(Date.now() - 10000).toISOString(),
      checked_at: new Date().toISOString(),
      extra: { rate_per_min: 195, error_count_last_hour: 2, workers_active: 16, workers_total: 16, pid: 14245 },
    });

    // 2. Ollama Instances
    this.ollamaInstances = [
      { port: 11434, status: 'healthy', model: 'llama3.1:8b-instruct-q8_0', vram_mb: 8420, latency_ms: 210, active_requests: 2, total_evaluations: 14820 },
      { port: 11435, status: 'healthy', model: 'llama3.1:8b-instruct-q8_0', vram_mb: 8415, latency_ms: 195, active_requests: 1, total_evaluations: 14610 },
      { port: 11436, status: 'healthy', model: 'llama3.1:8b-instruct-q8_0', vram_mb: 8422, latency_ms: 220, active_requests: 2, total_evaluations: 14750 },
      { port: 11437, status: 'healthy', model: 'llama3.1:8b-instruct-q8_0', vram_mb: 8418, latency_ms: 185, active_requests: 0, total_evaluations: 14900 },
      { port: 11438, status: 'healthy', model: 'qwen2.5:14b-instruct-q4_k_m', vram_mb: 10240, latency_ms: 340, active_requests: 3, total_evaluations: 11200 },
      { port: 11439, status: 'healthy', model: 'qwen2.5:14b-instruct-q4_k_m', vram_mb: 10235, latency_ms: 330, active_requests: 2, total_evaluations: 11140 },
      { port: 11440, status: 'healthy', model: 'qwen2.5:14b-instruct-q4_k_m', vram_mb: 10245, latency_ms: 355, active_requests: 1, total_evaluations: 10980 },
      { port: 11441, status: 'healthy', model: 'qwen2.5:14b-instruct-q4_k_m', vram_mb: 10220, latency_ms: 315, active_requests: 0, total_evaluations: 11400 },
    ];

    // 3. Generate Historical Facts and Aggregates
    this.generateHistoricalFactsAndAggregates();
    this.generateHostMetricsHistory();
  }

  private seedInitialData() {
    // Users
    this.users = [
      {
        id: 1,
        login: 'admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        full_name: 'Александр Волков (Главный Администратор)',
        role: 'admin',
        is_active: true,
        created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
        last_login_at: new Date().toISOString(),
      },
      {
        id: 2,
        login: 'manager',
        password_hash: bcrypt.hashSync('manager123', 10),
        full_name: 'Екатерина Романова (Старший Менеджер)',
        role: 'manager',
        is_active: true,
        created_by: 1,
        created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
        last_login_at: new Date().toISOString(),
      },
      {
        id: 3,
        login: 'client_booking',
        password_hash: bcrypt.hashSync('client123', 10),
        full_name: 'ООО «ОтельСофт Инновации»',
        role: 'client',
        is_active: true,
        created_by: 2,
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        last_login_at: new Date().toISOString(),
      },
      {
        id: 4,
        login: 'client_travel',
        password_hash: bcrypt.hashSync('client123', 10),
        full_name: 'TravelTech Global Europe Ltd.',
        role: 'client',
        is_active: true,
        created_by: 2,
        created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
        last_login_at: new Date().toISOString(),
      },
    ];

    // Settings & Budgets
    this.userSettings.set(1, { user_id: 1, score_threshold: 7, updated_at: new Date().toISOString() });
    this.userSettings.set(2, { user_id: 2, score_threshold: 7, updated_at: new Date().toISOString() });
    this.userSettings.set(3, { user_id: 3, score_threshold: 7, updated_at: new Date().toISOString() });
    this.userSettings.set(4, { user_id: 4, score_threshold: 8, updated_at: new Date().toISOString() });

    this.budgets.set(3, {
      user_id: 3,
      raw_limit: 200000,
      llm_limit: 150000,
      raw_used: 128400,
      llm_used: 91300,
      updated_at: new Date().toISOString(),
    });

    this.budgets.set(4, {
      user_id: 4,
      raw_limit: 50000,
      llm_limit: 40000,
      raw_used: 41500,
      llm_used: 38200,
      updated_at: new Date().toISOString(),
    });

    this.budgetLedger.push(
      {
        id: this.nextLedgerId++,
        user_id: 3,
        delta_raw: 200000,
        delta_llm: 150000,
        reason: 'topup',
        actor_id: 1,
        actor_name: 'admin',
        created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      },
      {
        id: this.nextLedgerId++,
        user_id: 4,
        delta_raw: 50000,
        delta_llm: 40000,
        reason: 'topup',
        actor_id: 1,
        actor_name: 'admin',
        created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      }
    );

    // Projects
    this.projects = [
      {
        id: this.nextProjectId++,
        owner_user_id: 3,
        name: 'Отельные PMS и облачные системы EU/US',
        description: 'Поиск и скоринг всех SaaS решений Property Management Systems для независимых и бутик-отелей.',
        is_archived: false,
        created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
      },
      {
        id: this.nextProjectId++,
        owner_user_id: 3,
        name: 'Channel Managers & Booking Engines 2026',
        description: 'Синхронизаторы каналов, модули прямого бронирования и интеграции с метапоисковиками.',
        is_archived: false,
        created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      },
      {
        id: this.nextProjectId++,
        owner_user_id: 4,
        name: 'Global Hospitality Tech & RMS',
        description: 'Системы динамического ценообразования и управления доходами отелей.',
        is_archived: false,
        created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      },
    ];

    // Queries
    const querySeeds = [
      { pId: 1, owner: 3, text: 'best hotel pms software cloud', regions: ['us', 'gb', 'de', 'fr', 'es'], status: 'active' as const },
      { pId: 1, owner: 3, text: 'boutique hotel property management system', regions: ['us', 'gb', 'it', 'ch'], status: 'active' as const },
      { pId: 1, owner: 3, text: 'cloud hospitality management platform', regions: ['wt-wt'], status: 'active' as const },
      { pId: 1, owner: 3, text: 'hotel front desk automation software', regions: ['us', 'de', 'nl'], status: 'active' as const },
      { pId: 1, owner: 3, text: 'hotel self check-in kiosk system mobile', regions: ['us', 'gb', 'de', 'jp'], status: 'paused' as const },
      { pId: 2, owner: 3, text: 'hotel channel manager api direct booking', regions: ['us', 'gb', 'de', 'es', 'it'], status: 'active' as const },
      { pId: 2, owner: 3, text: 'vacation rental channel manager otas', regions: ['us', 'fr', 'es', 'pt'], status: 'active' as const },
      { pId: 2, owner: 3, text: 'hotel booking engine stripe integration', regions: ['us', 'gb', 'de', 'nl'], status: 'active' as const },
      { pId: 2, owner: 3, text: 'direct hotel reservations widget saas', regions: ['wt-wt'], status: 'active' as const },
      { pId: 3, owner: 4, text: 'hotel revenue management system rms dynamic pricing', regions: ['us', 'gb', 'de', 'fr'], status: 'active' as const },
      { pId: 3, owner: 4, text: 'hotel rate shopper parity monitoring tool', regions: ['us', 'gb', 'it', 'es'], status: 'active' as const },
      { pId: 3, owner: 4, text: 'hospitality yield management software ai', regions: ['wt-wt'], status: 'paused' as const },
    ];

    for (const q of querySeeds) {
      this.queries.push({
        id: this.nextQueryId++,
        project_id: q.pId,
        owner_user_id: q.owner,
        text_orig: q.text,
        regions: q.regions,
        status: q.status,
        created_by: q.owner,
        created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        first_seen_at: new Date(Date.now() - 9 * 86400000).toISOString(),
        last_seen_at: new Date(Date.now() - 30000).toISOString(),
      });
    }

    // Default prompt profiles
    const defaultBlocks: PromptBlocks = {
      target_description: 'Программное обеспечение B2B для отелей, хостелов, апарт-отелей и сетей: PMS (Property Management System), Channel Managers для синхронизации OTA, модули прямого бронирования (Booking Engine), системы динамического ценообразования (RMS), киоски и софт самозаселения.',
      exclusions: 'Потребительские сайты бронирования (Booking.com, Airbnb, Expedia), блоги туристов, каталоги туров, сайты отдельных отелей без SaaS-платформы, агентства веб-дизайна, сервисы аренды автомобилей.',
      categories: [...CATEGORIES_LIST],
      reference_sites: [
        { domain: 'cloudbeds.com', description: 'Эталонный облачный PMS + Channel Manager' },
        { domain: 'mews.com', description: 'Современная cloud-native PMS для сетевых отелей' },
        { domain: 'siteminder.com', description: 'Мировой лидер среди Channel Manager решений' },
        { domain: 'stayntouch.com', description: 'Мобильная PMS и киоски самозаселения' },
        { domain: 'guesty.com', description: 'Платформа управления краткосрочной арендой' },
      ],
    };

    this.promptProfiles = [
      {
        id: 1,
        owner_user_id: null,
        stage: 1,
        blocks: { ...defaultBlocks },
        version: 3,
        updated_by: 1,
        updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        id: 2,
        owner_user_id: null,
        stage: 2,
        blocks: { ...defaultBlocks },
        version: 5,
        updated_by: 1,
        updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ];

    this.seedRuntimeData();
  }

  // Register a new user dynamically with disk persistence
  public registerUser(params: {
    login: string;
    password?: string;
    full_name: string;
    role: 'admin' | 'manager' | 'client';
    score_threshold?: number;
    raw_limit?: number;
    llm_limit?: number;
  }): User {
    const nextId = this.users.length > 0 ? Math.max(...this.users.map(u => u.id)) + 1 : 1;
    const passwordHash = params.password ? bcrypt.hashSync(params.password, 10) : PASSWORD_HASH;

    const newUser: User = {
      id: nextId,
      login: params.login.trim(),
      password_hash: passwordHash,
      full_name: params.full_name.trim(),
      role: params.role,
      is_active: true,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };

    this.users.push(newUser);

    // User settings
    const threshold = params.score_threshold || 7;
    this.userSettings.set(newUser.id, {
      user_id: newUser.id,
      score_threshold: threshold,
      updated_at: new Date().toISOString(),
    });

    // Budget
    const rawLimit = params.raw_limit || (params.role === 'admin' ? 1000000 : 150000);
    const llmLimit = params.llm_limit || (params.role === 'admin' ? 800000 : 100000);

    this.budgets.set(newUser.id, {
      user_id: newUser.id,
      raw_limit: rawLimit,
      llm_limit: llmLimit,
      raw_used: 0,
      llm_used: 0,
      updated_at: new Date().toISOString(),
    });

    this.budgetLedger.push({
      id: this.nextLedgerId++,
      user_id: newUser.id,
      delta_raw: rawLimit,
      delta_llm: llmLimit,
      reason: 'topup',
      actor_name: 'система регистрации',
      created_at: new Date().toISOString(),
    });

    // Create a default initial project for the user
    const defaultProject: Project = {
      id: this.getNextProjectId(),
      owner_user_id: newUser.id,
      name: params.role === 'client' ? `Основной проект (${newUser.login})` : `Общий проект мониторинга`,
      description: 'Автоматически созданный рабочий проект для поиска и скоринга ссылок.',
      is_archived: false,
      created_at: new Date().toISOString(),
    };
    this.projects.push(defaultProject);

    // Create 2 initial starter queries for the user
    this.queries.push(
      {
        id: this.getNextQueryId(),
        project_id: defaultProject.id,
        owner_user_id: newUser.id,
        text_orig: 'best hospitality hotel management software cloud',
        regions: ['wt-wt'],
        status: 'active',
        created_at: new Date().toISOString(),
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      {
        id: this.getNextQueryId(),
        project_id: defaultProject.id,
        owner_user_id: newUser.id,
        text_orig: 'hotel channel manager direct booking engine sync',
        regions: ['us', 'gb', 'de', 'es'],
        status: 'active',
        created_at: new Date().toISOString(),
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }
    );

    this.addAuditLog(newUser.id, newUser.login, 'register_user', 'user', String(newUser.id), {
      login: newUser.login,
      role: newUser.role,
      full_name: newUser.full_name,
    });

    this.saveToDisk();
    return newUser;
  }

  private generateHistoricalFactsAndAggregates() {
    const now = Date.now();
    const minutesToGenerate = 1440; // 24 hours

    for (let m = minutesToGenerate; m >= 0; m--) {
      const bucketTime = new Date(now - m * 60000);
      bucketTime.setSeconds(0, 0);
      const bucketIso = bucketTime.toISOString();

      const clients = [0, 3, 4];
      for (const clientId of clients) {
        const hour = (bucketTime.getUTCHours() + 3) % 24;
        const isPeak = hour >= 8 && hour <= 22;
        const multiplier = isPeak ? 1.4 : 0.6;
        const clientWeight = clientId === 0 ? 1 : clientId === 3 ? 0.75 : 0.25;

        const queriesRun = Math.max(1, Math.round((10 + Math.random() * 12) * multiplier * clientWeight));
        const rawFound = Math.round(queriesRun * (6.5 + Math.random() * 2.5));
        const s1Done = Math.round(rawFound * (0.18 + Math.random() * 0.05));
        const classified = Math.round(s1Done * (0.95 + Math.random() * 0.04));
        const errors = Math.random() < 0.15 ? Math.floor(Math.random() * 2) : 0;
        const llmCalls = s1Done + classified;
        const procCnt = classified;
        const avgProcMs = Math.round(180000 + Math.random() * 120000);
        const procMsSum = procCnt * avgProcMs;

        const scoreHist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < classified; i++) {
          const rand = Math.random();
          let sc: number;
          if (rand < 0.15) sc = Math.floor(Math.random() * 4);
          else if (rand < 0.45) sc = 4 + Math.floor(Math.random() * 2);
          else if (rand < 0.75) sc = 6 + Math.floor(Math.random() * 2);
          else if (rand < 0.95) sc = 8 + Math.floor(Math.random() * 2);
          else sc = 10;
          scoreHist[sc]++;
        }

        const agg: AggMinute = {
          bucket: bucketIso,
          owner_user_id: clientId,
          query_id: 0,
          raw_found: rawFound,
          s1_done: s1Done,
          classified: classified,
          queries_run: queriesRun,
          errors: errors,
          llm_calls: llmCalls,
          proc_ms_sum: procMsSum,
          proc_cnt: procCnt,
          score_hist: scoreHist,
        };

        this.aggMinute.set(`${bucketIso}_${clientId}_0`, agg);
      }

      if (m <= 300 && Math.random() < 0.6) {
        const itemClient = Math.random() < 0.75 ? 3 : 4;
        const queryList = this.queries.filter(q => q.owner_user_id === itemClient);
        const query = queryList[Math.floor(Math.random() * queryList.length)] || this.queries[0] || {
          id: 1,
          project_id: 1,
          text_orig: 'hotel pms software',
          regions: ['wt-wt'],
        };
        const domainObj = SAMPLE_DOMAINS[Math.floor(Math.random() * SAMPLE_DOMAINS.length)];
        const minScore = domainObj.scoreRange[0];
        const maxScore = domainObj.scoreRange[1];
        const score = minScore + Math.floor(Math.random() * (maxScore - minScore + 1));
        const region = query.regions[Math.floor(Math.random() * query.regions.length)] || 'wt-wt';
        const foundTime = new Date(bucketTime.getTime() - (120000 + Math.random() * 180000));

        const fact: FactClassified = {
          id: this.nextFactId++,
          raw_site_id: Math.floor(100000 + Math.random() * 900000),
          url: `https://${domainObj.domain}/products/${domainObj.cat.toLowerCase().replace(' ', '-')}/solution-${Math.floor(Math.random() * 500)}`,
          domain: domainObj.domain,
          title: `${domainObj.title} [${region.toUpperCase()}]`,
          snippet: `Next generation ${domainObj.cat} solution for boutique hotels, resorts and vacation rentals. Direct 2-way API synchronization, multi-calendar, zero-commission booking engine.`,
          page_tags: `<title>${domainObj.title}</title> <meta name="description" content="Cloud hotel property management system, real-time rates distribution, OTA channel manager, guest portal"/> <h1>Award-winning hospitality software</h1> <ul><li>Property Management</li><li>Channel Manager</li><li>Booking Engine</li><li>Payment Gateway</li></ul>`,
          category: domainObj.cat,
          score: score,
          query_orig: query.text_orig,
          query_sent: `${query.text_orig} loc:${region}`,
          region: region,
          found_at: foundTime.toISOString(),
          classified_at: bucketTime.toISOString(),
          owner_user_id: itemClient,
          project_id: query.project_id,
          query_id: query.id,
        };

        this.factClassified.push(fact);
      }
    }
  }

  private generateHostMetricsHistory() {
    const now = Date.now();
    const points = 288;

    for (let i = points; i >= 0; i--) {
      const ts = new Date(now - i * 300000).toISOString();
      const cpu = 38 + Math.sin(i / 10) * 15 + Math.random() * 8;
      const ramPct = 62 + Math.random() * 4;
      const ramTotal = 65536;
      const ramUsed = Math.round(ramTotal * (ramPct / 100));
      const diskPct = 48.2;
      const diskTotal = 2000;
      const diskFree = Math.round(diskTotal * (1 - diskPct / 100));

      const cores = [
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
        Math.min(100, Math.max(10, cpu + (Math.random() * 20 - 10))),
      ];

      const gpus: GpuMetric[] = [
        {
          idx: 0,
          name: 'NVIDIA RTX 4090 (24GB)',
          util_pct: Math.round(68 + Math.random() * 22),
          mem_used_mb: 18450 + Math.round(Math.random() * 800),
          mem_total_mb: 24576,
          temp_c: Math.round(58 + Math.random() * 7),
        },
        {
          idx: 1,
          name: 'NVIDIA RTX 4090 (24GB)',
          util_pct: Math.round(72 + Math.random() * 18),
          mem_used_mb: 19200 + Math.round(Math.random() * 600),
          mem_total_mb: 24576,
          temp_c: Math.round(61 + Math.random() * 6),
        },
      ];

      this.hostMetricsHistory.push({
        ts,
        cpu_pct: Math.round(cpu * 10) / 10,
        cpu_cores: cores.map(c => Math.round(c)),
        ram_pct: Math.round(ramPct * 10) / 10,
        ram_used_mb: ramUsed,
        ram_total_mb: ramTotal,
        disk_pct: diskPct,
        disk_free_gb: diskFree,
        disk_total_gb: diskTotal,
        net_in_mb: Math.round((12.4 + Math.random() * 6) * 10) / 10,
        net_out_mb: Math.round((8.1 + Math.random() * 4) * 10) / 10,
        gpu: gpus,
      });
    }
  }

  public generateLiveTick(): { newFact?: FactClassified; kpiTick: any; chartPoint?: any } {
    const now = new Date();
    const nowIso = now.toISOString();
    const currentMinute = new Date(now);
    currentMinute.setSeconds(0, 0);
    const minuteIso = currentMinute.toISOString();

    const targetClient = this.users.find(u => u.role === 'client')?.id || 3;
    const activeQueries = this.queries.filter(q => q.owner_user_id === targetClient && q.status === 'active');
    const query = activeQueries[Math.floor(Math.random() * activeQueries.length)] || this.queries[0] || {
      id: 1,
      project_id: 1,
      text_orig: 'hotel management cloud pms',
      regions: ['wt-wt'],
    };

    const domainObj = SAMPLE_DOMAINS[Math.floor(Math.random() * SAMPLE_DOMAINS.length)];
    const minScore = domainObj.scoreRange[0];
    const maxScore = domainObj.scoreRange[1];
    const score = minScore + Math.floor(Math.random() * (maxScore - minScore + 1));
    const region = query.regions[Math.floor(Math.random() * query.regions.length)] || 'wt-wt';
    const foundTime = new Date(now.getTime() - (90000 + Math.random() * 150000));

    const newFact: FactClassified = {
      id: this.nextFactId++,
      raw_site_id: Math.floor(100000 + Math.random() * 900000),
      url: `https://${domainObj.domain}/solutions/${domainObj.cat.toLowerCase()}-cloud-v${Math.floor(Math.random() * 9000)}`,
      domain: domainObj.domain,
      title: `${domainObj.title} [Live: ${region.toUpperCase()}]`,
      snippet: `Real-time classified item: ${domainObj.cat} SaaS solution for enterprise hospitality. Direct Booking API, integrated POS, 2-way GDS sync.`,
      page_tags: `<title>${domainObj.title}</title><meta name="keywords" content="${domainObj.cat}, hotel software, direct reservations, PMS, cloud API"/><h1>${domainObj.title}</h1>`,
      category: domainObj.cat,
      score: score,
      query_orig: query.text_orig,
      query_sent: `${query.text_orig} region:${region}`,
      region: region,
      found_at: foundTime.toISOString(),
      classified_at: nowIso,
      owner_user_id: targetClient,
      project_id: query.project_id,
      query_id: query.id,
    };

    this.factClassified.unshift(newFact);
    if (this.factClassified.length > 5000) {
      this.factClassified.pop();
    }

    const budget = this.budgets.get(targetClient);
    if (budget) {
      budget.raw_used += 1;
      budget.llm_used += 1;
      budget.updated_at = nowIso;
    }

    const updateBucket = (cId: number) => {
      const key = `${minuteIso}_${cId}_0`;
      let agg = this.aggMinute.get(key);
      if (!agg) {
        agg = {
          bucket: minuteIso,
          owner_user_id: cId,
          query_id: 0,
          raw_found: 0,
          s1_done: 0,
          classified: 0,
          queries_run: 0,
          errors: 0,
          llm_calls: 0,
          proc_ms_sum: 0,
          proc_cnt: 0,
          score_hist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        };
        this.aggMinute.set(key, agg);
      }
      agg.raw_found += 1;
      agg.classified += 1;
      agg.s1_done += 1;
      agg.llm_calls += 2;
      agg.score_hist[score]++;
      agg.proc_cnt += 1;
      agg.proc_ms_sum += (now.getTime() - foundTime.getTime());
    };

    updateBucket(0);
    updateBucket(targetClient);

    const scorerHealth = this.serviceHealth.get('scorer');
    if (scorerHealth) {
      scorerHealth.last_record_at = nowIso;
      scorerHealth.checked_at = nowIso;
    }
    const crawlerHealth = this.serviceHealth.get('crawler');
    if (crawlerHealth) {
      crawlerHealth.last_record_at = nowIso;
      crawlerHealth.checked_at = nowIso;
    }

    return {
      newFact,
      kpiTick: {
        rawFoundInc: 1,
        classifiedInc: 1,
        score,
        targetClient,
      },
      chartPoint: {
        time: minuteIso,
        rawFound: 1,
        suitable: score >= (this.userSettings.get(targetClient)?.score_threshold ?? 7) ? 1 : 0,
      }
    };
  }

  public generateLiveHostMetrics(): HostMetrics {
    const now = new Date().toISOString();
    const cpu = 42 + Math.random() * 12;
    const ramPct = 63.4 + Math.random() * 1.5;
    const ramTotal = 65536;
    const ramUsed = Math.round(ramTotal * (ramPct / 100));
    const diskPct = 48.2;
    const diskTotal = 2000;
    const diskFree = Math.round(diskTotal * (1 - diskPct / 100));

    const current: HostMetrics = {
      ts: now,
      cpu_pct: Math.round(cpu * 10) / 10,
      cpu_cores: [
        Math.round(45 + Math.random() * 20),
        Math.round(40 + Math.random() * 25),
        Math.round(52 + Math.random() * 18),
        Math.round(38 + Math.random() * 22),
        Math.round(48 + Math.random() * 20),
        Math.round(35 + Math.random() * 30),
        Math.round(42 + Math.random() * 20),
        Math.round(50 + Math.random() * 15),
      ],
      ram_pct: Math.round(ramPct * 10) / 10,
      ram_used_mb: ramUsed,
      ram_total_mb: ramTotal,
      disk_pct: diskPct,
      disk_free_gb: diskFree,
      disk_total_gb: diskTotal,
      net_in_mb: Math.round((14.2 + Math.random() * 4) * 10) / 10,
      net_out_mb: Math.round((9.5 + Math.random() * 3) * 10) / 10,
      gpu: [
        {
          idx: 0,
          name: 'NVIDIA RTX 4090 (24GB)',
          util_pct: Math.round(74 + Math.random() * 15),
          mem_used_mb: 18820 + Math.round(Math.random() * 200),
          mem_total_mb: 24576,
          temp_c: Math.round(62 + Math.random() * 4),
        },
        {
          idx: 1,
          name: 'NVIDIA RTX 4090 (24GB)',
          util_pct: Math.round(78 + Math.random() * 12),
          mem_used_mb: 19450 + Math.round(Math.random() * 200),
          mem_total_mb: 24576,
          temp_c: Math.round(64 + Math.random() * 3),
        },
      ],
    };

    this.hostMetricsHistory.push(current);
    if (this.hostMetricsHistory.length > 300) {
      this.hostMetricsHistory.shift();
    }

    return current;
  }

  public addAuditLog(actorId: number | undefined, actorName: string | undefined, action: string, entity?: string, entityId?: string, payload?: any, ip?: string) {
    this.auditLogs.unshift({
      id: this.nextAuditId++,
      actor_id: actorId,
      actor_name: actorName,
      action,
      entity,
      entity_id: entityId,
      payload,
      ip: ip || '127.0.0.1',
      created_at: new Date().toISOString(),
    });
    this.saveToDisk();
  }

  public getNextProjectId() {
    const id = this.nextProjectId++;
    return id;
  }

  public getNextQueryId() {
    const id = this.nextQueryId++;
    return id;
  }

  public getNextLedgerId() {
    const id = this.nextLedgerId++;
    return id;
  }
}

export const db = new DatabaseStore();
