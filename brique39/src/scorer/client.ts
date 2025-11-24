export async function scoreTransaction(features: any) {
    const res = await fetch(`${process.env.SCORER_URL}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(features),
    });

    if (!res.ok) {
        throw new Error(`Scorer error: ${res.status}`);
    }

    return res.json();
}