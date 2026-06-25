"""
Regression tests for schema package importability.

`app/schemas/programs.py` once defaulted `requirement_type` to
``RequirementType.REQUIRED`` — a member that does not exist on the enum
(valid members: REQUIRED_CORE / LIST_A / LIST_B / GE). That raised
``AttributeError`` at import time of ``app.schemas`` (the package __init__),
masked only because the live app builds its request models inline in the
route modules. These tests pin the package as importable and the default sane.
"""
from app.models.program import RequirementType


def test_requirement_type_has_no_bare_required_member():
    """The canonical 'required' member is REQUIRED_CORE; bare REQUIRED never existed."""
    assert not hasattr(RequirementType, "REQUIRED")
    assert RequirementType.REQUIRED_CORE.value == "RequiredCore"


def test_schemas_package_imports_cleanly():
    """`import app.schemas` must not raise (regression for the bad enum default)."""
    import app.schemas  # noqa: F401


def test_program_course_base_default_requirement_type():
    """ProgramCourseBase defaults requirement_type to REQUIRED_CORE."""
    from app.schemas.programs import ProgramCourseBase

    model = ProgramCourseBase(course_id="00000000-0000-0000-0000-000000000000")
    assert model.requirement_type is RequirementType.REQUIRED_CORE
