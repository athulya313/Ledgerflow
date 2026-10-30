
const API_BASE_URL = "/api";


export class ApiError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (isFormData) {
    headers.delete("Content-Type");
  } else if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new ApiError(
      body?.message || body?.error || `Request failed (${response.status})`,
      response.status,
      body?.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}


export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Organization {
  id: string;
  name: string;
  role: "owner" | "finance_admin" | "auditor";
}

export interface CurrentUser {
  user: User;
  organizations: Organization[];
}

export const authApi = {
  register(input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }) {
    return request<{
      user: User;
      organization: { id: string; name: string };
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  login(input: { email: string; password: string }) {
    return request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  me() {
    return request<CurrentUser>("/auth/me");
  },

  logout() {
    return request<void>("/auth/logout", {
      method: "POST",
    });
  },
};

export interface Account {
  id: string;
  organization_id: string;
  name: string;
  account_type:
    | "asset"
    | "liability"
    | "equity"
    | "income"
    | "expense";
  currency: string;
  status: string;
  created_at: string;
}

export const accountsApi = {
  list(organizationId: string) {
    return request<{ accounts: Account[] }>(
      `/organizations/${organizationId}/accounts`,
    );
  },

  create(
    organizationId: string,
    input: { name: string; accountType: Account["account_type"] },
  ) {
    return request<{ account: Account }>(
      `/organizations/${organizationId}/accounts`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
};

export interface LedgerEntryInput {
  accountId: string;
  entryType: "debit" | "credit";
  amountPaise: number;
}

export interface CreateLedgerTransactionInput {
  description: string;
  entries: LedgerEntryInput[];
}
export interface LedgerTransaction {
  id: string;
  organization_id: string;
  description: string;
  status: string;
  created_at: string;
  posted_at: string | null;
    amount_paise?: string;

  // Fields returned by the list endpoint
  reference?: string | null;
  created_by?: string | null;

  // Fields returned by the create/get endpoint
  entries?: {
    id: string;
    account_id: string;
    entry_type: "debit" | "credit";
    amount_paise?: string;
    created_at: string;
  }[];

  idempotencyReplayed?: boolean;
}


export const ledgerApi = {
  create(
    organizationId: string,
    input: CreateLedgerTransactionInput,
  ) {
    return request<{
      message: string;
      transaction: LedgerTransaction;
    }>(
      `/organizations/${organizationId}/ledger/transactions`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      },
    );
  },

list(
  organizationId: string,
  filters: {
    page?: number;
    limit?: number;
    search?: string;
    from?: string;
    to?: string;
  } = {},
) {
  const params = new URLSearchParams();

  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  return request<{
    transactions: LedgerTransaction[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>(
    `/organizations/${organizationId}/ledger/transactions?${params.toString()}`,
  );
},

    trialBalance(organizationId: string) {
    return request<{
      trialBalance: {
        organizationId: string;
        accounts: {
          accountId: string;
          accountName: string;
          accountType: string;
          debitBalancePaise: string;
          creditBalancePaise: string;
        }[];
        totalDebitsPaise: string;
        totalCreditsPaise: string;
        isBalanced: boolean;
      };
    }>(
      `/organizations/${organizationId}/ledger/trial-balance`,
    );
  },
  
monthlyCashFlow(organizationId: string) {
  return request<{
    months: {
      month: string;
      income_paise: string;
      expenses_paise: string;
    }[];
  }>(`/organizations/${organizationId}/ledger/monthly-cash-flow`);
},

};


export interface Reconciliation {
  id: string;
  account_id: string;
  account_name: string;
  statement_name: string;
  status: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  created_at: string;
  completed_at: string | null;
}

export interface ReconciliationItem {
  id: string;
  row_number: number;
  transaction_date: string;
  description: string;
  reference: string | null;
  amount_paise: string;
  status: "matched" | "unmatched";
  ledger_transaction_id: string | null;
  created_at: string;
}

export interface ReconciliationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const reconciliationApi = {
  importStatement(
    organizationId: string,
    input: {
      file: File;
      accountId: string;
      statementName: string;
    },
  ) {
    const formData = new FormData();
    formData.append("file", input.file);
    formData.append("accountId", input.accountId);
    formData.append("statementName", input.statementName);

    return request<{
      message: string;
      reconciliation: Reconciliation;
      items: ReconciliationItem[];
    }>(`/organizations/${organizationId}/reconciliations`, {
      method: "POST",
      body: formData,
    });
  },

  list(
    organizationId: string,
    filters: { page?: number; limit?: number } = {},
  ) {
    const params = new URLSearchParams();
    params.set("page", String(filters.page ?? 1));
    params.set("limit", String(filters.limit ?? 20));

    return request<{
      items: Reconciliation[];
      pagination: ReconciliationPagination;
    }>(
      `/organizations/${organizationId}/reconciliations?${params.toString()}`,
    );
  },

  details(
    organizationId: string,
    reconciliationId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: "matched" | "unmatched";
    } = {},
  ) {
    const params = new URLSearchParams();
    params.set("page", String(filters.page ?? 1));
    params.set("limit", String(filters.limit ?? 20));

    if (filters.status) {
      params.set("status", filters.status);
    }

    return request<{
      reconciliation: Reconciliation;
      items: ReconciliationItem[];
      pagination: ReconciliationPagination;
    }>(
      `/organizations/${organizationId}/reconciliations/${reconciliationId}?${params.toString()}`,
    );
  },
};
