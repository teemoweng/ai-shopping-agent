from app.domain.contracts import GuideAction, GuideMessageRequest, GuideViewKind

_ALLOWED_ACTIONS_BY_VIEW = {
    GuideViewKind.OPENING_CONTEXT: (GuideAction.RETURN_TO_FEED,),
    GuideViewKind.CONTEXT_CONFIRMATION: (
        GuideAction.CONFIRM_CONTEXT,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.WAITING_CLARIFICATION: (
        GuideAction.ANSWER_CLARIFICATION,
        GuideAction.SKIP_CLARIFICATION,
        GuideAction.UPDATE_CONSTRAINTS,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.VERIFYING_FACTS: (GuideAction.RETURN_TO_FEED,),
    GuideViewKind.DECISION_READY: (
        GuideAction.UPDATE_CONSTRAINTS,
        GuideAction.REQUEST_COMPARISON,
        GuideAction.OPEN_PRODUCT,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.NO_MATCH: (
        GuideAction.RELAX_CONSTRAINT,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.INSUFFICIENT_EVIDENCE: (
        GuideAction.OPEN_PRODUCT,
        GuideAction.CONTINUE_WITH_KNOWN,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.COMPARISON_READY: (
        GuideAction.OPEN_PRODUCT,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.SAFE_BOUNDARY: (GuideAction.RETURN_TO_FEED,),
    GuideViewKind.RECOVERY_REQUIRED: (
        GuideAction.RETRY_GUIDE_OPERATION,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.FATAL_ERROR: (GuideAction.RETURN_TO_FEED,),
}

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
    "诊断",
    "治疗",
    "皮疹",
    "过敏",
    "荨麻疹",
    "肿胀",
    "呼吸困难",
    "药物相互作用",
)
URGENT_SAFETY_TERMS = (
    "severe allergy",
    "severe allergic reaction",
    "hives",
    "swelling",
    "difficulty breathing",
    "trouble breathing",
    "anaphylaxis",
    "严重过敏",
    "荨麻疹",
    "肿胀",
    "呼吸困难",
)


def allowed_actions_for(view_kind: GuideViewKind) -> list[GuideAction]:
    return list(_ALLOWED_ACTIONS_BY_VIEW[view_kind])


def is_medical_boundary(request: GuideMessageRequest) -> bool:
    normalized = request.text.lower()
    return any(term in normalized for term in SAFETY_TERMS)


def is_urgent_medical_boundary(request: GuideMessageRequest) -> bool:
    normalized = request.text.lower()
    return any(term in normalized for term in URGENT_SAFETY_TERMS)


def clarification_question(locale: str = "en-US") -> str:
    if locale == "zh-CN":
        return "主要是日常通勤，还是需要 40/80 分钟防水？"
    return "Is water resistance a must, or is this mainly for a daily commute?"


def clarification_quick_replies(locale: str = "en-US") -> list[str]:
    if locale == "zh-CN":
        return ["日常通勤", "40 分钟", "80 分钟", "跳过"]
    return [
        "Daily commute",
        "40 min water resistance",
        "80 min water resistance",
        "Skip",
    ]


def safety_boundary_text(locale: str, *, urgent: bool) -> str:
    if locale == "zh-CN":
        if urgent:
            return (
                "我不能诊断身体反应。荨麻疹、面部肿胀或呼吸困难可能是紧急"
                "情况。请停止使用该商品，立即寻求紧急医疗帮助并联系当地急救服务。"
            )
        return (
            "我可以比较防晒标签事实，但不能提供诊断或治疗建议。若商品正在引起"
            "身体反应，请停止使用并咨询合格的医疗专业人员。"
        )
    if urgent:
        return (
            "I can't diagnose a reaction. Hives, facial swelling, difficulty "
            "breathing, or possible anaphylaxis can be an emergency. Stop "
            "using the product and seek emergency medical help now; call "
            "local emergency services."
        )
    return (
        "I can compare labeled sunscreen facts, but I can't diagnose, treat, "
        "or claim sunscreen cures a disease. Stop using a product that is "
        "causing a reaction and seek a qualified medical professional."
    )


def no_match_text(locale: str) -> str:
    if locale == "zh-CN":
        return "没有商品满足全部硬性条件。我不会悄悄放宽条件；请修改一项要求后继续。"
    return (
        "No product meets every stated must-have. I won't silently relax a hard "
        "constraint; change one requirement to continue."
    )


def recommendation_text(locale: str, *, evidence_is_insufficient: bool) -> str:
    if locale == "zh-CN":
        if evidence_is_insufficient:
            return "这些商品满足你明确条件，但当前证据不足，无法确认哪一款更值得推荐。"
        return "这些商品满足你明确条件。第一款最接近你的偏好，请选择前查看取舍。"
    if evidence_is_insufficient:
        return (
            "These products pass your stated constraints, but there is "
            "insufficient evidence to recommend one."
        )
    return (
        "These options pass your must-haves. The first is the closest fit; "
        "review the tradeoffs before choosing a size."
    )
