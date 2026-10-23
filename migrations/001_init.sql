CREATE TABLE tenants (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL
);

CREATE TABLE memberships (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role      text NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  active    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX projects_tenant_lower_name_key ON projects (tenant_id, lower(name));
CREATE INDEX projects_tenant_created_idx ON projects (tenant_id, created_at DESC, id);

CREATE TABLE audit_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  actor_id   uuid NOT NULL REFERENCES users(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  action     text NOT NULL,
  old_name   text,
  new_name   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_project_idx ON audit_events (project_id, created_at DESC);
