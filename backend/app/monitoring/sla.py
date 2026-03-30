from collections import defaultdict
from dataclasses import dataclass
from typing import Dict

from app.models.schemas import ServiceCheckResult, ServiceConfig, ServiceSla


@dataclass
class SlaCounter:
    success: int = 0
    total: int = 0


class SlaTracker:
    def __init__(self) -> None:
        self._counts: Dict[str, SlaCounter] = defaultdict(SlaCounter)

    @staticmethod
    def _key(name: str, env: str, region: str) -> str:
        return f"{name}:{env}:{region}"

    def record(self, result: ServiceCheckResult) -> None:
        key = self._key(result.name, result.env, result.region)
        counter = self._counts[key]
        counter.total += 1
        if result.status == "UP":
            counter.success += 1

    def get_availability_pct(self, name: str, env: str, region: str) -> float:
        key = self._key(name, env, region)
        counter = self._counts.get(key)
        if not counter or counter.total == 0:
            return 100.0
        return round((counter.success / counter.total) * 100.0, 2)

    def get_sla_snapshot(self, service_configs: list[ServiceConfig]) -> list[ServiceSla]:
        snapshots: list[ServiceSla] = []
        for config in service_configs:
            current = self.get_availability_pct(config.name, config.env, config.region)
            consumed = max(0.0, 100.0 - current)
            budget = max(0.0, 100.0 - config.sla)
            remaining = 0.0 if budget == 0 else max(0.0, round(((budget - consumed) / budget) * 100.0, 2))

            snapshots.append(
                ServiceSla(
                    name=config.name,
                    env=config.env,
                    region=config.region,
                    category=config.category,
                    sla_target_pct=config.sla,
                    current_availability_pct=current,
                    error_budget_remaining_pct=remaining,
                )
            )
        return snapshots
