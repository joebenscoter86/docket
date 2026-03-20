// lib/xero/types.ts

/**
 * Token response shape from Xero's token endpoint.
 * Confirmed in DOC-53 sandbox validation.
 */
export interface XeroTokenResponse {
  id_token: string;
  access_token: string;
  expires_in: number; // 1800 (30 min)
  token_type: "Bearer";
  refresh_token: string;
  scope: string;
}

/**
 * Internal representation after token exchange.
 * Mirrors QBOTokens in lib/quickbooks/types.ts.
 */
export interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Tenant object from GET https://api.xero.com/connections.
 * After OAuth, this endpoint returns the list of orgs the user authorized.
 * We take the first tenant.
 */
export interface XeroTenant {
  id: string; // UUID
  authEventId: string;
  tenantId: string; // UUID — stored as company_id in accounting_connections
  tenantType: string; // "ORGANISATION"
  tenantName: string; // stored as company_name
  createdDateUtc: string;
  updatedDateUtc: string;
}

/**
 * Database row shape for accounting_connections table.
 * Re-declared here to avoid cross-provider import from lib/quickbooks/types.
 * Keeps parallel module structure clean (Xero auth doesn't depend on QBO types).
 */
export interface AccountingConnectionRow {
  id: string;
  org_id: string;
  provider: "quickbooks" | "xero";
  access_token: string; // encrypted
  refresh_token: string; // encrypted
  token_expires_at: string;
  company_id: string;
  connected_at: string;
  company_name?: string | null;
}
