"""
Calricula - Course Seed Data
Seeds sample courses in various statuses for testing.
"""

import sys
from pathlib import Path
from decimal import Decimal

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.course import Course, CourseStatus, StudentLearningOutcome, BloomLevel, CourseContent
from app.models.department import Department
from app.models.user import User


# Sample courses with realistic data
SEED_COURSES = [
    # ================== APPROVED COURSES (5) ==================
    {
        "subject_code": "MATH",
        "course_number": "101",
        "title": "College Algebra",
        "units": Decimal("3.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.APPROVED,
        "catalog_description": "This course provides a comprehensive study of algebraic concepts essential for success in calculus and other STEM disciplines. Students will explore polynomial, rational, exponential, and logarithmic functions through algebraic, graphical, and numerical approaches. Major topics include solving equations and inequalities (linear, quadratic, polynomial, rational, absolute value, exponential, and logarithmic), analyzing functions and their transformations, performing operations on functions including composition and finding inverses, and applying algebraic modeling to real-world problems in science, business, and social sciences. Students will develop proficiency in graphing techniques using technology and by hand, and will strengthen their ability to translate between verbal, symbolic, graphical, and tabular representations of mathematical relationships. This course satisfies the prerequisite for Calculus I and fulfills the mathematics requirement for associate degrees. Students should have completed intermediate algebra or equivalent with a grade of C or better.",
        "effective_term": "Fall 2024",
        "ccn_id": "MATH C1051",
        "department_code": "MATH",
        "slos": [
            {"sequence": 1, "outcome_text": "Analyze and graph polynomial, rational, exponential, and logarithmic functions", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 2, "outcome_text": "Solve equations and inequalities using algebraic methods", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Apply algebraic concepts to model and solve real-world problems", "bloom_level": BloomLevel.APPLY},
            {"sequence": 4, "outcome_text": "Evaluate functions and perform operations on functions including composition", "bloom_level": BloomLevel.EVALUATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Equations and Inequalities", "subtopics": ["Linear equations", "Quadratic equations", "Polynomial equations", "Rational equations"], "hours_allocated": Decimal("9")},
            {"sequence": 2, "topic": "Functions and Graphs", "subtopics": ["Function notation", "Domain and range", "Graphing techniques", "Transformations"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Polynomial Functions", "subtopics": ["Graphing polynomials", "Zeros and factoring", "Division algorithms"], "hours_allocated": Decimal("9")},
            {"sequence": 4, "topic": "Rational Functions", "subtopics": ["Graphing rational functions", "Asymptotes", "Solving rational equations"], "hours_allocated": Decimal("9")},
            {"sequence": 5, "topic": "Exponential and Logarithmic Functions", "subtopics": ["Exponential functions", "Logarithmic functions", "Applications"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "ENGL",
        "course_number": "101",
        "title": "English Composition",
        "units": Decimal("3.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.APPROVED,
        "catalog_description": "This course develops college-level reading and writing skills through the study and practice of expository prose. Students will learn to write clear, well-organized, and effectively developed essays of varying rhetorical modes including narration, description, comparison/contrast, cause and effect, and argumentation. Emphasis is placed on the writing process: invention strategies, drafting, peer review, revision, and editing. Students will develop critical reading skills through analysis of professional and student essays, learning to identify rhetorical strategies, evaluate evidence, and respond thoughtfully to diverse perspectives. The course introduces academic research skills including locating, evaluating, and integrating sources using MLA documentation format. Students will complete a minimum of 8,000 words of evaluated writing including a researched essay. This course fulfills the first-semester composition requirement for the associate degree and prepares students for ENGL 102. Students must earn a grade of C or better to enroll in the next English course. Recommended: Eligibility for college-level English as determined by the assessment process.",
        "effective_term": "Fall 2024",
        "ccn_id": "ENGL C1000",
        "department_code": "ENGL",
        "slos": [
            {"sequence": 1, "outcome_text": "Compose essays demonstrating clear thesis statements and logical organization", "bloom_level": BloomLevel.CREATE},
            {"sequence": 2, "outcome_text": "Apply revision strategies to improve clarity, coherence, and style", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Integrate and document sources following MLA format", "bloom_level": BloomLevel.APPLY},
            {"sequence": 4, "outcome_text": "Analyze texts for rhetorical strategies and effectiveness", "bloom_level": BloomLevel.ANALYZE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "The Writing Process", "subtopics": ["Prewriting", "Drafting", "Revision", "Editing"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Essay Structure and Organization", "subtopics": ["Thesis statements", "Introduction", "Body paragraphs", "Conclusion"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Critical Reading", "subtopics": ["Annotation", "Summary", "Analysis", "Response"], "hours_allocated": Decimal("9")},
            {"sequence": 4, "topic": "Research and Documentation", "subtopics": ["Finding sources", "Evaluating sources", "MLA format", "Avoiding plagiarism"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Rhetorical Analysis", "subtopics": ["Audience", "Purpose", "Tone", "Persuasive techniques"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "Grammar and Style", "subtopics": ["Sentence structure", "Word choice", "Common errors"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "PSYCH",
        "course_number": "101",
        "title": "Introduction to Psychology",
        "units": Decimal("3.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.APPROVED,
        "catalog_description": "This course provides a comprehensive introduction to psychology as the scientific study of behavior and mental processes. Students will examine the history and evolution of psychological thought, from early philosophical roots through contemporary theoretical perspectives including biological, cognitive, behavioral, humanistic, psychodynamic, and sociocultural approaches. Major topics include research methodology and ethics in psychological science, the biological foundations of behavior (neurons, brain structures, neurotransmitters, and genetics), states of consciousness, sensation and perception, learning theories (classical conditioning, operant conditioning, and observational learning), memory systems and processes, cognition and language, motivation and emotion, lifespan development, personality theories and assessment, psychological disorders and their treatment, and social psychology. Students will develop scientific literacy by reading and evaluating psychological research, and will apply psychological concepts to understand themselves and others. This course fulfills the social and behavioral science requirement for the associate degree and transfers to CSU and UC as a general education course. No prerequisites required.",
        "effective_term": "Fall 2024",
        "ccn_id": "PSYC C1000",
        "department_code": "PSYCH",
        "slos": [
            {"sequence": 1, "outcome_text": "Describe the scientific method as applied to psychological research", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 2, "outcome_text": "Explain biological and environmental factors influencing behavior", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 3, "outcome_text": "Compare and contrast major psychological perspectives", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 4, "outcome_text": "Apply psychological principles to analyze real-world situations", "bloom_level": BloomLevel.APPLY},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction and Research Methods", "subtopics": ["History of psychology", "Scientific method", "Research ethics"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Biological Bases of Behavior", "subtopics": ["Neurons", "Brain structure", "Neurotransmitters"], "hours_allocated": Decimal("6")},
            {"sequence": 3, "topic": "Sensation and Perception", "subtopics": ["Vision", "Hearing", "Perception processes"], "hours_allocated": Decimal("6")},
            {"sequence": 4, "topic": "Learning and Memory", "subtopics": ["Classical conditioning", "Operant conditioning", "Memory processes"], "hours_allocated": Decimal("9")},
            {"sequence": 5, "topic": "Development", "subtopics": ["Cognitive development", "Social development", "Lifespan changes"], "hours_allocated": Decimal("6")},
            {"sequence": 6, "topic": "Personality and Disorders", "subtopics": ["Personality theories", "Psychological disorders", "Treatment approaches"], "hours_allocated": Decimal("12")},
            {"sequence": 7, "topic": "Social Psychology", "subtopics": ["Social influence", "Attitudes", "Group behavior"], "hours_allocated": Decimal("6")},
            {"sequence": 8, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "CS",
        "course_number": "101",
        "title": "Introduction to Computer Science",
        "units": Decimal("3.0"),
        "lecture_hours": 2,  # hours per week
        "lab_hours": 3,  # hours per week
        "outside_of_class_hours": 4,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.APPROVED,
        "catalog_description": "This course introduces fundamental concepts of computer science and programming using the Python programming language. Students will develop computational thinking skills and learn to design algorithms to solve problems systematically. Topics include data types and variables, operators and expressions, input/output operations, selection structures (if-else statements), iteration (for and while loops), functions and modular programming, built-in data structures (lists, tuples, dictionaries, and sets), string manipulation, file handling, exception handling, and an introduction to object-oriented programming concepts including classes, objects, encapsulation, and inheritance. Students will complete hands-on programming assignments in a laboratory setting, progressing from simple programs to multi-file projects. Emphasis is placed on program design, coding style, documentation, debugging techniques, and testing strategies. This course is designed for computer science majors and anyone interested in learning to program. It prepares students for advanced courses in data structures, software development, and specialized programming domains. Lab fee required. Prerequisite: MATH 112 (Intermediate Algebra) or equivalent with a grade of C or better, or appropriate placement.",
        "effective_term": "Fall 2024",
        "department_code": "CS",
        "slos": [
            {"sequence": 1, "outcome_text": "Design algorithms to solve computational problems", "bloom_level": BloomLevel.CREATE},
            {"sequence": 2, "outcome_text": "Implement programs using variables, control structures, and functions", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Debug and test programs systematically", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 4, "outcome_text": "Apply object-oriented principles to organize code", "bloom_level": BloomLevel.APPLY},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Programming", "subtopics": ["Python basics", "Variables", "Data types", "Input/output"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Control Structures", "subtopics": ["Conditionals", "Loops", "Boolean logic"], "hours_allocated": Decimal("9")},
            {"sequence": 3, "topic": "Functions", "subtopics": ["Function definition", "Parameters", "Return values", "Scope"], "hours_allocated": Decimal("9")},
            {"sequence": 4, "topic": "Data Structures", "subtopics": ["Lists", "Dictionaries", "Strings", "File I/O"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Object-Oriented Programming", "subtopics": ["Classes", "Objects", "Inheritance"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "Problem Solving", "subtopics": ["Algorithm design", "Debugging", "Testing"], "hours_allocated": Decimal("6")},
        ],
    },
    {
        "subject_code": "BIOL",
        "course_number": "101",
        "title": "General Biology",
        "units": Decimal("4.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 3,  # hours per week
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 216,
        "status": CourseStatus.APPROVED,
        "catalog_description": "This course is the first semester of a two-semester sequence designed for biology majors and students pursuing careers in the life sciences and health professions. The course provides a rigorous introduction to the fundamental principles of biology at the molecular, cellular, and organismal levels. Lecture topics include the chemistry of life (atoms, molecules, water, and organic compounds), cell structure and function in prokaryotic and eukaryotic cells, membrane transport and cellular communication, cellular respiration and photosynthesis, the cell cycle and cell division (mitosis and meiosis), Mendelian genetics and inheritance patterns, molecular genetics (DNA structure, replication, transcription, and translation), gene regulation and biotechnology, the theory of evolution by natural selection, mechanisms of evolutionary change, speciation and the history of life, and an introduction to ecology and ecosystems. The laboratory component provides hands-on experience with the scientific method, microscopy, experimental design, data collection and statistical analysis, and scientific writing. Students will conduct experiments in cell biology, genetics, and molecular biology using current laboratory techniques. This course fulfills the life science requirement for the associate degree and transfers to CSU and UC. Lab fee required. Prerequisites: CHEM 101 (General Chemistry I) or concurrent enrollment, and eligibility for college-level English.",
        "effective_term": "Fall 2024",
        "ccn_id": "BIOL C1000",
        "department_code": "BIOL",
        "slos": [
            {"sequence": 1, "outcome_text": "Describe the structure and function of cells and their components", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 2, "outcome_text": "Explain the principles of genetics and inheritance", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 3, "outcome_text": "Analyze evidence supporting evolution by natural selection", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 4, "outcome_text": "Design and conduct laboratory experiments using proper techniques", "bloom_level": BloomLevel.CREATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Biology", "subtopics": ["Scientific method", "Characteristics of life", "Chemistry of life"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Cell Biology", "subtopics": ["Cell structure", "Membrane transport", "Cell division"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Genetics", "subtopics": ["Mendelian genetics", "DNA structure", "Gene expression"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Evolution", "subtopics": ["Natural selection", "Evidence for evolution", "Speciation"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Ecology", "subtopics": ["Ecosystems", "Population ecology", "Conservation"], "hours_allocated": Decimal("9")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },

    # ================== IN REVIEW COURSES (5) ==================
    {
        "subject_code": "MATH",
        "course_number": "201",
        "title": "Calculus I",
        "units": Decimal("4.0"),
        "lecture_hours": 4,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 8,  # hours per week
        "total_student_learning_hours": 216,
        "status": CourseStatus.CURRICULUM_COMMITTEE,
        "catalog_description": "This course is the first in the calculus sequence for students majoring in mathematics, engineering, computer science, physics, chemistry, and other STEM fields. Students will develop a deep understanding of the concepts and applications of differential and integral calculus for functions of a single variable. Topics include limits and continuity (intuitive, graphical, and formal epsilon-delta definitions), the derivative (definition as a limit, interpretation as rate of change and slope of tangent line), differentiation techniques (power rule, product rule, quotient rule, chain rule), derivatives of polynomial, rational, trigonometric, exponential, logarithmic, and inverse functions, implicit differentiation, related rates problems, linear approximation and differentials, applications of the derivative (curve sketching, optimization problems, Mean Value Theorem, L'Hôpital's Rule), antiderivatives and indefinite integrals, Riemann sums and definite integrals, the Fundamental Theorem of Calculus, and integration by substitution. A graphing calculator is required for this course. This course fulfills the mathematics requirement for the associate degree and transfers to CSU and UC. Prerequisite: MATH 101 (College Algebra) and MATH 102 (Trigonometry) or MATH 103 (Precalculus) with grades of C or better.",
        "ccn_id": "MATH C1051",
        "department_code": "MATH",
        "slos": [
            {"sequence": 1, "outcome_text": "Evaluate limits using algebraic, graphical, and numerical techniques", "bloom_level": BloomLevel.EVALUATE},
            {"sequence": 2, "outcome_text": "Calculate derivatives using the definition and derivative rules", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Apply derivatives to related rates and optimization problems", "bloom_level": BloomLevel.APPLY},
            {"sequence": 4, "outcome_text": "Evaluate definite and indefinite integrals using substitution", "bloom_level": BloomLevel.EVALUATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Limits and Continuity", "subtopics": ["Definition of limits", "Limit laws", "Continuity"], "hours_allocated": Decimal("12")},
            {"sequence": 2, "topic": "Derivatives", "subtopics": ["Definition", "Derivative rules", "Chain rule"], "hours_allocated": Decimal("18")},
            {"sequence": 3, "topic": "Applications of Derivatives", "subtopics": ["Related rates", "Optimization", "Curve sketching"], "hours_allocated": Decimal("18")},
            {"sequence": 4, "topic": "Integration", "subtopics": ["Antiderivatives", "Definite integrals", "Fundamental theorem"], "hours_allocated": Decimal("18")},
            {"sequence": 5, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("6")},
        ],
    },
    {
        "subject_code": "ENGL",
        "course_number": "102",
        "title": "Critical Thinking and Composition",
        "units": Decimal("3.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.DEPT_REVIEW,
        "catalog_description": "This course develops advanced skills in critical thinking, reading, and writing through the study and practice of argumentation. Students will learn to analyze the logical structure of arguments, identify assumptions and unstated premises, recognize common logical fallacies and cognitive biases, and evaluate the quality and relevance of evidence. The course emphasizes the construction of well-reasoned, persuasive arguments on complex, controversial issues using multiple research sources. Students will explore different argument types including classical, Rogerian, and Toulmin models, learning to select appropriate strategies for different audiences and purposes. Through extensive reading of arguments from diverse perspectives on contemporary issues, students will develop skills in critical evaluation, synthesis, and response. Writing assignments progress from analysis of others' arguments to the construction of original, research-supported argumentative essays. Students will also develop skills in oral argumentation through class discussions and presentations. This course fulfills the second-semester composition requirement for the associate degree and prepares students for upper-division writing in their major fields. It is recommended for students planning to transfer to four-year institutions or pursue careers requiring strong analytical and communication skills. Prerequisite: ENGL 101 with a grade of C or better.",
        "ccn_id": "ENGL C1002",
        "department_code": "ENGL",
        "slos": [
            {"sequence": 1, "outcome_text": "Analyze arguments for validity and rhetorical effectiveness", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 2, "outcome_text": "Construct well-reasoned arguments supported by evidence", "bloom_level": BloomLevel.CREATE},
            {"sequence": 3, "outcome_text": "Identify logical fallacies and cognitive biases", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 4, "outcome_text": "Synthesize multiple perspectives on complex issues", "bloom_level": BloomLevel.EVALUATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Argument", "subtopics": ["Claims", "Evidence", "Warrants"], "hours_allocated": Decimal("9")},
            {"sequence": 2, "topic": "Logical Reasoning", "subtopics": ["Deductive reasoning", "Inductive reasoning", "Fallacies"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Evaluating Evidence", "subtopics": ["Sources", "Data", "Expert testimony"], "hours_allocated": Decimal("9")},
            {"sequence": 4, "topic": "Argumentation", "subtopics": ["Building arguments", "Counterarguments", "Synthesis"], "hours_allocated": Decimal("18")},
            {"sequence": 5, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("6")},
        ],
    },
    {
        "subject_code": "CS",
        "course_number": "201",
        "title": "Data Structures",
        "units": Decimal("3.0"),
        "lecture_hours": 2,  # hours per week
        "lab_hours": 3,  # hours per week
        "outside_of_class_hours": 4,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.ARTICULATION_REVIEW,
        "catalog_description": "This course provides an in-depth study of data structures and their applications in computer science. Students will learn to implement, analyze, and apply fundamental data structures to solve complex programming problems efficiently. Topics include abstract data types, algorithm analysis using Big-O notation (time and space complexity), arrays and dynamic arrays, singly and doubly linked lists, stacks (array and linked implementations), queues (circular and priority queues), recursion and recursive problem-solving, binary trees and binary search trees, balanced trees (AVL trees, red-black trees), heaps and heap-based priority queues, hash tables (collision resolution strategies), graphs (representations, traversals, shortest path algorithms), and comparison and non-comparison based sorting algorithms (insertion sort, merge sort, quicksort, heapsort, radix sort). Laboratory assignments require students to implement data structures in a high-level programming language (C++ or Java) and analyze their performance through empirical testing. Students will develop proficiency in selecting appropriate data structures for different problem domains and optimizing code for efficiency. This course is essential for students pursuing careers in software development, data science, or graduate study in computer science. Prerequisite: CS 101 (Introduction to Computer Science) with a grade of C or better and completion of or concurrent enrollment in MATH 210 (Discrete Mathematics).",
        "department_code": "CS",
        "slos": [
            {"sequence": 1, "outcome_text": "Implement fundamental data structures in a programming language", "bloom_level": BloomLevel.APPLY},
            {"sequence": 2, "outcome_text": "Analyze time and space complexity of algorithms", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 3, "outcome_text": "Select appropriate data structures for specific problems", "bloom_level": BloomLevel.EVALUATE},
            {"sequence": 4, "outcome_text": "Design efficient algorithms using standard techniques", "bloom_level": BloomLevel.CREATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Arrays and Linked Lists", "subtopics": ["Array operations", "Linked list types", "Comparison"], "hours_allocated": Decimal("9")},
            {"sequence": 2, "topic": "Stacks and Queues", "subtopics": ["Stack operations", "Queue operations", "Applications"], "hours_allocated": Decimal("9")},
            {"sequence": 3, "topic": "Trees", "subtopics": ["Binary trees", "BST", "Balanced trees"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Graphs", "subtopics": ["Graph representation", "Traversals", "Shortest paths"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Hash Tables", "subtopics": ["Hash functions", "Collision handling", "Applications"], "hours_allocated": Decimal("6")},
            {"sequence": 6, "topic": "Sorting and Analysis", "subtopics": ["Sorting algorithms", "Big-O notation", "Analysis"], "hours_allocated": Decimal("6")},
        ],
    },
    {
        "subject_code": "ART",
        "course_number": "101",
        "title": "Introduction to Art",
        "units": Decimal("3.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.DEPT_REVIEW,
        "catalog_description": "This course is a comprehensive survey of the visual arts from prehistoric times to the present day, exploring the development of art across diverse cultures and civilizations worldwide. Students will develop visual literacy skills and acquire a critical vocabulary for analyzing, interpreting, and discussing works of art in their historical and cultural contexts. The course examines painting, sculpture, architecture, photography, and other visual media through multiple lenses including formal analysis (elements of art and principles of design), iconography and symbolism, and socio-cultural interpretation. Major periods and movements covered include prehistoric and ancient art (cave paintings, Mesopotamia, Egypt), classical antiquity (Greece and Rome), medieval art (Byzantine, Romanesque, Gothic), the Renaissance and Baroque periods in Europe, non-Western artistic traditions (Asian, African, Islamic, Pre-Columbian), the modern era (Romanticism, Impressionism, Post-Impressionism, early 20th century movements), and contemporary art practices. Students will analyze how art reflects and shapes social values, political power, religious beliefs, and cultural identity. Through museum visits or virtual exhibitions, writing assignments, and class discussions, students will develop critical thinking skills applicable to understanding visual culture in everyday life. This course fulfills the arts and humanities requirement for the associate degree and transfers to CSU and UC. No prerequisites required; recommended for students interested in art, design, art history, or general humanities.",
        "department_code": "ART",
        "slos": [
            {"sequence": 1, "outcome_text": "Identify major art movements and their characteristics", "bloom_level": BloomLevel.REMEMBER},
            {"sequence": 2, "outcome_text": "Analyze artworks using formal elements and principles of design", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 3, "outcome_text": "Evaluate art in its historical and cultural context", "bloom_level": BloomLevel.EVALUATE},
            {"sequence": 4, "outcome_text": "Apply critical vocabulary to discuss visual art", "bloom_level": BloomLevel.APPLY},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Elements and Principles of Art", "subtopics": ["Line", "Shape", "Color", "Composition"], "hours_allocated": Decimal("9")},
            {"sequence": 2, "topic": "Ancient and Medieval Art", "subtopics": ["Prehistoric", "Egyptian", "Greek", "Medieval"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Renaissance to Baroque", "subtopics": ["Italian Renaissance", "Northern Renaissance", "Baroque"], "hours_allocated": Decimal("9")},
            {"sequence": 4, "topic": "19th Century Art", "subtopics": ["Romanticism", "Impressionism", "Post-Impressionism"], "hours_allocated": Decimal("9")},
            {"sequence": 5, "topic": "Modern and Contemporary Art", "subtopics": ["Modernism", "Abstract", "Contemporary"], "hours_allocated": Decimal("12")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "BUS",
        "course_number": "101",
        "title": "Introduction to Business",
        "units": Decimal("3.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.CURRICULUM_COMMITTEE,
        "catalog_description": "This course provides a comprehensive introduction to the dynamic world of business, exploring how businesses operate within the U.S. and global economic systems. Students will examine the fundamental principles of management, marketing, finance, accounting, and operations that drive successful organizations. Topics include economic systems and market structures, forms of business ownership (sole proprietorships, partnerships, corporations, LLCs, and franchises), entrepreneurship and small business management, management functions (planning, organizing, leading, and controlling), organizational structures and human resource management, marketing concepts and the marketing mix (product, price, place, promotion), consumer behavior and market research, financial management and securities markets, accounting fundamentals and financial statement analysis, information technology in business, and business ethics, corporate social responsibility, and sustainability. The course emphasizes the interconnectedness of business functions and the impact of globalization, technology, and social trends on business strategy. Students will develop analytical skills through case studies, business simulations, and current event analyses. This course is designed for business majors and anyone interested in understanding how businesses function. It serves as the foundation for advanced study in specific business disciplines and prepares students for careers in management, marketing, finance, and entrepreneurship. This course fulfills the general elective requirement and transfers to CSU. No prerequisites required.",
        "department_code": "BUS",
        "slos": [
            {"sequence": 1, "outcome_text": "Describe the functions of management in business organizations", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 2, "outcome_text": "Explain marketing principles and their application", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 3, "outcome_text": "Analyze financial statements and basic accounting concepts", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 4, "outcome_text": "Evaluate ethical considerations in business decisions", "bloom_level": BloomLevel.EVALUATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Business", "subtopics": ["Economic systems", "Business types", "Environment"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Management", "subtopics": ["Planning", "Organizing", "Leading", "Controlling"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Marketing", "subtopics": ["Marketing mix", "Consumer behavior", "Strategy"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Finance and Accounting", "subtopics": ["Financial statements", "Budgeting", "Investment"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Ethics and Social Responsibility", "subtopics": ["Business ethics", "CSR", "Sustainability"], "hours_allocated": Decimal("9")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },

    # ================== DRAFT COURSES (5) ==================
    {
        "subject_code": "MATH",
        "course_number": "202",
        "title": "Calculus II",
        "units": Decimal("4.0"),
        "lecture_hours": 4,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 8,  # hours per week
        "total_student_learning_hours": 216,
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course is the second in the calculus sequence for students majoring in mathematics, engineering, computer science, physics, and other STEM fields. Building on the foundation established in Calculus I, students will master advanced integration techniques and explore the rich theory of infinite series. Topics include techniques of integration (integration by parts, trigonometric integrals and substitutions, partial fraction decomposition, improper integrals, and numerical integration methods), applications of integration (area between curves, volumes by disks, washers, and shells, arc length, surface area, work, and hydrostatic force), differential equations (separable equations, exponential growth and decay, and direction fields), infinite sequences (limits and convergence), infinite series (geometric series, convergence tests including comparison, integral, ratio, and root tests), power series (radius and interval of convergence, Taylor and Maclaurin series, operations on power series), parametric equations (curves, calculus with parametric curves), and polar coordinates (polar curves, area and arc length in polar coordinates). Throughout the course, students will use graphing technology to visualize concepts and verify analytical results. A graphing calculator is required. This course fulfills the mathematics requirement for the associate degree and transfers to CSU and UC. It prepares students for Calculus III (Multivariable Calculus) and differential equations. Prerequisite: MATH 201 (Calculus I) with a grade of C or better.",
        "ccn_id": "MATH C1052",
        "department_code": "MATH",
        "slos": [
            {"sequence": 1, "outcome_text": "Apply integration techniques to evaluate complex integrals", "bloom_level": BloomLevel.APPLY},
            {"sequence": 2, "outcome_text": "Calculate areas, volumes, and arc lengths using integration", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Analyze convergence of infinite series", "bloom_level": BloomLevel.ANALYZE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Integration Techniques", "subtopics": ["By parts", "Trigonometric", "Partial fractions"], "hours_allocated": Decimal("18")},
            {"sequence": 2, "topic": "Applications of Integration", "subtopics": ["Area", "Volume", "Arc length"], "hours_allocated": Decimal("18")},
            {"sequence": 3, "topic": "Sequences and Series", "subtopics": ["Sequences", "Series", "Convergence tests"], "hours_allocated": Decimal("24")},
            {"sequence": 4, "topic": "Parametric and Polar", "subtopics": ["Parametric curves", "Polar coordinates"], "hours_allocated": Decimal("9")},
            {"sequence": 5, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "CS",
        "course_number": "301",
        "title": "Database Systems",
        "units": Decimal("3.0"),
        "lecture_hours": 2,  # hours per week
        "lab_hours": 3,  # hours per week
        "outside_of_class_hours": 4,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course provides a comprehensive introduction to the design, implementation, and management of database systems. Students will learn both the theoretical foundations and practical skills necessary to create, query, and maintain relational databases in professional environments. Topics include database concepts and architecture (ANSI-SPARC three-level architecture, data independence, database management systems), the relational data model (relations, keys, referential integrity, relational algebra), SQL programming (data definition language for creating tables and constraints, data manipulation language for inserting, updating, and deleting data, complex queries with joins, subqueries, aggregation, and set operations, views and stored procedures), database design methodology (entity-relationship modeling, mapping ER diagrams to relational schemas, functional dependencies and normalization through BCNF), transaction processing (ACID properties, concurrency control, locking, and recovery), database administration (security, user management, backup and recovery strategies, performance tuning and indexing), and emerging topics such as NoSQL databases and big data considerations. Laboratory assignments require students to design databases for realistic business scenarios and implement them using a commercial or open-source database management system (such as MySQL, PostgreSQL, or Oracle). Students will develop portfolios of database projects suitable for professional presentation. This course prepares students for careers in software development, data analytics, database administration, and systems analysis. Prerequisite: CS 101 (Introduction to Computer Science) with a grade of C or better.",
        "department_code": "CS",
        "slos": [],  # Needs SLOs - demonstrating incomplete draft
        "content_items": [
            {"sequence": 1, "topic": "Database Concepts", "subtopics": ["Data models", "DBMS", "Architecture"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Relational Model", "subtopics": ["Relations", "Keys", "Integrity"], "hours_allocated": Decimal("9")},
            {"sequence": 3, "topic": "SQL", "subtopics": ["DDL", "DML", "Queries", "Joins"], "hours_allocated": Decimal("18")},
            {"sequence": 4, "topic": "Database Design", "subtopics": ["ER modeling", "Normalization", "Implementation"], "hours_allocated": Decimal("18")},
            {"sequence": 5, "topic": "Administration", "subtopics": ["Security", "Backup", "Performance"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "NURS",
        "course_number": "101",
        "title": "Fundamentals of Nursing",
        "units": Decimal("6.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 3,  # hours per week
        "activity_hours": 6,  # hours per week
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 324,
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course introduces students to the foundational concepts, theories, and skills essential for the practice of professional nursing. Students will develop competencies in the nursing process, evidence-based practice, patient-centered care, and interprofessional collaboration within the healthcare system. Lecture topics include the history and evolution of nursing as a profession, theoretical frameworks for nursing practice (Florence Nightingale, Jean Watson, Dorothea Orem, and others), the nursing process (assessment, diagnosis, planning, implementation, and evaluation), communication and therapeutic relationships with patients and families, cultural competence and sensitivity in healthcare, health assessment across the lifespan, vital signs measurement and interpretation, documentation and the electronic health record, principles of asepsis and infection control, safe medication administration (rights of medication administration, pharmacological calculations, routes of administration, and medication safety), comfort measures and pain management, nutrition and fluid balance, and professional ethics, legal responsibilities, and scope of practice. The laboratory component provides hands-on practice of fundamental nursing skills in a simulated clinical environment, including physical assessment techniques, sterile and clean procedures, medication administration, and patient mobility and safety. Clinical rotations in acute care and long-term care settings allow students to apply skills under faculty supervision with actual patients. This course is the first in the Associate Degree Nursing program sequence. Prerequisites: Admission to the ADN program, BIO 235 (Human Anatomy), BIO 236 (Human Physiology), and completion of or concurrent enrollment in BIO 237 (Microbiology). Current CPR certification and clinical clearances required.",
        "department_code": "NURS",
        "slos": [
            {"sequence": 1, "outcome_text": "Perform systematic patient assessments", "bloom_level": BloomLevel.APPLY},
            {"sequence": 2, "outcome_text": "Demonstrate safe medication administration techniques", "bloom_level": BloomLevel.APPLY},
            {"sequence": 3, "outcome_text": "Apply infection control principles in clinical settings", "bloom_level": BloomLevel.APPLY},
            {"sequence": 4, "outcome_text": "Communicate effectively with patients and healthcare team", "bloom_level": BloomLevel.APPLY},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Nursing", "subtopics": ["Nursing history", "Nursing process", "Ethics"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Patient Assessment", "subtopics": ["Health history", "Physical exam", "Documentation"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Basic Skills", "subtopics": ["Hygiene", "Mobility", "Vital signs"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Medication Administration", "subtopics": ["Pharmacology basics", "Routes", "Safety"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Clinical Practice", "subtopics": ["Clinical rotations", "Skills lab", "Simulation"], "hours_allocated": Decimal("12")},
        ],
    },
    {
        "subject_code": "HIST",
        "course_number": "101",
        "title": "U.S. History to 1877",
        "units": Decimal("3.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 0,
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 162,
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course provides a comprehensive survey of American history from the pre-Columbian era through the end of Reconstruction in 1877, examining the political, social, economic, and cultural forces that shaped the development of the United States. Students will analyze the experiences and perspectives of diverse groups including Indigenous peoples, European colonizers, enslaved Africans and their descendants, women, and working people. Topics include Indigenous societies and cultures before European contact, European exploration and colonization (Spanish, French, Dutch, and English), the development of colonial societies and regional differences, the institution of slavery and its expansion, colonial resistance and the American Revolution, the creation of the Constitution and the early Republic, westward expansion and its impact on Native Americans and Mexico, the market revolution and industrialization, reform movements of the antebellum period (abolitionism, women's rights, temperance), sectionalism and the deepening crisis over slavery, the Civil War (causes, conduct, and consequences), and Reconstruction and its contested legacy. Students will develop skills in historical thinking including analyzing primary sources, evaluating historical arguments, understanding cause and effect, and constructing evidence-based interpretations of the past. The course emphasizes the contested nature of historical memory and the relevance of history to understanding contemporary American society. This course fulfills the American history requirement for the associate degree and transfers to CSU and UC. No prerequisites required.",
        "ccn_id": "HIST C1010",
        "department_code": "HIST",
        "slos": [
            {"sequence": 1, "outcome_text": "Analyze primary sources from American history", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 2, "outcome_text": "Evaluate causes and effects of major historical events", "bloom_level": BloomLevel.EVALUATE},
            {"sequence": 3, "outcome_text": "Compare perspectives of diverse groups in American history", "bloom_level": BloomLevel.ANALYZE},
            {"sequence": 4, "outcome_text": "Construct historical arguments using evidence", "bloom_level": BloomLevel.CREATE},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Pre-Columbian America", "subtopics": ["Indigenous peoples", "Culture areas", "Societies"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Colonization", "subtopics": ["European exploration", "Colonial development", "Slavery"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Revolution and New Nation", "subtopics": ["Causes", "War", "Constitution"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Antebellum America", "subtopics": ["Expansion", "Reform", "Sectionalism"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "Civil War and Reconstruction", "subtopics": ["Causes", "War", "Reconstruction"], "hours_allocated": Decimal("9")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },
    {
        "subject_code": "CHEM",
        "course_number": "101",
        "title": "General Chemistry I",
        "units": Decimal("5.0"),
        "lecture_hours": 3,  # hours per week
        "lab_hours": 6,  # hours per week
        "outside_of_class_hours": 6,  # hours per week
        "total_student_learning_hours": 270,
        "status": CourseStatus.DRAFT,
        "catalog_description": "This course is the first semester of a two-semester general chemistry sequence designed for students majoring in chemistry, biochemistry, biology, pre-medicine, engineering, and other science disciplines requiring a rigorous foundation in chemistry. The course presents fundamental concepts of chemistry through both theoretical study and hands-on laboratory experience. Lecture topics include classification of matter, atoms and elements, measurements and significant figures, dimensional analysis and unit conversions, atomic theory and atomic structure (Bohr model, quantum mechanical model, electron configurations), periodic trends (atomic radius, ionization energy, electron affinity, electronegativity), chemical bonding (ionic, covalent, and metallic bonds), Lewis structures and resonance, molecular geometry and VSEPR theory, polarity and intermolecular forces, nomenclature of inorganic compounds, chemical equations and reaction types, stoichiometry (mole concept, limiting reagents, percent yield), gas laws (Boyle's, Charles's, Avogadro's, ideal gas law, gas mixtures and partial pressures), solutions and concentration units, and thermochemistry (enthalpy, Hess's Law, calorimetry). The laboratory component develops proficiency in quantitative techniques including gravimetric and volumetric analysis, proper use of analytical balances, titrations, spectrophotometry, and safe handling of chemicals. Students will learn to collect and analyze data, propagate uncertainty, and communicate results through formal laboratory reports. This course fulfills the physical science requirement for the associate degree and transfers to CSU and UC. Lab fee required. Prerequisites: MATH 101 (College Algebra) or equivalent with a grade of C or better, and eligibility for college-level English. High school chemistry strongly recommended.",
        "ccn_id": "CHEM C1001",
        "department_code": "CHEM",
        "slos": [
            {"sequence": 1, "outcome_text": "Apply stoichiometry to solve quantitative chemistry problems", "bloom_level": BloomLevel.APPLY},
            {"sequence": 2, "outcome_text": "Describe atomic structure and periodic trends", "bloom_level": BloomLevel.UNDERSTAND},
            {"sequence": 3, "outcome_text": "Predict molecular geometry and bonding characteristics", "bloom_level": BloomLevel.APPLY},
            {"sequence": 4, "outcome_text": "Perform laboratory experiments using proper safety procedures", "bloom_level": BloomLevel.APPLY},
        ],
        "content_items": [
            {"sequence": 1, "topic": "Introduction to Chemistry", "subtopics": ["Matter", "Measurements", "Significant figures"], "hours_allocated": Decimal("6")},
            {"sequence": 2, "topic": "Atomic Structure", "subtopics": ["Atomic theory", "Electron configuration", "Periodic trends"], "hours_allocated": Decimal("12")},
            {"sequence": 3, "topic": "Chemical Bonding", "subtopics": ["Ionic bonding", "Covalent bonding", "Molecular geometry"], "hours_allocated": Decimal("12")},
            {"sequence": 4, "topic": "Stoichiometry", "subtopics": ["Moles", "Chemical equations", "Limiting reagents"], "hours_allocated": Decimal("12")},
            {"sequence": 5, "topic": "States of Matter", "subtopics": ["Gases", "Liquids", "Solids"], "hours_allocated": Decimal("9")},
            {"sequence": 6, "topic": "Review and Assessment", "subtopics": ["Midterm review", "Final review"], "hours_allocated": Decimal("3")},
        ],
    },
]


def seed_courses():
    """
    Seed sample courses into the database.
    """
    with Session(engine) as session:
        # Get department lookup
        dept_map = {}
        departments = session.exec(select(Department)).all()
        for dept in departments:
            dept_map[dept.code] = dept.id

        # Get user lookup by department for assigning course ownership
        # This ensures courses are created by faculty in the appropriate department
        user_by_dept = {}
        users = session.exec(select(User)).all()
        for user in users:
            if user.department_id:
                # Find department code for this user's department
                for dept in departments:
                    if dept.id == user.department_id:
                        user_by_dept[dept.code] = user
                        break

        # Get a default user (preferably the MATH faculty for test purposes)
        default_user = user_by_dept.get("MATH") or (users[0] if users else None)
        if not default_user:
            print("  ERROR: No users found. Run seed_users.py first.")
            return

        created_count = 0
        skipped_count = 0

        for course_data in SEED_COURSES:
            # Check if course already exists
            existing = session.exec(
                select(Course).where(
                    Course.subject_code == course_data["subject_code"],
                    Course.course_number == course_data["course_number"]
                )
            ).first()

            if existing:
                print(f"  Course '{course_data['subject_code']} {course_data['course_number']}' already exists, skipping")
                skipped_count += 1
                continue

            # Extract nested data
            slos_data = course_data.pop("slos", [])
            content_data = course_data.pop("content_items", [])
            dept_code = course_data.pop("department_code", None)

            # Set department_id and created_by
            # Assign course to the faculty member in the same department if available
            if dept_code and dept_code in dept_map:
                course_data["department_id"] = dept_map[dept_code]
                # Use department-specific faculty if available, otherwise default
                course_owner = user_by_dept.get(dept_code, default_user)
                course_data["created_by"] = course_owner.id
            else:
                course_data["created_by"] = default_user.id

            # Create course
            course = Course(**course_data)
            session.add(course)
            session.flush()  # Get the course ID

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

            status_str = course_data.get("status", CourseStatus.DRAFT).value if isinstance(course_data.get("status"), CourseStatus) else str(course_data.get("status", "Draft"))
            print(f"  Created course: {course_data['subject_code']} {course_data['course_number']} - {course_data['title']} ({status_str})")
            created_count += 1

        session.commit()
        print(f"\nSeeded {created_count} courses ({skipped_count} already existed)")


if __name__ == "__main__":
    print("Seeding courses...")
    print("NOTE: Run seed_departments.py and seed_users.py first")
    seed_courses()
    print("Done!")
