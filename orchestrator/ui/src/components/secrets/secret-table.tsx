'use client';

import { useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2, Check, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecretTableProps {
  secrets: Record<string, string>;
  onUpdate: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onAdd: (key: string, value: string) => Promise<void>;
  readOnly?: boolean;
  loading?: boolean;
}

export function SecretTable({ secrets, onUpdate, onDelete, onAdd, readOnly, loading }: SecretTableProps) {
  const entries = Object.entries(secrets).sort(([a], [b]) => a.localeCompare(b));

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Loading secrets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground">No secrets at this path.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase w-1/3">Key</th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Value</th>
                {!readOnly && (
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase w-24">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map(([key, value]) => (
                <SecretRow
                  key={key}
                  secretKey={key}
                  value={value}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  readOnly={readOnly}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && <AddSecretRow onAdd={onAdd} existingKeys={Object.keys(secrets)} />}
    </div>
  );
}

function SecretRow({
  secretKey,
  value,
  onUpdate,
  onDelete,
  readOnly,
}: {
  secretKey: string;
  value: string;
  onUpdate: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (editValue === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onUpdate(secretKey, editValue);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await onDelete(secretKey);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const displayValue = revealed ? value : '\u2022'.repeat(Math.min(value.length, 24));

  return (
    <tr className="hover:bg-accent/20 group">
      <td className="px-4 py-2">
        <span className="text-xs font-mono text-foreground">{secretKey}</span>
      </td>
      <td className="px-4 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setEditValue(value); setEditing(false); } }}
              autoFocus
              className="rounded border border-primary bg-input px-2 py-0.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring flex-1 max-w-md"
            />
            <button onClick={handleSave} disabled={busy} className="p-0.5 text-emerald-400 hover:text-emerald-300">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setEditValue(value); setEditing(false); }} className="p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={cn('text-xs', revealed ? 'font-mono text-muted-foreground break-all' : 'text-muted-foreground tracking-wider')}>
              {displayValue}
            </span>
            <button
              onClick={() => setRevealed(!revealed)}
              className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title={revealed ? 'Hide' : 'Reveal'}
            >
              {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
        )}
      </td>
      {!readOnly && (
        <td className="px-4 py-2 text-right">
          {confirming ? (
            <div className="flex items-center justify-end gap-1">
              <span className="text-[10px] text-red-400 mr-1">Delete?</span>
              <button onClick={handleDelete} disabled={busy} className="text-[10px] text-red-400 hover:text-red-300 font-medium">
                Yes
              </button>
              <button onClick={() => setConfirming(false)} className="text-[10px] text-muted-foreground hover:text-foreground">
                No
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => { setEditValue(value); setEditing(true); setRevealed(true); }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Edit"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => setConfirming(true)}
                className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

const VALID_KEY = /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/;

function AddSecretRow({
  onAdd,
  existingKeys,
}: {
  onAdd: (key: string, value: string) => Promise<void>;
  existingKeys: string[];
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleAdd() {
    setErr('');
    if (!VALID_KEY.test(key)) {
      setErr('Key must start with a letter and contain only letters, numbers, underscores, hyphens, or dots.');
      return;
    }
    if (existingKeys.includes(key)) {
      setErr('Key already exists. Edit the existing value instead.');
      return;
    }
    if (!value) {
      setErr('Value cannot be empty.');
      return;
    }

    setBusy(true);
    try {
      await onAdd(key, value);
      setKey('');
      setValue('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Secret
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={key}
          onChange={(e) => { setKey(e.target.value); setErr(''); }}
          placeholder="KEY_NAME"
          className="rounded border border-border bg-input px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-48"
          autoFocus
        />
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr(''); }}
          placeholder="secret value"
          className="rounded border border-border bg-input px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false); }}
        />
        <button
          onClick={handleAdd}
          disabled={busy}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? '...' : 'Add'}
        </button>
        <button
          onClick={() => { setOpen(false); setKey(''); setValue(''); setErr(''); }}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {err && <p className="text-[10px] text-red-400">{err}</p>}
    </div>
  );
}
