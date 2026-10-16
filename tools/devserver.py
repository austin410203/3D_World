# devserver.py - local static server with caching disabled (ES modules are otherwise reused stale by the browser)
#   python tools/devserver.py [port]
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5179
http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
