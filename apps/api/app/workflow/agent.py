from app.domain.contracts import GuideMessageRequest

SAFETY_TERMS = ("diagnose", "treat", "rash", "burning", "prescription")


def is_medical_boundary(request: GuideMessageRequest) -> bool:
    normalized = request.text.lower()
    return any(term in normalized for term in SAFETY_TERMS)


def clarification_question() -> str:
    return "Is water resistance a must, or is this mainly for a daily commute?"
