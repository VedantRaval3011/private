'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserRole, AuthUser } from '@/types/auth';

interface PagePermission {
  _id: string;
  pageRoute: string;
  pageName: string;
  allowedRoles: UserRole[];
  allowedUsers: string[];
}

const ALL_ROLES: UserRole[] = ['super-admin', 'admin', 'employee'];

const ROLE_LABELS: Record<UserRole, string> = {
  'super-admin': 'Super Admin',
  admin: 'Admin',
  employee: 'Employee',
};

const ROLE_COLORS: Record<UserRole, string> = {
  'super-admin': 'var(--primary-600)',
  admin: 'var(--info)',
  employee: 'var(--success)',
};

type Tab = 'roles' | 'users';

export default function PagePermissionsPage() {
  const [permissions, setPermissions] = useState<PagePermission[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('roles');
  const [selectedUserId, setSelectedUserId] = useState('');

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const [permRes, userRes] = await Promise.all([
        fetch('/api/page-permissions'),
        fetch('/api/users'),
      ]);
      if (permRes.ok) {
        const data = await permRes.json();
        setPermissions(data.permissions.map((p: PagePermission) => ({
          ...p,
          allowedUsers: p.allowedUsers ?? [],
        })));
      } else {
        setError('Failed to load permissions');
      }
      if (userRes.ok) {
        const data = await userRes.json();
        setUsers(data.users.filter((u: AuthUser) => u.role !== 'super-admin'));
      } else {
        const data = await userRes.json().catch(() => ({}));
        setError(data.error || `Failed to load users (${userRes.status})`);
      }
    } catch (e) {
      setError('Network error loading data');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 3000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Role helpers ──────────────────────────────────────────────
  function toggleRole(pageRoute: string, role: UserRole) {
    if (role === 'super-admin') return;
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.pageRoute !== pageRoute) return p;
        const has = p.allowedRoles.includes(role);
        return { ...p, allowedRoles: has ? p.allowedRoles.filter((r) => r !== role) : [...p.allowedRoles, role] };
      })
    );
    setDirty(true);
  }

  function toggleAll(role: UserRole, checked: boolean) {
    if (role === 'super-admin') return;
    setPermissions((prev) =>
      prev.map((p) => ({
        ...p,
        allowedRoles: checked
          ? Array.from(new Set([...p.allowedRoles, role]))
          : p.allowedRoles.filter((r) => r !== role),
      }))
    );
    setDirty(true);
  }

  function isAllRoleChecked(role: UserRole) {
    return permissions.every((p) => p.allowedRoles.includes(role));
  }

  // ── User helpers ──────────────────────────────────────────────
  function toggleUserPage(pageRoute: string, userId: string) {
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.pageRoute !== pageRoute) return p;
        const has = p.allowedUsers.includes(userId);
        return { ...p, allowedUsers: has ? p.allowedUsers.filter((id) => id !== userId) : [...p.allowedUsers, userId] };
      })
    );
    setDirty(true);
  }

  function toggleAllUserPages(userId: string, checked: boolean) {
    setPermissions((prev) =>
      prev.map((p) => ({
        ...p,
        allowedUsers: checked
          ? Array.from(new Set([...p.allowedUsers, userId]))
          : p.allowedUsers.filter((id) => id !== userId),
      }))
    );
    setDirty(true);
  }

  function isAllUserPagesChecked(userId: string) {
    return permissions.every((p) => p.allowedUsers.includes(userId));
  }

  // ── Save ──────────────────────────────────────────────────────
  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/page-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      setPermissions(data.permissions.map((p: PagePermission) => ({ ...p, allowedUsers: p.allowedUsers ?? [] })));
      setDirty(false);
      setSuccess('Permissions saved successfully');
    } finally {
      setSaving(false);
    }
  }

  const selectedUser = users.find((u) => u._id === selectedUserId) ?? null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>

      {/* Header */}
      <div style={{ background: 'var(--gradient-primary)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', margin: 0 }}>Page Permissions</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginTop: '0.125rem' }}>
              Control access by role and by individual user
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <a href="/admin/users" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>
              ← User Management
            </a>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: dirty ? 'pointer' : 'default', background: dirty ? 'white' : 'rgba(255,255,255,0.3)', color: dirty ? 'var(--primary-700)' : 'white', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? (
                <>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {dirty ? 'Save Changes' : 'Saved'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '1.5rem' }}>

        {/* Alerts */}
        {success && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {success}
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', background: '#fef2f2', color: 'var(--error)', border: '1px solid #fecaca' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}

        {/* Info banner */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1.25rem', fontSize: '0.875rem', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', color: 'var(--primary-800)' }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>Super Admin</strong> always has access to all pages.
            User-specific grants give individual users access <strong>regardless of their role</strong> settings.
            Changes take effect after saving.
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
          {(['roles', 'users'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t ? 'var(--gradient-primary)' : 'var(--card)', color: tab === t ? 'white' : 'var(--muted-foreground)', transition: 'all 0.15s' }}
            >
              {t === 'roles' ? 'Role Permissions' : 'User Permissions'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" style={{ margin: '0 auto 0.75rem', display: 'block', animation: 'spin 1s linear infinite' }}>
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading permissions...
          </div>
        ) : (
          <>
            {/* ── Role Permissions Tab ── */}
            {tab === 'roles' && (
              <div style={{ borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: 'var(--shadow-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={thStyle}>Page</th>
                      {ALL_ROLES.map((role) => (
                        <th key={role} style={{ ...thStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                            <span style={{ color: ROLE_COLORS[role] }}>{ROLE_LABELS[role]}</span>
                            {role !== 'super-admin' && permissions.length > 0 && (
                              <input
                                type="checkbox"
                                title={`Toggle all for ${ROLE_LABELS[role]}`}
                                checked={isAllRoleChecked(role)}
                                onChange={(e) => toggleAll(role, e.target.checked)}
                                style={{ width: '0.875rem', height: '0.875rem', cursor: 'pointer' }}
                              />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((p, i) => (
                      <tr key={p._id || p.pageRoute} style={{ borderBottom: i < permissions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={tdStyle}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--foreground)', margin: 0 }}>{p.pageName}</p>
                          <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--muted-foreground)', margin: 0 }}>{p.pageRoute}</p>
                        </td>
                        {ALL_ROLES.map((role) => {
                          const checked = p.allowedRoles.includes(role);
                          const locked = role === 'super-admin';
                          return (
                            <td key={role} style={{ ...tdStyle, textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={locked}
                                onChange={() => toggleRole(p.pageRoute, role)}
                                style={{ width: '1rem', height: '1rem', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1 }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── User Permissions Tab ── */}
            {tab === 'users' && (
              <div>
                {/* User selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>Select User:</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none', minWidth: '220px' }}
                  >
                    <option value="">— choose a user —</option>
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name} (@{u.username}) — {ROLE_LABELS[u.role]}
                      </option>
                    ))}
                  </select>
                  {selectedUser && (
                    <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', background: 'var(--primary-50)', color: 'var(--primary-700)', border: '1px solid var(--primary-200)' }}>
                      {permissions.filter((p) => p.allowedUsers.includes(selectedUser._id)).length} page(s) granted
                    </span>
                  )}
                </div>

                {!selectedUserId ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)', borderRadius: '0.75rem', border: '1px dashed var(--border)', background: 'var(--card)' }}>
                    <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.3 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p style={{ fontWeight: 500, margin: 0 }}>Select a user to manage their page access</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>User grants override role permissions for that specific user</p>
                  </div>
                ) : (
                  <div style={{ borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: 'var(--shadow-sm)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                          <th style={thStyle}>Page</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                              <span style={{ color: 'var(--primary-600)' }}>Access for {selectedUser?.name}</span>
                              <input
                                type="checkbox"
                                title="Toggle all pages for this user"
                                checked={isAllUserPagesChecked(selectedUserId)}
                                onChange={(e) => toggleAllUserPages(selectedUserId, e.target.checked)}
                                style={{ width: '0.875rem', height: '0.875rem', cursor: 'pointer' }}
                              />
                            </div>
                          </th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {permissions.map((p, i) => {
                          const hasUserGrant = p.allowedUsers.includes(selectedUserId);
                          const hasRoleAccess = selectedUser ? p.allowedRoles.includes(selectedUser.role) : false;
                          return (
                            <tr key={p._id || p.pageRoute} style={{ borderBottom: i < permissions.length - 1 ? '1px solid var(--border)' : 'none', background: hasUserGrant ? 'var(--primary-50)' : 'var(--card)' }}>
                              <td style={tdStyle}>
                                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--foreground)', margin: 0 }}>{p.pageName}</p>
                                <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--muted-foreground)', margin: 0 }}>{p.pageRoute}</p>
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={hasUserGrant}
                                  onChange={() => toggleUserPage(p.pageRoute, selectedUserId)}
                                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                                />
                              </td>
                              <td style={tdStyle}>
                                {hasUserGrant ? (
                                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
                                    User grant
                                  </span>
                                ) : hasRoleAccess ? (
                                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
                                    Via role
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>No access</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {dirty && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.5rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'white', background: 'var(--gradient-primary)', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.75rem 1.25rem',
  textAlign: 'left',
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 1.25rem',
};
