"""Helpers for contract PDF generation."""
from __future__ import annotations

import random
from datetime import datetime, timedelta

import re
from io import BytesIO
from pathlib import Path
from typing import Sequence

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import cidfonts
from reportlab.lib.styles import getSampleStyleSheet

try:
    pdfmetrics.registerFont(TTFont("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
except Exception:
    pass

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
    client_full_name: str | None = None,
) -> list[str]:
    template = _load_template()

    client_full_name = (client_full_name or "").strip()

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
    # шрифт с кириллицей
    try:
        pdf.setFont("DejaVuSans", 11)
    except Exception:
        pass
    x_margin = 40
    y = A4[1] - 60
    for line in lines:
        pdf.drawString(x_margin, y, line)
        y -= 18
        if y < 60:
            pdf.showPage()
            try:
                pdf.setFont("DejaVuSans", 11)
            except Exception:
                pass
            y = A4[1] - 60


def build_contract_pdf(
    *,
    contract_number: str,
    passport_snapshot: dict,
    devices: list[dict],
    tariff_snapshot: dict,
    client_full_name: str | None = None,
) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)

    lines = _render_template(
        contract_number=contract_number,
        passport_snapshot=passport_snapshot,
        devices=devices,
        tariff_snapshot=tariff_snapshot,
        client_full_name=client_full_name,
    )

    _write_lines(pdf, lines)
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()

async def request_contract_otp(db, *, client):
    """Генерирует OTP, гарантирует наличие номера договора, сохраняет в контракт и отправляет в чат Support."""
    from app.manager_api import crud  # локальный импорт, чтобы избежать циклов
    from app.services.support_bridge import SupportBridgeService

    # 1) Сгенерировать OTP и записать в контракт
    otp = f"{random.randint(100000, 999999)}"
    await crud.upsert_contract(db, client=client, data={
        "otp_code": otp,
        "otp_sent_at": datetime.utcnow(),
    })

    # 2) Убедиться, что у контракта есть номер (для сообщения в чат)
    #    Формируем короткий предсказуемый номер формата AA-YYMMDD-01,
    #    где AA — первые 2 буквы фамилии (или имени пользователя),
    #    YYMMDD — дата по UTC. Если номер уже есть — не трогаем его.
    fresh = await crud.get_client(db, client.id)
    number: str | None = None
    if fresh and fresh.contract and fresh.contract.contract_number:
        number = fresh.contract.contract_number
    else:
        last_name = (
            getattr(getattr(fresh, "passport", None), "last_name", None)
            or (getattr(getattr(fresh, "user", None), "name", "") or "").split(" ")[-1]
            or ""
        )
        two = re.sub(r"[^A-Za-zА-Яа-яЁё]", "", last_name or "").upper()[:2] or "XX"
        yymmdd = datetime.utcnow().strftime("%y%m%d")
        base = f"{two}-{yymmdd}"
        # Базово даём суффикс -01; если уже был номер на эту дату у этого клиента,
        # оставляем его как есть (истории у нас нет, так что просто не увеличиваем).
        number = f"{base}-01"
        await crud.upsert_contract(db, client=client, data={
            "contract_number": number,
        })

    # 3) Отправить сообщение в Support с номером договора и кодом
    bridge = SupportBridgeService(db)
    ticket = await bridge.ensure_ticket(client)
    # Новый формат сообщения
    await bridge.post_support_message(ticket=ticket, body=f"Договор {number}, код подтверждения {otp}")
    return {"ok": True}


async def confirm_contract_and_build_pdf(db, *, client, otp_code: str) -> dict:
    """Проверяет OTP, рендерит PDF, сохраняет в S3, помечает контракт подписанным."""
    from app.manager_api import crud
    from app.services.storage import storage_service

    from fastapi import HTTPException

    fresh = await crud.get_client(db, client.id)
    if (not fresh) or (not fresh.contract) or ((fresh.contract.otp_code or "").strip() != otp_code.strip()):
        # возвращаем корректный 400 вместо 500
        raise HTTPException(status_code=400, detail="INVALID_OTP")

    passport_snapshot = (fresh.passport or {}).__dict__ if hasattr(fresh.passport, "__dict__") else {}
    devices = [d.__dict__ for d in (fresh.devices or [])]

    tariff_snapshot = {}
    if fresh.tariff:
        user_name = (getattr(fresh.user, "name", "") or "").strip()
        last_name = (
            getattr(getattr(fresh, "passport", None), "last_name", None)
            or (user_name.split(" ")[-1] if user_name else None)
        ) or ""
        tariff_snapshot = {
            "device_count": int(getattr(fresh.tariff, "device_count", 0) or 0),
            "extra_per_device": float(getattr(getattr(fresh.tariff, "tariff", None), "extra_per_device", 0) or 0),
            "total_extra_fee": float(getattr(fresh.tariff, "total_extra_fee", 0) or 0),
            "client_full_name": user_name or last_name,
        }

    user_name = (getattr(fresh.user, "name", "") or "").strip()
    if fresh.contract.contract_number:
        number = fresh.contract.contract_number
    else:
        last_name = (getattr(fresh.passport, 'last_name', None) or (getattr(getattr(fresh, 'user', None), 'name', '') or '').split(' ')[-1])
        two = re.sub(r"[^A-Za-zА-Яа-яЁё]", "", (last_name or '')).upper()[:2] or "XX"
        yymmdd = datetime.utcnow().strftime("%y%m%d")
        number = f"{two}-{yymmdd}-01"

    try:
        pdf_bytes = await _try_build_from_docx(
            passport_snapshot=passport_snapshot,
            devices=devices,
            tariff_snapshot=tariff_snapshot,
            contract_number=number,
        )
    except Exception:
        pdf_bytes = build_contract_pdf(
            contract_number=number,
            passport_snapshot=passport_snapshot,
            devices=devices,
            tariff_snapshot=tariff_snapshot,
        )

    key = f"contracts/{fresh.id}/{number}.pdf"
    storage_service.upload_bytes(key=key, data=pdf_bytes, content_type="application/pdf")
    public_url = storage_service.get_public_url(key)

    # persist snapshots to suppress unnecessary regenerations on next visits
    await crud.upsert_contract(db, client=fresh, data={
        "contract_number": number,
        "contract_url": public_url,
        "signed_at": datetime.utcnow(),
        "otp_code": None,
        "passport_snapshot": passport_snapshot or {},
        "device_snapshot": devices or [],
        "tariff_snapshot": tariff_snapshot or {},
    })

    # если нет счётов — гарантированно создаём PENDING инвойс
    amount = float(getattr(fresh.tariff, "total_extra_fee", 0) or 0)
    if amount <= 0:
        per = float(getattr(getattr(fresh.tariff, "tariff", None), "extra_per_device", 0) or 0)
        cnt = int(getattr(fresh.tariff, "device_count", 0) or 0) or len(getattr(fresh, "devices", []) or [])
        amount = per * cnt
    if amount > 0:
        await crud.ensure_invoice_for_client(
            db, client=fresh, contract_number=number, amount=amount, due_in_days=3
        )


async def _try_build_from_docx(*, passport_snapshot: dict, devices: list[dict], tariff_snapshot: dict, contract_number: str) -> bytes:
    """Пытается собрать PDF из DOCX через docxtpl + LibreOffice headless. Кидает исключение при любой ошибке."""
    from tempfile import TemporaryDirectory
    from pathlib import Path
    import subprocess

    try:
        from docxtpl import DocxTemplate
    except Exception as e:
        raise RuntimeError("docxtpl is not available") from e

    context = {
        "contract": {"number": contract_number, "date": f"{datetime.utcnow():%Y-%m-%d}"},
        "client": {
            "full_name": " ".join(filter(None, [passport_snapshot.get("last_name"), passport_snapshot.get("first_name"), passport_snapshot.get("middle_name")])),
            "phone": "",
            "email": "",
            "address": passport_snapshot.get("registration_address") or "",
        },
        "passport": {
            "series": passport_snapshot.get("series", ""),
            "number": passport_snapshot.get("number", ""),
            "issued_by": passport_snapshot.get("issued_by", ""),
            "issue_code": passport_snapshot.get("issue_code", ""),
            "issue_date": str(passport_snapshot.get("issue_date") or ""),
            "registration_address": passport_snapshot.get("registration_address", ""),
        },
        "devices": devices,
        "tariff": {
            "device_count": tariff_snapshot.get("device_count", 0),
            "extra_per_device": tariff_snapshot.get("extra_per_device", 0),
            "total_extra_fee": tariff_snapshot.get("total_extra_fee", 0),
        },
    }

    template_path = Path("app/templates/contracts/base_contract.docx")
    if not template_path.exists():
        raise RuntimeError(f"Contract template not found: {template_path}")

    with TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        docx_out = tmpdir / "contract.docx"
        pdf_out = tmpdir / "contract.pdf"

        tpl = DocxTemplate(str(template_path))
        tpl.render(context)
        tpl.save(str(docx_out))

        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(tmpdir), str(docx_out)], check=True)
        return pdf_out.read_bytes()
    

# --- Ищем и патчим другие вызовы post_support_message с "Код подтверждения договора" ---
import inspect
import sys

# Найти все вызовы bridge.post_support_message с формулировкой "Код подтверждения договора"
# и заменить их на новый формат и добавить блок про номер договора.

# Вручную ищем такие вызовы в этом файле:

# --- Example: (гипотетический блок, который требуется заменить) ---
# await bridge.post_support_message(ticket=ticket, body=f"Код подтверждения договора: {otp_code}")

# --- Патчим (пример для случая, если такой вызов был бы ниже) ---
# cn = client.contract.contract_number if (client.contract and client.contract.contract_number) else f"CTR-{str(client.id)[:8].upper()}"
# if not (client.contract and client.contract.contract_number):
#     await crud.upsert_contract(db, client=client, data={"contract_number": cn})
# await bridge.post_support_message(ticket=ticket, body=f"Договор {cn}, код подтверждения {otp_code}")

# В этом файле других явных вызовов нет, но если бы они были, их нужно было бы заменить по вышеуказанному шаблону.
