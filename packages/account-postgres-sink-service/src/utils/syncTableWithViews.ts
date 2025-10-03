import { QueryTypes, Sequelize } from "sequelize";

interface DependentView {
  schemaname: string;
  viewname: string;
  definition: string;
}

interface DependentMatView {
  schemaname: string;
  matviewname: string;
  definition: string;
}

/**
 * Handles syncing a table that has dependent views and materialized views.
 * Drops views, runs the sync operation, then recreates the views.
 */
export async function syncTableWithViews(
  sequelize: Sequelize,
  tableName: string,
  schemaName: string,
  syncCallback: () => Promise<void>
): Promise<void> {
  const dependentViews = await sequelize.query<DependentView>(
    `SELECT DISTINCT
      vn.nspname as schemaname,
      v.relname as viewname,
      pg_get_viewdef(v.oid) as definition
     FROM pg_class t
     JOIN pg_namespace tn ON t.relnamespace = tn.oid
     JOIN pg_attribute a ON a.attrelid = t.oid
     JOIN pg_depend d ON d.refobjid = t.oid AND d.refobjsubid = a.attnum
     JOIN pg_rewrite r ON r.oid = d.objid
     JOIN pg_class v ON v.oid = r.ev_class AND v.relkind = 'v'
     JOIN pg_namespace vn ON v.relnamespace = vn.oid
     WHERE t.relname = '${tableName}'
     AND tn.nspname = '${schemaName}'
     AND t.relkind = 'r'
     AND vn.nspname NOT IN ('pg_catalog', 'information_schema')`,
    { type: QueryTypes.SELECT }
  );

  const dependentMatViews = await sequelize.query<DependentMatView>(
    `SELECT DISTINCT
      vn.nspname as schemaname,
      v.relname as matviewname,
      pg_get_viewdef(v.oid) as definition
     FROM pg_class t
     JOIN pg_namespace tn ON t.relnamespace = tn.oid
     JOIN pg_attribute a ON a.attrelid = t.oid
     JOIN pg_depend d ON d.refobjid = t.oid AND d.refobjsubid = a.attnum
     JOIN pg_rewrite r ON r.oid = d.objid
     JOIN pg_class v ON v.oid = r.ev_class AND v.relkind = 'm'
     JOIN pg_namespace vn ON v.relnamespace = vn.oid
     WHERE t.relname = '${tableName}'
     AND tn.nspname = '${schemaName}'
     AND t.relkind = 'r'
     AND vn.nspname NOT IN ('pg_catalog', 'information_schema')`,
    { type: QueryTypes.SELECT }
  );

  if (dependentViews.length > 0 || dependentMatViews.length > 0) {
    console.log(
      `${tableName} has ${dependentViews.length} dependent view(s) and ${dependentMatViews.length} materialized view(s)`
    );

    for (const view of dependentViews) {
      await sequelize.query(
        `DROP VIEW IF EXISTS ${view.schemaname}.${view.viewname} CASCADE`
      );
      console.log(`Dropped view: ${view.schemaname}.${view.viewname}`);
    }

    for (const matView of dependentMatViews) {
      await sequelize.query(
        `DROP MATERIALIZED VIEW IF EXISTS ${matView.schemaname}.${matView.matviewname} CASCADE`
      );
      console.log(
        `Dropped materialized view: ${matView.schemaname}.${matView.matviewname}`
      );
    }

    await syncCallback();

    for (const view of dependentViews) {
      await sequelize.query(
        `CREATE OR REPLACE VIEW ${view.schemaname}.${view.viewname} AS ${view.definition}`
      );
      console.log(`Recreated view: ${view.schemaname}.${view.viewname}`);
    }

    for (const matView of dependentMatViews) {
      await sequelize.query(
        `CREATE MATERIALIZED VIEW ${matView.schemaname}.${matView.matviewname} AS ${matView.definition}`
      );
      console.log(
        `Recreated materialized view: ${matView.schemaname}.${matView.matviewname}`
      );
    }
  } else {
    await syncCallback();
  }
}
