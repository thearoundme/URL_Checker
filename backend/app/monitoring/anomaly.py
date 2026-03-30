from collections import defaultdict, deque
from typing import Deque, Dict, Tuple


class AnomalyDetector:
    def __init__(self, history_size: int, failure_window: int, intermittent_threshold: int) -> None:
        self._latency_history: Dict[str, Deque[float]] = defaultdict(lambda: deque(maxlen=history_size))
        self._failure_history: Dict[str, Deque[bool]] = defaultdict(lambda: deque(maxlen=failure_window))
        self._intermittent_threshold = intermittent_threshold

    def record(self, key: str, latency_ms: float, is_failure: bool) -> Tuple[bool, float]:
        lat_hist = self._latency_history[key]
        fail_hist = self._failure_history[key]

        moving_avg = (sum(lat_hist) / len(lat_hist)) if lat_hist else latency_ms
        latency_anomaly = len(lat_hist) >= 3 and latency_ms > (2 * moving_avg)

        fail_hist.append(is_failure)
        intermittent_anomaly = sum(1 for item in fail_hist if item) >= self._intermittent_threshold

        lat_hist.append(latency_ms)
        return latency_anomaly or intermittent_anomaly, moving_avg
