// web/src/SubscriptionsPanel.tsx
import React, { useEffect, useState } from "react";

export default function SubscriptionsPanel(){
  const [plans,setPlans] = useState([]);
  const [subs,setSubs] = useState([]);

  useEffect(()=>{
    fetch("/api/connect/plans").then(r=>r.json()).then(setPlans);
    fetch("/api/connect/subscriptions").then(r=>r.json()).then(setSubs);
  },[]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Subscriptions</h1>
      <section className="grid md:grid-cols-2 gap-4 mt-4">
        {plans.map(p=>(
          <div key={p.id} className="p-4 border rounded-2xl">
            <div className="font-medium">{p.name} • {p.amount} {p.currency}/{p.frequency}</div>
            <div className="mt-2 text-sm opacity-70">{p.description}</div>
            <button className="mt-3 px-3 py-1 rounded-lg border" onClick={()=>createSub(p.id)}>Create Subscription</button>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <h2 className="text-lg">Active subscriptions</h2>
        <table className="w-full text-sm mt-2">
          <thead><tr><th>ID</th><th>Plan</th><th>Status</th><th>Next bill</th><th></th></tr></thead>
          <tbody>
            {subs.map(s=>(
              <tr key={s.id} className="border-b">
                <td>{s.id.slice(0,8)}…</td>
                <td>{s.plan_name}</td>
                <td>{s.status}</td>
                <td>{new Date(s.current_period_end).toLocaleDateString()}</td>
                <td><button className="px-2 py-1 rounded border">Change Plan</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
