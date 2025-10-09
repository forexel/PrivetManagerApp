"""Helpers for contract PDF generation."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Sequence

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

_TEMPLATE_PATH = Path(__file__).with_name("templates") / "contract_template.txt"


def _load_template() -> str:
    try:
        return _TEMPLATE_PATH.read_text(encoding="utf-8")
    except FileNotFoundError as exc:  # pragma: no cover - template is part of repo
        raise RuntimeError(f"Contract template not found at {_TEMPLATE_PATH}") from exc


def _render_template(
    *,
    contract_number: str,
    passport_snapshot: dict,
    devices: list[dict],
    tariff_snapshot: dict,
) -> list[str]:
    template = _load_template()

    client_full_name = " ".join(
        filter(
            None,
            [
                passport_snapshot.get("last_name", ""),
                passport_snapshot.get("first_name", ""),
                passport_snapshot.get("middle_name", ""),
            ],
        )
    ).strip()

    devices_block = "\n".join(
        f"- {device.get('device_type', '').title()} — {device.get('title', '')} (доплата {device.get('extra_fee', 0)} ₽)"
        for device in devices
    ) or "- Устройства не указаны"

    specs_block = "\n".join(
        (
            f"  • Характеристики: {', '.join(f'{k}: {v}' for k, v in (device.get('specs') or {}).items())}"
            if device.get("specs")
            else ""
        )
        for device in devices
    )
    specs_block = "\n".join(line for line in specs_block.splitlines() if line)

    context = {
        "contract_number": contract_number,
        "client_full_name": client_full_name or "—",
        "passport_series": passport_snapshot.get("series", ""),
        "passport_number": passport_snapshot.get("number", ""),
        "passport_issue_date": passport_snapshot.get("issue_date", ""),
        "passport_issue_code": passport_snapshot.get("issue_code", ""),
        "passport_issued_by": passport_snapshot.get("issued_by", ""),
        "passport_registration_address": passport_snapshot.get("registration_address", ""),
        "devices_block": devices_block,
        "devices_specs_block": specs_block,
        "tariff_device_count": tariff_snapshot.get("device_count", 0),
        "tariff_extra_per_device": tariff_snapshot.get("extra_per_device", 0),
        "tariff_total_extra_fee": tariff_snapshot.get("total_extra_fee", 0),
    }

    rendered = template.format(**context)
    return rendered.splitlines()


def _write_lines(pdf: canvas.Canvas, lines: Sequence[str]) -> None:
    x_margin = 40
    y = A4[1] - 60
    for line in lines:
        pdf.drawString(x_margin, y, line)
        y -= 18
        if y < 60:
            pdf.showPage()
            y = A4[1] - 60


def build_contract_pdf(
    *,
    contract_number: str,
    passport_snapshot: dict,
    devices: list[dict],
    tariff_snapshot: dict,
) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)

    lines = _render_template(
        contract_number=contract_number,
        passport_snapshot=passport_snapshot,
        devices=devices,
        tariff_snapshot=tariff_snapshot,
    )

    _write_lines(pdf, lines)
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
