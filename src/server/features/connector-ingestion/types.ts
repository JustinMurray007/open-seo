export const CONNECTOR_PROVIDERS = ["gsc", "ga4"] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];
export type ConnectorSyncTrigger = "manual" | "scheduled" | "connection";
export type ConnectorSyncStatus = "running" | "succeeded" | "failed";
export type ConnectorHealthState =
  | "disconnected"
  | "never_synced"
  | "syncing"
  | "healthy"
  | "stale"
  | "error";

export type ConnectorDateRange = {
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  effectiveStartDate: string;
  effectiveEndDate: string;
};

export type ConnectorImportPage<T> = {
  rows: T[];
  hasMore: boolean;
  nextOffset: number;
};

export class ConnectorImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorImportValidationError";
  }
}

export class ConnectorInvocationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorInvocationLimitError";
  }
}

export type GscDailyFactInput = {
  date: string;
  query: string;
  page: string;
  country: string;
  device: string;
  searchType: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type Ga4DailyLandingPageFactInput = {
  date: string;
  hostName: string;
  landingPage: string;
  channel: string;
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
  engagementRate: number;
  keyEvents: number;
  transactions: number;
  purchaseRevenue: number;
};

export type ConnectorProviderAdapter = {
  provider: ConnectorProvider;
  getConnection(projectId: string): Promise<{
    propertyTimeZone?: string;
    connectedByUserId: string;
    accountId: string | null;
    resourceId: string;
  } | null>;
  fetchPage(input: {
    projectId: string;
    connection: {
      propertyTimeZone?: string;
      connectedByUserId: string;
      accountId: string | null;
      resourceId: string;
    };
    startDate: string;
    endDate: string;
    offset: number;
  }): Promise<
    | ConnectorImportPage<GscDailyFactInput>
    | ConnectorImportPage<Ga4DailyLandingPageFactInput>
  >;
};
