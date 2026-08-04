from app.domain.contracts import GuideMessageRequest

SAFETY_TERMS = (
    "diagnose",
    "treat",
    "rash",
    "burning",
    "prescription",
    "cure",
    "melanoma",
    "cancer",
    "allergy",
    "allergic",
    "hives",
    "swelling",
    "difficulty breathing",
    "trouble breathing",
    "anaphylaxis",
    "medication",
    "drug interaction",
)
URGENT_SAFETY_TERMS = (
    "severe allergy",
    "severe allergic reaction",
    "hives",
    "swelling",
    "difficulty breathing",
    "trouble breathing",
    "anaphylaxis",
)


def is_medical_boundary(request: GuideMessageRequest) -> bool:
    normalized = request.text.lower()
    return any(term in normalized for term in SAFETY_TERMS)


def is_urgent_medical_boundary(request: GuideMessageRequest) -> bool:
    normalized = request.text.lower()
    return any(term in normalized for term in URGENT_SAFETY_TERMS)


def clarification_question() -> str:
    return "Is water resistance a must, or is this mainly for a daily commute?"
