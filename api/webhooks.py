"""Local test harness that accepts webhook POSTs. Not for production use."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class WebhookTestServer(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            json.loads(self.rfile.read(length))
        except ValueError:
            self.send_response(400)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"OK")

    def log_message(self, *args):
        pass


def make_webhook_test_server(port=9090):
    return HTTPServer(("127.0.0.1", port), WebhookTestServer)


def start_webhook_test_server(port=9090):
    make_webhook_test_server(port).serve_forever()
