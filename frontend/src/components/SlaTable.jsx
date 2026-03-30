export function SlaTable({ rows }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <h2 className="text-sm font-semibold text-slate-200">SLA Snapshot</h2>
      <div className="mt-2 max-h-64 overflow-auto text-xs">
        <table className="w-full text-left">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1">Service</th>
              <th className="py-1">Env</th>
              <th className="py-1">Region</th>
              <th className="py-1">Category</th>
              <th className="py-1">Target</th>
              <th className="py-1">Current</th>
              <th className="py-1">Error Budget Left</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={`${item.name}-${item.env}`} className="border-t border-slate-800 text-slate-300">
                <td className="py-1">{item.name}</td>
                <td className="py-1">{item.env}</td>
                <td className="py-1">{item.region}</td>
                <td className="py-1 uppercase">{item.category}</td>
                <td className="py-1">{item.sla_target_pct}%</td>
                <td className="py-1">{item.current_availability_pct}%</td>
                <td className="py-1">{item.error_budget_remaining_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
