/**
 * FLASH Role-Based Access Control Engine (FlashRBAC)
 * Granular permissions per role, collection, action ('read'|'write'|'delete'|'admin'), and field scope.
 */
export class FlashRBAC {
  constructor() {
    // roleName -> Set<string> (e.g. 'users:read', 'orders:*', '*:*')
    this.roles = new Map();
    // userId -> Set<string> (roleNames)
    this.userRoles = new Map();

    // Default admin & reader roles
    this.createRole('admin', ['*:*']);
    this.createRole('reader', ['*:read']);
  }

  /**
   * Registers a new role with allowed permission patterns
   * @param {string} roleName
   * @param {string[]} permissions - e.g. ['users:read', 'users:write', 'audit:*']
   */
  createRole(roleName, permissions = []) {
    this.roles.set(roleName, new Set(permissions));
  }

  /**
   * Assigns a role to a user
   */
  assignRole(userId, roleName) {
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }
    this.userRoles.get(userId).add(roleName);
  }

  /**
   * Evaluates if a user has permission to perform an action on a target collection
   * @param {string} userId
   * @param {string} collection
   * @param {'read'|'write'|'delete'|'admin'} action
   * @returns {boolean}
   */
  can(userId, collection, action) {
    const roles = this.userRoles.get(userId);
    if (!roles) return false;

    const requestedPerm = `${collection}:${action}`;

    for (const roleName of roles) {
      const perms = this.roles.get(roleName);
      if (!perms) continue;

      if (
        perms.has('*:*') ||
        perms.has(`${collection}:*`) ||
        perms.has(`*:${action}`) ||
        perms.has(requestedPerm)
      ) {
        return true;
      }
    }

    return false;
  }
}
