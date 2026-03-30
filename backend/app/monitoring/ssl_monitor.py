import asyncio
import socket
import ssl
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.models.schemas import ServiceConfig, SslCertificateInfo


def _normalize_source_urls(services: list[ServiceConfig]) -> dict[str, set[str]]:
    domains: dict[str, set[str]] = {}
    for service in services:
        for raw_url in [service.url, service.summary_url, service.heartbeat_url]:
            if not raw_url:
                continue
            parsed = urlparse(raw_url)
            if parsed.scheme.lower() != "https":
                continue
            host = parsed.hostname
            if not host:
                continue
            domains.setdefault(host.lower(), set()).add(raw_url)
    return domains


def _format_issuer(cert: dict) -> str | None:
    issuer = cert.get("issuer")
    if not issuer:
        return None
    parts: list[str] = []
    for item in issuer:
        if not item:
            continue
        kv = item[0]
        if len(kv) == 2:
            parts.append(f"{kv[0]}={kv[1]}")
    return ", ".join(parts) if parts else None


def _fetch_ssl_certificate(domain: str, timeout_seconds: float) -> dict:
    context = ssl.create_default_context()
    with socket.create_connection((domain, 443), timeout=timeout_seconds) as sock:
        with context.wrap_socket(sock, server_hostname=domain) as tls_sock:
            cert = tls_sock.getpeercert()
            tls_version = tls_sock.version()
    return {"cert": cert, "tls_version": tls_version}


async def scan_ssl_certificates(
    services: list[ServiceConfig],
    critical_days: int = 7,
    warning_days: int = 15,
    timeout_seconds: float = 5.0,
) -> list[SslCertificateInfo]:
    domain_sources = _normalize_source_urls(services)
    if not domain_sources:
        return []

    async def check_domain(domain: str, source_urls: set[str]) -> SslCertificateInfo:
        try:
            result = await asyncio.to_thread(_fetch_ssl_certificate, domain, timeout_seconds)
            cert = result.get("cert", {})
            not_after = cert.get("notAfter")
            expiry = None
            if not_after:
                expiry = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days_remaining = None
            if expiry:
                days_remaining = (expiry - now).days

            if days_remaining is None:
                status = "ERROR"
            elif days_remaining < 0:
                status = "EXPIRED"
            elif days_remaining <= critical_days:
                status = "CRITICAL"
            elif days_remaining <= warning_days:
                status = "EXPIRING_SOON"
            else:
                status = "OK"

            return SslCertificateInfo(
                domain=domain,
                issuer=_format_issuer(cert),
                tls_version=result.get("tls_version"),
                expiry_date=expiry,
                days_remaining=days_remaining,
                status=status,  # type: ignore[arg-type]
                source_urls=sorted(source_urls),
            )
        except Exception as exc:  # noqa: BLE001
            return SslCertificateInfo(
                domain=domain,
                status="ERROR",
                source_urls=sorted(source_urls),
                error_message=f"{type(exc).__name__}: {exc}",
            )

    tasks = [check_domain(domain, urls) for domain, urls in domain_sources.items()]
    results = await asyncio.gather(*tasks)
    return sorted(results, key=lambda x: (x.days_remaining is None, x.days_remaining if x.days_remaining is not None else 10**9))
