// ============================================================================
// FX Aggregator Server Entry Point
// ============================================================================

import app from "./app";

const PORT = process.env.FX_AGG_PORT || 3001;

app.listen(PORT, () => {
  console.log(`[FX Aggregator] API server listening on port ${PORT}`);
});
