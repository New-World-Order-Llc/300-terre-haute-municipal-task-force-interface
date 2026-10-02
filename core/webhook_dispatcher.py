import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import yaml

from core.audit import log_event

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "webhooks.yaml"
RETRY_DELAY = 1


def load_webhook_config():
    try:
        with open(CONFIG_PATH, "r") as f:
            return yaml.safe_load(f) or {}
    except (OSError, yaml.YAMLError) as e:
        log_event("webhook_config_error", {"error": str(e)})
        return {}


def _is_http_url(url):
    parsed = urlparse(url) if isinstance(url, str) else None
    return bool(parsed and parsed.scheme in ("http", "https") and parsed.netloc)


def dispatch_webhook(name: str, payload: dict) -> bool:
    cfg = load_webhook_config().get(name)
    if not cfg:
        log_event("webhook_missing_config", {"name": name})
        return False

    url = cfg.get("url")
    retries = cfg.get("retries", 3)
    timeout = cfg.get("timeout", 5)

    if not url:
        log_event("webhook_missing_url", {"name": name})
        return False

    # Unconfigured (placeholder) or unsafe endpoints are never contacted.
    if not _is_http_url(url):
        log_event("webhook_invalid_url", {"name": name})
        return False

    data = json.dumps(payload).encode("utf-8")

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                log_event("webhook_success", {"name": name, "status": resp.status})
                return True
        except (urllib.error.URLError, OSError, ValueError) as e:
            log_event("webhook_error", {"name": name, "attempt": attempt, "error": str(e)})
            if attempt < retries:
                time.sleep(RETRY_DELAY)

    return False
