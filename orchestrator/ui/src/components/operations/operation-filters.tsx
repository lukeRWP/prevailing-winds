'use client';

import { Search } from 'lucide-react';

interface OperationFiltersProps {
  env: string;
  status: string;
  type: string;
  search: string;
  onEnvChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}

const ENVS = ['', 'dev', 'qa', 'prod'];
const STATUSES = ['', 'queued', 'running', 'success', 'failed', 'cancelled'];
const TYPES = [
  '',
  'deploy',
  'deploy-server',
  'deploy-client',
  'provision',
  'infra-plan',
  'infra-apply',
  'db-setup',
  'db-migrate',
  'db-backup',
  'start',
  'stop',
  'restart',
];

export function OperationFilters({
  env,
  status,
  type,
  search,
  onEnvChange,
  onStatusChange,
  onTypeChange,
  onSearchChange,
}: OperationFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search ref, user, ID..."
          className="rounded-md border border-border bg-card pl-7 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-48"
        />
      </div>
      <FilterSelect label="Environment" value={env} options={ENVS} onChange={onEnvChange} />
      <FilterSelect label="Status" value={status} options={STATUSES} onChange={onStatusChange} />
      <FilterSelect label="Type" value={type} options={TYPES} onChange={onTypeChange} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt || 'All'}
          </option>
        ))}
      </select>
    </div>
  );
}
