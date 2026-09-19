import type { CCNStandard } from "./schemas";

type CCNReferenceTuple = readonly [
  ccnCode: string,
  subjectCode: string,
  courseNumber: string,
  discipline: string,
  title: string,
  minimumUnits: string,
  descriptor: string,
  flags: number,
  impliedTopCode: string | null,
  approvedDate: string | null,
  sourceFile: string,
];

/**
 * Compact, immutable projection of the valid rows in
 * backend/seeds/data/ccn_templates_extracted.json.
 *
 * The source currently contains 64 rows. Its one blank-code ECON row is
 * deliberately excluded. The extractor also emitted zero units for 18 rows;
 * as in the backend seed transform, those parse gaps use a documented
 * three-unit safe default rather than representing a zero-unit course.
 *
 * Flag bits: 1 honors, 2 lab-only, 4 support course, 8 embedded support.
 */
const CCN_REFERENCE_TUPLES = [
  ["ANTH C1000", "ANTH", "C1000", "ANTH", "Introduction to Biological Anthropology with Lab", "4", "In this course students examine human origins, evolution, and variation with a focus on the adaptations of humans and other primates. Biological evolution and scientific methods are foundations for the course. The laboratory component uses interactive exercises to investigate the anatomy, genetics, behavior, variation, and evolution of humans and other primates.", 0, "2202.00", "2025-06-16", "ccn-course-template-anth-c1000-introduction-to-biological-anthropology-with-lab-a11y.pdf"],
  ["ANTH C1000H", "ANTH", "C1000H", "ANTH", "Introduction to Biological Anthropology with Lab - Honors", "4", "In this course students examine human origins, evolution, and variation with a focus on the adaptations of humans and other primates. Biological evolution and scientific methods are foundations for the course. The laboratory component uses interactive exercises to investigate the anatomy, genetics, behavior, variation, and evolution of humans and other primates. This is an honors course.", 1, "2202.00", "2025-06-16", "ccn-course-template-anth-c1000h-introduction-to-biological-anthropology-with-lab-honors-1-a11y.pdf"],
  ["ANTH C1001", "ANTH", "C1001", "ANTH", "Introduction to Biological Anthropology", "3", "In this course, students examine human origins, evolution, and variation with a focus on the adaptations of humans and other primates. Biological evolution and scientific methods are foundations for the course.", 0, "2202.00", "2025-06-16", "ccn-course-template-anth-c1001-introduction-to-biological-anthropology-a11y.pdf"],
  ["ANTH C1001H", "ANTH", "C1001H", "ANTH", "Introduction to Biological Anthropology - Honors", "3", "In this course, students examine human origins, evolution, and variation with a focus on the adaptations of humans and other primates. Biological evolution and scientific methods are foundations for the course. This is an honors course.", 1, "2202.00", "2025-06-16", "ccn-course-template-anth-c1001h-introduction-to-biological-anthropology-honors-a11y.pdf"],
  ["ANTH C1001L", "ANTH", "C1001L", "ANTH", "Biological Anthropology Lab", "3", "In this laboratory course, students investigate the anatomy, genetics, behavior, variation, and evolution of humans and other primates. Students apply the scientific method and use interactive exercises in this course supplement to the Introduction to Biological Anthropology lecture course.", 2, "2202.00", "2025-06-16", "ccn-course-template-anth-c1001l-biological-anthropology-lab-a11y.pdf"],
  ["ANTH C1001LH", "ANTH", "C1001LH", "ANTH", "Biological Anthropology Lab - Honors", "3", "In this laboratory course, students investigate the anatomy, genetics, behavior, variation, and evolution of humans and other primates. Students apply the scientific method and use interactive exercises in this course supplement to the Introduction to Biological Anthropology lecture course. This is an honors course.", 3, "2202.00", "2025-06-16", "ccn-course-template-anth-c1001lh-biological-anthropology-lab-honors-a11y.pdf"],
  ["ARTH C1100", "ARTH", "C1100", "ARTH", "Survey of Art from Prehistory to the Medieval Era", "3", "This course introduces students to visual art and architecture from prehistory to the medieval era with a focus on art from Europe, North Africa, and the near East. The course will further consider global interactions involving these regions.", 0, "1002.00", "2025-01-08", "ccn-course-template-arth-c1100-survey-of-art-from-prehistory-to-the-medieval-era-jan2025-v2-a11y.pdf"],
  ["ARTH C1200", "ARTH", "C1200", "ARTH", "Survey of Art from the Renaissance to Contemporary", "3", "This course provides an overview of art and architecture from the Renaissance to the contemporary period with a focus on art from Europe. The course will further consider global interactions involving this region.", 0, "1002.00", "2025-01-08", "ccn-course-template-arth-c1200-survey-of-art-from-the-renaissance-to-contemporary-jan2025-v2-a11y.pdf"],
  ["ASTR C1001H", "ASTR", "C1001H", "ASTR", "Introduction to Astronomy - Honors", "3", "This course introduces fundamental concepts of astronomy, including the Solar System, stars, supernovae, galaxies, black holes, and the expanding universe. Students learn how to study the cosmos and what the latest discoveries reveal about the origins and fate of the universe. This is an honors course.", 1, "1911.00", "2025-06-16", "ccn-course-template-aster-c1001h-introduction-to-astronomy-honors-a11y.pdf"],
  ["ASTR C1000", "ASTR", "C1000", "ASTR", "Introduction to Astronomy with Lab", "4", "This course introduces fundamental concepts of astronomy, including the Solar System, stars, supernovae, galaxies, black holes, and the expanding universe. Students learn how to study the cosmos through experiments, observations, and/or simulations and discover what the latest science reveals about the origins and fate of the universe.", 0, "1911.00", "2025-06-16", "ccn-course-template-astr-c1000-introduction-to-astronomy-with-lab-a11y.pdf"],
  ["ASTR C1000H", "ASTR", "C1000H", "ASTR", "Introduction to Astronomy with Lab - Honors", "4", "This course introduces fundamental concepts of astronomy, including the Solar System, stars, supernovae, galaxies, black holes, and the expanding universe. Students learn how to study the cosmos through experiments, observations, and/or simulations and discover what the latest science reveals about the origins and fate of the universe. This is an honors course.", 1, "1911.00", "2025-06-16", "ccn-course-template-astr-c1000h-introduction-to-astronomy-with-lab-honors-a11y.pdf"],
  ["ASTR C1001", "ASTR", "C1001", "ASTR", "Introduction to Astronomy", "3", "This course introduces fundamental concepts of astronomy, including the Solar System, stars, supernovae, galaxies, black holes, and the expanding universe. Students learn how to study the cosmos and what the latest discoveries reveal about the origins and fate of the universe.", 0, "1911.00", "2025-06-16", "ccn-course-template-astr-c1001-introduction-to-astronomy-a11y.pdf"],
  ["ASTR C1001L", "ASTR", "C1001L", "ASTR", "Introduction to Astronomy Lab", "1", "This laboratory course reinforces fundamental principles and concepts of astronomy by applying the scientific method through experiments, observations, and/or simulations.", 2, "1911.00", "2025-06-16", "ccn-course-template-astr-c1001l-introduction-to-astronomy-lab-a11y.pdf"],
  ["ASTR C1001LH", "ASTR", "C1001LH", "ASTR", "Introduction to Astronomy Lab - Honors", "1", "This laboratory course reinforces fundamental principles and concepts of astronomy by applying the scientific method through experiments, observations, and/or simulations. This is an honors course.", 3, "1911.00", "2025-06-16", "ccn-course-template-astr-c1001lh-introduction-to-astronomy-lab-honors-a11y.pdf"],
  ["BIOL C1000", "BIOL", "C1000", "BIOL", "Introduction to Biology with Lab", "4", "This combined lecture and laboratory course provides the non-biology major with an introduction to living things and their environment. Students use experimentation and investigation to develop important critical thinking skills. Students learn about the process of science, the building blocks of life, the role and regulation of DNA, how populations change over time, the movement of energy within and between life forms, and how species interact with each other and their surroundings. By the end of the course, students will be able to apply an understanding of biological concepts to current issues and their impacts on society.", 0, "0401.00", "2025-06-16", "ccn-course-template-biol-c1000-introduction-to-biology-with-lab-ca-a11y.pdf"],
  ["BIOL C1000H", "BIOL", "C1000H", "BIOL", "Introduction to Biology with Lab – Honors", "4", "This combined lecture and laboratory course provides the non-biology major with an introduction to living things and their environment. Students use experimentation and investigation to develop important critical thinking skills. Students learn about the process of science, the building blocks of life, the role and regulation of DNA, how populations change over time, the movement of energy within and between life forms, and how species interact with each other and their surroundings. By the end of the course, students will be able to apply an understanding of biological concepts to current issues and their impacts on society. This is an honors course.", 1, "0401.00", "2025-06-16", "ccn-course-template-biol-c1000h-introduction-to-biology-with-lab-honors-ca-a11y.pdf"],
  ["BIOL C1001", "BIOL", "C1001", "BIOL", "Introduction to Biology", "3", "This lecture course provides the non-biology major with an introduction to living things and their environment. Students develop important critical thinking skills as they learn about the process of science, the building blocks of life, the role and regulation of DNA, how populations change over time, the movement of energy within and between life forms, and how species interact with each other and their surroundings. By the end of the course, students will be able to apply an understanding of biological concepts to current issues and their impacts on society.", 0, "0401.00", "2025-06-16", "ccn-course-template-biol-c1001-introduction-to-biology-ca-a11y.pdf"],
  ["BIOL C1001H", "BIOL", "C1001H", "BIOL", "Introduction to Biology - Honors", "3", "This lecture course provides the non-biology major with an introduction to living things and their environment. Students develop important critical thinking skills as they learn about the process of science, the building blocks of life, the role and regulation of DNA, how populations change over time, the movement of energy within and between life forms, and how species interact with each other and their surroundings. By the end of the course, students will be able to apply an understanding of biological concepts to current issues and their impacts on society. This is an honors course.", 1, "0401.00", "2025-06-16", "ccn-course-template-biol-c1001h-introduction-to-biology-honors-ca-a11y.pdf"],
  ["BIOL C1001L", "BIOL", "C1001L", "BIOL", "Introduction to Biology Lab", "3", "This laboratory course provides the hands-on application of concepts learned in the Introduction to Biology lecture (BIOL C1001) for the non-biology major. Students use experimentation and investigation to develop important critical thinking skills. Students engage in the process of science to explore the building blocks of life, the role and regulation of DNA, how populations change over time, the movement of energy within and between life forms, and how species interact with each other and their surroundings. By the end of the course, students will be familiar with some of the equipment and techniques used by biologists.", 2, "0401.00", "2025-06-16", "ccn-course-template-biol-c1001l-introduction-to-biology-lab-ca-a11y.pdf"],
  ["BIOL C1001LH", "BIOL", "C1001LH", "BIOL", "Introduction to Biology Lab - Honors", "3", "This laboratory course provides the hands-on application of concepts learned in the Introduction to Biology lecture (BIOL C1001) for the non-biology major. Students use experimentation and investigation to develop important critical thinking skills. Students engage in the process of science to explore the building blocks of life, the role and regulation of DNA, how populations change over time, the movement of energy within and between life forms, and how species interact with each other and their surroundings. By the end of the course, students will be familiar with some of the equipment and techniques used by biologists. This is an honors course.", 3, "0401.00", "2025-06-16", "ccn-course-template-biol-c1001lh-introduction-to-biology-lab-honors-ca-a11y.pdf"],
  ["CDEV C1000", "CDEV", "C1000", "CDEV", "Child Growth and Development", "3", "Students examine the progression of development in the physical, cognitive, social, and emotional domains and identify developmental milestones for children from conception through adolescence. Emphasis is on interactions between biological processes, environmental, and cultural factors. Students may engage in various methods of observing children's development to evaluate individual differences and analyze development characteristics at various stages according to developmental theories.", 0, "1305.00", "2025-06-16", "ccn-course-template-cdev-c1000-child-growth-and-development-a11y.pdf"],
  ["CDEV C1000H", "CDEV", "C1000H", "CDEV", "Child Growth and Development - Honors", "3", "Students examine the progression of development in the physical, cognitive, social, and emotional domains and identify developmental milestones for children from conception through adolescence. Emphasis is on interactions between biological processes, environmental, and cultural factors. Students may engage in various methods of observing children's development to evaluate individual differences and analyze development characteristics at various stages according to developmental theories. This is an honors course.", 1, "1305.00", "2025-06-16", "ccn-course-template-cdev-c1000h-child-growth-and-development-honors-a11y.pdf"],
  ["COMM C1004", "COMM", "C1004", "COMM", "Interpersonal Communication", "3", "This course covers theory, research, and application of ethical one-to-one communication practices in various and diverse interpersonal relationships including in personal, professional, and social situations.", 0, "0604.00", "2025-06-16", "ccn-course-template-comm-c1004-interpersonal-communication-a11y.pdf"],
  ["COMM C1004H", "COMM", "C1004H", "COMM", "Interpersonal Communication - Honors", "3", "This course covers theory, research, and application of ethical one-to-one communication practices in various and diverse interpersonal relationships including in personal, professional, and social situations. This is an honors course.", 1, "0604.00", "2025-06-16", "ccn-course-template-comm-c1004h-interpersonal-communication-honors-a11y.pdf"],
  ["ECON C2001H", "ECON", "C2001H", "ECON", "Principles of Microeconomics - Honors", "3", "An introductory course using microeconomic models to understand individual decisions by consumers and firms, market outcomes including market failure, elasticity, market structures, labor markets, inequality, and the impact of government policies. This is an honors course.", 1, "2204.00", "2025-03-18", "ccn-course-template-econ-c2001h-principles-of-microeconomics-honors-jan2025-v2-a11y.pdf"],
  ["ECON C2002", "ECON", "C2002", "ECON", "Principles of Macroeconomics", "3", "An introductory course using models of the domestic and international economy to understand national income, unemployment, inflation, economic growth, inequality, the financial system, and monetary, fiscal, and other economic policies.", 0, "2204.00", "2025-01-08", "ccn-course-template-econ-c2002-principles-of-mamcroeconomics-jan2025-v2-a11y.pdf"],
  ["ECON C2002H", "ECON", "C2002H", "ECON", "Principles of Macroeconomics - Honors", "3", "An introductory course using models of the domestic and international economy to understand national income, unemployment, inflation, economic growth, inequality, the financial system, and monetary, fiscal, and other economic policies. This is an honors course.", 1, "2204.00", "2025-01-08", "ccn-course-template-econ-c2002h-principles-of-macroeconomics-honors-jan2025-v2-a11y.pdf"],
  ["ENGL C1002", "ENGL", "C1002", "ENGL", "Introduction to Literature", "3", "In this course, students are introduced to works by diverse authors and major literary genres, developing close reading and analytical writing skills. Students also develop appreciation for and critical understanding of the cultural, historical, and aesthetic qualities of literature.", 0, "1501.00", "2025-01-08", "ccn-course-template-engl-c1002-introduction-to-literature-jan2025-v2-a11y.pdf"],
  ["ENGL C1002H", "ENGL", "C1002H", "ENGL", "Introduction to Literature - Honors", "3", "In this course, students are introduced to works by diverse authors and major literary genres, developing close reading and analytical writing skills. Students also develop appreciation for and critical understanding of the cultural, historical, and aesthetic qualities of literature. This is an honors course.", 1, "1501.00", "2025-01-08", "ccn-course-template-engl-c1002h-introduction-to-literature-honors-jan2025-v2-a11y.pdf"],
  ["ENGL C1003", "ENGL", "C1003", "ENGL", "Critical Thinking and Writing through Literature", "4", "In this course, students receive instruction in analytical, critical, and argumentative writing. Students develop critical thinking, close reading and literary analysis skills, research strategies, information literacy, and knowledge of accurate documentation through the study of diverse literary works from a variety of literary genres, developing an appreciation for literature.", 0, "1501.00", "2025-01-08", "ccn-course-template-engl-c1003-critical-thinking-and-writing-through-literature-jan2025-v2-a11y.pdf"],
  ["HIST C1001", "HIST", "C1001", "HIST", "United States History to 1877", "3", "This course is a historical survey of the United States, from Indigenous North America to the end of Reconstruction. The course also introduces students to historical reasoning skills.", 0, "2205.00", "2025-01-08", "ccn-course-template-hist-c1001-united-states-history-to-1877-jan2025-v2-a11y.pdf"],
  ["HIST C1001H", "HIST", "C1001H", "HIST", "United States History to 1877 - Honors", "3", "This course is a historical survey of the United States, from Indigenous North America to the end of Reconstruction. The course also introduces students to historical reasoning skills. This is an honors course.", 1, "2205.00", "2025-01-08", "ccn-course-template-hist-c1001h-united-states-history-to-1877-honors-jan2025-v2-a11y.pdf"],
  ["HIST C1002", "HIST", "C1002", "HIST", "United States History since 1865", "3", "This course is a historical survey of the United States from the end of the Civil War to the present. The course also introduces students to historical reasoning skills.", 0, "2205.00", "2025-01-08", "ccn-course-template-hist-c1002-united-states-since-1865-jan2025-v2-a11y.pdf"],
  ["HIST C1002H", "HIST", "C1002H", "HIST", "United States History since 1865 - Honors", "3", "This course is a historical survey of the United States from the end of the Civil War to the present. The course also introduces students to historical reasoning skills. This is an honors course.", 1, "2205.00", "2025-01-08", "ccn-course-template-hist-c1002h-united-states-since-1865-honors-jan2025-v2-a11y.pdf"],
  ["MATH C2210", "MATH", "C2210", "MATH", "Calculus I: Early Transcendentals", "4", "A first course in differential and integral calculus of a single variable. Topics include limits and continuity of functions, techniques and applications of differentiation, an introduction to integration, and the Fundamental Theorem of Calculus. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors.", 0, "1701.00", "2025-06-16", "ccn-course-template-math-c2210-calculus-i-early-transcendentals-a11y.pdf"],
  ["MATH C2210E", "MATH", "C2210E", "MATH", "Calculus I: Early Transcendentals – Embedded Support", "4", "A first course in differential and integral calculus of a single variable. Topics include limits and continuity of functions, techniques and applications of differentiation, an introduction to integration, and the Fundamental Theorem of Calculus. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors. This course includes embedded support.", 8, "1701.00", "2025-06-16", "ccn-course-template-math-c2210e-calculus-i-early-transcendentals-with-embedded-support-a11y.pdf"],
  ["MATH C2210H", "MATH", "C2210H", "MATH", "Calculus I: Early Transcendentals - Honors", "4", "A first course in differential and integral calculus of a single variable. Topics include limits and continuity of functions, techniques and applications of differentiation, an introduction to integration, and the Fundamental Theorem of Calculus. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors. This is an honors course.", 1, "1701.00", "2025-06-16", "ccn-course-template-math-c2210h-calculus-i-early-transcendentals-honors-a11y.pdf"],
  ["MATH C2211", "MATH", "C2211", "MATH", "Calculus I: Late Transcendentals", "4", "A first course in differential and integral calculus of a single variable. Topics include limits and continuity of functions, techniques and applications of differentiation, an introduction to integration, and the Fundamental Theorem of Calculus. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors.", 0, "1701.00", "2025-06-16", "ccn-course-template-math-c2211-calculus-i-late-transcendentals-a11y.pdf"],
  ["MATH C2211E", "MATH", "C2211E", "MATH", "Calculus I: Late Transcendentals – Embedded Support", "4", "A first course in differential and integral calculus of a single variable. Topics include limits and continuity of functions, techniques and applications of differentiation, an introduction to integration, and the Fundamental Theorem of Calculus. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors. This course includes embedded support.", 8, "1701.00", "2025-06-16", "ccn-course-template-math-c2211e-calculus-i-late-transcendentals-with-embedded-support-a11y.pdf"],
  ["MATH C2211H", "MATH", "C2211H", "MATH", "Calculus I: Late Transcendentals - Honors", "4", "A first course in differential and integral calculus of a single variable. Topics include limits and continuity of functions, techniques and applications of differentiation, an introduction to integration, and the Fundamental Theorem of Calculus. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors. This is an honors course.", 1, "1701.00", "2025-06-16", "ccn-course-template-math-c2211h-calculus-i-late-transcendentals-honors-a11y.pdf"],
  ["MATH C2220", "MATH", "C2220", "MATH", "Calculus II: Early Transcendentals", "4", "A second course in differential and integral calculus of a single variable. Topics include applications of integration, techniques of integration, infinite sequences and series, and the calculus of parametric and polar equations. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors.", 0, "1701.00", "2025-06-16", "ccn-course-template-math-c2220-calculus-ii-early-transcendentals-a11y.pdf"],
  ["MATH C2220H", "MATH", "C2220H", "MATH", "Calculus II: Early Transcendentals - Honors", "4", "A second course in differential and integral calculus of a single variable. Topics include applications of integration, techniques of integration, infinite sequences and series, and the calculus of parametric and polar equations. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors. This is an honors course.", 1, "1701.00", "2025-06-16", "ccn-course-template-math-c2220h-calculus-ii-early-transcendentals-honors-a11y.pdf"],
  ["MATH C2221", "MATH", "C2221", "MATH", "Calculus II: Late Transcendentals", "4", "A second course in differential and integral calculus of a single variable. Topics include applications of integration, techniques of integration, infinite sequences and series, and the calculus of parametric and polar equations. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors.", 0, "1701.00", "2025-06-16", "ccn-course-template-math-c2221-calculus-ii-late-transcendentals-a11y.pdf"],
  ["MATH C2221H", "MATH", "C2221H", "MATH", "Calculus II: Late Transcendentals - Honors", "4", "A second course in differential and integral calculus of a single variable. Topics include applications of integration, techniques of integration, infinite sequences and series, and the calculus of parametric and polar equations. This course is primarily intended for Science, Technology, Engineering, and Mathematics (STEM) majors. This is an honors course.", 1, "1701.00", "2025-06-16", "ccn-course-template-math-c2221h-calculus-ii-late-transcendentals-honors-a11y.pdf"],
  ["SOCI C1000", "SOCI", "C1000", "SOCI", "Introduction to Sociology", "3", "This course introduces students to Sociology: the study of people, groups, and institutions that shape people’s lives. Through a mix of theory, research, and real-world examples, students explore key sociological concepts like culture, inequality, power, collective action, and social change. With content reflecting diverse histories and lived experiences, students make connections between their lives and the social forces that influence individual opportunities and choices. Students in this course will develop a critical lens that allows them to better understand and transform themselves and society.", 0, "2208.00", "2025-06-16", "ccn-course-template-soci-c1000-introduction-to-sociology-ca-nc-a11y.pdf"],
  ["SOCI C1000H", "SOCI", "C1000H", "SOCI", "Introduction to Sociology - Honors", "3", "This course introduces students to Sociology: the study of people, groups, and institutions that shape people’s lives. Through a mix of theory, research, and real-world examples, students explore key sociological concepts like culture, inequality, power, collective action, and social change. With content reflecting diverse histories and lived experiences, students make connections between their lives and the social forces that influence individual opportunities and choices. Students in this course will develop a critical lens that allows them to better understand and transform themselves and society. This is an honors course.", 1, "2208.00", "2025-06-16", "ccn-course-template-soci-c1000h-introduction-to-sociology-honors-ca-nc-a11y.pdf"],
  ["ENGL C1000", "ENGL", "C1000", "ENGL", "Academic Reading and Writing", "3", "", 0, "1501.00", "2024-09-27", "ccn-template-final-academic-reading-and-writing-aug2024c1000-a11y.pdf"],
  ["ENGL C1000E", "ENGL", "C1000E", "ENGL", "Academic Reading and Writing", "3", "", 8, "1501.00", "2024-09-27", "ccn-template-final-academic-reading-and-writing-embeddedsupport-aug2024c1000e-a11y.pdf"],
  ["ENGL C1000H", "ENGL", "C1000H", "ENGL", "Academic Reading and Writing - Honors", "3", "", 1, "1501.00", "2024-09-27", "ccn-template-final-academic-reading-and-writing-honors-aug2024c1000h-a11y.pdf"],
  ["POLS C1000H", "POLS", "C1000H", "POLS", "American Government and Politics - Honors", "3", "", 1, "2207.00", "2024-09-27", "ccn-template-final-american-government-and-politics-honors-july2024c1000h-a11y.pdf"],
  ["POLS C1000", "POLS", "C1000", "POLS", "American Government and Politics", "3", "", 0, "2207.00", "2024-09-27", "ccn-template-final-american-government-and-politics-july2024c1000-a11y.pdf"],
  ["ENGL C1001", "ENGL", "C1001", "ENGL", "Critical Thinking and Writing", "3", "In this course, students receive instruction in critical thinking for purposes of constructing, evaluating, and composing arguments in a variety of rhetorical forms, using primarily non-fiction texts, refining writing skills and research strategies developed in ENGL C1000 Academic Reading and Writing (or C-ID ENGL 100) or similar first-year college writing course.", 0, "1501.00", "2024-09-27", "ccn-template-final-critical-thinking-and-writing-aug2024-v2c1001-a11y.pdf"],
  ["ENGL C1001H", "ENGL", "C1001H", "ENGL", "Critical Thinking and Writing - Honors", "3", "", 1, "1501.00", "2024-09-27", "ccn-template-final-critical-thinking-and-writing-honors-aug2024-v2c1001h-a11y.pdf"],
  ["PSYC C1000", "PSYC", "C1000", "PSYC", "Introduction to Psychology", "3", "", 0, "2001.00", "2024-09-27", "ccn-template-final-introduction-to-psychology-aug2024c1000-a11y.pdf"],
  ["PSYC C1000H", "PSYC", "C1000H", "PSYC", "Introduction to Psychology - Honors", "3", "", 1, "2001.00", "2024-09-27", "ccn-template-final-introduction-to-psychology-honors-aug2024c1000h-a11y.pdf"],
  ["COMM C1000", "COMM", "C1000", "COMM", "Introduction to Public Speaking", "3", "", 0, "0604.00", "2024-09-27", "ccn-template-final-introduction-to-public-speaking-august2024-c1000-a11y.pdf"],
  ["COMM C1000H", "COMM", "C1000H", "COMM", "Introduction to Public Speaking - Honors", "3", "", 1, "0604.00", "2024-09-27", "ccn-template-final-introduction-to-public-speaking-honors-aug2024c1000h-a11y.pdf"],
  ["STAT C1000", "STAT", "C1000", "STAT", "Introduction to Statistics", "3", "", 0, "1701.00", "2024-09-27", "ccn-template-final-introduction-to-statistics-aug2024c1000-a11y.pdf"],
  ["STAT C1000H", "STAT", "C1000H", "STAT", "Introduction to Statistics - Honors", "3", "", 1, "1701.00", "2024-09-27", "ccn-template-final-introduction-to-statistics-honors-aug2024c1000h-a11y.pdf"],
  ["STAT C1000E", "STAT", "C1000E", "STAT", "Introduction to Statistics", "3", "", 8, "1701.00", "2024-09-27", "ccn-template-final-introduction-to-statistics-support-aug2024c1000e-a11y.pdf"],
  ["ARTH C1100H", "ARTH", "C1100H", "ARTH", "Survey of Art from Prehistory to the Medieval Era - Honors", "3", "This course introduces students to visual art and architecture from prehistory to the medieval era with a focus on art from Europe, North Africa, and the near East. The course will further consider global interactions involving these regions. This is an honors course.", 1, "1002.00", "2025-01-08", "ccncoursetemplatearthc1100hsurveyofartfromprehistorytothemedievalerahonorsjan2025v2a11y.pdf"],
  ["ARTH C1200H", "ARTH", "C1200H", "ARTH", "Survey of Art from the Renaissance to Contemporary - Honors", "3", "This course provides an overview of art and architecture from the Renaissance to the contemporary period with a focus on art from Europe. The course will further consider global interactions involving this region. This is an honors course.", 1, "1002.00", "2025-01-08", "ccncoursetemplatearthc1200hsurveyofartfromtherenaissancetocontemporaryhonorsjan2025v2a11y.pdf"],
  ["ENGL C1003H", "ENGL", "C1003H", "ENGL", "Critical Thinking and Writing through Literature - Honors", "4", "In this course, students receive instruction in analytical, critical, and argumentative writing. Students develop critical thinking, close reading and literary analysis skills, research strategies, information literacy, and knowledge of accurate documentation through the study of diverse literary works from a variety of literary genres, developing an appreciation for literature. This is an honors course.", 1, "1501.00", "2025-01-08", "ccncoursetemplateenglc1003hcriticalthinkingandwritingthroughliteraturehonorsjan2025v2a11y.pdf"],
] as const satisfies readonly CCNReferenceTuple[];

export const CCN_SAFE_DEFAULT_UNIT_CODES = Object.freeze([
  "ANTH C1001L",
  "ANTH C1001LH",
  "BIOL C1001L",
  "BIOL C1001LH",
  "ENGL C1000",
  "ENGL C1000E",
  "ENGL C1000H",
  "POLS C1000H",
  "POLS C1000",
  "ENGL C1001",
  "ENGL C1001H",
  "PSYC C1000",
  "PSYC C1000H",
  "COMM C1000",
  "COMM C1000H",
  "STAT C1000",
  "STAT C1000H",
  "STAT C1000E",
] as const);

const safeDefaultCodes = new Set<string>(CCN_SAFE_DEFAULT_UNIT_CODES);

export function createCCNReferenceStandards(
  stableId: (sequence: number) => string,
  effectiveDate: string,
): CCNStandard[] {
  return CCN_REFERENCE_TUPLES.map(
    (
      [
        ccnCode,
        subjectCode,
        courseNumber,
        discipline,
        title,
        minimumUnits,
        extractedDescriptor,
        flags,
        impliedTopCode,
        approvedDate,
        sourceFile,
      ],
      index,
    ) => {
      const descriptor =
        extractedDescriptor.trim() ||
        `Official Common Course Numbering template for ${title}.`;
      return Object.freeze({
        id: stableId(5_001 + index),
        ccnCode,
        discipline,
        subjectCode,
        courseNumber,
        title,
        descriptor,
        minimumUnits,
        maximumUnits: minimumUnits,
        catalogDescription: descriptor,
        minimumUnitsSource: safeDefaultCodes.has(ccnCode)
          ? ("safe-default" as const)
          : ("extracted" as const),
        isHonors: Boolean(flags & 1),
        isLabOnly: Boolean(flags & 2),
        isSupportCourse: Boolean(flags & 4),
        hasEmbeddedSupport: Boolean(flags & 8),
        impliedCb05: "A" as const,
        impliedTopCode,
        sourceFile,
        approvedDate,
        version: 1,
        effectiveDate: approvedDate
          ? `${approvedDate}T00:00:00.000Z`
          : effectiveDate,
      });
    },
  );
}

export const CCN_REFERENCE_COUNT = CCN_REFERENCE_TUPLES.length;
