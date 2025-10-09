from app.services.contracts import build_contract_pdf


def test_build_contract_pdf_creates_bytes():
    data = build_contract_pdf(
        contract_number="CTR-12345678",
        passport_snapshot={
            "last_name": "Иванов",
            "first_name": "Иван",
            "middle_name": "Иванович",
            "series": "1234",
            "number": "567890",
            "issued_by": "ОВД Москвы",
            "issue_code": "770-001",
            "issue_date": "2020-01-01",
            "registration_address": "Москва, ул. Пушкина, д. 1",
        },
        devices=[{"device_type": "телефон", "title": "iPhone", "extra_fee": 1000}],
        tariff_snapshot={"device_count": 1, "extra_per_device": 1000, "total_extra_fee": 1000},
    )

    assert isinstance(data, bytes)
    # ReportLab PDF starts with %PDF header
    assert data.startswith(b"%PDF")
