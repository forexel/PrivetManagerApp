from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from typing import Iterable

from app.core.config import settings
import logging

logger = logging.getLogger("app.mailer")


def _build_message(
    subject: str,
    body_text: str,
    to: Iterable[str],
    html_body: str | None = None,
    headers: dict[str, str] | None = None,
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    from_addr = settings.SMTP_FROM or settings.SMTP_USER or "no-reply@example.com"
    from_name = (settings.SMTP_FROM_NAME or "PrivetSuper").strip()
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = ", ".join(to)
    # Plain text (always)
    msg.set_content(body_text or "")
    # Optional HTML alternative
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    # Extra headers (Reply-To, List-Unsubscribe, etc.)
    if headers:
        for k, v in headers.items():
            if v:
                msg[k] = v
    return msg


def _send_sync(msg: EmailMessage) -> None:
    host = settings.SMTP_HOST
    port = settings.SMTP_PORT or (465 if settings.SMTP_SSL else 587)
    user = settings.SMTP_USER
    password = settings.SMTP_PASSWORD
    use_tls = bool(settings.SMTP_TLS)
    use_ssl = bool(getattr(settings, 'SMTP_SSL', False))

    if not host or not port:
        logger.warning("SMTP disabled: host/port not configured")
        return

    def send_tls(p: int):
        with smtplib.SMTP(host, p, timeout=30) as s:
            s.ehlo()
            s.starttls()
            s.ehlo()
            if user and password:
                s.login(user, password)
            s.send_message(msg)

    def send_ssl(p: int):
        with smtplib.SMTP_SSL(host, p, timeout=30) as s:
            if user and password:
                s.login(user, password)
            s.send_message(msg)

    tried = []
    # Primary attempt
    try:
        if use_ssl or port == 465:
            logger.info("SMTP try SSL %s:%s", host, port)
            tried.append(f"ssl:{port}")
            send_ssl(port)
        elif use_tls:
            logger.info("SMTP try TLS %s:%s", host, port)
            tried.append(f"tls:{port}")
            send_tls(port)
        else:
            # plain (rare)
            logger.info("SMTP try PLAIN %s:%s", host, port)
            tried.append(f"plain:{port}")
            with smtplib.SMTP(host, port, timeout=30) as s:
                s.ehlo()
                if user and password:
                    s.login(user, password)
                s.send_message(msg)
        return
    except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, TimeoutError, OSError) as e:
        logger.warning("SMTP primary attempt failed (%s). Tried=%s", e, tried)
        # Fallback: try alternative port/mode commonly used
        try:
            if 'ssl' in ''.join(tried):
                alt_port = 587
                logger.info("SMTP fallback to TLS %s:%s", host, alt_port)
                send_tls(alt_port)
            else:
                alt_port = 465
                logger.info("SMTP fallback to SSL %s:%s", host, alt_port)
                send_ssl(alt_port)
        except Exception as e2:
            logger.error("SMTP fallback failed: %s", e2)
            raise


async def send_email(
    subject: str,
    body_text: str,
    to: Iterable[str],
    html_body: str | None = None,
    headers: dict[str, str] | None = None,
) -> bool:
    """Send email using standard library in a thread executor.

    Returns True on success, False on failure. No-op (False) if SMTP is not configured.
    """
    msg = _build_message(subject, body_text, to, html_body, headers)
    logger.info(
        "Sending email via SMTP host=%s port=%s to=%s (TLS=%s SSL=%s)",
        settings.SMTP_HOST, settings.SMTP_PORT, list(to), settings.SMTP_TLS, getattr(settings, 'SMTP_SSL', False)
    )
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _send_sync, msg)
        logger.info("Email sent to %s", list(to))
        return True
    except Exception as e:
        logger.exception("Email sending failed: %s", e)
        return False
