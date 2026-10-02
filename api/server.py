"""HTTP API around the pipeline (integration module only; stdlib, no new deps)."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from core.pipeline import run_pipeline
from core.status import status_report

MAX_BODY = 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path.rstrip("/") != "/cases":
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            return self._send(400, {"error": "invalid Content-Length"})
        if length <= 0 or length > MAX_BODY:
            return self._send(400, {"error": "invalid body size"})
        try:
            payload = json.loads(self.rfile.read(length))
        except ValueError:
            return self._send(400, {"error": "invalid JSON"})
        if not isinstance(payload, dict):
            return self._send(400, {"error": "payload must be a JSON object"})
        result = run_pipeline(payload)
        code = 201 if result["validation"].get("valid") else 422
        self._send(code, result)

    def do_GET(self):
        parts = self.path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "status" and parts[1]:
            return self._send(200, status_report(parts[1]))
        self._send(404, {"error": "not found"})

    def log_message(self, *args):
        pass


def make_server(host="127.0.0.1", port=8080):
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    make_server().serve_forever()
