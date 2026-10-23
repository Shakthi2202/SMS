import json
import logging
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlencode, urlsplit
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))
COURSES_FILE = ROOT / "courses.json"
COURSE_FIELDS = "name,slug,description,photoUrl,courseType,department,instructor,duration,rating,students,url"


class CampusConnectHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        request_url = urlsplit(self.path)
        if request_url.path in ("/api/courses.v1", "/api/courses"):
            self.handle_course_request(parse_qs(request_url.query))
            return
        self.handle_static_request(request_url.path)

    def do_HEAD(self):
        request_url = urlsplit(self.path)
        if request_url.path in ("/api/courses.v1", "/api/courses"):
            self.send_error_response(
                HTTPStatus.METHOD_NOT_ALLOWED,
                "Only GET requests are supported.",
                headers={"Allow": "GET"},
            )
            return
        self.handle_static_request(request_url.path, head_only=True)

    def do_POST(self):
        self.send_error_response(
            HTTPStatus.METHOD_NOT_ALLOWED,
            "Only GET and HEAD requests are supported.",
            headers={"Allow": "GET, HEAD"},
        )

    def load_local_courses(self):
        """Loads course data from local courses.json in JSON format."""
        if COURSES_FILE.is_file():
            try:
                with open(COURSES_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return data
                    elif isinstance(data, dict) and "elements" in data:
                        return data["elements"]
            except Exception:
                logging.exception("Could not read local courses.json file")
        return []

    def handle_course_request(self, query):
        try:
            limit = int(query.get("limit", ["24"])[0])
            start = int(query.get("start", ["0"])[0])
        except (TypeError, ValueError):
            self.send_error_response(
                HTTPStatus.BAD_REQUEST, "Invalid course catalog pagination."
            )
            return

        if not 1 <= limit <= 100 or start < 0:
            self.send_error_response(
                HTTPStatus.BAD_REQUEST, "Invalid course catalog pagination."
            )
            return

        all_courses = self.load_local_courses()
        total = len(all_courses)
        paged_courses = all_courses[start : start + limit]
        next_start = (start + limit) if (start + limit) < total else None

        response_data = {
            "elements": paged_courses,
            "paging": {
                "next": next_start,
                "total": total
            }
        }

        body = json.dumps(response_data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_bytes(
            HTTPStatus.OK,
            body,
            "application/json; charset=utf-8",
            headers={"Cache-Control": "public, max-age=60"},
        )

    def handle_static_request(self, requested_url_path, head_only=False):
        try:
            requested_path = unquote(requested_url_path, errors="strict")
        except UnicodeDecodeError:
            self.send_error_response(HTTPStatus.BAD_REQUEST, "Invalid file path.")
            return

        relative_path = "index.html" if requested_path == "/" else requested_path.lstrip("/")
        if not relative_path or any(
            part.startswith(".") for part in Path(relative_path).parts
        ):
            self.send_error_response(HTTPStatus.NOT_FOUND, "Not found.")
            return

        file_path = (ROOT / relative_path).resolve()
        try:
            file_path.relative_to(ROOT)
        except ValueError:
            self.send_error_response(HTTPStatus.NOT_FOUND, "Not found.")
            return

        if not file_path.is_file():
            self.send_error_response(HTTPStatus.NOT_FOUND, "Not found.")
            return

        content_type, _ = mimetypes.guess_type(file_path.name)
        if content_type is None:
            self.send_error_response(HTTPStatus.NOT_FOUND, "Not found.")
            return
        if content_type.startswith("text/") or content_type in (
            "application/javascript",
            "application/json",
        ):
            content_type += "; charset=utf-8"

        try:
            body = b"" if head_only else file_path.read_bytes()
        except OSError:
            logging.exception("Could not serve requested file")
            self.send_error_response(
                HTTPStatus.INTERNAL_SERVER_ERROR, "Unable to serve this page."
            )
            return

        self.send_bytes(HTTPStatus.OK, body, content_type)

    def send_error_response(self, status, message, headers=None):
        body = json.dumps({"error": message}).encode("utf-8")
        self.send_bytes(
            status,
            body,
            "application/json; charset=utf-8",
            headers=headers,
        )

    def send_bytes(self, status, body, content_type, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), CampusConnectHandler)
    print("Campus Connect is available at http://localhost:{0}".format(PORT))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Campus Connect.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
