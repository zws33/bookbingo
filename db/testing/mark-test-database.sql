-- Runs once from /docker-entrypoint-initdb.d when the container initialises.
-- The test harness refuses to truncate a database without this marker, so a
-- production database reached through cloud-sql-proxy on localhost — which
-- passes any host or name check — fails instead.
--
-- The data directory is tmpfs, so every container start re-runs this.
do $$
begin
  execute format(
    'alter database %I set bookbingo.test_database = %L',
    current_database(),
    'on'
  );
end
$$;
