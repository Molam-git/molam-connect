// components/AutoHealingConsole.tsx
export default function AutoHealingConsole({logs}:{logs:any[]}) {
  return (
    <div className="p-4 bg-gray-50 rounded">
      <h2 className="text-xl font-bold">Auto-Healing Logs</h2>
      <table className="mt-4 w-full border">
        <thead>
          <tr><th>Plugin</th><th>Issue</th><th>Patch</th><th>Status</th><th>Date</th></tr>
        </thead>
        <tbody>
          {logs.map(l=>(
            <tr key={l.id} className="border-t">
              <td>{l.plugin_id}</td>
              <td>{l.detected_issue}</td>
              <td><pre>{JSON.stringify(l.applied_patch,null,2)}</pre></td>
              <td>{l.status}</td>
              <td>{l.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
