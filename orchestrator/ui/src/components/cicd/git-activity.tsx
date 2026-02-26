'use client';

import { useState, useEffect } from 'react';
import { Tag, GitPullRequest, GitBranch, ExternalLink, Package } from 'lucide-react';
import type { GitRelease, GitPR } from '@/types/api';

interface GitActivityProps {
  appName: string;
}

export function GitActivity({ appName }: GitActivityProps) {
  const [releases, setReleases] = useState<GitRelease[]>([]);
  const [pulls, setPulls] = useState<GitPR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appName) return;
    fetch(`/api/proxy/_x_/apps/${appName}/git/activity`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setReleases(data.data.releases || []);
          setPulls(data.data.pulls || []);
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, [appName]);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading git activity...</p>;
  }

  if (releases.length === 0 && pulls.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Releases */}
      <div className="rounded-md border border-border bg-card/50 p-3">
        <h4 className="text-[10px] font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
          <Package className="h-3 w-3" />
          Releases
        </h4>
        {releases.length === 0 ? (
          <p className="text-xs text-zinc-600">No releases found</p>
        ) : (
          <div className="space-y-2">
            {releases.map((rel) => (
              <a
                key={rel.tag}
                href={rel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-2 group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3 w-3 text-amber-400 shrink-0" />
                    <span className="text-xs font-medium text-amber-400">{rel.tag}</span>
                    {rel.prerelease && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        pre
                      </span>
                    )}
                  </div>
                  {rel.name !== rel.tag && (
                    <p className="text-[11px] text-foreground mt-0.5 truncate">{rel.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{formatRelative(rel.date)}</span>
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Merged PRs */}
      <div className="rounded-md border border-border bg-card/50 p-3">
        <h4 className="text-[10px] font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
          <GitPullRequest className="h-3 w-3" />
          Recent Merged PRs
        </h4>
        {pulls.length === 0 ? (
          <p className="text-xs text-zinc-600">No merged PRs found</p>
        ) : (
          <div className="space-y-2">
            {pulls.map((pr) => (
              <a
                key={pr.number}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <GitPullRequest className="h-3 w-3 text-violet-400 shrink-0" />
                      <span className="text-[11px] text-violet-400">#{pr.number}</span>
                      <span className="text-xs text-foreground truncate">{pr.title}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                      <GitBranch className="h-2.5 w-2.5 shrink-0" />
                      <span>{pr.branch}</span>
                      <span>&rarr;</span>
                      <span>{pr.baseBranch}</span>
                      <span className="mx-1">&middot;</span>
                      <span>{pr.author}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatRelative(pr.mergedAt)}</span>
                    <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
