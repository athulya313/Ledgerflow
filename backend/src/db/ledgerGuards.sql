-- Check balance before a transaction becomes posted.
CREATE OR REPLACE FUNCTION enforce_ledger_transaction_rules()
RETURNS TRIGGER AS $$
DECLARE
    debit_total BIGINT;
    credit_total BIGINT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'posted' THEN
            RAISE EXCEPTION 'Posted transactions cannot be deleted'
                USING ERRCODE = '55000';
        END IF;

        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted transactions cannot be modified'
            USING ERRCODE = '55000';
    END IF;

    IF NEW.status = 'posted' THEN
        SELECT
            COALESCE(SUM(amount_paise)
                FILTER (WHERE entry_type = 'debit'), 0),
            COALESCE(SUM(amount_paise)
                FILTER (WHERE entry_type = 'credit'), 0)
        INTO debit_total, credit_total
        FROM ledger_entries
        WHERE organization_id = NEW.organization_id
          AND transaction_id = NEW.id;

        IF debit_total = 0 OR credit_total = 0
           OR debit_total <> credit_total THEN
            RAISE EXCEPTION
                'Cannot post an unbalanced ledger transaction'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_transaction_rules_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON ledger_transactions
FOR EACH ROW
EXECUTE FUNCTION enforce_ledger_transaction_rules();


-- Protect entries belonging to posted transactions.
CREATE OR REPLACE FUNCTION enforce_ledger_entry_rules()
RETURNS TRIGGER AS $$
DECLARE
    parent_status VARCHAR(20);
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION
            'Ledger entries cannot be updated; recreate draft entries instead'
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT status
        INTO parent_status
        FROM ledger_transactions
        WHERE id = NEW.transaction_id
          AND organization_id = NEW.organization_id
        FOR UPDATE;

        IF parent_status IS DISTINCT FROM 'draft' THEN
            RAISE EXCEPTION
                'Entries can only be added to draft transactions'
                USING ERRCODE = '55000';
        END IF;

        RETURN NEW;
    END IF;

    SELECT status
    INTO parent_status
    FROM ledger_transactions
    WHERE id = OLD.transaction_id
      AND organization_id = OLD.organization_id
    FOR UPDATE;

    IF parent_status = 'posted' THEN
        RAISE EXCEPTION
            'Entries belonging to posted transactions cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_rules_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION enforce_ledger_entry_rules();

-- Prevent audit logs from being updated or deleted.
CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Audit logs cannot be updated or deleted'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutability_trigger
BEFORE UPDATE OR DELETE
ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_log_immutability();