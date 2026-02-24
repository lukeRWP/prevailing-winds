'use client';

interface OperationFiltersProps {
  env: string;
  status: string;
  type: string;
  onEnvChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: string) => void;
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
  onEnvChange,
  onStatusChange,
  onTypeChange,
}: OperationFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
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
