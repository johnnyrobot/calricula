"""
Calricula - Program Seed Data
Seeds sample programs (degrees and certificates) for testing.
"""

import sys
from pathlib import Path
from decimal import Decimal

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.program import Program, ProgramType, ProgramStatus, ProgramCourse, RequirementType
from app.models.course import Course
from app.models.department import Department
from app.models.user import User


# Sample programs
SEED_PROGRAMS = [
    {
        "title": "Mathematics for Transfer",
        "type": ProgramType.AAT,
        "department_code": "MATH",
        "total_units": Decimal("60.0"),
        "status": ProgramStatus.APPROVED,
        "catalog_description": "The Associate in Arts in Mathematics for Transfer (AA-T) degree is designed to provide students with a solid foundation in mathematics and prepare them for seamless transfer to a California State University campus to complete a bachelor's degree in mathematics, applied mathematics, statistics, or a related quantitative field. This degree is part of the Student Transfer Achievement Reform (STAR) Act, guaranteeing CSU admission with junior standing to students who complete the program with a 2.0 GPA. The curriculum provides rigorous training in the core areas of undergraduate mathematics including single and multivariable calculus, linear algebra, and differential equations, along with general education courses that develop critical thinking, communication, and analytical skills. Students will develop proficiency in mathematical reasoning, proof techniques, computational methods, and the application of mathematics to problems in science, engineering, economics, and other disciplines. The program prepares students for careers in education, actuarial science, data science, operations research, financial analysis, and many other fields requiring strong quantitative skills. Students are encouraged to consult with a counselor to develop an educational plan and to explore transfer requirements for specific CSU campuses and majors.",
        "program_narrative": "The Associate in Arts in Mathematics for Transfer (AA-T) degree provides students with a guaranteed pathway to transfer to a California State University as a junior-level mathematics major. Upon successful completion of this degree, students will have developed strong analytical and problem-solving skills, the ability to construct and evaluate mathematical proofs, proficiency in computational techniques using technology, and the mathematical maturity required for upper-division coursework. The program emphasizes the interconnections between different areas of mathematics and their applications to real-world problems. Students will be prepared to pursue baccalaureate degrees in pure mathematics, applied mathematics, statistics, mathematics education, or related fields such as physics, engineering, computer science, or economics. The AA-T in Mathematics satisfies the lower-division major requirements for transfer to CSU and provides priority admission consideration under the STAR Act. Students completing this degree are strongly encouraged to work with a counselor to identify target transfer institutions and to complete the CSU General Education Breadth or IGETC pattern. Career opportunities for mathematics graduates include K-12 teaching, actuarial science, data analysis, financial modeling, operations research, software development, and graduate study leading to research or academic positions.",
        "top_code": "1701.00",
        "required_courses": [
            {"subject": "MATH", "number": "101", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("3.0")},
            {"subject": "MATH", "number": "201", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("4.0")},
            {"subject": "MATH", "number": "202", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("4.0")},
        ],
    },
    {
        "title": "Computer Science",
        "type": ProgramType.AS,
        "department_code": "CS",
        "total_units": Decimal("62.0"),
        "status": ProgramStatus.REVIEW,
        "catalog_description": "The Associate in Science in Computer Science degree provides students with a comprehensive foundation in computer science theory and practice, preparing them for transfer to a four-year institution or for immediate entry into the technology workforce. The curriculum covers the essential areas of computer science including programming fundamentals, object-oriented design, data structures and algorithms, computer architecture, operating systems, and software engineering principles. Students will develop proficiency in multiple programming languages (including Python, Java, and C++), learn to analyze algorithm efficiency using Big-O notation, design and implement complex software systems, and work effectively in collaborative development environments using version control and agile methodologies. The program also includes a strong mathematics foundation with calculus, discrete mathematics, and linear algebra to support advanced study in theoretical computer science, machine learning, and computational science. Laboratory components emphasize hands-on programming projects that simulate real-world software development scenarios. Graduates are prepared for careers as software developers, systems analysts, quality assurance engineers, and IT professionals, or for continued study toward a bachelor's degree in computer science, software engineering, or related fields. This program has been approved by the LACCD Board of Trustees as a high-unit major.",
        "program_narrative": "The Associate in Science in Computer Science degree prepares students for successful transfer to a four-year institution or for entry-level positions in the rapidly evolving technology industry. The program provides a rigorous foundation in both the theoretical and practical aspects of computing, ensuring graduates possess the knowledge and skills demanded by universities and employers. Upon completion of this degree, students will be able to design and implement software solutions using industry-standard programming languages and development tools, analyze the time and space complexity of algorithms and select appropriate data structures for specific applications, apply software engineering principles to develop maintainable and scalable systems, work effectively in team environments using collaborative development practices, and communicate technical concepts clearly to both technical and non-technical audiences. The curriculum aligns with the ACM/IEEE Computer Science Curricula recommendations and prepares students for coursework at CSU and UC campuses. Career pathways include software development, web development, mobile application development, database administration, systems administration, cybersecurity, and data science. The Bureau of Labor Statistics projects continued strong growth in computer and information technology occupations, with median salaries significantly above the national average. Students interested in transfer are encouraged to consult with a counselor and review articulation agreements with their target institutions.",
        "top_code": "0707.00",
        "required_courses": [
            {"subject": "CS", "number": "101", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("3.0")},
            {"subject": "CS", "number": "201", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("3.0")},
            {"subject": "CS", "number": "301", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("3.0")},
            {"subject": "MATH", "number": "201", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("4.0")},
        ],
    },
    {
        "title": "Business Administration Certificate",
        "type": ProgramType.CERTIFICATE,
        "department_code": "BUS",
        "total_units": Decimal("18.0"),
        "status": ProgramStatus.APPROVED,
        "catalog_description": "The Certificate of Achievement in Business Administration provides students with a comprehensive foundation in the essential principles and practices of modern business operations. This program is designed for students seeking to enter the business workforce, entrepreneurs launching new ventures, and working professionals seeking to advance their careers or transition into business roles. The curriculum covers the fundamental areas of business including management theory and organizational behavior, marketing principles and consumer behavior, financial accounting and managerial accounting, business law and ethics, microeconomics and macroeconomics, and business communication. Students will develop practical skills in financial statement analysis, marketing plan development, business plan writing, and professional communication. The program emphasizes the interconnected nature of business functions and prepares students to understand how decisions in one area impact the entire organization. Case studies and real-world projects provide opportunities to apply concepts to actual business situations. This certificate can be completed in two semesters of full-time study and serves as an excellent starting point for students who may wish to continue toward an Associate or Bachelor's degree in Business Administration or a specialized business field such as accounting, marketing, or management. Career opportunities include administrative assistant, customer service representative, sales associate, bookkeeper, office manager, and small business owner.",
        "program_narrative": "The Certificate of Achievement in Business Administration equips students with the knowledge and skills necessary to succeed in today's dynamic business environment. This program provides a practical, career-focused education that can be completed in a shorter timeframe than a degree program while still covering the essential business disciplines. Upon successful completion of this certificate, students will be able to explain the functions of management and their application in organizational settings, apply marketing concepts to develop strategies for reaching target markets, interpret financial statements and apply basic accounting principles, analyze business situations using economic reasoning, demonstrate professional communication skills in written and oral formats, and evaluate ethical considerations in business decision-making. The curriculum is designed to meet the needs of diverse student populations including recent high school graduates exploring business careers, working adults seeking career advancement, career changers entering the business field, and entrepreneurs developing skills to launch or grow small businesses. All courses in this certificate apply toward the Associate in Science in Business Administration degree, allowing students to continue their education seamlessly. The program prepares students for entry-level positions in various industries including retail, banking, insurance, real estate, hospitality, healthcare administration, and government agencies. Students are encouraged to meet with a counselor to discuss their career goals and develop an educational plan.",
        "top_code": "0505.00",
        "required_courses": [
            {"subject": "BUS", "number": "101", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("3.0")},
        ],
    },
    {
        "title": "Psychology for Transfer",
        "type": ProgramType.AAT,
        "department_code": "PSYCH",
        "total_units": Decimal("60.0"),
        "status": ProgramStatus.DRAFT,
        "catalog_description": "The Associate in Arts in Psychology for Transfer (AA-T) degree is designed to provide students with the foundational knowledge and skills necessary for successful transfer to a California State University campus to complete a bachelor's degree in psychology. This degree is part of the Student Transfer Achievement Reform (STAR) Act, guaranteeing CSU admission with junior standing to students who complete the program with a 2.0 GPA. The curriculum introduces students to psychology as a scientific discipline, examining human behavior, mental processes, and the biological, cognitive, developmental, and social factors that influence them. Core coursework includes introduction to psychology, research methods in psychology, biological psychology, developmental psychology, abnormal psychology, and social psychology. Students will develop scientific literacy skills including the ability to read and evaluate psychological research, understand experimental design and statistical analysis, and apply the scientific method to questions about human behavior. The program emphasizes critical thinking, ethical reasoning, and cultural awareness in the study of diverse human experiences. Students are prepared to pursue baccalaureate degrees in psychology, counseling, social work, human development, or related fields. Career opportunities with advanced degrees include clinical psychologist, counselor, school psychologist, human resources specialist, research analyst, and many positions in healthcare, education, business, and social services. Students are strongly encouraged to meet with a counselor to develop a comprehensive educational plan.",
        "program_narrative": "The Associate in Arts in Psychology for Transfer (AA-T) degree provides students with a guaranteed pathway to transfer to a California State University as a junior-level psychology major. Psychology is the scientific study of behavior and mental processes, and this program introduces students to the major theories, research findings, and applications of psychological science. Upon successful completion of this degree, students will be able to describe the major perspectives in psychology (biological, cognitive, behavioral, humanistic, psychodynamic, and sociocultural) and their contributions to understanding human behavior, apply the scientific method to psychological questions including designing studies, collecting data, and interpreting results, explain the biological bases of behavior including the structure and function of the nervous system, analyze developmental processes across the lifespan from conception through late adulthood, identify the characteristics, causes, and treatments of psychological disorders, and evaluate how social contexts influence individual behavior and mental processes. The AA-T in Psychology satisfies the lower-division major requirements for transfer to CSU and provides priority admission consideration under the STAR Act. This degree also provides excellent preparation for students interested in related fields such as sociology, anthropology, criminal justice, nursing, and education. The study of psychology develops valuable transferable skills including critical thinking, data analysis, written and oral communication, and understanding of human diversity. Students completing this degree are encouraged to explore internship and research opportunities to strengthen their applications for transfer and graduate programs.",
        "top_code": "2001.00",
        "required_courses": [
            {"subject": "PSYCH", "number": "101", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("3.0")},
        ],
    },
    {
        "title": "Web Development Certificate",
        "type": ProgramType.CERTIFICATE,
        "department_code": "CS",
        "total_units": Decimal("24.0"),
        "status": ProgramStatus.DRAFT,
        "catalog_description": "The Certificate of Achievement in Web Development prepares students for entry-level positions as web developers, front-end developers, or full-stack developers in the growing technology sector. This career-focused program provides comprehensive training in both client-side (front-end) and server-side (back-end) web development technologies. Students will learn to design and build responsive, accessible, and visually appealing websites using HTML5, CSS3, and modern CSS frameworks such as Bootstrap and Tailwind CSS. The curriculum covers JavaScript programming including ES6+ features, DOM manipulation, event handling, and asynchronous programming with Promises and async/await. Students will gain experience with popular front-end frameworks such as React, Vue.js, or Angular for building dynamic single-page applications. Server-side development is covered through Node.js and Express.js, with instruction in RESTful API design, database integration (both SQL and NoSQL), authentication, and deployment strategies. Industry-standard development tools and practices are emphasized throughout the program including Git version control, command-line interfaces, package managers (npm/yarn), testing frameworks, and debugging techniques. Students will build a professional portfolio of projects demonstrating their skills to potential employers. This certificate can be completed in two to three semesters and provides a pathway to immediate employment or continued study in the Computer Science degree program.",
        "program_narrative": "The Certificate of Achievement in Web Development equips students with the practical skills and industry knowledge required to succeed as web developers in today's technology-driven economy. The program combines theoretical foundations with extensive hands-on project work, ensuring graduates are job-ready upon completion. Upon successful completion of this certificate, students will be able to develop semantic, accessible HTML documents following W3C and WCAG standards, create responsive layouts using CSS flexbox, grid, and media queries that function across devices, write clean, maintainable JavaScript code using modern ES6+ syntax and best practices, build interactive user interfaces using a modern JavaScript framework (React, Vue.js, or Angular), develop server-side applications and RESTful APIs using Node.js and Express.js, implement database solutions using both relational (PostgreSQL, MySQL) and document-based (MongoDB) systems, utilize Git for version control and collaborate effectively using platforms like GitHub, and deploy web applications to cloud platforms such as Heroku, Netlify, or AWS. The curriculum is regularly updated to reflect current industry trends and employer requirements. Students benefit from project-based learning that mirrors real-world development workflows, building a portfolio that demonstrates their capabilities to employers. Career opportunities include web developer, front-end developer, back-end developer, full-stack developer, UI developer, and junior software engineer. The Bureau of Labor Statistics projects strong job growth in web development, with median salaries well above the national average. All courses in this certificate apply toward the Associate in Science in Computer Science degree.",
        "top_code": "0707.00",
        "required_courses": [
            {"subject": "CS", "number": "101", "requirement_type": RequirementType.REQUIRED_CORE, "units": Decimal("3.0")},
            {"subject": "CS", "number": "201", "requirement_type": RequirementType.LIST_A, "units": Decimal("3.0")},
        ],
    },
]


def seed_programs():
    """
    Seed sample programs into the database.
    """
    with Session(engine) as session:
        # Get department lookup
        dept_map = {}
        departments = session.exec(select(Department)).all()
        for dept in departments:
            dept_map[dept.code] = dept.id

        # Get course lookup
        course_map = {}
        courses = session.exec(select(Course)).all()
        for course in courses:
            key = f"{course.subject_code} {course.course_number}"
            course_map[key] = course.id

        # Get a default user for created_by
        default_user = session.exec(select(User)).first()
        if not default_user:
            print("  ERROR: No users found. Run seed_users.py first.")
            return

        created_count = 0
        skipped_count = 0

        for prog_data in SEED_PROGRAMS:
            # Check if program already exists
            existing = session.exec(
                select(Program).where(Program.title == prog_data["title"])
            ).first()

            if existing:
                print(f"  Program '{prog_data['title']}' already exists, skipping")
                skipped_count += 1
                continue

            # Extract nested data
            required_courses = prog_data.pop("required_courses", [])
            dept_code = prog_data.pop("department_code", None)

            # Set department_id and created_by
            if dept_code and dept_code in dept_map:
                prog_data["department_id"] = dept_map[dept_code]
            prog_data["created_by"] = default_user.id

            # Create program
            program = Program(**prog_data)
            session.add(program)
            session.flush()  # Get the program ID

            # Create program-course relationships
            seq = 1
            for course_req in required_courses:
                course_key = f"{course_req['subject']} {course_req['number']}"
                course_id = course_map.get(course_key)

                if course_id:
                    program_course = ProgramCourse(
                        program_id=program.id,
                        course_id=course_id,
                        requirement_type=course_req["requirement_type"],
                        sequence=seq,
                        units_applied=course_req.get("units", Decimal("0")),
                    )
                    session.add(program_course)
                    seq += 1
                else:
                    print(f"    Warning: Course '{course_key}' not found, skipping")

            status_str = prog_data.get("status", ProgramStatus.DRAFT).value
            print(f"  Created program: {prog_data['title']} ({prog_data['type'].value}, {prog_data['total_units']} units, {status_str})")
            created_count += 1

        session.commit()
        print(f"\nSeeded {created_count} programs ({skipped_count} already existed)")


if __name__ == "__main__":
    print("Seeding programs...")
    print("NOTE: Run seed_departments.py, seed_users.py, and seed_courses.py first")
    seed_programs()
    print("Done!")
