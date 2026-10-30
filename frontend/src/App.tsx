import { useEffect, useState } from "react";

import {
  Activity,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Command,
  CreditCard,
  Download,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";

import {
  accountsApi,
  ledgerApi,
  reconciliationApi,
  type Account,
  type CurrentUser,
  type LedgerTransaction,
  type Reconciliation,
  type ReconciliationItem,
} from "./services/api";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const navigation = [
  {
    section: "WORKSPACE",
    items: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Accounts", icon: Wallet },
      { label: "Transactions", icon: ArrowLeftRight },
    ],
  },
  {
    section: "MANAGEMENT",
    items: [
      { label: "Reconciliation", icon: Check },
      { label: "Reports", icon: FileText },
      { label: "Audit trail", icon: ShieldCheck },
    ],
  },
];

const accountStyles: Record<Account["account_type"], string> = {
  asset: "bg-emerald-50 text-emerald-700",
  liability: "bg-amber-50 text-amber-700",
  equity: "bg-indigo-50 text-indigo-700",
  income: "bg-sky-50 text-sky-700",
  expense: "bg-violet-50 text-violet-700",
};

const formatPaiseINR = (paise: bigint) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100);

function App({ currentUser }: { currentUser: CurrentUser }) {
  const organization = currentUser.organizations[0];
  
async function handleImportStatement(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!organization?.id) {
    setImportStatementError("No organization is selected.");
    return;
  }

  if (!statementName.trim() || !statementAccountId || !statementFile) {
    setImportStatementError(
      "Enter a statement name, select a bank account, and choose a CSV file.",
    );
    return;
  }

  if (!statementFile.name.toLowerCase().endsWith(".csv")) {
    setImportStatementError("Please select a CSV file.");
    return;
  }

  if (statementFile.size > 2 * 1024 * 1024) {
    setImportStatementError("The CSV file must be smaller than 2 MB.");
    return;
  }

  setImportingStatement(true);
  setImportStatementError("");

  try {
    const result = await reconciliationApi.importStatement(organization.id, {
      file: statementFile,
      accountId: statementAccountId,
      statementName: statementName.trim(),
    });

    setStatementName("");
    setStatementAccountId("");
    setStatementFile(null);
    setShowImportForm(false);
    setSelectedReconciliation(result.reconciliation);
    setReconciliationRefreshKey((previous) => previous + 1);
  } catch (error) {
    setImportStatementError(
      error instanceof Error
        ? error.message
        : "Failed to import the bank statement.",
    );
  } finally {
    setImportingStatement(false);
  }
}


  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");

  const [activePage, setActivePage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] =
    useState<Account["account_type"]>("asset");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createAccountError, setCreateAccountError] = useState("");
  const [createAccountSuccess, setCreateAccountSuccess] = useState("");
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionDescription, setTransactionDescription] = useState("");
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState("");
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState("");
  const [transactionsRefreshKey, setTransactionsRefreshKey] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const [historyTransactions, setHistoryTransactions] = useState<
    LedgerTransaction[]
  >([]);

  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  
const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
const [reconciliationsLoading, setReconciliationsLoading] = useState(false);
const [reconciliationsError, setReconciliationsError] = useState("");

const [selectedReconciliation, setSelectedReconciliation] =
  useState<Reconciliation | null>(null);
const [reconciliationItems, setReconciliationItems] =
  useState<ReconciliationItem[]>([]);
const [reconciliationDetailsLoading, setReconciliationDetailsLoading] =
  useState(false);
const [reconciliationDetailsError, setReconciliationDetailsError] =
  useState("");
const [reconciliationStatusFilter, setReconciliationStatusFilter] =
  useState<"all" | "matched" | "unmatched">("all");
const [reconciliationRefreshKey, setReconciliationRefreshKey] = useState(0);

const [showImportForm, setShowImportForm] = useState(false);
const [statementName, setStatementName] = useState("");
const [statementAccountId, setStatementAccountId] = useState("");

const [statementFile, setStatementFile] = useState<File | null>(null);
const [importingStatement, setImportingStatement] = useState(false);
const [importStatementError, setImportStatementError] = useState("");


  const [trialBalance, setTrialBalance] = useState<{
    totalDebitsPaise: string;
    totalCreditsPaise: string;
    isBalanced: boolean;
    accounts: {
      accountId: string;
      accountName: string;
      accountType: string;
      debitBalancePaise: string;
      creditBalancePaise: string;
    }[];
  } | null>(null);
  const [cashFlow, setCashFlow] = useState<
    { month: string; income_paise: string; expenses_paise: string }[]
  >([]);
  const [cashFlowLoading, setCashFlowLoading] = useState(true);
  const [cashFlowError, setCashFlowError] = useState("");

  const [trialBalanceError, setTrialBalanceError] = useState("");

  useEffect(() => {
    if (!organization?.id) {
      setAccounts([]);
      setAccountsLoading(false);
      setAccountsError("No organization is available for this account.");
      return;
    }

    let cancelled = false;

    setAccountsLoading(true);
    setAccountsError("");

    accountsApi
      .list(organization.id)
      .then(({ accounts: result }) => {
        if (!cancelled) {
          setAccounts(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAccountsError(
            error instanceof Error
              ? error.message
              : "Unable to load accounts.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organization?.id, transactionsRefreshKey]);
  
useEffect(() => {
  if (!organization?.id) return;

  let cancelled = false;

  async function loadReconciliations() {
    setReconciliationsLoading(true);
    setReconciliationsError("");

    try {
      const result = await reconciliationApi.list(organization.id);

      if (!cancelled) {
        setReconciliations(result.items);
      }
    } catch (error) {
      if (!cancelled) {
        setReconciliationsError(
          error instanceof Error
            ? error.message
            : "Failed to load reconciliation statements.",
        );
      }
    } finally {
      if (!cancelled) {
        setReconciliationsLoading(false);
      }
    }
  }

  void loadReconciliations();

  return () => {
    cancelled = true;
  };
}, [organization?.id, reconciliationRefreshKey]);

useEffect(() => {
  if (!organization?.id || !selectedReconciliation) {
    setReconciliationItems([]);
    return;
  }
  const reconciliationId = selectedReconciliation.id;

  let cancelled = false;

  async function loadReconciliationDetails() {
    setReconciliationDetailsLoading(true);
    setReconciliationDetailsError("");

    try {
      const result = await reconciliationApi.details(
        organization.id,
       
        reconciliationId,
        {
          page: 1,
          limit: 100,
          ...(reconciliationStatusFilter !== "all"
            ? { status: reconciliationStatusFilter }
            : {}),
        },
      );

      if (!cancelled) {
        setReconciliationItems(result.items);
      }
    } catch (error) {
      if (!cancelled) {
        setReconciliationDetailsError(
          error instanceof Error
            ? error.message
            : "Failed to load reconciliation details.",
        );
      }
    } finally {
      if (!cancelled) {
        setReconciliationDetailsLoading(false);
      }
    }
  }

  void loadReconciliationDetails();

  return () => {
    cancelled = true;
  };
}, [organization?.id, selectedReconciliation?.id, reconciliationStatusFilter]);



  const getNetBalancePaise = (accountType: string) => {
    if (!trialBalance) return 0n;

    return trialBalance.accounts
      .filter((account) => account.accountType === accountType)
      .reduce((total, account) => {
        const debit = BigInt(account.debitBalancePaise);
        const credit = BigInt(account.creditBalancePaise);

        const normalDebit =
          accountType === "asset" || accountType === "expense";

        return total + (normalDebit ? debit - credit : credit - debit);
      }, 0n);
  };

  const financialCards = [
    {
      title: "Total assets",
      amount: getNetBalancePaise("asset"),
      change: "From posted entries",
      subtitle: "Net asset balance",
      icon: Wallet,
      iconStyle: "bg-emerald-50 text-emerald-700",
      positive: true,
    },
    {
      title: "Total liabilities",
      amount: getNetBalancePaise("liability"),
      change: "From posted entries",
      subtitle: "Net liability balance",
      icon: CreditCard,
      iconStyle: "bg-amber-50 text-amber-700",
      positive: false,
    },
    {
      title: "Total income",
      amount: getNetBalancePaise("income"),
      change: "From posted entries",
      subtitle: "Cumulative income balance",
      icon: ArrowDownLeft,
      iconStyle: "bg-sky-50 text-sky-700",
      positive: true,
    },
    {
      title: "Total expenses",
      amount: getNetBalancePaise("expense"),
      change: "From posted entries",
      subtitle: "Cumulative expense balance",
      icon: ArrowUpRight,
      iconStyle: "bg-violet-50 text-violet-700",
      positive: true,
    },
  ];

  const filteredTransactions = transactions.filter((transaction) =>
    `${transaction.description} ${transaction.id} ${transaction.reference ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const navigate = (page: string) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  async function handleCreateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization?.id) {
      setCreateAccountError("No organization selected.");
      return;
    }

    setCreatingAccount(true);
    setCreateAccountError("");
    setCreateAccountSuccess("");

    try {
      await accountsApi.create(organization.id, {
        name: accountName.trim(),
        accountType,
      });

      const result = await accountsApi.list(organization.id);

      setAccounts(result.accounts);

      setAccountName("");
      setAccountType("asset");
      setShowCreateAccount(false);
      setCreateAccountSuccess("Account created successfully.");
    } catch (error) {
      setCreateAccountError(
        error instanceof Error ? error.message : "Failed to create account.",
      );
    } finally {
      setCreatingAccount(false);
    }
  }

  useEffect(() => {
    if (!organization?.id) {
      setTrialBalance(null);
      return;
    }

    let cancelled = false;

    ledgerApi
      .trialBalance(organization.id)
      .then(({ trialBalance: result }) => {
        if (!cancelled) {
          setTrialBalance(result);
          setTrialBalanceError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTrialBalanceError(
            error instanceof Error
              ? error.message
              : "Unable to load financial summary.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organization?.id, transactionsRefreshKey]);

  useEffect(() => {
    if (!organization?.id) {
      setCashFlow([]);
      setCashFlowLoading(false);
      return;
    }

    let cancelled = false;
    setCashFlowLoading(true);

    ledgerApi
      .monthlyCashFlow(organization.id)
      .then(({ months }) => {
        if (!cancelled) {
          setCashFlow(months);
          setCashFlowError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCashFlowError(
            error instanceof Error
              ? error.message
              : "Unable to load cash flow.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCashFlowLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organization?.id, transactionsRefreshKey]);

  useEffect(() => {
    if (!organization?.id) {
      setTransactions([]);
      setTransactionsLoading(false);
      setTransactionsError("No organization selected.");
      return;
    }

    let cancelled = false;

    setTransactionsLoading(true);
    setTransactionsError("");

    ledgerApi
      .list(organization.id)
      .then(({ transactions: result }) => {
        if (!cancelled) {
          setTransactions(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTransactionsError(
            error instanceof Error
              ? error.message
              : "Unable to load transactions.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTransactionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organization?.id, transactionsRefreshKey]);

  useEffect(() => {
    if (activePage !== "Transactions") return;

    if (!organization?.id) {
      setHistoryTransactions([]);
      setHistoryTotal(0);
      setHistoryTotalPages(1);
      setHistoryError("No organization selected.");
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;

    setHistoryLoading(true);
    setHistoryError("");

    ledgerApi
      .list(organization.id, {
        page: historyPage,
        limit: 10,
        search: historySearch,
        from: historyFrom,
        to: historyTo,
      })
      .then(({ transactions: result, pagination }) => {
        if (cancelled) return;

        setHistoryTransactions(result);
        setHistoryTotal(pagination.total);
        setHistoryTotalPages(Math.max(1, pagination.totalPages));
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setHistoryError(
          error instanceof Error
            ? error.message
            : "Unable to load transaction history.",
        );
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    organization?.id,
    historyPage,
    historySearch,
    historyFrom,
    historyTo,
    transactionsRefreshKey,
  ]);

  async function handleCreateTransaction(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!organization?.id) {
      setTransactionError("No organization selected.");
      return;
    }

    const amount = Number(transactionAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setTransactionError("Enter an amount greater than zero.");
      return;
    }

    if (!debitAccountId || !creditAccountId) {
      setTransactionError("Select both accounts.");
      return;
    }

    if (debitAccountId === creditAccountId) {
      setTransactionError("Select two different accounts.");
      return;
    }

    setTransactionLoading(true);
    setTransactionError("");
    setTransactionSuccess("");

    try {
      await ledgerApi.create(organization.id, {
        description: transactionDescription.trim(),
        entries: [
          {
            accountId: debitAccountId,
            entryType: "debit",
            amountPaise: Math.round(amount * 100),
          },
          {
            accountId: creditAccountId,
            entryType: "credit",
            amountPaise: Math.round(amount * 100),
          },
        ],
      });

      setTransactionDescription("");
      setTransactionAmount("");
      setDebitAccountId("");
      setCreditAccountId("");
      setShowTransactionForm(false);
      setTransactionSuccess("Transaction created successfully.");
      setTransactionsRefreshKey((previous) => previous + 1);
    } catch (error) {
      setTransactionError(
        error instanceof Error
          ? error.message
          : "Unable to create transaction.",
      );
    } finally {
      setTransactionLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#172033]">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col bg-[#111827] text-slate-300 transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-white/[0.08] px-6">
          <button
            onClick={() => navigate("Dashboard")}
            className="flex items-center gap-3 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-[#10251e]">
              <Activity size={21} strokeWidth={2.5} />
            </span>
            <span>
              <span className="block text-[17px] font-bold tracking-tight text-white">
                LedgerFlow
              </span>
              <span className="mt-0.5 block text-[10px] tracking-[0.16em] text-slate-400">
                FINANCIAL OPERATIONS
              </span>
            </span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pt-6">
          <div className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-400/15 text-indigo-300">
              <BriefcaseBusiness size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {organization?.name ?? "No workspace"}
              </span>
              <span className="mt-1 block text-xs capitalize text-slate-400">
                {organization?.role?.replace("_", " ") ?? "No role"}
              </span>
            </span>
            <ChevronDown size={16} className="text-slate-500" />
          </div>
        </div>

        <nav className="flex-1 space-y-7 overflow-y-auto px-4 py-7">
          {navigation.map((group) => (
            <div key={group.section}>
              <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-500">
                {group.section}
              </p>
              <div className="space-y-1">
                {group.items.map(({ label, icon: Icon }) => {
                  const active = activePage === label;

                  return (
                    <button
                      key={label}
                      onClick={() => navigate(label)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${
                        active
                          ? "bg-emerald-400/10 font-medium text-emerald-300"
                          : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                      {label}
                      {label === "Audit trail" && (
                        <span className="ml-auto rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-slate-400">
                          LOG
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-500">
              PREFERENCES
            </p>
            <button
              onClick={() => navigate("Settings")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] ${
                activePage === "Settings"
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <Settings size={18} />
              Settings
            </button>
          </div>
        </nav>

        <div className="border-t border-white/[0.08] p-4">
          <div className="mb-4 flex items-center gap-3 rounded-xl p-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-600 text-xs font-bold text-[#10251e]">
              {currentUser.user.name
                .split(/\s+/)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {currentUser.user.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {organization?.role?.replace("_", " ") ?? "Member"} access
              </p>
            </div>
            <button
              onClick={() => navigate("Settings")}
              aria-label="Account settings"
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10"
              title="Account settings"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 px-2 text-[11px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LedgerFlow workspace
            <span className="ml-auto">v1.0</span>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-[252px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={21} />
            </button>
            <div>
              <p className="text-xs text-slate-400">
                Workspace / {activePage}
              </p>
              <h1 className="mt-1 text-base font-semibold tracking-tight text-slate-800">
                {activePage}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <label className="hidden h-10 w-56 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-emerald-500 md:flex">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transactions..."
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
              />
              <Command size={13} className="text-slate-400" />
            </label>

            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notifications"
                className="relative rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
              >
                <Bell size={18} />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <p className="text-sm font-semibold text-slate-800">
                    Notifications
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    You&apos;re all caught up. Live notifications will appear
                    here when connected.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate("Settings")}
              aria-label="Help and settings"
              className="hidden rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 sm:block"
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>

        {showTransactionForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <form
              onSubmit={handleCreateTransaction}
              className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  New transaction
                </h2>
                <button
                  type="button"
                  aria-label="Close form"
                  onClick={() => setShowTransactionForm(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Description
                </label>
                <input
                  required
                  minLength={2}
                  maxLength={500}
                  value={transactionDescription}
                  onChange={(event) =>
                    setTransactionDescription(event.target.value)
                  }
                  placeholder="e.g. Office rent payment"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Debit account
                </label>
                <select
                  required
                  value={debitAccountId}
                  onChange={(event) => setDebitAccountId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select debit account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.account_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Credit account
                </label>
                <select
                  required
                  value={creditAccountId}
                  onChange={(event) => setCreditAccountId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select credit account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.account_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Amount (INR ₹)
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={transactionAmount}
                  onChange={(event) =>
                    setTransactionAmount(event.target.value)
                  }
                  placeholder="1000.00"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              {transactionError && (
                <p role="alert" className="text-sm text-rose-600">
                  {transactionError}
                </p>
              )}

              <button
                type="submit"
                disabled={transactionLoading || accounts.length < 2}
                className="w-full rounded-lg bg-[#172b25] px-4 py-3 text-sm font-medium text-white hover:bg-[#24483b] disabled:opacity-50"
              >
                {transactionLoading ? "Submitting..." : "Create transaction"}
              </button>

              {accounts.length < 2 && (
                <p className="text-xs text-amber-700">
                  Create at least two accounts before recording a transaction.
                </p>
              )}
            </form>
          </div>
        )}

        {transactionSuccess && (
          <p role="status" className="mx-4 mt-4 text-sm text-emerald-700">
            {transactionSuccess}
          </p>
        )}

        <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          {activePage === "Accounts" ? (
            <section>
              <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="mb-2 text-xs font-medium text-emerald-700">
                    FINANCIAL SETUP
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Chart of accounts
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Manage the accounts your organization uses to record financial activity.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCreateAccount((visible) => !visible);
                    setCreateAccountError("");
                    setCreateAccountSuccess("");
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#172b25] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#24483b]"
                >
                  <Plus size={16} />
                  {showCreateAccount ? "Close form" : "Create account"}
                </button>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
                {(["asset", "liability", "equity", "income", "expense"] as const).map((type) => (
                  <div
                    key={type}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <p className="text-xs capitalize text-slate-500">{type}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {accounts.filter((account) => account.account_type === type).length}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">Accounts</p>
                  </div>
                ))}
              </div>

              {showCreateAccount && (
                <form
                  onSubmit={handleCreateAccount}
                  className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
                >
                  <div className="sm:col-span-2">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Create a new account
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Choose a clear name and the account&apos;s accounting category.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="accountsPageAccountName" className="mb-1.5 block text-xs font-medium text-slate-600">
                      Account name
                    </label>
                    <input
                      id="accountsPageAccountName"
                      value={accountName}
                      onChange={(event) => setAccountName(event.target.value)}
                      minLength={2}
                      maxLength={120}
                      required
                      placeholder="e.g. Operating Bank Account"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="accountsPageAccountType" className="mb-1.5 block text-xs font-medium text-slate-600">
                      Account type
                    </label>
                    <select
                      id="accountsPageAccountType"
                      value={accountType}
                      onChange={(event) => setAccountType(event.target.value as Account["account_type"])}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
                    >
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                      <option value="equity">Equity</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  {createAccountError && (
                    <p role="alert" className="text-xs text-rose-600 sm:col-span-2">
                      {createAccountError}
                    </p>
                  )}
                  <div className="flex gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={creatingAccount}
                      className="rounded-lg bg-[#172b25] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#24483b] disabled:opacity-50"
                    >
                      {creatingAccount ? "Creating..." : "Save account"}
                    </button>
                    <button
                      type="button"
                      disabled={creatingAccount}
                      onClick={() => {
                        setShowCreateAccount(false);
                        setCreateAccountError("");
                      }}
                      className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {createAccountSuccess && (
                <p role="status" className="mb-4 text-sm text-emerald-700">
                  {createAccountSuccess}
                </p>
              )}

              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">All accounts</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {accounts.length} {accounts.length === 1 ? "account" : "accounts"} in this organization
                  </p>
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:w-72">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                    placeholder="Search accounts..."
                    className="min-w-0 flex-1 text-sm outline-none"
                  />
                </label>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {accountsLoading ? (
                  <p className="px-5 py-12 text-center text-sm text-slate-400">
                    Loading accounts...
                  </p>
                ) : accountsError ? (
                  <div className="px-5 py-12 text-center">
                    <p role="alert" className="text-sm text-rose-600">{accountsError}</p>
                    <button
                      onClick={() => setTransactionsRefreshKey((previous) => previous + 1)}
                      className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Try again
                    </button>
                  </div>
                ) : accounts.filter((account) =>
                    `${account.name} ${account.account_type} ${account.currency} ${account.status}`
                      .toLowerCase()
                      .includes(accountSearch.toLowerCase())
                  ).length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <Wallet size={28} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-sm font-medium text-slate-700">
                      {accounts.length === 0 ? "No accounts yet" : "No matching accounts"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {accounts.length === 0
                        ? "Create an account to start organizing your financial records."
                        : "Try a different search term."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          {["ACCOUNT", "TYPE", "CURRENCY", "STATUS"].map((heading) => (
                            <th key={heading} className="border-b border-slate-100 px-5 py-3.5 text-[10px] font-semibold tracking-wider text-slate-400">
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {accounts
                          .filter((account) =>
                            `${account.name} ${account.account_type} ${account.currency} ${account.status}`
                              .toLowerCase()
                              .includes(accountSearch.toLowerCase())
                          )
                          .map((account) => (
                            <tr key={account.id} className="hover:bg-slate-50/70">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accountStyles[account.account_type]}`}>
                                    <Wallet size={16} />
                                  </span>
                                  <div>
                                    <p className="text-sm font-medium text-slate-800">{account.name}</p>
                                    <p className="mt-1 text-[10px] text-slate-400">ID: {account.id}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${accountStyles[account.account_type]}`}>
                                  {account.account_type}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-xs text-slate-500">{account.currency}</td>
                              <td className="px-5 py-4">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] capitalize text-slate-600">
                                  {account.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          ) : activePage === "Transactions" ? (
            <section>
              <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Transaction history
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Search, review, and track your organization&apos;s posted
                    transactions.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setTransactionError("");
                    setTransactionSuccess("");
                    setShowTransactionForm(true);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#172b25] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#24483b]"
                >
                  <Plus size={16} />
                  New transaction
                </button>
              </div>

              <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">
                      Search transactions
                    </span>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
                      <Search size={16} className="text-slate-400" />
                      <input
                        value={historySearch}
                        onChange={(event) => {
                          setHistorySearch(event.target.value);
                          setHistoryPage(1);
                        }}
                        placeholder="Description, reference, or ID"
                        className="w-full py-2.5 text-sm outline-none"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">
                      From date
                    </span>
                    <input
                      type="date"
                      value={historyFrom}
                      max={historyTo || undefined}
                      onChange={(event) => {
                        setHistoryFrom(event.target.value);
                        setHistoryPage(1);
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">
                      To date
                    </span>
                    <input
                      type="date"
                      value={historyTo}
                      min={historyFrom || undefined}
                      onChange={(event) => {
                        setHistoryTo(event.target.value);
                        setHistoryPage(1);
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                    />
                  </label>
                </div>

                <button
                  onClick={() => {
                    setHistorySearch("");
                    setHistoryFrom("");
                    setHistoryTo("");
                    setHistoryPage(1);
                  }}
                  className="mt-4 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                >
                  Clear filters
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {historyError ? (
                  <div
                    role="alert"
                    className="p-8 text-center text-sm text-rose-600"
                  >
                    {historyError}
                    <button
                      onClick={() =>
                        setTransactionsRefreshKey((previous) => previous + 1)
                      }
                      className="ml-2 font-medium underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          {[
                            "TRANSACTION",
                            "DATE",
                            "REFERENCE",
                            "AMOUNT",
                            "STATUS",
                          ].map((heading) => (
                            <th
                              key={heading}
                              className="border-b border-slate-100 px-5 py-3.5 text-[10px] font-semibold tracking-wider text-slate-400"
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {historyLoading ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-5 py-12 text-center text-sm text-slate-400"
                            >
                              Loading transaction history...
                            </td>
                          </tr>
                        ) : historyTransactions.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-5 py-12 text-center text-sm text-slate-400"
                            >
                              No transactions found. Try changing your filters.
                            </td>
                          </tr>
                        ) : (
                          historyTransactions.map((transaction) => (
                            <tr
                              key={transaction.id}
                              className="hover:bg-slate-50/70"
                            >
                              <td className="px-5 py-4">
                                <p className="text-sm font-medium text-slate-800">
                                  {transaction.description}
                                </p>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  ID: {transaction.id}
                                </p>
                              </td>

                              <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                                {new Date(
                                  transaction.posted_at ??
                                    transaction.created_at,
                                ).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>

                              <td className="px-5 py-4 text-xs text-slate-500">
                                {transaction.reference ?? "—"}
                              </td>

                              <td className="whitespace-nowrap px-5 py-4 text-right text-xs font-medium text-slate-900">
                                {transaction.amount_paise != null
                                  ? formatPaiseINR(
                                      BigInt(transaction.amount_paise),
                                    )
                                  : "—"}
                              </td>

                              <td className="px-5 py-4">
                                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium capitalize text-emerald-700">
                                  {transaction.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    {historyTotal === 0
                      ? "No transactions"
                      : `Showing ${(historyPage - 1) * 10 + 1}–${Math.min(historyPage * 10, historyTotal)} of ${historyTotal} transactions`}
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      disabled={historyPage <= 1 || historyLoading}
                      onClick={() =>
                        setHistoryPage((page) => Math.max(1, page - 1))
                      }
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <span className="text-xs text-slate-500">
                      Page {historyPage} of {historyTotalPages}
                    </span>

                    <button
                      disabled={historyPage >= historyTotalPages || historyLoading}
                      onClick={() =>
                        setHistoryPage((page) =>
                          Math.min(historyTotalPages, page + 1),
                        )
                      }
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </section>
                    ) : activePage === "Reconciliation" ? (
            <section>
             
 
<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
  <div>
    <h2 className="text-2xl font-semibold text-slate-900">
      Bank reconciliation
    </h2>
    <p className="mt-2 text-sm text-slate-500">
      Import bank statements and review matched and unmatched transactions.
    </p>
  </div>

  <button
    type="button"
    onClick={() => {
      setShowImportForm((visible) => !visible);
      setImportStatementError("");
    }}
    className="rounded-xl bg-[#172b25] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#24483b]"
  >
    {showImportForm ? "Close import form" : "Import statement"}
  </button>
</div>

{showImportForm && (
  <form
    onSubmit={handleImportStatement}
    className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"
  >
    <h3 className="text-lg font-semibold text-slate-900">
      Import bank statement
    </h3>
    <p className="mt-1 text-sm text-slate-500">
      Upload a CSV file to compare bank transactions with your ledger.
    </p>

    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label
          htmlFor="statementName"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Statement name
        </label>
        <input
          id="statementName"
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={statementName}
          onChange={(event) => setStatementName(event.target.value)}
          placeholder="e.g. October bank statement"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-700"
        />
      </div>

      <div>
        <label
          htmlFor="statementAccount"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Bank account
        </label>
        <select
          id="statementAccount"
          required
          value={statementAccountId}
          onChange={(event) => setStatementAccountId(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="">Select a bank account</option>
          {accounts
            .filter(
              (account) =>
                account.account_type === "asset" &&
                account.status === "active",
            )
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor="statementFile"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          CSV file
        </label>
        <input
          id="statementFile"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={(event) =>
            setStatementFile(event.target.files?.[0] ?? null)
          }
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
        />
        <p className="mt-2 text-xs text-slate-500">
          Required columns: transaction_date, description, amount.
          Optional: reference. Use YYYY-MM-DD dates and decimal amounts.
          Maximum file size: 2 MB.
        </p>
      </div>
    </div>

    {importStatementError && (
      <p role="alert" className="mt-4 text-sm text-rose-600">
        {importStatementError}
      </p>
    )}

    <div className="mt-5 flex flex-wrap gap-3">
      <button
        type="submit"
        disabled={importingStatement}
        className="rounded-xl bg-[#172b25] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#24483b] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {importingStatement ? "Importing statement..." : "Import CSV"}
      </button>

      <button
        type="button"
        disabled={importingStatement}
        onClick={() => {
          setShowImportForm(false);
          setImportStatementError("");
        }}
        className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  </form>
)}

<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <p className="text-xs text-slate-500">Statements imported</p>
    <p className="mt-2 text-2xl font-semibold">
      {reconciliations.length}
    </p>
  </div>

  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <p className="text-xs text-slate-500">Rows matched</p>
    <p className="mt-2 text-2xl font-semibold text-emerald-700">
      {reconciliations.reduce(
        (total, item) => total + item.matched_rows,
        0,
      )}
    </p>
  </div>

  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <p className="text-xs text-slate-500">Rows unmatched</p>
    <p className="mt-2 text-2xl font-semibold text-amber-600">
      {reconciliations.reduce(
        (total, item) => total + item.unmatched_rows,
        0,
      )}
    </p>
  </div>
</div>


              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                
{showImportForm && (
 
<form
  onSubmit={handleImportStatement}
  className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"
>
    <h3 className="text-lg font-semibold text-slate-900">
      Import bank statement
    </h3>
    <p className="mt-1 text-sm text-slate-500">
      Upload a CSV file to compare bank transactions with your ledger.
    </p>

    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label
          htmlFor="statementName"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Statement name
        </label>
        <input
          id="statementName"
          type="text"
          value={statementName}
          onChange={(event) => setStatementName(event.target.value)}
          placeholder="e.g. October bank statement"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-700"
        />
      </div>

      <div>
        <label
          htmlFor="statementAccount"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Bank account
        </label>
        <select
          id="statementAccount"
          value={statementAccountId}
          onChange={(event) => setStatementAccountId(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="">Select a bank account</option>
          {accounts
            .filter(
              (account) =>
                account.account_type === "asset" &&
                account.status === "active",
            )
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor="statementFile"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          CSV file
        </label>
        <input
          id="statementFile"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) =>
            setStatementFile(event.target.files?.[0] ?? null)
          }
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
        />
        <p className="mt-2 text-xs text-slate-500">
          Required columns: transaction_date, description, amount. Optional:
          reference. Use YYYY-MM-DD dates and decimal amounts.
        </p>
      </div>
    </div>
  </form>
)}

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Statements imported</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {reconciliations.length}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Rows matched</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-700">
                    {reconciliations.reduce((total, item) => total + item.matched_rows, 0)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Rows unmatched</p>
                  <p className="mt-2 text-2xl font-semibold text-amber-600">
                    {reconciliations.reduce((total, item) => total + item.unmatched_rows, 0)}
                  </p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                {reconciliationsLoading ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    Loading statements...
                  </p>
                
) : reconciliationsError ? (
  <div className="p-8 text-center">
    <p role="alert" className="text-sm text-rose-600">
      {reconciliationsError}
    </p>
    <button
      onClick={() =>
        setReconciliationRefreshKey((previous) => previous + 1)
      }
      className="mt-3 text-xs font-medium text-emerald-700 hover:underline"
    >
      Try again
    </button>
  </div>
)
 : reconciliations.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No statements imported yet.
                  </p>
                ) : (
                  <table className="w-full min-w-[650px] text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        {["STATEMENT", "ACCOUNT", "ROWS", "MATCHED", "UNMATCHED"].map((heading) => (
                          <th key={heading} className="px-4 py-3 text-xs text-slate-500">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reconciliations.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => {
                                setSelectedReconciliation(item);
                                setReconciliationStatusFilter("all");
                              }}
                              className="text-left text-sm font-medium text-emerald-800 hover:underline"
                            >
                              {item.statement_name}
                            </button>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {item.account_name}
                          </td>
                          <td className="px-4 py-4 text-sm">{item.total_rows}</td>
                          <td className="px-4 py-4 text-sm text-emerald-700">
                            {item.matched_rows}
                          </td>
                          <td className="px-4 py-4 text-sm text-amber-600">
                            {item.unmatched_rows}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {selectedReconciliation && (
                <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {selectedReconciliation.statement_name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Review individual bank statement rows.
                      </p>
                    </div>

                    <button
                      onClick={() => setSelectedReconciliation(null)}
                      className="self-start rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 sm:self-auto"
                    >
                      Close details
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 p-5 pb-0">
                    {(["all", "matched", "unmatched"] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setReconciliationStatusFilter(status)}
                        className={`rounded-lg px-3 py-2 text-sm capitalize ${
                          reconciliationStatusFilter === status
                            ? "bg-emerald-800 text-white"
                            : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {status === "all" ? "All rows" : status}
                      </button>
                    ))}
                  </div>

                  {reconciliationDetailsLoading ? (
                    <p className="p-6 text-sm text-slate-500">
                      Loading statement details...
                    </p>
                  ) : reconciliationDetailsError ? (
                    <p role="alert" className="p-6 text-sm text-rose-600">
                      {reconciliationDetailsError}
                    </p>
                  ) : reconciliationItems.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">
                      No rows found for this filter.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[700px] text-left">
                        <thead className="bg-slate-50">
                          <tr>
                            {["ROW", "DATE", "DESCRIPTION", "AMOUNT", "STATUS"].map(
                              (heading) => (
                                <th
                                  key={heading}
                                  className="px-4 py-3 text-xs font-medium text-slate-500"
                                >
                                  {heading}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reconciliationItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-4 text-sm text-slate-500">
                                {item.row_number}
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-600">
                                {item.transaction_date.slice(0, 10)}
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-800">
                                {item.description}
                              </td>
                              <td
                                className={`px-4 py-4 text-sm font-medium ${
                                  Number(item.amount_paise) >= 0
                                    ? "text-emerald-700"
                                    : "text-rose-600"
                                }`}
                              >
                                {new Intl.NumberFormat("en-IN", {
                                  style: "currency",
                                  currency: "INR",
                                }).format(Number(item.amount_paise) / 100)}
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    item.status === "matched"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </section>
          ) : (
            <>
              <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="mb-2 text-xs font-medium text-emerald-700">
                    FINANCIAL WORKSPACE
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
                    Financial overview
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Here&apos;s what&apos;s happening with your finances.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate("Reports")}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                  >
                    <Download size={15} />
                    Export report
                  </button>
                  <button
                    onClick={() => {
                      setTransactionError("");
                      setTransactionSuccess("");
                      setShowTransactionForm(true);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#172b25] px-4 py-2.5 text-xs font-medium text-white shadow-sm transition hover:bg-[#24483b]"
                  >
                    <Plus size={16} />
                    New transaction
                  </button>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {financialCards.map((card) => (
                  <SummaryCard
                    key={card.title}
                    title={card.title}
                    amount={
                      trialBalanceError
                        ? "Unavailable"
                        : trialBalance
                          ? formatPaiseINR(card.amount)
                          : "Loading..."
                    }
                    change={trialBalanceError ? "Could not load" : card.change}
                    subtitle={card.subtitle}
                    icon={card.icon}
                    iconStyle={card.iconStyle}
                    positive={card.positive}
                  />
                ))}
              </div>

              {trialBalanceError ? (
                <p role="alert" className="mb-6 text-xs text-rose-600">
                  Unable to load financial summary: {trialBalanceError}
                </p>
              ) : trialBalance ? (
                <p className="mb-6 text-xs text-slate-500">
                  Trial balance:{" "}
                  <span
                    className={
                      trialBalance.isBalanced
                        ? "font-medium text-emerald-700"
                        : "font-medium text-rose-600"
                    }
                  >
                    {trialBalance.isBalanced ? "Balanced" : "Out of balance"}
                  </span>
                  {" · "}Total debits:{" "}
                  {formatPaiseINR(BigInt(trialBalance.totalDebitsPaise))}
                  {" · "}Total credits:{" "}
                  {formatPaiseINR(BigInt(trialBalance.totalCreditsPaise))}
                </p>
              ) : (
                <p className="mb-6 text-xs text-slate-400">
                  Loading financial summary...
                </p>
              )}

              <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
                <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">
                        Cash flow
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Monthly income versus expenses
                      </p>
                    </div>
                    <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                      Last 6 months
                    </span>
                  </div>

                  {cashFlowLoading ? (
                    <div className="flex h-[250px] items-center justify-center text-sm text-slate-400">
                      Loading cash flow...
                    </div>
                  ) : cashFlowError ? (
                    <div
                      role="alert"
                      className="flex h-[250px] items-center justify-center text-sm text-rose-600"
                    >
                      {cashFlowError}
                    </div>
                  ) : (
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={cashFlow.map((item) => ({
                            month: new Date(
                              `${item.month}-01T00:00:00`,
                            ).toLocaleDateString("en-IN", { month: "short" }),
                            Income: Number(BigInt(item.income_paise)) / 100,
                            Expenses: Number(BigInt(item.expenses_paise)) / 100,
                          }))}
                          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(value) =>
                              value >= 100000
                                ? `₹${(value / 100000).toFixed(1)}L`
                                : value >= 1000
                                  ? `₹${(value / 1000).toFixed(0)}k`
                                  : `₹${value}`
                            }
                            width={45}
                          />
                          <Tooltip
                            formatter={(value) =>
                              `₹${Number(value).toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}`
                            }
                          />
                          <Legend />
                          <Bar
                            dataKey="Income"
                            fill="#059669"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="Expenses"
                            fill="#8b5cf6"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <p className="mt-4 text-[10px] text-slate-400">
                    Based on posted ledger entries. Amounts shown in INR.
                  </p>
                </section>

                <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
                  <div className="mb-6 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">
                        Account overview
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Your organization&apos;s accounts
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        onClick={() => {
                          setShowCreateAccount(true);
                          setCreateAccountError("");
                          setCreateAccountSuccess("");
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-[#172b25] px-3 py-2 text-xs font-medium text-white hover:bg-[#24483b]"
                      >
                        <Plus size={14} />
                        Create
                      </button>

                      <button
                        onClick={() => navigate("Accounts")}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                      >
                        View all
                      </button>
                    </div>
                  </div>

                  {showCreateAccount && (
                    <form
                      onSubmit={handleCreateAccount}
                      className="mb-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <h4 className="text-sm font-semibold text-slate-800">
                        Create account
                      </h4>

                      <div>
                        <label
                          htmlFor="accountName"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Account name
                        </label>
                        <input
                          id="accountName"
                          value={accountName}
                          onChange={(event) => setAccountName(event.target.value)}
                          minLength={2}
                          maxLength={120}
                          required
                          placeholder="e.g. Operating Bank Account"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="accountType"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Account type
                        </label>
                        <select
                          id="accountType"
                          value={accountType}
                          onChange={(event) =>
                            setAccountType(
                              event.target.value as Account["account_type"],
                            )
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                        >
                          <option value="asset">Asset</option>
                          <option value="liability">Liability</option>
                          <option value="equity">Equity</option>
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                        </select>
                      </div>

                      {createAccountError && (
                        <p role="alert" className="text-xs text-rose-600">
                          {createAccountError}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={creatingAccount}
                          className="rounded-lg bg-[#172b25] px-3 py-2 text-xs font-medium text-white hover:bg-[#24483b] disabled:opacity-50"
                        >
                          {creatingAccount ? "Creating..." : "Save account"}
                        </button>

                        <button
                          type="button"
                          disabled={creatingAccount}
                          onClick={() => {
                            setShowCreateAccount(false);
                            setCreateAccountError("");
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {createAccountSuccess && (
                    <p role="status" className="mb-4 text-xs text-emerald-700">
                      {createAccountSuccess}
                    </p>
                  )}

                  <div className="space-y-4">
                    {accountsLoading ? (
                      <p className="py-8 text-center text-xs text-slate-400">
                        Loading accounts...
                      </p>
                    ) : accountsError ? (
                      <div className="py-6 text-center">
                        <p className="text-xs text-rose-600">{accountsError}</p>
                        <button
                          onClick={() => {
                            if (!organization?.id) return;
                            setAccountsError("");
                            setAccountsLoading(true);
                            accountsApi
                              .list(organization.id)
                              .then(({ accounts: result }) =>
                                setAccounts(result),
                              )
                              .catch((error: unknown) =>
                                setAccountsError(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to load accounts.",
                                ),
                              )
                              .finally(() => setAccountsLoading(false));
                          }}
                          className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Try again
                        </button>
                      </div>
                    ) : accounts.length === 0 ? (
                      <div className="py-8 text-center">
                        <Wallet
                          className="mx-auto mb-3 text-slate-300"
                          size={28}
                        />
                        <p className="text-sm font-medium text-slate-700">
                          No accounts yet
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Accounts you create will appear here.
                        </p>
                        <button
                          onClick={() => navigate("Accounts")}
                          className="mt-4 rounded-lg bg-[#172b25] px-3 py-2 text-xs font-medium text-white hover:bg-[#24483b]"
                        >
                          Manage accounts
                        </button>
                      </div>
                    ) : (
                      accounts.slice(0, 5).map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50"
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accountStyles[account.account_type]}`}
                          >
                            <Wallet size={17} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-700">
                              {account.name}
                            </p>
                            <p className="mt-1 text-[10px] capitalize text-slate-400">
                              {account.account_type} · {account.currency}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
                            {account.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
                <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:px-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      Recent transactions
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Latest posted ledger transactions
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("Transactions")}
                    className="flex items-center gap-2 self-start text-xs font-medium text-emerald-700 hover:text-emerald-900 sm:self-auto"
                  >
                    View all transactions
                    <ArrowUpRight size={14} />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[740px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        {[
                          "TRANSACTION",
                          "DATE",
                          "REFERENCE",
                          "AMOUNT",
                          "STATUS",
                          "",
                        ].map((heading, index) => (
                          <th
                            key={`${heading}-${index}`}
                            className="px-6 py-3.5 text-[10px] font-semibold tracking-[0.08em] text-slate-400"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {transactionsLoading ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-12 text-center text-sm text-slate-400"
                          >
                            Loading transactions...
                          </td>
                        </tr>
                      ) : transactionsError ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-12 text-center text-sm text-rose-600"
                          >
                            {transactionsError}
                          </td>
                        </tr>
                      ) : filteredTransactions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-12 text-center text-sm text-slate-400"
                          >
                            {transactions.length === 0
                              ? "No transactions yet. Create your first transaction."
                              : "No transactions match your search."}
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.slice(0, 5).map((transaction) => (
                          <tr
                            key={transaction.id}
                            className="transition hover:bg-slate-50/70"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-semibold uppercase text-emerald-700">
                                  {transaction.description.slice(0, 2)}
                                </span>
                                <div>
                                  <p className="text-xs font-medium text-slate-800">
                                    {transaction.description}
                                  </p>
                                  <p className="mt-1 text-[10px] text-slate-400">
                                    {transaction.id.slice(0, 8)}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">
                              {new Date(
                                transaction.posted_at ?? transaction.created_at,
                              ).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">
                              {transaction.reference ?? "—"}
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-right text-xs font-medium text-slate-900">
                              {transaction.amount_paise != null
                                ? formatPaiseINR(
                                    BigInt(transaction.amount_paise),
                                  )
                                : "—"}
                            </td>

                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium capitalize text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {transaction.status}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-right">
                              <button
                                aria-label={`View ${transaction.description}`}
                                onClick={() => navigate("Transactions")}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-400">
                    Showing {Math.min(filteredTransactions.length, 5)} of{" "}
                    {filteredTransactions.length} loaded transactions
                  </p>
                  <span className="text-xs text-slate-400">
                    Latest posted transactions
                  </span>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  title,
  amount,
  change,
  subtitle,
  icon: Icon,
  iconStyle,
  positive,
}: {
  title: string;
  amount: string;
  change: string;
  subtitle: string;
  icon: React.ElementType;
  iconStyle: string;
  positive: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <span className={`rounded-xl p-2.5 ${iconStyle}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="text-[25px] font-semibold tracking-tight text-slate-900">
        {amount}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
            positive ? "text-emerald-700" : "text-rose-600"
          }`}
        >
          {positive ? (
            <ArrowDownRight size={13} />
          ) : (
            <ArrowUpRight size={13} />
          )}
          {change}
        </span>
        <span className="text-[10px] text-slate-400">{subtitle}</span>
      </div>
    </section>
  );
}

export default App;