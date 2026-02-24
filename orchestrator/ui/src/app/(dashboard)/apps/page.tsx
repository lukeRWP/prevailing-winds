'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, Plus, Trash2, ExternalLink, X } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { cn } from '@/lib/utils';

export default function AppsPage() {
  const { apps, role, setCurrentApp, refreshApps } = useApp();
  const router = useRouter();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = role === 'admin';

  async function handleDelete(appName: string) {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/_d_/apps/${appName}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setDeleteTarget(null);
        await refreshApps();
      } else {
        setError(data.message || 'Delete failed');
      }
    } catch {
      setError('Delete request failed');
    } finally {
      setDeleting(false);
    }
  }

  function handleAppClick(appName: string) {
    setCurrentApp(appName);
    router.push('/config');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Apps</h1>
          <p className="text-sm text-muted-foreground">Manage registered applications</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setRegisterOpen(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Register App
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {apps.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Boxes className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No applications registered.</p>
          {isAdmin && (
            <p className="text-xs text-muted-foreground mt-1">
              Click &quot;Register App&quot; to add your first application manifest.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <div
              key={app.name}
              className="rounded-lg border border-border bg-card p-4 hover:border-primary/50 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="cursor-pointer min-w-0 flex-1"
                  onClick={() => handleAppClick(app.name)}
                >
                  <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {app.displayName || app.name}
                  </h3>
                  <p className="text-xs font-mono text-muted-foreground truncate">{app.name}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => handleAppClick(app.name)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="View config"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteTarget(app.name)}
                      className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Delete app"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {app.repo && (
                <p className="text-[10px] text-muted-foreground font-mono truncate mb-3">
                  {app.repo}
                </p>
              )}

              <div className="flex items-center gap-1.5 flex-wrap">
                {app.environments.map((env) => (
                  <span
                    key={env}
                    className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      env === 'prod' ? 'bg-emerald-500/20 text-emerald-400' :
                      env === 'qa' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400'
                    )}
                  >
                    {env.toUpperCase()}
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground ml-1">
                  {app.environments.length} env{app.environments.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setDeleteTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-foreground mb-2">Delete Application</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Are you sure you want to delete <span className="font-mono font-bold text-foreground">{deleteTarget}</span>?
                This will remove the app manifest and cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteTarget)}
                  disabled={deleting}
                  className="rounded-md bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Register App Dialog */}
      {registerOpen && (
        <RegisterAppDialog
          onClose={() => setRegisterOpen(false)}
          onRegistered={refreshApps}
        />
      )}
    </div>
  );
}

function RegisterAppDialog({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => Promise<void>;
}) {
  const [appName, setAppName] = useState('');
  const [yamlContent, setYamlContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nameValid = /^[a-z][a-z0-9-]*$/.test(appName);

  async function handleSubmit() {
    if (!nameValid || !yamlContent.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/_u_/apps/${appName}/manifest`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: yamlContent }),
      });
      const data = await res.json();
      if (data.success) {
        await onRegistered();
        onClose();
      } else {
        setError(data.message || 'Registration failed');
      }
    } catch {
      setError('Registration request failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h3 className="text-sm font-semibold text-foreground">Register Application</h3>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">App Name</label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value.toLowerCase())}
                placeholder="my-app"
                className={cn(
                  'w-full rounded-md border bg-input px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
                  appName && !nameValid ? 'border-red-500/50' : 'border-border'
                )}
              />
              {appName && !nameValid && (
                <p className="text-[10px] text-red-400 mt-1">
                  Must start with a letter, lowercase alphanumeric and hyphens only
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Manifest YAML (app.yml)
              </label>
              <textarea
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                placeholder={'name: my-app\ndisplayName: "My Application"\nrepo: "git@github.com:org/repo.git"\n...'}
                rows={14}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !nameValid || !yamlContent.trim()}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
