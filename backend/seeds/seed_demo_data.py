"""
Calricula - Demo User Data Seed
Creates comprehensive demo data for demo@calricula.com including:
- Courses in various statuses (drafts, in review, approved)
- Notifications
- Workflow history
- Comments
"""

import sys
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timedelta
import uuid

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.course import (
    Course, CourseStatus, StudentLearningOutcome, BloomLevel, CourseContent
)
from app.models.department import Department
from app.models.user import User
from app.models.notification import Notification, NotificationType
from app.models.workflow import WorkflowHistory, EntityType, Comment


# ============================================================================
# DEMO USER COURSES
# Courses created by the demo user in various workflow stages
# ============================================================================
DEMO_COURSES = [
    # ================== APPROVED COURSES (Recently approved) ==================
    {
        "subject_code": "COMM",
        "course_number": "101",
        "title": "Public Speaking",
        "units": Decimal("3.0"),
        "lecture_hours": Decimal("3"),  # hours per week (3 × 18 = 54 total)
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # hours per week (6 × 18 = 108 total)
        "total_student_learning_hours": Decimal("162"),
        "status": CourseStatus.APPROVED,
        "approved_at": datetime.utcnow() - timedelta(days=3),  # Approved 3 days ago
        "catalog_description": "This course introduces students to the principles and practices of effective public speaking in personal, professional, and civic contexts. Students will develop competencies in speech preparation, organization, delivery, and audience analysis while reducing communication apprehension through systematic practice. Topics include selecting and researching topics, analyzing diverse audiences, organizing ideas using various patterns (chronological, spatial, topical, problem-solution, Monroe's Motivated Sequence), constructing effective introductions and conclusions, using evidence and supporting materials ethically, developing persuasive arguments, incorporating visual aids and presentation technology effectively, practicing extemporaneous delivery techniques, and providing constructive feedback. Students will prepare and deliver informative, persuasive, and special occasion speeches, progressing from brief presentations to extended formal addresses. The course emphasizes critical listening skills and the ethical responsibilities of speakers in a democratic society. Video recording of speeches allows students to analyze and improve their delivery. This course fulfills the oral communication requirement for the associate degree and transfers to CSU and UC. No prerequisites required.",
        "effective_term": "Spring 2025",
        "ccn_id": "COMM C1000",
        "department_code": "COMM",
        "slos": [
            {"sequence": 1, "outcome_text": "Construct and deliver well-organized speeches with clear thesis statements", "bloom_level": BloomLevel.CREATE},
            {"sequence": 2, "outcome_text": "Adapt messages appropriately for diverse audiences and occasions", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Employ effective verbal and nonverbal delivery techniques", "bloom_level": BloomLevel.APPLY},
            {"sequence": 4, "outcome_text": "Evaluate speeches using established criteria for effectiveness", "bloom_level": BloomLevel.EVALUATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Foundations of Public Speaking", "subtopics": ["Communication process", "Speech anxiety", "Ethics"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Audience Analysis", "subtopics": ["Demographics", "Attitudes", "Adaptation"], "hours_allocated": Decimal("6")},
            {"sequence": 3, "topic": "Speech Organization", "subtopics": ["Main points", "Patterns", "Transitions"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Research and Evidence", "subtopics": ["Sources", "Citations", "Supporting materials"], "hours_allocated": Decimal("9")},
            {"sequence": 5, "topic": "Delivery Skills", "subtopics": ["Voice", "Body language", "Visual aids"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "Persuasive Speaking", "subtopics": ["Argumentation", "Appeals", "Refutation"], "hours_allocated": Decimal("9")},
        ],
    },
    {
        "subject_code": "PHIL",
        "course_number": "101",
        "title": "Introduction to Philosophy",
        "units": Decimal("3.0"),
        "lecture_hours": Decimal("3"),  # hours per week
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # hours per week
        "total_student_learning_hours": Decimal("162"),
        "status": CourseStatus.APPROVED,
        "approved_at": datetime.utcnow() - timedelta(days=14),  # Approved 2 weeks ago
        "catalog_description": "This course introduces students to fundamental questions of philosophy and the methods philosophers use to address them. Through careful reading of primary texts and rigorous analysis, students will examine enduring questions about reality, knowledge, ethics, and human existence. Topics include metaphysics (the nature of reality, free will vs. determinism, mind-body problem, personal identity), epistemology (sources and limits of knowledge, skepticism, rationalism vs. empiricism, the problem of induction), ethics (moral relativism vs. objectivism, consequentialism, deontological ethics, virtue ethics), political philosophy (justice, rights, liberty, social contract theory), philosophy of religion (arguments for and against God's existence, the problem of evil, faith and reason), and existentialism (meaning, authenticity, absurdity). Students will engage with both Western and non-Western philosophical traditions, reading works by thinkers such as Plato, Aristotle, Descartes, Hume, Kant, Mill, Nietzsche, and contemporary philosophers. The course emphasizes the development of critical thinking skills: constructing and evaluating arguments, identifying assumptions and implications, and articulating and defending positions clearly. This course fulfills the humanities requirement for the associate degree and transfers to CSU and UC. No prerequisites required.",
        "effective_term": "Spring 2025",
        "department_code": "PHIL",
        "slos": [
            {"sequence": 1, "outcome_text": "Analyze philosophical arguments identifying premises and conclusions", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 2, "outcome_text": "Compare major philosophical theories on fundamental questions", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 3, "outcome_text": "Construct well-reasoned positions on philosophical issues", "bloom_level": BloomLevel.CREATE},
            {"sequence": 4, "outcome_text": "Apply philosophical concepts to contemporary problems", "bloom_level": BloomLevel.APPLY},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Philosophy", "subtopics": ["What is philosophy?", "Argument analysis", "Critical thinking"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Metaphysics", "subtopics": ["Reality", "Free will", "Mind-body problem"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Epistemology", "subtopics": ["Knowledge", "Skepticism", "Truth"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Ethics", "subtopics": ["Moral theories", "Applied ethics", "Moral reasoning"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Political Philosophy", "subtopics": ["Justice", "Rights", "Social contract"], "hours_allocated": Decimal("9")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },

    # ================== IN REVIEW COURSES ==================
    {
        "subject_code": "SOCI",
        "course_number": "101",
        "title": "Introduction to Sociology",
        "units": Decimal("3.0"),
        "lecture_hours": Decimal("3"),  # hours per week
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # hours per week
        "total_student_learning_hours": Decimal("162"),
        "status": CourseStatus.CURRICULUM_COMMITTEE,  # In committee review
        "catalog_description": "This course introduces students to the sociological perspective—the systematic study of human society, social interaction, and social change. Students will develop a sociological imagination that connects personal experiences to broader social structures and historical forces. Topics include the development of sociology as a discipline, major theoretical perspectives (functionalism, conflict theory, symbolic interactionism, feminism), research methods in sociology, culture and socialization, social structure and interaction, groups and organizations, deviance and social control, social stratification (class, race, gender), social institutions (family, education, religion, economy, politics), population, urbanization, and social movements and collective behavior. The course emphasizes the analysis of contemporary social issues including inequality, discrimination, globalization, and technology using sociological concepts and evidence. Students will develop skills in critical thinking, data interpretation, and written communication through assignments that apply sociological concepts to real-world phenomena. This course fulfills the social and behavioral science requirement for the associate degree and transfers to CSU and UC. No prerequisites required.",
        "effective_term": "Fall 2025",
        "ccn_id": "SOCI C1000",
        "department_code": "SOC",
        "slos": [
            {"sequence": 1, "outcome_text": "Apply sociological concepts to analyze social phenomena", "bloom_level": BloomLevel.APPLY},
            {"sequence": 2, "outcome_text": "Compare major sociological perspectives on social issues", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 3, "outcome_text": "Evaluate evidence from sociological research", "bloom_level": BloomLevel.EVALUATE},
            {"sequence": 4, "outcome_text": "Explain patterns of social inequality and their consequences", "bloom_level": BloomLevel.UNDERSTAND},
        ],
        "content_items": [
            {"sequence": 1, "topic": "The Sociological Perspective", "subtopics": ["Sociological imagination", "Theories", "Methods"], "hours_allocated": Decimal("9")},
            {"sequence": 2, "topic": "Culture and Socialization", "subtopics": ["Culture", "Socialization", "Identity"], "hours_allocated": Decimal("9")},
            {"sequence": 3, "topic": "Social Structure", "subtopics": ["Groups", "Organizations", "Networks"], "hours_allocated": Decimal("9")},
            {"sequence": 4, "topic": "Social Stratification", "subtopics": ["Class", "Race", "Gender"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Social Institutions", "subtopics": ["Family", "Education", "Economy"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "MUS",
        "course_number": "101",
        "title": "Music Appreciation",
        "units": Decimal("3.0"),
        "lecture_hours": Decimal("3"),  # hours per week
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # hours per week
        "total_student_learning_hours": Decimal("162"),
        "status": CourseStatus.DEPT_REVIEW,  # In department review
        "catalog_description": "This course develops informed listening skills and aesthetic appreciation of music from diverse cultures and historical periods. Students will learn to identify musical elements (melody, rhythm, harmony, texture, form, timbre) and understand how composers and performers use these elements to create expressive works. The course surveys Western art music from the Medieval period through the 21st century, including Medieval and Renaissance sacred and secular music, Baroque instrumental and vocal music (Bach, Handel, Vivaldi), Classical-era symphonies and operas (Haydn, Mozart, Beethoven), Romantic expression and nationalism (Brahms, Tchaikovsky, Verdi), and modern and contemporary classical music. Equal attention is given to American music including jazz (from ragtime through bebop to contemporary jazz), blues, rock and popular music, musical theater, and film music. Students will also explore music from world cultures including African, Asian, Latin American, and Middle Eastern traditions. Through guided listening, concert attendance or video viewing, and written analysis, students will develop vocabulary and critical skills for discussing music intelligently. This course fulfills the arts and humanities requirement for the associate degree and transfers to CSU and UC. No prior musical training required.",
        "effective_term": "Fall 2025",
        "department_code": "MUS",
        "slos": [
            {"sequence": 1, "outcome_text": "Identify musical elements in diverse musical works", "bloom_level": BloomLevel.REMEMBER},
            {"sequence": 2, "outcome_text": "Describe stylistic characteristics of major musical periods", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 3, "outcome_text": "Analyze musical structure and form in representative works", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 4, "outcome_text": "Evaluate music using appropriate critical vocabulary", "bloom_level": BloomLevel.EVALUATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Elements of Music", "subtopics": ["Melody", "Rhythm", "Harmony", "Form"], "hours_allocated": Decimal("9")},
            {"sequence": 2, "topic": "Medieval to Baroque", "subtopics": ["Medieval", "Renaissance", "Baroque"], "hours_allocated": Decimal("9")},
            {"sequence": 3, "topic": "Classical and Romantic", "subtopics": ["Classical era", "Romantic era", "Nationalism"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Modern Classical Music", "subtopics": ["Impressionism", "20th century", "Contemporary"], "hours_allocated": Decimal("6")},
            {"sequence": 5, "topic": "American Music", "subtopics": ["Jazz", "Blues", "Popular music"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "World Music", "subtopics": ["African", "Asian", "Latin American"], "hours_allocated": Decimal("6")},
        ],
    },

    # ================== DRAFT COURSES (In progress) ==================
    {
        "subject_code": "ANTH",
        "course_number": "101",
        "title": "Introduction to Cultural Anthropology",
        "units": Decimal("3.0"),
        "lecture_hours": Decimal("3"),  # hours per week
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # hours per week
        "total_student_learning_hours": Decimal("162"),
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course introduces students to cultural anthropology—the comparative study of human societies and cultures around the world. Using the concept of culture as the central organizing principle, students will examine the diversity of human experience and the common patterns that emerge across societies. Topics include the history and methods of anthropology (fieldwork, ethnography, participant observation), the nature of culture and cultural relativism, language and communication, subsistence patterns and economic systems, kinship and family organization, sex, gender, and sexuality across cultures, political organization and social control, religion, magic, and worldview, art, expressive culture, and aesthetics, globalization and culture change, and applied anthropology. The course emphasizes the anthropological perspective: understanding human behavior in cultural context, suspending ethnocentric judgments, and appreciating both cultural differences and human universals. Through ethnographic case studies from around the world—including foraging, pastoral, horticultural, agricultural, and industrial societies—students will develop cross-cultural understanding applicable to our increasingly interconnected world. This course fulfills the social and behavioral science requirement for the associate degree and transfers to CSU and UC. No prerequisites required.",
        "effective_term": "Fall 2025",
        "ccn_id": "ANTH C1200",
        "department_code": "ANTH",
        "slos": [
            {"sequence": 1, "outcome_text": "Define key anthropological concepts including culture and ethnocentrism", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 2, "outcome_text": "Compare cultural practices across diverse societies", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 3, "outcome_text": "Apply cultural relativism to evaluate unfamiliar practices", "bloom_level": BloomLevel.APPLY},
        ],
        "content_items": [
            {"sequence": 1, "topic": "What is Anthropology?", "subtopics": ["Subfields", "Methods", "Ethics"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Culture", "subtopics": ["Definition", "Characteristics", "Relativism"], "hours_allocated": Decimal("9")},
            {"sequence": 3, "topic": "Language and Communication", "subtopics": ["Linguistics", "Nonverbal", "Language change"], "hours_allocated": Decimal("6")},
            {"sequence": 4, "topic": "Subsistence and Economics", "subtopics": ["Foraging", "Agriculture", "Exchange"], "hours_allocated": Decimal("9")},
            {"sequence": 5, "topic": "Kinship and Social Organization", "subtopics": ["Family", "Marriage", "Descent"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "Religion and Worldview", "subtopics": ["Beliefs", "Rituals", "Practitioners"], "hours_allocated": Decimal("9")},
        ],
    },
    {
        "subject_code": "ECON",
        "course_number": "101",
        "title": "Principles of Macroeconomics",
        "units": Decimal("3.0"),
        "lecture_hours": Decimal("3"),  # hours per week
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # hours per week
        "total_student_learning_hours": Decimal("162"),
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course introduces the fundamental concepts and analytical tools of macroeconomics—the study of the economy as a whole. Students will examine how aggregate economic activity is measured, what determines the overall level of national output, employment, and prices, and how government policies can influence economic performance. Topics include scarcity and opportunity cost, comparative advantage and gains from trade, supply and demand analysis, measuring economic performance (GDP, unemployment, inflation), economic growth and productivity, business cycles, aggregate demand and aggregate supply models, fiscal policy (government spending and taxation), money and banking, monetary policy and the Federal Reserve, international trade and finance, and current macroeconomic issues and debates. The course emphasizes the application of economic principles to understand real-world events including recessions, inflation, unemployment, government debt, and international trade disputes. Students will develop skills in economic reasoning, graphical analysis, and interpretation of economic data. This course fulfills the social and behavioral science requirement for the associate degree and transfers to CSU and UC. Prerequisite: Eligibility for MATH 101 (College Algebra).",
        "effective_term": "Fall 2025",
        "department_code": "ECON",
        "slos": [
            {"sequence": 1, "outcome_text": "Explain how GDP, unemployment, and inflation are measured", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 2, "outcome_text": "Apply aggregate demand and supply models to analyze economic events", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Evaluate the effects of fiscal and monetary policies", "bloom_level": BloomLevel.EVALUATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Economics", "subtopics": ["Scarcity", "Trade-offs", "Opportunity cost"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Supply and Demand", "subtopics": ["Markets", "Equilibrium", "Elasticity"], "hours_allocated": Decimal("9")},
            {"sequence": 3, "topic": "Measuring the Economy", "subtopics": ["GDP", "Unemployment", "Inflation"], "hours_allocated": Decimal("9")},
            {"sequence": 4, "topic": "AD-AS Model", "subtopics": ["Aggregate demand", "Aggregate supply", "Equilibrium"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Fiscal Policy", "subtopics": ["Government spending", "Taxes", "Debt"], "hours_allocated": Decimal("9")},
            {"sequence": 6, "topic": "Monetary Policy", "subtopics": ["Money", "Banking", "Federal Reserve"], "hours_allocated": Decimal("9")},
        ],
    },
    {
        "subject_code": "POLI",
        "course_number": "101",
        "title": "American Government",
        "units": Decimal("3.0"),
        "lecture_hours": Decimal("3"),  # hours per week
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # hours per week
        "total_student_learning_hours": Decimal("162"),
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course provides a comprehensive introduction to the American political system, examining the constitutional foundations, institutions, processes, and policies of government at the federal, state, and local levels with emphasis on California. Students will analyze the principles underlying American democracy and evaluate how well our institutions achieve democratic ideals. Topics include the constitutional framework (separation of powers, federalism, checks and balances), civil liberties and civil rights, political participation and voting behavior, interest groups and political parties, the mass media and public opinion, Congress, the presidency, the federal bureaucracy, the federal judiciary, and domestic and foreign policy making. The course also examines state and local government in California including the California Constitution, legislature, governor, judiciary, and direct democracy (initiatives, referenda, and recall). Students will develop skills in political analysis, critical evaluation of information sources, and civic engagement. Through the study of current political issues and debates, students will gain tools to become informed, effective citizens in a democratic society. This course fulfills the American government requirement for the associate degree, satisfies the U.S. Constitution requirement, and transfers to CSU and UC. No prerequisites required.",
        "effective_term": "Spring 2026",
        "ccn_id": "POLI C1010",
        "department_code": "POLI",
        "slos": [],  # Intentionally empty - draft in progress
        "content_items": [
            {"sequence": 1, "topic": "Constitutional Foundations", "subtopics": ["Constitution", "Federalism", "Separation of powers"], "hours_allocated": Decimal("12")},
            {"sequence": 2, "topic": "Civil Liberties and Rights", "subtopics": ["Bill of Rights", "Equal protection", "Due process"], "hours_allocated": Decimal("9")},
        ],
    },
]


# ============================================================================
# NOTIFICATION TEMPLATES
# ============================================================================
def create_demo_notifications(session: Session, demo_user: User, chair: User, courses: dict):
    """Create realistic notifications for the demo user."""
    notifications = []
    now = datetime.utcnow()

    # Course approved notifications (for recently approved courses)
    if "COMM 101" in courses:
        notifications.append(Notification(
            user_id=demo_user.id,
            actor_id=chair.id if chair else None,
            type=NotificationType.COURSE_APPROVED,
            title="Course Approved",
            message="COMM 101 Public Speaking has been approved and is ready for the Spring 2025 catalog.",
            entity_type="Course",
            entity_id=courses["COMM 101"].id,
            entity_title="COMM 101",
            is_read=False,
            created_at=now - timedelta(days=3),
        ))

    if "PHIL 101" in courses:
        notifications.append(Notification(
            user_id=demo_user.id,
            actor_id=chair.id if chair else None,
            type=NotificationType.COURSE_APPROVED,
            title="Course Approved",
            message="PHIL 101 Introduction to Philosophy has been approved after committee review.",
            entity_type="Course",
            entity_id=courses["PHIL 101"].id,
            entity_title="PHIL 101",
            is_read=True,  # Already read
            created_at=now - timedelta(days=14),
            read_at=now - timedelta(days=13),
        ))

    # Course commented notifications
    if "SOCI 101" in courses:
        notifications.append(Notification(
            user_id=demo_user.id,
            actor_id=chair.id if chair else None,
            type=NotificationType.COURSE_COMMENTED,
            title="New Comment on Your Course",
            message="Dr. Williams commented on SOCI 101: 'Please clarify the assessment methods in SLO #3.'",
            entity_type="Course",
            entity_id=courses["SOCI 101"].id,
            entity_title="SOCI 101",
            is_read=False,
            created_at=now - timedelta(hours=6),
        ))

    # Course submitted notification
    if "MUS 101" in courses:
        notifications.append(Notification(
            user_id=demo_user.id,
            type=NotificationType.COURSE_SUBMITTED,
            title="Course Submitted for Review",
            message="MUS 101 Music Appreciation has been submitted to your department for review.",
            entity_type="Course",
            entity_id=courses["MUS 101"].id,
            entity_title="MUS 101",
            is_read=True,
            created_at=now - timedelta(days=5),
            read_at=now - timedelta(days=5),
        ))

    # System notifications (deadline alerts)
    notifications.append(Notification(
        user_id=demo_user.id,
        type=NotificationType.SYSTEM,
        title="Curriculum Deadline Reminder",
        message="Spring 2026 catalog submissions are due in 30 days. You have 3 courses in draft status.",
        is_read=False,
        created_at=now - timedelta(days=1),
    ))

    notifications.append(Notification(
        user_id=demo_user.id,
        type=NotificationType.SYSTEM,
        title="Welcome to Calricula",
        message="Welcome! Start by reviewing your courses or creating a new Course Outline of Record.",
        is_read=True,
        created_at=now - timedelta(days=30),
        read_at=now - timedelta(days=29),
    ))

    # Course returned notification (for past course, simulating workflow)
    notifications.append(Notification(
        user_id=demo_user.id,
        actor_id=chair.id if chair else None,
        type=NotificationType.COURSE_RETURNED,
        title="Course Returned for Revision",
        message="ANTH 101 was returned for revision. Please add SLO #4 addressing cultural sensitivity.",
        entity_type="Course",
        entity_id=courses.get("ANTH 101", courses.get("COMM 101")).id if courses else None,
        entity_title="ANTH 101",
        is_read=True,
        created_at=now - timedelta(days=10),
        read_at=now - timedelta(days=9),
    ))

    for notification in notifications:
        session.add(notification)

    return len(notifications)


def create_workflow_history(session: Session, demo_user: User, chair: User, courses: dict):
    """Create workflow history entries for demo courses."""
    history_entries = []
    now = datetime.utcnow()

    # COMM 101 workflow: Draft -> DeptReview -> Committee -> Approved
    if "COMM 101" in courses:
        course = courses["COMM 101"]
        history_entries.extend([
            WorkflowHistory(
                entity_type=EntityType.COURSE,
                entity_id=course.id,
                from_status="Draft",
                to_status="DeptReview",
                comment="Submitted for department review.",
                changed_by=demo_user.id,
                created_at=now - timedelta(days=20),
            ),
            WorkflowHistory(
                entity_type=EntityType.COURSE,
                entity_id=course.id,
                from_status="DeptReview",
                to_status="CurriculumCommittee",
                comment="Department approved. Forwarded to curriculum committee.",
                changed_by=chair.id if chair else demo_user.id,
                created_at=now - timedelta(days=15),
            ),
            WorkflowHistory(
                entity_type=EntityType.COURSE,
                entity_id=course.id,
                from_status="CurriculumCommittee",
                to_status="Approved",
                comment="Approved by curriculum committee. Excellent course design.",
                changed_by=chair.id if chair else demo_user.id,
                created_at=now - timedelta(days=3),
            ),
        ])

    # SOCI 101 workflow: Draft -> Committee (pending)
    if "SOCI 101" in courses:
        course = courses["SOCI 101"]
        history_entries.extend([
            WorkflowHistory(
                entity_type=EntityType.COURSE,
                entity_id=course.id,
                from_status="Draft",
                to_status="DeptReview",
                comment="Initial submission for review.",
                changed_by=demo_user.id,
                created_at=now - timedelta(days=12),
            ),
            WorkflowHistory(
                entity_type=EntityType.COURSE,
                entity_id=course.id,
                from_status="DeptReview",
                to_status="CurriculumCommittee",
                comment="Department approved with minor suggestions.",
                changed_by=chair.id if chair else demo_user.id,
                created_at=now - timedelta(days=7),
            ),
        ])

    for entry in history_entries:
        session.add(entry)

    return len(history_entries)


def create_comments(session: Session, demo_user: User, chair: User, courses: dict):
    """Create sample comments on courses."""
    comments = []
    now = datetime.utcnow()

    if "SOCI 101" in courses and chair:
        course = courses["SOCI 101"]
        comments.append(Comment(
            entity_type=EntityType.COURSE,
            entity_id=course.id,
            section="SLOs",
            content="Please clarify the assessment methods for SLO #3. How will students demonstrate they can 'evaluate evidence from sociological research'?",
            user_id=chair.id,
            resolved=False,
            created_at=now - timedelta(hours=6),
        ))
        comments.append(Comment(
            entity_type=EntityType.COURSE,
            entity_id=course.id,
            section="Description",
            content="Excellent catalog description. Very comprehensive.",
            user_id=chair.id,
            resolved=True,
            created_at=now - timedelta(days=7),
        ))

    if "MUS 101" in courses and chair:
        course = courses["MUS 101"]
        comments.append(Comment(
            entity_type=EntityType.COURSE,
            entity_id=course.id,
            section="Content",
            content="Consider adding more contemporary examples in the World Music section.",
            user_id=chair.id,
            resolved=False,
            created_at=now - timedelta(days=3),
        ))

    for comment in comments:
        session.add(comment)

    return len(comments)


def seed_demo_data():
    """
    Seed comprehensive demo data for demo@calricula.com user.
    """
    with Session(engine) as session:
        # Get demo user
        demo_user = session.exec(
            select(User).where(User.email == "demo@calricula.com")
        ).first()

        if not demo_user:
            print("  ERROR: Demo user not found. Run seed_users.py first.")
            return

        # Get curriculum chair for notifications/comments
        chair = session.exec(
            select(User).where(User.email == "chair@calricula.com")
        ).first()

        # Get department lookup
        dept_map = {}
        departments = session.exec(select(Department)).all()
        for dept in departments:
            dept_map[dept.code] = dept.id

        # Track created courses for notifications
        created_courses = {}
        course_count = 0

        print("  Creating demo courses...")
        for course_data in DEMO_COURSES:
            # Check if course already exists
            existing = session.exec(
                select(Course).where(
                    Course.subject_code == course_data["subject_code"],
                    Course.course_number == course_data["course_number"]
                )
            ).first()

            if existing:
                # Store existing course for notifications
                course_key = f"{course_data['subject_code']} {course_data['course_number']}"
                created_courses[course_key] = existing
                print(f"    {course_key} already exists, skipping creation")
                continue

            # Extract nested data
            slos_data = course_data.pop("slos", [])
            content_data = course_data.pop("content_items", [])
            dept_code = course_data.pop("department_code", None)

            # Set department_id and created_by (demo user owns these)
            if dept_code and dept_code in dept_map:
                course_data["department_id"] = dept_map[dept_code]
            else:
                # Use first department if not found
                course_data["department_id"] = list(dept_map.values())[0] if dept_map else None

            course_data["created_by"] = demo_user.id

            # Create course
            course = Course(**course_data)
            session.add(course)
            session.flush()

            # Store for notifications
            course_key = f"{course_data['subject_code']} {course_data['course_number']}"
            created_courses[course_key] = course

            # Create SLOs
            for slo_data in slos_data:
                slo_data["course_id"] = course.id
                slo = StudentLearningOutcome(**slo_data)
                session.add(slo)

            # Create content items
            for content_item_data in content_data:
                content_item_data["course_id"] = course.id
                content_item = CourseContent(**content_item_data)
                session.add(content_item)

            status_str = course_data.get("status", CourseStatus.DRAFT).value
            print(f"    Created: {course_key} - {course_data['title']} ({status_str})")
            course_count += 1

        session.flush()

        # Create notifications
        print("  Creating notifications...")
        notif_count = create_demo_notifications(session, demo_user, chair, created_courses)
        print(f"    Created {notif_count} notifications")

        # Create workflow history
        print("  Creating workflow history...")
        history_count = create_workflow_history(session, demo_user, chair, created_courses)
        print(f"    Created {history_count} workflow history entries")

        # Create comments
        print("  Creating comments...")
        comment_count = create_comments(session, demo_user, chair, created_courses)
        print(f"    Created {comment_count} comments")

        session.commit()
        print(f"\nDemo data seeding complete:")
        print(f"  - {course_count} courses created")
        print(f"  - {notif_count} notifications created")
        print(f"  - {history_count} workflow history entries created")
        print(f"  - {comment_count} comments created")


if __name__ == "__main__":
    print("Seeding demo data...")
    print("NOTE: Run seed_all.py first to create base data")
    seed_demo_data()
    print("Done!")
