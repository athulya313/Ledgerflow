

import { pool } from "../../db/pool.js";
import type { Pool, PoolClient } from "pg";

export interface AuditLogFilters {
  action?: string;
  from?: string;
  to?: string;
}
type AuditLogQuery = Pick<Pool | PoolClient, "query">

export async function listAuditLogs(
  organizationId: string,
  page: number,
  limit: number,
  filters: AuditLogFilters = {},
    db: AuditLogQuery = pool,

) {
  const offset = (page - 1) * limit;

  const conditions = ["al.organization_id = $1"];
  const filterValues: unknown[] = [organizationId];

  if (filters.action) {
    filterValues.push(filters.action);
    conditions.push(`al.action = $${filterValues.length}`);
  }

 if (filters.from) {
  filterValues.push(filters.from);
  conditions.push(
    `al.created_at >= ($${filterValues.length}::date::timestamp AT TIME ZONE 'UTC')`,
  );
}

if (filters.to) {
  filterValues.push(filters.to);
  conditions.push(
    `al.created_at < (($${filterValues.length}::date + INTERVAL '1 day') AT TIME ZONE 'UTC')`,
  );
}

  const whereClause = conditions.join(" AND ");

  const logsValues = [...filterValues, limit, offset];
  const limitPosition = filterValues.length + 1;
  const offsetPosition = filterValues.length + 2;

  const [logsResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         al.id,
         al.organization_id,
         al.actor_user_id,
         u.name AS actor_name,
         al.action,
         al.resource_type,
         al.resource_id,
         al.metadata,
         al.created_at
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${whereClause}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      logsValues,
    ),

    db.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs al
       WHERE ${whereClause}`,
      filterValues,
    ),
  ]);

  const total = Number(countResult.rows[0].total);

  return {
    auditLogs: logsResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
