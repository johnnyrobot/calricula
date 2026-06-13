"""
Database models module.

SQLModel classes for all database tables in the Calricula application.
"""

# User and Auth
from app.models.user import (
    User, UserCreate, UserRead, UserUpdate, UserRole, UserBase
)

# Organization
from app.models.department import (
    Division, DivisionCreate, DivisionRead, DivisionBase,
    Department, DepartmentCreate, DepartmentRead, DepartmentWithDivision, DepartmentBase
)

# Courses
from app.models.course import (
    Course, CourseCreate, CourseRead, CourseUpdate, CourseBase, CourseStatus,
    StudentLearningOutcome, SLOCreate, SLORead, SLOUpdate, BloomLevel,
    CourseContent, CourseContentCreate, CourseContentRead, CourseContentUpdate,
    CourseRequisite, CourseRequisiteCreate, CourseRequisiteRead, CourseRequisiteUpdate,
    RequisiteType, RequisiteValidationType
)

# Programs
from app.models.program import (
    Program, ProgramCreate, ProgramRead, ProgramUpdate, ProgramBase,
    ProgramType, ProgramStatus, RequirementType,
    ProgramCourse, ProgramCourseCreate, ProgramCourseRead
)

# Workflow
from app.models.workflow import (
    WorkflowHistory, WorkflowHistoryCreate, WorkflowHistoryRead,
    Comment, CommentCreate, CommentRead, CommentUpdate,
    EntityType
)

# Reference Data
from app.models.reference import (
    College, CollegeCreate, CollegeRead,
    TOPCode, TOPCodeCreate, TOPCodeRead,
    CCNStandard, CCNStandardCreate, CCNStandardRead,
    CrossListing, CrossListingCreate, CrossListingRead
)

# Documents and RAG
from app.models.document import (
    Document, DocumentCreate, DocumentRead, DocumentType,
    RAGDocument, RAGDocumentCreate, RAGDocumentRead, RAGDocumentUpdate,
    RAGDocumentType, IndexingStatus,
    AIChatHistory, AIChatHistoryCreate, AIChatHistoryRead, AIChatHistoryUpdate
)

# Notifications
from app.models.notification import (
    Notification, NotificationCreate, NotificationRead, NotificationUpdate,
    NotificationType, NotificationCounts
)

__all__ = [
    # User
    "User", "UserCreate", "UserRead", "UserUpdate", "UserRole", "UserBase",
    # Division/Department
    "Division", "DivisionCreate", "DivisionRead", "DivisionBase",
    "Department", "DepartmentCreate", "DepartmentRead", "DepartmentWithDivision", "DepartmentBase",
    # Course
    "Course", "CourseCreate", "CourseRead", "CourseUpdate", "CourseBase", "CourseStatus",
    "StudentLearningOutcome", "SLOCreate", "SLORead", "SLOUpdate", "BloomLevel",
    "CourseContent", "CourseContentCreate", "CourseContentRead", "CourseContentUpdate",
    "CourseRequisite", "CourseRequisiteCreate", "CourseRequisiteRead", "CourseRequisiteUpdate",
    "RequisiteType", "RequisiteValidationType",
    # Program
    "Program", "ProgramCreate", "ProgramRead", "ProgramUpdate", "ProgramBase",
    "ProgramType", "ProgramStatus", "RequirementType",
    "ProgramCourse", "ProgramCourseCreate", "ProgramCourseRead",
    # Workflow
    "WorkflowHistory", "WorkflowHistoryCreate", "WorkflowHistoryRead",
    "Comment", "CommentCreate", "CommentRead", "CommentUpdate",
    "EntityType",
    # Reference
    "College", "CollegeCreate", "CollegeRead",
    "TOPCode", "TOPCodeCreate", "TOPCodeRead",
    "CCNStandard", "CCNStandardCreate", "CCNStandardRead",
    "CrossListing", "CrossListingCreate", "CrossListingRead",
    # Documents
    "Document", "DocumentCreate", "DocumentRead", "DocumentType",
    "RAGDocument", "RAGDocumentCreate", "RAGDocumentRead", "RAGDocumentUpdate",
    "RAGDocumentType", "IndexingStatus",
    "AIChatHistory", "AIChatHistoryCreate", "AIChatHistoryRead", "AIChatHistoryUpdate",
    # Notifications
    "Notification", "NotificationCreate", "NotificationRead", "NotificationUpdate",
    "NotificationType", "NotificationCounts",
]
