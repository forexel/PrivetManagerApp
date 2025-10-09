import re

def normalize_phone_to_10_digits(raw: str | None) -> str:
    """Return exactly 10 digits from a raw phone string.
    Strips all non-digits; if length >= 11 and starts with 7 or 8, drop the first digit.
    Then clamp to 10 digits.
    """
    if not raw:
        return ""
    d = re.sub(r"\D", "", raw)
    if len(d) >= 11 and d[0] in ("7", "8"):
        d = d[1:]
    return d[:10]