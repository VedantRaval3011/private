'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthUser, UserRole } from '@/types/auth';

const ROLE_LABELS: Record<UserRole, string> = {
  'super-admin': 'Super Admin',
  admin: 'Admin',
  employee: 'Employee',
};

const ROLE_COLORS: Record<UserRole, { bg: string; text: string; border: string }> = {
  'super-admin': { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' },
  admin: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  employee: { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
};

type ModalType = 'create' | 'edit' | 'delete' | 'password' | null;

interface FormState {
  name: string;
  username: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  isActive: boolean;
}

const defaultForm: FormState = {
  name: '',
  username: '',
  password: '',
  confirmPassword: '',
  role: 'employee',
  isActive: true,
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 3000);
    return () => clearTimeout(t);
  }, [success]);

  function openCreate() { setForm(defaultForm); setError(''); setModal('create'); }
  function openEdit(u: AuthUser) {
    setSelectedUser(u);
    setForm({ name: u.name, username: u.username, password: '', confirmPassword: '', role: u.role, isActive: u.isActive });
    setError(''); setModal('edit');
  }
  function openDelete(u: AuthUser) { setSelectedUser(u); setError(''); setModal('delete'); }
  function openPassword(u: AuthUser) {
    setSelectedUser(u);
    setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setError(''); setModal('password');
  }
  function closeModal() { setModal(null); setSelectedUser(null); setError(''); }

  function showSuccess(msg: string) { setSuccess(msg); }

  async function handleCreate() {
    setError('');
    if (!form.name || !form.username || !form.password || !form.role) { setError('All fields are required'); return; }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, username: form.username, password: form.password, role: form.role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      closeModal(); showSuccess('User created successfully'); fetchUsers();
    } finally { setSubmitting(false); }
  }

  async function handleEdit() {
    if (!selectedUser) return;
    setError(''); setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${selectedUser._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, username: form.username, role: form.role, isActive: form.isActive }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      closeModal(); showSuccess('User updated successfully'); fetchUsers();
    } finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${selectedUser._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      closeModal(); showSuccess('User deleted successfully'); fetchUsers();
    } finally { setSubmitting(false); }
  }

  async function handlePasswordChange() {
    if (!selectedUser) return;
    setError('');
    if (!pwForm.newPassword || !pwForm.confirmPassword) { setError('All fields are required'); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setError('Passwords do not match'); return; }
    const isSelf = currentUser?._id === selectedUser._id;
    if (isSelf && !pwForm.currentPassword) { setError('Current password is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${selectedUser._id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword || undefined, newPassword: pwForm.newPassword, confirmPassword: pwForm.confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      closeModal(); showSuccess('Password updated successfully');
    } finally { setSubmitting(false); }
  }

  const filtered = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const canManageUser = (target: AuthUser) => {
    if (!currentUser) return false;
    if (currentUser._id === target._id) return false;
    if (currentUser.role === 'super-admin') return true;
    if (currentUser.role === 'admin') return target.role === 'employee';
    return false;
  };

  const availableRoles: UserRole[] =
    currentUser?.role === 'super-admin' ? ['super-admin', 'admin', 'employee'] : ['employee'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>

      {/* Header */}
      <div style={{ background: 'var(--gradient-primary)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', margin: 0 }}>User Management</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginTop: '0.125rem' }}>
              Manage users, roles, and access control
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <a href="/" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>
              ← Back
            </a>
            {currentUser?.role === 'super-admin' && (
              <a
                href="/admin/page-permissions"
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 500, background: 'rgba(255,255,255,0.15)', color: 'white', textDecoration: 'none' }}
              >
                Page Permissions
              </a>
            )}
            <button
              onClick={openCreate}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 600, background: 'white', color: 'var(--primary-700)', border: 'none', cursor: 'pointer' }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '1.5rem' }}>

        {/* Success */}
        {success && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.25rem', paddingRight: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none' }}
          >
            <option value="all">All Roles</option>
            <option value="super-admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
          </select>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {(['all', 'super-admin', 'admin', 'employee'] as const).map((r) => {
            const count = r === 'all' ? users.length : users.filter((u) => u.role === r).length;
            const active = roleFilter === r;
            return (
              <div
                key={r}
                onClick={() => setRoleFilter(r)}
                style={{ borderRadius: '0.75rem', padding: '0.75rem 1rem', textAlign: 'center', cursor: 'pointer', background: active ? 'var(--primary-50)' : 'var(--card)', border: `1px solid ${active ? 'var(--primary-300)' : 'var(--border)'}`, boxShadow: 'var(--shadow-sm)' }}
              >
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-700)', margin: 0 }}>{count}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.125rem' }}>
                  {r === 'all' ? 'Total Users' : ROLE_LABELS[r]}
                </p>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: 'var(--shadow-sm)' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }}>
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading users...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
              <p style={{ fontWeight: 500 }}>No users found</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Try adjusting your search or filter</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  {['User', 'Role', 'Status', 'Created', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const rc = ROLE_COLORS[u.role];
                  const isSelf = currentUser?._id === u._id;
                  return (
                    <tr key={u._id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', background: isSelf ? 'var(--primary-50)' : 'var(--card)' }}>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 700, flexShrink: 0, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--foreground)', margin: 0 }}>
                              {u.name}
                              {isSelf && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', background: 'var(--primary-100)', color: 'var(--primary-700)' }}>
                                  You
                                </span>
                              )}
                            </p>
                            <p style={{ fontSize: '0.75rem', marginTop: '0.125rem', color: 'var(--muted-foreground)', margin: 0 }}>@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.25rem 0.625rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', fontWeight: 500, color: u.isActive ? 'var(--success)' : 'var(--error)' }}>
                          <span style={{ width: '0.375rem', height: '0.375rem', borderRadius: '50%', background: u.isActive ? 'var(--success)' : 'var(--error)' }} />
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          {new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          {(canManageUser(u) || isSelf) && (
                            <button onClick={() => openEdit(u)} title="Edit user" style={{ padding: '0.375rem', borderRadius: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--info)' }}>
                              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {(canManageUser(u) || isSelf) && (
                            <button onClick={() => openPassword(u)} title="Change password" style={{ padding: '0.375rem', borderRadius: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--warning)' }}>
                              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </button>
                          )}
                          {canManageUser(u) && !isSelf && (
                            <button onClick={() => openDelete(u)} title="Delete user" style={{ padding: '0.375rem', borderRadius: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--error)' }}>
                              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeModal()}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          <div style={{ width: '100%', maxWidth: '28rem', borderRadius: '1rem', padding: '1.5rem', background: 'var(--card)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>

            {/* Create */}
            {modal === 'create' && (
              <>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '1rem', marginTop: 0 }}>Create New User</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Field label="Full Name"><input type="text" placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Username"><input type="text" placeholder="e.g. john.doe" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Role">
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} style={inputStyle}>
                      {availableRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </Field>
                  <Field label="Password"><input type="password" placeholder="Min 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Confirm Password"><input type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} style={inputStyle} /></Field>
                </div>
                {error && <ErrorMsg msg={error} />}
                <ModalActions onCancel={closeModal} onConfirm={handleCreate} confirmLabel="Create User" loading={submitting} />
              </>
            )}

            {/* Edit */}
            {modal === 'edit' && selectedUser && (
              <>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '1rem', marginTop: 0 }}>Edit User</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Field label="Full Name"><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Username"><input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle} /></Field>
                  {currentUser?.role === 'super-admin' && (
                    <Field label="Role">
                      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} style={inputStyle}>
                        {(['super-admin', 'admin', 'employee'] as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </Field>
                  )}
                  {['admin', 'super-admin'].includes(currentUser?.role ?? '') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input type="checkbox" id="isActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} style={{ width: '1rem', height: '1rem' }} />
                      <label htmlFor="isActive" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--foreground)' }}>Account Active</label>
                    </div>
                  )}
                </div>
                {error && <ErrorMsg msg={error} />}
                <ModalActions onCancel={closeModal} onConfirm={handleEdit} confirmLabel="Save Changes" loading={submitting} />
              </>
            )}

            {/* Delete */}
            {modal === 'delete' && selectedUser && (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', background: '#fef2f2' }}>
                    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--error)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.5rem', marginTop: 0 }}>Delete User</h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Are you sure you want to delete</p>
                  <p style={{ fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>{selectedUser.name}</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>@{selectedUser.username}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: '0.75rem' }}>This action cannot be undone.</p>
                </div>
                {error && <ErrorMsg msg={error} />}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <button onClick={closeModal} style={{ flex: 1, padding: '0.625rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 500, border: '1px solid var(--border)', color: 'var(--foreground)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleDelete} disabled={submitting} style={{ flex: 1, padding: '0.625rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'white', background: 'var(--error)', border: 'none', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                    {submitting ? 'Deleting...' : 'Delete User'}
                  </button>
                </div>
              </>
            )}

            {/* Password */}
            {modal === 'password' && selectedUser && (
              <>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.25rem', marginTop: 0 }}>
                  {currentUser?._id === selectedUser._id ? 'Change Your Password' : `Reset Password — ${selectedUser.name}`}
                </h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                  {currentUser?._id === selectedUser._id
                    ? 'Enter your current password to set a new one.'
                    : 'Set a new password for this user.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {currentUser?._id === selectedUser._id && (
                    <Field label="Current Password"><input type="password" placeholder="Your current password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} style={inputStyle} /></Field>
                  )}
                  <Field label="New Password"><input type="password" placeholder="Min 8 characters" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Confirm New Password"><input type="password" placeholder="Repeat new password" value={pwForm.confirmPassword} onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} style={inputStyle} /></Field>
                </div>
                {error && <ErrorMsg msg={error} />}
                <ModalActions onCancel={closeModal} onConfirm={handlePasswordChange} confirmLabel="Update Password" loading={submitting} />
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// Shared sub-components

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  background: 'var(--muted)',
  color: 'var(--foreground)',
  fontSize: '0.875rem',
  outline: 'none',
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--muted-foreground)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.875rem', marginTop: '0.75rem', background: '#fef2f2', color: 'var(--error)', border: '1px solid #fecaca' }}>
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {msg}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, loading }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; loading: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
      <button onClick={onCancel} style={{ flex: 1, padding: '0.625rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 500, border: '1px solid var(--border)', color: 'var(--foreground)', background: 'transparent', cursor: 'pointer' }}>
        Cancel
      </button>
      <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: '0.625rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'white', background: 'var(--gradient-primary)', border: 'none', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Please wait...' : confirmLabel}
      </button>
    </div>
  );
}
