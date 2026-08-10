from enum import StrEnum

from app.domain.contracts import GuideAction, GuideMessageRequest, GuideViewKind

_ALLOWED_ACTIONS_BY_VIEW = {
    GuideViewKind.OPENING_CONTEXT: (
        GuideAction.SEND_MESSAGE,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.ANSWER_READY: (
        GuideAction.SEND_MESSAGE,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.CONTEXT_CONFIRMATION: (
        GuideAction.SEND_MESSAGE,
        GuideAction.CONFIRM_CONTEXT,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.WAITING_CLARIFICATION: (
        GuideAction.SEND_MESSAGE,
        GuideAction.ANSWER_CLARIFICATION,
        GuideAction.SKIP_CLARIFICATION,
        GuideAction.UPDATE_CONSTRAINTS,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.VERIFYING_FACTS: (GuideAction.RETURN_TO_FEED,),
    GuideViewKind.DECISION_READY: (
        GuideAction.SEND_MESSAGE,
        GuideAction.UPDATE_CONSTRAINTS,
        GuideAction.REQUEST_COMPARISON,
        GuideAction.OPEN_PRODUCT,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.NO_MATCH: (
        GuideAction.SEND_MESSAGE,
        GuideAction.RELAX_CONSTRAINT,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.INSUFFICIENT_EVIDENCE: (
        GuideAction.SEND_MESSAGE,
        GuideAction.OPEN_PRODUCT,
        GuideAction.CONTINUE_WITH_KNOWN,
        GuideAction.RETURN_TO_FEED,
    ),
    GuideViewKind.COMPARISON_READY: (
        GuideAction.SEND_MESSAGE,
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


class GuideQuestionIntent(StrEnum):
    FIT = "FIT"
    CLAIM_WHITE_CAST = "CLAIM_WHITE_CAST"
    COMPARE = "COMPARE"
    RECOMMEND_OR_CONSTRAINT = "RECOMMEND_OR_CONSTRAINT"
    GENERAL = "GENERAL"

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

_COMPARISON_TERMS = (
    "比比",
    "比一下",
    "比一比",
    "比较",
    "对比",
    "compare",
    "versus",
    " vs ",
)
_NEGATED_COMPARISON_TERMS = (
    "不要比较",
    "不用比较",
    "别比较",
    "不要对比",
    "不用对比",
    "别对比",
)
_FIT_TERMS = ("适合", "能用", "suitable", "good for", "work for")
_SKIN_TYPE_TERMS = (
    "油皮",
    "干皮",
    "敏感肌",
    "混合皮",
    "oily",
    "dry skin",
    "sensitive skin",
    "combination skin",
)
_WHITE_CAST_TERMS = ("泛白", "白膜", "white cast")
_QUESTION_TERMS = (
    "？",
    "?",
    "会不会",
    "是否",
    "吗",
    "嘛",
    "么",
    "does",
    "will",
    "is it",
)
_SCENARIO_TERMS = ("日常通勤", "户外出汗或玩水", "daily commute")
_DECISION_EXPLANATION_TERMS = ("为什么", "依据", " why ", "reason")
_RECOMMENDATION_TERMS = (
    "帮我选",
    "推荐",
    "选一款",
    "日常通勤",
    "户外出汗或玩水",
    "防水",
    "预算",
    "无香",
    "香精",
    "妆效",
    "哑光",
    "水润",
    "泛白",
    "取消",
    "不限",
    "深肤色",
    "under $",
    "fragrance",
    "water resistance",
    "water-resistant",
    "daily commute",
    "natural finish",
    "matte",
    "dewy",
    "recommend",
    "help me choose",
    "find ",
)


def classify_question(text: str) -> GuideQuestionIntent:
    """Route Foundation messages with deterministic lexical rules, not an LLM."""
    normalized = f" {text.casefold().strip()} "
    comparison_is_negated = any(
        term in normalized for term in _NEGATED_COMPARISON_TERMS
    )
    if not comparison_is_negated and any(
        term in normalized for term in _COMPARISON_TERMS
    ):
        return GuideQuestionIntent.COMPARE
    is_fit_question = any(term in normalized for term in _FIT_TERMS) and any(
        term in normalized for term in _SKIN_TYPE_TERMS
    )
    if is_fit_question and not any(
        term in normalized for term in _SCENARIO_TERMS
    ):
        return GuideQuestionIntent.FIT
    if any(term in normalized for term in _WHITE_CAST_TERMS) and any(
        term in normalized for term in _QUESTION_TERMS
    ):
        return GuideQuestionIntent.CLAIM_WHITE_CAST
    if is_water_resistance_question(text):
        return GuideQuestionIntent.GENERAL
    if any(term in normalized for term in _DECISION_EXPLANATION_TERMS):
        return GuideQuestionIntent.RECOMMEND_OR_CONSTRAINT
    if any(term in normalized for term in _RECOMMENDATION_TERMS):
        return GuideQuestionIntent.RECOMMEND_OR_CONSTRAINT
    return GuideQuestionIntent.GENERAL


def is_water_resistance_question(text: str) -> bool:
    normalized = text.casefold()
    asks_about_water = "防水" in normalized or "water resistant" in normalized
    has_duration_constraint = "40" in normalized or "80" in normalized
    return (
        asks_about_water
        and not has_duration_constraint
        and any(term in normalized for term in _QUESTION_TERMS)
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
        return "主要是日常通勤，还是户外出汗或玩水？"
    return "Is this mainly for a daily commute, or for sweating or water?"


def clarification_quick_replies(locale: str = "en-US") -> list[str]:
    if locale == "zh-CN":
        return ["日常通勤", "户外出汗或玩水"]
    return ["Daily commute", "Sweating or water"]


def opening_text(locale: str = "en-US") -> str:
    if locale == "zh-CN":
        return "我看到你在看 Seoul Shade。你最想确认什么？"
    return "I see you're looking at Seoul Shade. What would you like to confirm?"


def opening_quick_replies(locale: str = "en-US") -> list[str]:
    if locale == "zh-CN":
        return ["适合油皮吗？", "会不会泛白？", "和防水款比比"]
    return ["Good for oily skin?", "Will it leave a white cast?", "Compare water-resistant"]


def white_cast_answer_text(locale: str, *, white_cast_risk: str) -> str:
    if locale == "zh-CN":
        risk = {"low": "低", "medium": "中等", "high": "高"}[white_cast_risk]
        return (
            f"这款的结构化商品事实标注为{risk}泛白风险；但现有证据不足以支持"
            "创作者所说的“所有肤色都绝不泛白”。"
        )
    return (
        f"The structured product fact lists {white_cast_risk} white-cast risk; "
        "available evidence does not support the creator's claim that it never "
        "casts on every complexion."
    )


def water_resistance_answer_text(
    locale: str,
    *,
    water_resistance_minutes: int | None,
) -> str:
    if locale == "zh-CN":
        if water_resistance_minutes is None:
            return "这款未标注 40 或 80 分钟防水，因此不能把它当作防水款。"
        return f"这款的结构化商品事实标注为 {water_resistance_minutes} 分钟防水。"
    if water_resistance_minutes is None:
        return (
            "This product is not labeled for 40 or 80 minutes of water "
            "resistance, so it should not be treated as water-resistant."
        )
    return (
        "The structured product fact lists "
        f"{water_resistance_minutes} minutes of water resistance."
    )


def general_answer_text(locale: str) -> str:
    if locale == "zh-CN":
        return "我可以先核对这款的商品事实。你可以问适配、泛白，或要求和防水款比较。"
    return (
        "I can check this product's facts first. Ask about fit, white cast, "
        "or a comparison with a water-resistant option."
    )


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


def fallback_recommendation_text(
    locale: str,
    *,
    evidence_is_insufficient: bool,
) -> str:
    if locale == "zh-CN":
        if evidence_is_insufficient:
            return "已切换为简版结果：候选满足明确条件，但现有证据不足，无法确认首选。"
        return "已切换为简版结果：以下候选满足明确条件，请查看已核验的理由与取舍。"
    if evidence_is_insufficient:
        return (
            "A simplified result is shown: candidates meet the stated constraints, "
            "but the available evidence is insufficient to confirm a top choice."
        )
    return (
        "A simplified result is shown: these candidates meet the stated "
        "constraints; review the verified reasons and tradeoffs."
    )
