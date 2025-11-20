#!/usr/bin/env python3
"""
BRIQUE 142-SIRA — SIRA Bridge Service
HTTP bridge that wraps gRPC calls to SIRA model service
Provides a simple HTTP API for Node.js services to call
"""

import os
import json
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
from concurrent import futures
import grpc

# Import generated protobuf code (assumes sira_pb2.py and sira_pb2_grpc.py exist)
try:
    import sira_pb2 as pb
    import sira_pb2_grpc as rpc
except ImportError:
    print("ERROR: Missing generated protobuf code. Run: python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. sira.proto")
    pb = None
    rpc = None

# Configuration
MODEL_HOST = os.environ.get("SIRA_MODEL_HOST", "localhost:50051")
MODEL_CERT = os.environ.get("SIRA_MODEL_CERT")  # path to TLS cert if mTLS
BRIDGE_PORT = int(os.environ.get("SIRA_BRIDGE_PORT", "8081"))


def call_model(samples, request_id=None, model_version=None):
    """
    Call SIRA gRPC model service with event samples
    Returns inference response as dict
    """
    if not pb or not rpc:
        raise RuntimeError("Protobuf code not generated")

    # Create gRPC channel (insecure for dev, use TLS in production)
    if MODEL_CERT and os.path.exists(MODEL_CERT):
        with open(MODEL_CERT, 'rb') as f:
            creds = grpc.ssl_channel_credentials(f.read())
        channel = grpc.secure_channel(MODEL_HOST, creds)
    else:
        channel = grpc.insecure_channel(MODEL_HOST)

    stub = rpc.SiraModelStub(channel)

    # Build request
    req = pb.InferRequest(
        request_id=request_id or "",
        model_version=model_version or ""
    )

    for s in samples:
        ev = pb.EventSample(
            id=str(s.get("id", "")),
            type=s.get("type", ""),
            amount=float(s.get("amount", 0)),
            currency=s.get("currency", ""),
            occurred_at=s.get("occurred_at", "")
        )
        for k, v in (s.get("meta") or {}).items():
            ev.meta[k] = str(v)
        req.samples.append(ev)

    # Call model with timeout
    try:
        res = stub.Infer(req, timeout=20)
    except grpc.RpcError as e:
        raise RuntimeError(f"gRPC error: {e.code()} - {e.details()}")

    # Convert to dict
    return {
        "request_id": res.request_id,
        "scenario": res.scenario,
        "confidence": res.confidence,
        "justification": [
            {"name": i.name, "value": i.value, "note": i.note}
            for i in res.justification
        ],
        "suggested_actions": list(res.suggested_actions),
        "model_version": res.model_version,
        "dataset_hash": res.dataset_hash,
        "debug_info": res.debug_info,
        "metrics": dict(res.metrics)
    }


class BridgeHandler(BaseHTTPRequestHandler):
    """HTTP handler for bridge API"""

    def log_message(self, format, *args):
        """Override to customize logging"""
        print(f"[SIRA Bridge] {self.address_string()} - {format % args}")

    def do_POST(self):
        """Handle POST requests"""
        if self.path == "/v1/infer":
            self.handle_infer()
        elif self.path == "/health":
            self.handle_health()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "not_found"}).encode())

    def do_GET(self):
        """Handle GET requests"""
        if self.path == "/health":
            self.handle_health()
        else:
            self.send_response(404)
            self.end_headers()

    def handle_health(self):
        """Health check endpoint"""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())

    def handle_infer(self):
        """Handle inference request"""
        try:
            # Read request body
            length = int(self.headers.get('content-length', 0))
            raw = self.rfile.read(length)
            payload = json.loads(raw)

            samples = payload.get("samples", [])
            request_id = self.headers.get("Idempotency-Key") or payload.get("request_id")
            model_version = payload.get("model_version")

            if not samples:
                self.send_error(400, "Missing samples")
                return

            # Call model
            result = call_model(samples, request_id=request_id, model_version=model_version)

            # Return response
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            print(f"[SIRA Bridge] Error: {e}")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())


def main():
    """Start HTTP server"""
    server = HTTPServer(('0.0.0.0', BRIDGE_PORT), BridgeHandler)
    print(f"[SIRA Bridge] Listening on port {BRIDGE_PORT}")
    print(f"[SIRA Bridge] Model service: {MODEL_HOST}")
    print(f"[SIRA Bridge] TLS: {'enabled' if MODEL_CERT else 'disabled (dev mode)'}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[SIRA Bridge] Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
