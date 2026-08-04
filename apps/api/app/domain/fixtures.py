import json
from pathlib import Path

from pydantic import BaseModel, TypeAdapter


def load_model_list[T: BaseModel](path: Path, model_type: type[T]) -> list[T]:
    payload = json.loads(path.read_text())
    return TypeAdapter(list[model_type]).validate_python(payload)
