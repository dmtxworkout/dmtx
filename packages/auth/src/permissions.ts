import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

/**
 * Access-control statement. Extend `content` (and add new resources) as the
 * portal grows. The SAME `ac` + `roles` must be passed to the server `admin()`
 * plugin AND the client `adminClient()` plugin, or permission checks drift.
 */
export const statement = {
  ...defaultStatements,
  content: ['create', 'read', 'update', 'delete', 'publish'],
} as const;

export const ac = createAccessControl(statement);

export const adminRole = ac.newRole({
  ...adminAc.statements,
  content: ['create', 'read', 'update', 'delete', 'publish'],
});

export const userRole = ac.newRole({
  content: ['read'],
});

export const roles = { admin: adminRole, user: userRole };
