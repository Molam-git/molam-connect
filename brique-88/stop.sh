#!/bin/bash

# Brique 88 - Stop Script
# Stops all services gracefully

set -e

echo "🛑 Stopping Brique 88 services..."

if [ -f .pids ]; then
  while read pid; do
    if ps -p $pid > /dev/null 2>&1; then
      echo "  - Stopping process $pid..."
      kill -SIGTERM $pid
      # Wait for graceful shutdown
      sleep 2
      # Force kill if still running
      if ps -p $pid > /dev/null 2>&1; then
        echo "    Process $pid didn't stop gracefully, forcing..."
        kill -9 $pid
      fi
      echo "    ✅ Stopped"
    else
      echo "  - Process $pid already stopped"
    fi
  done < .pids

  rm .pids
  echo ""
  echo "✅ All services stopped successfully"
else
  echo "⚠️  No .pids file found. Services may not be running."
  echo "    You can manually check with: ps aux | grep node"
fi
