import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import {
  createUser,
  deleteUser,
  fetchCandidates,
  fetchUsers,
  updateUser,
} from "../api";
import type { CandidateListItem, UserListItem } from "../api";
import { useAuth } from "../context/AuthContext";

// ─── Form State ───

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: string;
  candidateId: string;
}

const emptyForm: UserFormData = {
  name: "",
  email: "",
  password: "",
  role: "user",
  candidateId: "",
};

// ─── User Form Component ───

function UserForm({
  initial,
  candidates,
  isEdit,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: UserFormData;
  candidates: CandidateListItem[];
  isEdit: boolean;
  isPending: boolean;
  error: string | null;
  onSubmit: (data: UserFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<UserFormData>(initial);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  const set = (field: keyof UserFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-875 p-5">
      <h3 className="text-sm font-medium text-slate-200 mb-4">
        {isEdit ? "Edit User" : "Create User"}
      </h3>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1.5">
              Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={set("name")}
              placeholder="Full name"
              className="w-full bg-slate-925 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={set("email")}
              placeholder="user@example.com"
              className="w-full bg-slate-925 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1.5">
              Password{isEdit ? " (leave blank to keep)" : ""}
            </label>
            <input
              type="password"
              required={!isEdit}
              value={form.password}
              onChange={set("password")}
              placeholder={isEdit ? "Unchanged" : "Password"}
              className="w-full bg-slate-925 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1.5">
              Role
            </label>
            <select
              value={form.role}
              onChange={set("role")}
              className="w-full bg-slate-925 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-mono text-slate-500 mb-1.5">
              Linked Candidate
            </label>
            <select
              value={form.candidateId}
              onChange={set("candidateId")}
              className="w-full bg-slate-925 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
            >
              <option value="">None</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-400 text-slate-925 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending
              ? isEdit
                ? "Saving..."
                : "Creating..."
              : isEdit
                ? "Save Changes"
                : "Create User"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Users Page ───

export function Users() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserListItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeletingUser(null);
    },
  });

  function handleCreate(form: UserFormData) {
    setFormError(null);
    createMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      ...(form.candidateId ? { candidateId: form.candidateId } : {}),
    });
  }

  function handleUpdate(form: UserFormData) {
    if (!editingUser) return;
    setFormError(null);
    const data: Parameters<typeof updateUser>[1] = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      candidateId: form.candidateId || undefined,
    };
    if (form.password) {
      data.password = form.password;
    }
    updateMutation.mutate({ id: editingUser.id, data });
  }

  function openEdit(u: UserListItem) {
    setShowForm(false);
    setFormError(null);
    setEditingUser(u);
  }

  function openCreate() {
    setEditingUser(null);
    setFormError(null);
    setShowForm(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
        loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage user accounts and roles
          </p>
        </div>
        {!showForm && !editingUser && (
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            + New User
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <UserForm
          initial={emptyForm}
          candidates={candidates ?? []}
          isEdit={false}
          isPending={createMutation.isPending}
          error={formError}
          onSubmit={handleCreate}
          onCancel={() => {
            setShowForm(false);
            setFormError(null);
          }}
        />
      )}

      {/* Edit form */}
      {editingUser && (
        <UserForm
          key={editingUser.id}
          initial={{
            name: editingUser.name,
            email: editingUser.email,
            password: "",
            role: editingUser.role,
            candidateId: editingUser.candidateId ?? "",
          }}
          candidates={candidates ?? []}
          isEdit={true}
          isPending={updateMutation.isPending}
          error={formError}
          onSubmit={handleUpdate}
          onCancel={() => {
            setEditingUser(null);
            setFormError(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      {deletingUser && (
        <div className="border border-red-900/50 bg-red-950/30 rounded-lg p-5">
          <p className="text-sm text-red-400">
            Are you sure you want to delete{" "}
            <span className="font-medium text-red-300">
              {deletingUser.name}
            </span>
            ? This action cannot be undone.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => deleteMutation.mutate(deletingUser.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </button>
            <button
              onClick={() => setDeletingUser(null)}
              className="px-4 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      {users && users.length > 0 && (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs font-mono font-normal text-slate-500 px-5 py-3">
                  Name
                </th>
                <th className="text-left text-xs font-mono font-normal text-slate-500 px-5 py-3 hidden sm:table-cell">
                  Email
                </th>
                <th className="text-left text-xs font-mono font-normal text-slate-500 px-5 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-mono font-normal text-slate-500 px-5 py-3 hidden md:table-cell">
                  Linked Candidate
                </th>
                <th className="text-left text-xs font-mono font-normal text-slate-500 px-5 py-3 hidden lg:table-cell">
                  Created
                </th>
                <th className="text-right text-xs font-mono font-normal text-slate-500 px-5 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-slate-800/20 transition-colors"
                >
                  <td className="px-5 py-3">
                    <span className="text-sm text-slate-200">{u.name}</span>
                    {u.id === currentUser?.id && (
                      <span className="ml-2 text-[10px] font-mono text-amber-400/60">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <span className="text-sm text-slate-400">{u.email}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded ${
                        u.role === "admin"
                          ? "text-amber-400 bg-amber-400/10"
                          : "text-slate-400 bg-slate-800"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <span className="text-sm text-slate-400">
                      {u.candidateName ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs font-mono text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-xs text-slate-500 hover:text-slate-200 transition-colors"
                      >
                        Edit
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => setDeletingUser(u)}
                          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {users && users.length === 0 && (
        <p className="text-sm text-slate-600 text-center py-12">
          No users found. Click &quot;+ New User&quot; to add one.
        </p>
      )}
    </div>
  );
}
