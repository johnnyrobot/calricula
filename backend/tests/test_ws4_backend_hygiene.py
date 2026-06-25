"""WS-4 backend hygiene regression tests.

These lock the three WS-4 properties and are intentionally DB-free (pure unit
tests) so they run even when Postgres is unavailable:

1. Pydantic v2 sweep: no ``class Config`` remains in the swept modules and the
   converted models expose ``model_config`` with identical behavior; importing
   ``app.main`` (which imports every swept module) succeeds with no Pydantic
   ``class Config`` deprecation warning.
2. The runtime LMI ``ALTER TABLE`` is captured by an Alembic migration and is no
   longer executed from the app startup lifespan.
3. The production-config guard fails closed: a production config with a dev/demo
   auth-bypass flag enabled raises on construction; dev configs are unaffected.
"""

import importlib.util
import warnings
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings


BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_isolated(rel_path: str, mod_name: str):
    """Load a module straight from its file, bypassing package ``__init__``.

    The pure-Pydantic schema modules (common.py, departments.py) import only
    pydantic + stdlib, so they can be exec'd in isolation. This deliberately
    avoids importing the ``app.schemas`` package, whose ``__init__`` eagerly
    imports every schema (one of which, programs.py, has a pre-existing,
    unrelated enum bug) -- the live app never imports that package either.
    """
    spec = importlib.util.spec_from_file_location(mod_name, BACKEND_DIR / rel_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# The 15 files swept in WS-4 (config.py uses SettingsConfigDict).
SWEPT_FILES = [
    "app/core/config.py",
    "app/schemas/auth.py",
    "app/schemas/courses.py",
    "app/schemas/common.py",
    "app/schemas/departments.py",
    "app/schemas/programs.py",
    "app/api/routes/elumen.py",
    "app/api/routes/auth.py",
    "app/api/routes/workflow.py",
    "app/api/routes/programs.py",
    "app/api/routes/courses.py",
    "app/api/routes/departments.py",
    "app/api/routes/approvals.py",
    "app/services/lmi_client.py",
    "app/services/elumen_client.py",
]


# =============================================================================
# 1. Pydantic v2 class Config -> model_config sweep
# =============================================================================

@pytest.mark.unit
@pytest.mark.parametrize("rel", SWEPT_FILES)
def test_no_legacy_class_config_remains(rel):
    """None of the swept modules should still declare an inner ``class Config``."""
    source = (BACKEND_DIR / rel).read_text()
    assert "class Config:" not in source, f"{rel} still has a legacy 'class Config:' block"


@pytest.mark.unit
def test_app_main_imports():
    """The full app (which imports every swept route/service module) imports.

    A lingering ``class Config`` would not break import, but a botched
    model_config conversion would; this is the end-to-end guard.
    """
    import app.main

    assert app.main.app is not None


@pytest.mark.unit
def test_schema_definitions_emit_no_pydantic_config_deprecation():
    """Re-executing the pure-Pydantic swept modules emits no class-Config
    deprecation.

    pytest.ini globally ignores DeprecationWarning; here we record warnings while
    exec'ing the module bodies and assert none are Pydantic's class-Config
    deprecation -- proving the sweep removed the deprecated style rather than the
    ignore merely masking it.
    """
    from pydantic import PydanticDeprecatedSince20

    for idx, rel in enumerate(["app/schemas/common.py", "app/schemas/departments.py"]):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _load_isolated(rel, f"ws4_dep_{idx}")
        offending = [w for w in caught if issubclass(w.category, PydanticDeprecatedSince20)]
        assert not offending, f"{rel}: {[str(w.message) for w in offending]}"


@pytest.mark.unit
def test_converted_models_expose_model_config():
    """Representative converted models carry their config on ``model_config``,
    covering all three converted key styles."""
    common = _load_isolated("app/schemas/common.py", "ws4_common_mc")
    departments = _load_isolated("app/schemas/departments.py", "ws4_dept_mc")
    from app.services.elumen_client import TenantResponse

    # from_attributes (was orm_mode style)
    assert departments.DepartmentInfo.model_config.get("from_attributes") is True
    # json_schema_extra
    assert "example" in common.MessageResponse.model_config.get("json_schema_extra", {})
    # populate_by_name
    assert TenantResponse.model_config.get("populate_by_name") is True


@pytest.mark.unit
def test_from_attributes_behavior_preserved():
    """``from_attributes`` still lets a model validate from an ORM-like object."""
    import uuid

    departments = _load_isolated("app/schemas/departments.py", "ws4_dept_attr")
    uid = uuid.uuid4()

    class _Row:
        id = uid
        name = "Mathematics"
        code = "MATH"

    info = departments.DepartmentInfo.model_validate(_Row())
    assert info.name == "Mathematics"
    assert info.code == "MATH"
    assert info.id == uid


# =============================================================================
# 2. Runtime ALTER TABLE folded into Alembic
# =============================================================================

@pytest.mark.unit
def test_lmi_alembic_migration_exists():
    """A migration captures the lmi_data DDL and chains off the prior head."""
    migration = (
        BACKEND_DIR
        / "alembic/versions/20260625_0000_add_lmi_data_jsonb_columns.py"
    )
    source = migration.read_text()
    assert "revision = \"add_lmi_data_jsonb\"" in source
    assert "down_revision = \"a174c3ff1e19\"" in source
    assert "ALTER TABLE courses ADD COLUMN IF NOT EXISTS lmi_data" in source
    assert "ALTER TABLE programs ADD COLUMN IF NOT EXISTS lmi_data" in source


@pytest.mark.unit
def test_startup_lifespan_does_not_run_ddl():
    """The app startup lifespan no longer imports/invokes the runtime DDL helper."""
    main_source = (BACKEND_DIR / "app/main.py").read_text()
    assert "update_schema_for_lmi" not in main_source


# =============================================================================
# 3. Production config guard (fail closed)
# =============================================================================

@pytest.mark.unit
def test_production_rejects_auth_dev_mode():
    with pytest.raises(ValidationError) as exc:
        Settings(ENVIRONMENT="production", AUTH_DEV_MODE=True, DEMO_MODE=False)
    assert "AUTH_DEV_MODE" in str(exc.value)


@pytest.mark.unit
def test_production_rejects_demo_mode():
    with pytest.raises(ValidationError) as exc:
        Settings(ENVIRONMENT="production", AUTH_DEV_MODE=False, DEMO_MODE=True)
    assert "DEMO_MODE" in str(exc.value)


@pytest.mark.unit
def test_production_rejects_both_flags():
    with pytest.raises(ValidationError) as exc:
        Settings(ENVIRONMENT="production", AUTH_DEV_MODE=True, DEMO_MODE=True)
    msg = str(exc.value)
    assert "AUTH_DEV_MODE" in msg and "DEMO_MODE" in msg


@pytest.mark.unit
def test_production_allows_flags_off():
    s = Settings(ENVIRONMENT="production", AUTH_DEV_MODE=False, DEMO_MODE=False)
    assert s.ENVIRONMENT == "production"
    assert s.AUTH_DEV_MODE is False
    assert s.DEMO_MODE is False


@pytest.mark.unit
def test_production_case_insensitive():
    """Guard normalizes the environment value, so 'Production' is still prod."""
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="Production", AUTH_DEV_MODE=True)


@pytest.mark.unit
def test_development_allows_dev_mode():
    s = Settings(ENVIRONMENT="development", AUTH_DEV_MODE=True, DEMO_MODE=True)
    assert s.AUTH_DEV_MODE is True
    assert s.DEMO_MODE is True


@pytest.mark.unit
def test_default_environment_allows_dev_mode():
    """The default (no ENVIRONMENT set) is non-production and permits bypass."""
    s = Settings(AUTH_DEV_MODE=True)
    assert s.ENVIRONMENT != "production"
    assert s.AUTH_DEV_MODE is True
