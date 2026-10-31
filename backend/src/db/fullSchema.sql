--
-- PostgreSQL database dump
--

\restrict 5mMmtme6vmsXSfYwMnXFyUxvbpPtcDiT8PRnPApF4xWYWjGGhkpFHfByh78O3eC

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: enforce_audit_log_immutability(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_audit_log_immutability() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION
        'Audit logs cannot be updated or deleted'
        USING ERRCODE = '55000';
    END;
    $$;


--
-- Name: enforce_ledger_entry_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_ledger_entry_rules() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: enforce_ledger_transaction_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_ledger_transaction_rules() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    account_type character varying(20) NOT NULL,
    currency character(3) DEFAULT 'INR'::bpchar NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_account_type_check CHECK (((account_type)::text = ANY ((ARRAY['asset'::character varying, 'liability'::character varying, 'equity'::character varying, 'income'::character varying, 'expense'::character varying])::text[]))),
    CONSTRAINT accounts_currency_check CHECK ((currency = 'INR'::bpchar)),
    CONSTRAINT accounts_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    action character varying(100) NOT NULL,
    resource_type character varying(100) NOT NULL,
    resource_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    account_id uuid NOT NULL,
    entry_type character varying(10) NOT NULL,
    amount_paise bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_entries_amount_paise_check CHECK ((amount_paise > 0)),
    CONSTRAINT ledger_entries_entry_type_check CHECK (((entry_type)::text = ANY ((ARRAY['debit'::character varying, 'credit'::character varying])::text[])))
);


--
-- Name: ledger_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    reference character varying(120),
    description character varying(500) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_at timestamp with time zone,
    idempotency_key character varying(255),
    request_hash character varying(64),
    reverses_transaction_id uuid,
    CONSTRAINT ledger_transactions_check CHECK (((((status)::text = 'draft'::text) AND (posted_at IS NULL)) OR (((status)::text = 'posted'::text) AND (posted_at IS NOT NULL)))),
    CONSTRAINT ledger_transactions_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'posted'::character varying])::text[])))
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role character varying(30) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memberships_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'finance_admin'::character varying, 'auditor'::character varying])::text[])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(160) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reconciliation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    reconciliation_id uuid NOT NULL,
    row_number integer NOT NULL,
    transaction_date date NOT NULL,
    description character varying(500) NOT NULL,
    reference character varying(120),
    amount_paise bigint NOT NULL,
    status character varying(20) DEFAULT 'unmatched'::character varying NOT NULL,
    ledger_transaction_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reconciliation_items_amount_paise_check CHECK ((amount_paise <> 0)),
    CONSTRAINT reconciliation_items_check CHECK (((((status)::text = 'matched'::text) AND (ledger_transaction_id IS NOT NULL)) OR (((status)::text = 'unmatched'::text) AND (ledger_transaction_id IS NULL)))),
    CONSTRAINT reconciliation_items_row_number_check CHECK ((row_number > 0)),
    CONSTRAINT reconciliation_items_status_check CHECK (((status)::text = ANY ((ARRAY['matched'::character varying, 'unmatched'::character varying])::text[])))
);


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    account_id uuid NOT NULL,
    statement_name character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    matched_rows integer DEFAULT 0 NOT NULL,
    unmatched_rows integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT reconciliations_matched_rows_check CHECK ((matched_rows >= 0)),
    CONSTRAINT reconciliations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying])::text[]))),
    CONSTRAINT reconciliations_total_rows_check CHECK ((total_rows >= 0)),
    CONSTRAINT reconciliations_unmatched_rows_check CHECK ((unmatched_rows >= 0))
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(254) NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying(120) NOT NULL
);


--
-- Name: accounts accounts_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ledger_entries ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: ledger_transactions ledger_transactions_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: ledger_transactions ledger_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_user_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_organization_id_key UNIQUE (user_id, organization_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_items reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_items
    ADD CONSTRAINT reconciliation_items_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_items reconciliation_items_reconciliation_id_row_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_items
    ADD CONSTRAINT reconciliation_items_reconciliation_id_row_number_key UNIQUE (reconciliation_id, row_number);


--
-- Name: reconciliations reconciliations_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: accounts_org_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX accounts_org_name_unique ON public.accounts USING btree (organization_id, lower((name)::text));


--
-- Name: accounts_organization_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_organization_idx ON public.accounts USING btree (organization_id);


--
-- Name: audit_logs_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_org_created_idx ON public.audit_logs USING btree (organization_id, created_at DESC, id DESC);


--
-- Name: audit_logs_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_resource_idx ON public.audit_logs USING btree (organization_id, resource_type, resource_id);


--
-- Name: ledger_entries_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_entries_account_idx ON public.ledger_entries USING btree (organization_id, account_id);


--
-- Name: ledger_entries_transaction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_entries_transaction_idx ON public.ledger_entries USING btree (organization_id, transaction_id);


--
-- Name: ledger_transactions_one_reversal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ledger_transactions_one_reversal ON public.ledger_transactions USING btree (organization_id, reverses_transaction_id) WHERE (reverses_transaction_id IS NOT NULL);


--
-- Name: ledger_transactions_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_transactions_org_created_idx ON public.ledger_transactions USING btree (organization_id, created_at DESC);


--
-- Name: ledger_transactions_org_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ledger_transactions_org_idempotency_unique ON public.ledger_transactions USING btree (organization_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: memberships_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_organization_id_idx ON public.memberships USING btree (organization_id);


--
-- Name: reconciliation_items_ledger_transaction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_items_ledger_transaction_idx ON public.reconciliation_items USING btree (organization_id, ledger_transaction_id);


--
-- Name: reconciliation_items_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_items_org_status_idx ON public.reconciliation_items USING btree (organization_id, status);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (lower((email)::text));


--
-- Name: audit_logs audit_log_immutability_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_log_immutability_trigger BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_immutability();


--
-- Name: ledger_entries ledger_entry_rules_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ledger_entry_rules_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_ledger_entry_rules();


--
-- Name: ledger_transactions ledger_transaction_rules_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ledger_transaction_rules_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_ledger_transaction_rules();


--
-- Name: accounts accounts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: ledger_entries ledger_entries_organization_id_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_organization_id_account_id_fkey FOREIGN KEY (organization_id, account_id) REFERENCES public.accounts(organization_id, id) ON DELETE RESTRICT;


--
-- Name: ledger_entries ledger_entries_organization_id_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_organization_id_transaction_id_fkey FOREIGN KEY (organization_id, transaction_id) REFERENCES public.ledger_transactions(organization_id, id) ON DELETE RESTRICT;


--
-- Name: ledger_transactions ledger_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ledger_transactions ledger_transactions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: ledger_transactions ledger_transactions_reversal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_reversal_fk FOREIGN KEY (organization_id, reverses_transaction_id) REFERENCES public.ledger_transactions(organization_id, id) ON DELETE RESTRICT;


--
-- Name: memberships memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reconciliation_items reconciliation_items_organization_id_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_items
    ADD CONSTRAINT reconciliation_items_organization_id_ledger_transaction_id_fkey FOREIGN KEY (organization_id, ledger_transaction_id) REFERENCES public.ledger_transactions(organization_id, id) ON DELETE RESTRICT;


--
-- Name: reconciliation_items reconciliation_items_organization_id_reconciliation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_items
    ADD CONSTRAINT reconciliation_items_organization_id_reconciliation_id_fkey FOREIGN KEY (organization_id, reconciliation_id) REFERENCES public.reconciliations(organization_id, id) ON DELETE RESTRICT;


--
-- Name: reconciliations reconciliations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reconciliations reconciliations_organization_id_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_organization_id_account_id_fkey FOREIGN KEY (organization_id, account_id) REFERENCES public.accounts(organization_id, id) ON DELETE RESTRICT;


--
-- Name: reconciliations reconciliations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 5mMmtme6vmsXSfYwMnXFyUxvbpPtcDiT8PRnPApF4xWYWjGGhkpFHfByh78O3eC

