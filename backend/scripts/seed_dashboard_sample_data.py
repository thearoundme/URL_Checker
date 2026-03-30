import json
import socket
import urllib.error
import urllib.parse
import urllib.request


BASE_URL = "http://127.0.0.1:8000"
API_KEY = "local-dev-key"
REQUEST_TIMEOUT_SECONDS = 180


def post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_smoke(brand: str, env: str, region: str, target_url: str | None = None) -> None:
    query = urllib.parse.urlencode({"brand": brand, "env": env, "region": region})
    payload = {"target_url": target_url, "mode": "api"}
    try:
        result = post(f"/smoke/run?{query}", payload)
        print(f"Smoke seeded: {brand}/{env}/{region} -> {result.get('status')}")
    except urllib.error.HTTPError as exc:
        print(f"Smoke seed failed: {brand}/{env}/{region} -> HTTP {exc.code}")


def run_patching(group: str, selected_services: list[str] | None = None) -> None:
    payload = {"group": group, "selected_services": selected_services or []}
    try:
        result = post("/patching/run", payload)
        print(f"Patching seeded: {group} -> {result.get('status')}")
    except TimeoutError:
        print(f"Patching seed timed out: {group} (increase REQUEST_TIMEOUT_SECONDS if needed)")
    except socket.timeout:
        print(f"Patching seed timed out: {group} (socket timeout)")
    except urllib.error.HTTPError as exc:
        print(f"Patching seed failed: {group} -> HTTP {exc.code}")
    except urllib.error.URLError as exc:
        print(f"Patching seed failed: {group} -> {exc.reason}")


def main() -> None:
    # Seed smoke history with both pass/fail style targets.
    run_smoke("WS_US", "uat1", "EAST", "http://127.0.0.1:8000/mock/up")
    run_smoke("PB_US", "uat2", "WEST", "http://127.0.0.1:8000/mock/down")
    run_smoke("WE_US", "uat3", "EAST", "http://127.0.0.1:8000/mock/slow?ms=900")
    run_smoke("RJ_US", "uat3", "WEST", "http://127.0.0.1:8000/mock/flaky/rj-uat3-west")

    # Seed manual test history with small, fast subsets.
    run_patching(
        "day1-tools-vm",
        selected_services=[
            "jenkins-uat3-west-007",
            "kibana-uat-west-021",
            "vault-uat3-east-035",
        ],
    )
    run_patching(
        "day2-east-vm",
        selected_services=[
            "svc-001",
            "svc-009",
            "svc-017",
            "svc-025",
        ],
    )
    run_patching(
        "day3-west-vm",
        selected_services=[
            "svc-005",
            "svc-013",
            "svc-029",
            "svc-037",
        ],
    )

    print("Sample dashboard data seed complete.")


if __name__ == "__main__":
    main()
