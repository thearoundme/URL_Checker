import json
import random
from pathlib import Path


OUTPUT = Path(__file__).resolve().parents[1] / "config" / "services.json"

ENVS = ["prod", "UAT", "UAT2", "UAT3"]
REGIONS = ["EAST", "WEST"]
PLATFORMS = ["k8", "vm"]
TEAMS = ["accounts", "commerce", "catalog", "payments", "notifications", "search"]
TOOL_NAMES = ["grafana", "jenkins", "prometheus", "kibana", "argo-cd", "vault"]


def build_service(idx: int) -> dict:
    env = ENVS[idx % len(ENVS)]
    region = REGIONS[(idx // len(ENVS)) % len(REGIONS)]
    platform = PLATFORMS[idx % len(PLATFORMS)]
    team = TEAMS[idx % len(TEAMS)]
    base_name = f"svc-{idx:03d}"

    category = idx % 10
    service_category = "tool" if idx % 7 == 0 else "application"
    if service_category == "tool":
        base_name = f"{TOOL_NAMES[idx % len(TOOL_NAMES)]}-{env.lower()}-{region.lower()}-{idx:03d}"
    # 0-5: healthy, 6-7: degraded, 8: down, 9: flaky
    if category <= 3:
        check_type = "https"
        url = "http://127.0.0.1:8000/mock/up"
        expected = "UP"
        keyword = None
        threshold = 800
    elif category == 4:
        check_type = "tomcat"
        url = "http://127.0.0.1:8000/mock/tomcat/running"
        expected = None
        keyword = "running"
        threshold = 1000
    elif category == 5:
        check_type = "heartbeat"
        url = "http://127.0.0.1:8000/mock/heartbeat?value=UP"
        expected = "UP"
        keyword = None
        threshold = 900
    elif category in (6, 7):
        check_type = "https"
        # Deliberately slow endpoint to produce DEGRADED.
        url = "http://127.0.0.1:8000/mock/slow?ms=1500"
        expected = "UP"
        keyword = None
        threshold = 700
    elif category == 8:
        check_type = "https"
        url = "http://127.0.0.1:8000/mock/down"
        expected = "UP"
        keyword = None
        threshold = 800
    else:
        check_type = "https"
        url = f"http://127.0.0.1:8000/mock/flaky/{base_name}"
        expected = "UP"
        keyword = None
        threshold = 800

    return {
        "name": base_name,
        "env": env,
        "region": region,
        "platform": platform,
        "category": service_category,
        "type": check_type,
        "url": url,
        "team": team,
        "critical": category in (8, 9),
        "sla": round(random.choice([99.0, 99.5, 99.9]), 1),
        "expected_response": expected,
        "keyword": keyword,
        "degraded_threshold_ms": threshold,
    }


def main() -> None:
    random.seed(42)
    services = [build_service(i) for i in range(1, 521)]
    OUTPUT.write_text(json.dumps({"services": services}, indent=2), encoding="utf-8")
    print(f"Wrote {len(services)} services to {OUTPUT}")


if __name__ == "__main__":
    main()
