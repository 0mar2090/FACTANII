-- ═══════════════════════════════════════════════
-- Row-Level Security Policies — FacturaPE
-- Ejecutar después de las migraciones de Prisma
-- ═══════════════════════════════════════════════

-- Habilitar RLS en tablas de tenant
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Crear rol de aplicación (Prisma se conecta con este rol)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END
$$;

-- Policies para invoices
CREATE POLICY tenant_invoices_select ON invoices
  FOR SELECT TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_invoices_insert ON invoices
  FOR INSERT TO app_user
  WITH CHECK (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_invoices_update ON invoices
  FOR UPDATE TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true))
  WITH CHECK (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_invoices_delete ON invoices
  FOR DELETE TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

-- Policies para invoice_items (via invoice)
CREATE POLICY tenant_items_select ON invoice_items
  FOR SELECT TO app_user
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE company_id = current_setting('tenancy.tenant_id', true)
  ));

CREATE POLICY tenant_items_insert ON invoice_items
  FOR INSERT TO app_user
  WITH CHECK (invoice_id IN (
    SELECT id FROM invoices WHERE company_id = current_setting('tenancy.tenant_id', true)
  ));

CREATE POLICY tenant_items_update ON invoice_items
  FOR UPDATE TO app_user
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE company_id = current_setting('tenancy.tenant_id', true)
  ));

CREATE POLICY tenant_items_delete ON invoice_items
  FOR DELETE TO app_user
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE company_id = current_setting('tenancy.tenant_id', true)
  ));

-- Policies para certificates
CREATE POLICY tenant_certs_select ON certificates
  FOR SELECT TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_certs_insert ON certificates
  FOR INSERT TO app_user
  WITH CHECK (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_certs_update ON certificates
  FOR UPDATE TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

-- Policies para api_keys
CREATE POLICY tenant_keys_select ON api_keys
  FOR SELECT TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_keys_insert ON api_keys
  FOR INSERT TO app_user
  WITH CHECK (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_keys_delete ON api_keys
  FOR DELETE TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

-- ═══════════════════════════════════════════════
-- Tablas adicionales con RLS
-- ═══════════════════════════════════════════════

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies para webhooks
CREATE POLICY tenant_webhooks_select ON webhooks
  FOR SELECT TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_webhooks_insert ON webhooks
  FOR INSERT TO app_user
  WITH CHECK (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_webhooks_update ON webhooks
  FOR UPDATE TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true))
  WITH CHECK (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_webhooks_delete ON webhooks
  FOR DELETE TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

-- Policies para subscriptions
CREATE POLICY tenant_subs_select ON subscriptions
  FOR SELECT TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true));

CREATE POLICY tenant_subs_update ON subscriptions
  FOR UPDATE TO app_user
  USING (company_id = current_setting('tenancy.tenant_id', true))
  WITH CHECK (company_id = current_setting('tenancy.tenant_id', true));

-- NOTA: El superuser (postgres) NO es afectado por RLS.
-- Prisma migrations usa superuser, así que las migraciones funcionan normal.
-- Para desarrollo, si Prisma se conecta como superuser, RLS no filtra.
-- En producción, configurar un usuario app_user separado.

-- Función helper para setear tenant en transacción
CREATE OR REPLACE FUNCTION set_tenant(tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('tenancy.tenant_id', tenant_id, true);
END;
$$ LANGUAGE plpgsql;
