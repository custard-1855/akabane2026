"""アンケート定義(apps/<app>/survey.json)の形式と、回答の検証(要件 4.6)。"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from core.config import SURVEY_TEXT_MAX_CHARS


class Question(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    type: Literal["single", "multi", "scale", "text"]
    text: str
    required: bool = False
    options: list[str] | None = None
    min: int = 1
    max: int = 5
    min_label: str | None = Field(default=None, alias="minLabel")
    max_label: str | None = Field(default=None, alias="maxLabel")
    max_length: int = Field(default=SURVEY_TEXT_MAX_CHARS, alias="maxLength", ge=1, le=SURVEY_TEXT_MAX_CHARS)

    @model_validator(mode="after")
    def _check(self) -> "Question":
        if self.type in ("single", "multi") and not self.options:
            raise ValueError(f"{self.id}: options が必要です")
        if self.type == "scale" and self.min >= self.max:
            raise ValueError(f"{self.id}: min < max にしてください")
        return self


class SurveyDef(BaseModel):
    version: int = Field(ge=1)
    title: str | None = None
    questions: list[Question] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_ids(self) -> "SurveyDef":
        ids = [q.id for q in self.questions]
        if len(ids) != len(set(ids)):
            raise ValueError("設問の id が重複しています")
        return self


def validate_answers(survey: SurveyDef, answers: dict[str, Any]) -> list[str]:
    """回答を検証し、問題点の一覧を返す(空なら妥当)。未回答は None・欠落・空文字・空リストのいずれか。"""
    errors: list[str] = []
    known = {q.id for q in survey.questions}
    for qid in answers:
        if qid not in known:
            errors.append(f"{qid}: 未定義の設問です")
    for q in survey.questions:
        v = answers.get(q.id)
        if v is None or v == "" or v == []:
            if q.required:
                errors.append(f"{q.id}: 必須です")
            continue
        if q.type == "single":
            if v not in q.options:
                errors.append(f"{q.id}: 選択肢にない値です")
        elif q.type == "multi":
            if not isinstance(v, list) or any(x not in q.options for x in v) or len(set(v)) != len(v):
                errors.append(f"{q.id}: 選択肢のリストではありません")
        elif q.type == "scale":
            if not isinstance(v, int) or isinstance(v, bool) or not q.min <= v <= q.max:
                errors.append(f"{q.id}: {q.min}〜{q.max} の整数にしてください")
        elif q.type == "text":
            if not isinstance(v, str) or len(v) > q.max_length:
                errors.append(f"{q.id}: {q.max_length} 文字以内の文字列にしてください")
    return errors
