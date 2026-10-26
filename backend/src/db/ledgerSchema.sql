-- 1. Financial accounts
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id) ON DELETE RESTRICT,

    name VARCHAR(120) NOT NULL,
    account_type VARCHAR(20) NOT NULL
        CHECK (account_type IN (
            'asset', 'liability', 'equity', 'income', 'expense'
        )),

    currency CHAR(3) NOT NULL DEFAULT 'INR'
        CHECK (currency = 'INR'),

    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX accounts_org_name_unique
ON accounts (organization_id, LOWER(name));


-- 2. Ledger transactions
CREATE TABLE ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id) ON DELETE RESTRICT,

    reference VARCHAR(120),
    description VARCHAR(500) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'posted')),

    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_at TIMESTAMPTZ,

    UNIQUE (organization_id, id),

    CHECK (
        (status = 'draft' AND posted_at IS NULL)
        OR
        (status = 'posted' AND posted_at IS NOT NULL)
    )
);


-- 3. Individual debit and credit entries
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL,
    transaction_id UUID NOT NULL,
    account_id UUID NOT NULL,

    entry_type VARCHAR(10) NOT NULL
        CHECK (entry_type IN ('debit', 'credit')),

    amount_paise BIGINT NOT NULL
        CHECK (amount_paise > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (organization_id, transaction_id)
        REFERENCES ledger_transactions (organization_id, id)
        ON DELETE RESTRICT,

    FOREIGN KEY (organization_id, account_id)
        REFERENCES accounts (organization_id, id)
        ON DELETE RESTRICT
);


-- Indexes for common queries
CREATE INDEX accounts_organization_idx
ON accounts (organization_id);

CREATE INDEX ledger_transactions_org_created_idx
ON ledger_transactions (organization_id, created_at DESC);

CREATE INDEX ledger_entries_transaction_idx
ON ledger_entries (organization_id, transaction_id);

CREATE INDEX ledger_entries_account_idx
ON ledger_entries (organization_id, account_id);