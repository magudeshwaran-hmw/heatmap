// ─── Python — Beginner (F1) ───────────────────────────────────────────────────
export const PYTHON_BEGINNER = {
  mcq: [
    { id: "py_b_001", question: "What is the output of print(type([]))?", options: ["<class 'list'>", "<class 'array'>", "<class 'tuple'>", "list"], correct: "A", explanation: "[] creates a list object. type() returns the class of the object." },
    { id: "py_b_002", question: "Which method adds an element to the end of a list?", options: ["add()", "insert()", "append()", "push()"], correct: "C", explanation: "append() adds an element to the end. insert() adds at a specific position." },
    { id: "py_b_003", question: "What does len('hello') return?", options: ["4", "5", "6", "Error"], correct: "B", explanation: "len() counts characters. 'hello' has 5 characters." },
    { id: "py_b_004", question: "Which of these is a valid Python comment?", options: ["// This is a comment", "/* This is a comment */", "# This is a comment", "-- This is a comment"], correct: "C", explanation: "Python uses # for single line comments." },
    { id: "py_b_005", question: "What is the output of print(10 // 3)?", options: ["3.33", "3", "4", "3.0"], correct: "B", explanation: "// is floor division. Returns the integer part of the division." },
    { id: "py_b_006", question: "Which keyword is used to define a function in Python?", options: ["function", "func", "define", "def"], correct: "D", explanation: "def keyword defines a function in Python." },
    { id: "py_b_007", question: "What is the correct way to create an empty dictionary?", options: ["d = []", "d = ()", "d = {}", "d = <>"], correct: "C", explanation: "Curly braces {} create a dictionary. [] is list, () is tuple." },
    { id: "py_b_008", question: "What does range(0, 10, 2) produce?", options: ["[0,2,4,6,8,10]", "[0,2,4,6,8]", "[2,4,6,8,10]", "[0,1,2,3,4]"], correct: "B", explanation: "range(start, stop, step). Stop is exclusive. So 0,2,4,6,8 only." },
    { id: "py_b_009", question: "What is None in Python?", options: ["0", "False", "An empty string", "The absence of a value"], correct: "D", explanation: "None represents no value or null. It is its own type: NoneType." },
    { id: "py_b_010", question: "Which of these creates a tuple?", options: ["t = [1,2,3]", "t = {1,2,3}", "t = (1,2,3)", "t = <1,2,3>"], correct: "C", explanation: "Parentheses () create a tuple. Tuples are immutable." },
    { id: "py_b_011", question: "How do you check if a key exists in a dictionary?", options: ["key in dict", "dict.has(key)", "dict.contains(key)", "key.exists(dict)"], correct: "A", explanation: "The 'in' operator checks for key existence in a dictionary." },
    { id: "py_b_012", question: "What is the output of bool(0)?", options: ["True", "False", "0", "None"], correct: "B", explanation: "0 is falsy in Python. bool(0) returns False." },
    { id: "py_b_013", question: "Which method removes whitespace from both ends of a string?", options: ["trim()", "clean()", "strip()", "remove()"], correct: "C", explanation: "strip() removes leading and trailing whitespace." },
    { id: "py_b_014", question: "What does 'pass' do in Python?", options: ["Exits the function", "Skips to next iteration", "Does nothing — acts as a placeholder", "Returns None"], correct: "C", explanation: "pass is a null statement used as a placeholder where code is required syntactically." },
    { id: "py_b_015", question: "What is the output of 'hello'[1]?", options: ["h", "e", "l", "hello"], correct: "B", explanation: "String indexing starts at 0. Index 1 is 'e'." },
    { id: "py_b_016", question: "Which of these is NOT a Python data type?", options: ["int", "float", "char", "str"], correct: "C", explanation: "Python has no char type. Single characters are strings of length 1." },
    { id: "py_b_017", question: "What is a list comprehension?", options: ["A way to copy a list", "A concise way to create a list using a loop expression", "A method to sort a list", "A way to merge two lists"], correct: "B", explanation: "[x for x in range(10)] is a list comprehension. Concise and Pythonic." },
    { id: "py_b_018", question: "What does split() do on a string?", options: ["Reverses the string", "Splits string into a list of substrings", "Removes characters", "Joins two strings"], correct: "B", explanation: "'a,b,c'.split(',') returns ['a','b','c']." },
    { id: "py_b_019", question: "What is the difference between = and == in Python?", options: ["No difference", "= assigns value, == compares values", "== assigns value, = compares values", "Both compare values"], correct: "B", explanation: "= is assignment operator. == is equality comparison operator." },
    { id: "py_b_020", question: "How do you open a file for reading in Python?", options: ["open('file.txt', 'w')", "open('file.txt', 'a')", "open('file.txt', 'r')", "open('file.txt', 'x')"], correct: "C", explanation: "'r' mode opens for reading. 'w' writes, 'a' appends, 'x' creates new." },
  ],

  toolId: [
    {
      id: "py_b_ti_001",
      description: "You see this in terminal:\nTraceback (most recent call last):\n  File 'app.py', line 5, in <module>\n    print(name)\nNameError: name 'name' is not defined\n\nWhat does this error mean?",
      correctAnswer: "Variable 'name' was used before being defined",
      keywords: ["NameError", "not defined", "variable", "undefined", "declared"],
    },
    {
      id: "py_b_ti_002",
      description: "You run: pip install requests\nOutput shows:\nSuccessfully installed requests-2.31.0\n\nWhat happened and where is it installed?",
      correctAnswer: "The requests library was downloaded and installed into the current Python environment",
      keywords: ["installed", "library", "package", "environment", "pip"],
    },
    {
      id: "py_b_ti_003",
      description: "This code runs:\nnumbers = [3,1,4,1,5,9]\nnumbers.sort()\nprint(numbers)\n\nWhat is the output?",
      correctAnswer: "[1, 1, 3, 4, 5, 9]",
      keywords: ["sorted", "ascending", "order", "1", "3", "4", "5", "9"],
    },
    {
      id: "py_b_ti_004",
      description: "You see this output:\n{'name': 'Alice', 'age': 30}\n\nWhat Python data structure is this and how do you access 'Alice'?",
      correctAnswer: "Dictionary. Access with d['name'] or d.get('name')",
      keywords: ["dictionary", "dict", "key", "value", "access", "['name']"],
    },
    {
      id: "py_b_ti_005",
      description: "Terminal shows:\nIndentationError: expected an indented block after 'if' statement on line 3\n\nWhat caused this error?",
      correctAnswer: "The if statement body is not indented properly. Python requires consistent indentation.",
      keywords: ["indentation", "indent", "block", "spaces", "tabs", "whitespace"],
    },
  ],

  practical: [
    {
      id: "py_b_pr_001",
      task: "Write a Python function called 'reverse_string' that takes a string as input and returns it reversed.\nExample: reverse_string('hello') should return 'olleh'",
      expectedKeywords: ["def", "return", "reverse_string"],
      alternativeKeywords: ["[::-1]", "reversed", "join"],
      minLength: 30,
      sampleSolution: "def reverse_string(s):\n    return s[::-1]",
    },
    {
      id: "py_b_pr_002",
      task: "Write a Python function called 'count_even' that takes a list of numbers and returns how many are even.\nExample: count_even([1,2,3,4,5,6]) should return 3",
      expectedKeywords: ["def", "return", "count_even"],
      alternativeKeywords: ["% 2", "modulo", "filter", "even"],
      minLength: 40,
      sampleSolution: "def count_even(nums):\n    return len([x for x in nums if x % 2 == 0])",
    },
  ],
};

// ─── Python — Intermediate (E1/E2) ───────────────────────────────────────────
export const PYTHON_INTERMEDIATE = {
  mcq: [
    { id: "py_i_001", question: "What is the output of this code?\ndef func(x, lst=[]):\n    lst.append(x)\n    return lst\nprint(func(1))\nprint(func(2))", options: ["[1] then [2]", "[1] then [1,2]", "[1,2] then [1,2]", "Error"], correct: "B", explanation: "Mutable default arguments are shared across calls. The list persists between function calls." },
    { id: "py_i_002", question: "What does *args allow in a function?", options: ["Only keyword arguments", "Any number of positional arguments collected as a tuple", "Only two arguments", "Dictionary arguments"], correct: "B", explanation: "*args collects extra positional arguments as a tuple." },
    { id: "py_i_003", question: "What is the average time complexity of looking up a key in a dictionary?", options: ["O(n)", "O(log n)", "O(1)", "O(n²)"], correct: "C", explanation: "Dictionary uses hash table. Average O(1) lookup. Worst case O(n) with hash collisions." },
    { id: "py_i_004", question: "What is a generator in Python?", options: ["A function that returns a list", "A function that yields values lazily one at a time", "A class that generates objects", "A loop that generates numbers"], correct: "B", explanation: "Generators use yield. They produce values lazily, saving memory." },
    { id: "py_i_005", question: "What does the @property decorator do in a class?", options: ["Makes method private", "Allows method to be accessed like a read-only attribute", "Makes attribute static", "Converts method to constructor"], correct: "B", explanation: "@property turns a method into a read-only attribute access without calling it." },
    { id: "py_i_006", question: "What is the difference between deepcopy and shallow copy?", options: ["No difference", "Shallow copies reference nested objects; deepcopy recursively copies everything", "Deepcopy is faster", "Shallow copy works only on lists"], correct: "B", explanation: "copy.copy() is shallow — nested objects are still shared. copy.deepcopy() copies all nested objects recursively." },
    { id: "py_i_007", question: "What does the 'with' statement do in Python?", options: ["Creates a loop", "Manages context — ensures cleanup code always runs", "Imports a module", "Creates a class"], correct: "B", explanation: "with statement uses context managers. Ensures __exit__ runs even if an exception occurs." },
    { id: "py_i_008", question: "What is the GIL in CPython?", options: ["Global Import Library", "Global Interpreter Lock — prevents true thread parallelism for CPU-bound tasks", "General Interface Layer", "Garbage Interpreter Loop"], correct: "B", explanation: "GIL allows only one thread to execute Python bytecode at a time. Use multiprocessing for CPU-bound tasks." },
    { id: "py_i_009", question: "Which is fastest for membership testing (x in collection)?", options: ["list", "tuple", "set", "dict values"], correct: "C", explanation: "Set uses hash table. x in set is O(1). x in list is O(n)." },
    { id: "py_i_010", question: "What does __init__ do in a Python class?", options: ["Destroys the object", "Imports the class", "Initialises the object when it is created", "Makes the class static"], correct: "C", explanation: "__init__ is the constructor. Called automatically when an object is instantiated." },
    { id: "py_i_011", question: "What is the output of list(map(lambda x: x**2, [1,2,3]))?", options: ["[1,2,3]", "[1,4,9]", "[2,4,6]", "[1,8,27]"], correct: "B", explanation: "map applies lambda to each element. x**2 squares each: 1,4,9." },
    { id: "py_i_012", question: "What does try/except/finally guarantee?", options: ["finally only runs if no error", "finally always runs regardless of whether an exception occurred", "except always runs", "try block always succeeds"], correct: "B", explanation: "finally always executes. Used for cleanup like closing files or DB connections." },
    { id: "py_i_013", question: "What is duck typing in Python?", options: ["A data type for birds", "Type checking at compile time", "Object usability determined by its behaviour (methods), not its type", "Strict type enforcement"], correct: "C", explanation: "Duck typing means Python checks if an object has the required methods, not its actual type." },
    { id: "py_i_014", question: "What does collections.Counter do?", options: ["Counts lines in a file", "Counts occurrences of each element in a collection", "Creates a countdown timer", "Counts function calls"], correct: "B", explanation: "Counter({'a':3,'b':2}) counts how many times each element appears." },
    { id: "py_i_015", question: "What is the difference between __str__ and __repr__ in a class?", options: ["They are identical", "__str__ is human-readable for print(); __repr__ is for debugging and should be unambiguous", "__repr__ is human readable", "__str__ is only for numbers"], correct: "B", explanation: "__str__ is called by print(). __repr__ is called in REPL and for debugging. __repr__ should be unambiguous." },
  ],

  coding: [
    {
      id: "py_i_c_001",
      title: "Two Sum",
      difficulty: "Easy",
      description: "Given an array of integers nums and an integer target, return indices of the two numbers that add up to target. Assume exactly one solution exists. You may not use the same element twice.",
      examples: [
        { input: "nums = [2,7,11,15], target = 9", output: "[0, 1]", explanation: "nums[0]+nums[1] = 2+7 = 9" },
        { input: "nums = [3,2,4], target = 6", output: "[1, 2]" },
      ],
      testCases: [
        { input: "[2,7,11,15]\n9", expectedOutput: "[0, 1]", hidden: false },
        { input: "[3,2,4]\n6", expectedOutput: "[1, 2]", hidden: false },
        { input: "[3,3]\n6", expectedOutput: "[0, 1]", hidden: true },
        { input: "[1,2,3,4,5]\n9", expectedOutput: "[3, 4]", hidden: true },
      ],
      starterCode: {
        python: "def twoSum(nums, target):\n    # Write your solution here\n    pass\n\nimport sys\nnums = eval(input())\ntarget = int(input())\nprint(twoSum(nums, target))",
        java: "import java.util.*;\npublic class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Write solution\n        return new int[]{};\n    }\n}",
        javascript: "function twoSum(nums, target) {\n    // Write solution\n}\nconst lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');\nconsole.log(JSON.stringify(twoSum(JSON.parse(lines[0]), parseInt(lines[1]))));",
      },
      timeLimit: 2000,
      memoryLimit: 256,
    },
    {
      id: "py_i_c_002",
      title: "Valid Parentheses",
      difficulty: "Easy",
      description: "Given a string containing only '(', ')', '{', '}', '[' and ']', determine if the input string is valid. Open brackets must be closed by the same type and in the correct order.",
      examples: [
        { input: "s = '()'", output: "True" },
        { input: "s = '()[]{}'", output: "True" },
        { input: "s = '(]'", output: "False" },
      ],
      testCases: [
        { input: "()", expectedOutput: "True", hidden: false },
        { input: "()[]{}", expectedOutput: "True", hidden: false },
        { input: "(]", expectedOutput: "False", hidden: true },
        { input: "([)]", expectedOutput: "False", hidden: true },
        { input: "{[]}", expectedOutput: "True", hidden: true },
      ],
      starterCode: {
        python: "def isValid(s):\n    # Write your solution\n    pass\n\ns = input()\nprint(isValid(s))",
      },
      timeLimit: 1000,
      memoryLimit: 128,
    },
  ],

  scenarios: [
    {
      id: "py_i_s_001",
      question: "Your Python Flask API is returning 500 errors intermittently in production. The errors happen roughly every 2 hours and the service recovers on its own. You cannot reproduce it locally. Walk through your complete debugging approach — what tools, what logs, what hypotheses and how you would fix it.",
      minWords: 80,
      scoringKeywords: ["logging", "debug", "traceback", "memory", "leak", "profiler", "monitor", "APM", "Sentry", "timeout", "connection pool", "hypothesis", "reproduce", "logs", "stack trace"],
    },
    {
      id: "py_i_s_002",
      question: "You need to process a CSV file with 5 million rows daily. The current script reads the whole file into memory and crashes. Describe your complete approach to fix this — include the Python techniques, libraries and code structure you would use.",
      minWords: 80,
      scoringKeywords: ["chunk", "generator", "yield", "pandas", "chunksize", "stream", "memory", "batch", "iterator", "lazy", "csv", "readline", "buffer", "efficient"],
    },
  ],

  framework: [
    {
      id: "py_i_f_001",
      question: "Design a Python test automation framework for a REST API that handles 50 endpoints. Include: folder structure, libraries you would use, how you handle test data, authentication, reporting and CI/CD integration. Be specific about your design decisions and why.",
      minWords: 120,
      scoringKeywords: ["pytest", "requests", "fixture", "conftest", "structure", "auth", "token", "report", "allure", "CI", "jenkins", "github actions", "test data", "factory", "mock", "folder", "module", "config"],
    },
  ],
};

// ─── Python — Expert (D/C) ───────────────────────────────────────────────────
export const PYTHON_EXPERT = {
  scenarios: [
    {
      id: "py_e_s_001",
      question: "Your Python microservice handles 50,000 requests per second but memory usage grows by 500MB every 6 hours until the pod crashes. The service uses Redis for caching and PostgreSQL for storage. Describe your complete diagnosis and resolution strategy — include specific tools, the profiling approach, likely causes you would investigate and how you would fix without taking downtime.",
      minWords: 150,
      scoringKeywords: ["memory leak", "profiler", "tracemalloc", "objgraph", "gc", "garbage collector", "reference", "circular", "Redis", "connection pool", "Kubernetes", "pod", "rolling restart", "canary", "monitor", "prometheus", "grafana", "heap dump", "weak reference"],
    },
    {
      id: "py_e_s_002",
      question: "You are designing a Python data pipeline that must process 10 million events per day from Kafka, enrich each event with data from a PostgreSQL database, and write results to Elasticsearch. End-to-end latency must be under 500ms. Design the complete architecture including concurrency model, error handling, monitoring and scaling strategy.",
      minWords: 150,
      scoringKeywords: ["kafka", "consumer", "async", "asyncio", "thread", "process", "worker", "batch", "backpressure", "dead letter queue", "retry", "idempotent", "elasticsearch", "bulk insert", "connection pool", "circuit breaker", "monitoring", "latency", "throughput", "horizontal scaling"],
    },
    {
      id: "py_e_s_003",
      question: "Your team has a Python monolith of 200,000 lines that takes 45 minutes to run its full test suite. New feature development has slowed because tests are too slow and developers skip them. Design a complete strategy to reduce test time to under 5 minutes without losing coverage.",
      minWords: 150,
      scoringKeywords: ["parallel", "pytest-xdist", "worker", "fixture", "scope", "mock", "stub", "coverage", "critical path", "unit", "integration", "smoke", "database", "transaction", "rollback", "cache", "layer", "isolate", "matrix"],
    },
    {
      id: "py_e_s_004",
      question: "You are the lead Python engineer onboarding a team of 5 junior developers. The codebase has no tests, no type hints, inconsistent style and no CI/CD. Design a complete plan to bring this team and codebase to production quality within 3 months. Include technical and team process decisions.",
      minWords: 150,
      scoringKeywords: ["mypy", "typing", "black", "flake8", "pylint", "ruff", "pre-commit", "hook", "CI", "github actions", "pytest", "coverage", "code review", "PR", "mentoring", "pair programming", "documentation", "standards", "gradual", "refactor", "sprint", "milestone"],
    },
    {
      id: "py_e_s_005",
      question: "Design a Python-based AI test automation system that uses LLMs to automatically generate test cases from user stories, execute them against a REST API and report coverage gaps. Include the architecture, prompt engineering approach, test validation strategy and how you would measure quality of generated tests.",
      minWords: 150,
      scoringKeywords: ["LLM", "GPT", "prompt", "langchain", "generation", "validation", "coverage", "AST", "parse", "schema", "OpenAPI", "swagger", "assert", "hallucination", "verify", "feedback", "loop", "RAG", "embedding", "vector", "quality", "metric", "precision"],
    },
  ],

  capstone: {
    instruction: "Submit a GitHub repository that demonstrates your Python expertise. This should be a real project you built or significantly contributed to.",
    fields: [
      { name: "githubUrl", label: "GitHub Repository URL", placeholder: "https://github.com/username/repository", required: true },
      { name: "projectDescription", label: "Project Description", placeholder: "Describe what this project does, the problem it solves and its scale/impact", required: true, minWords: 50 },
      { name: "yourRole", label: "Your Role", placeholder: "Describe your specific contributions to this project", required: true, minWords: 30 },
      { name: "keyContributions", label: "Key Technical Contributions", placeholder: "List 3-5 specific technical decisions you made and why", required: true, minWords: 50 },
    ],
    githubEvalCriteria: {
      languageMatch: ["Python"],
      testFilePatterns: ["test_*.py", "*_test.py", "conftest.py", "pytest.ini", "setup.cfg", "tox.ini"],
      ciPatterns: [".github/workflows", "Jenkinsfile", ".travis.yml", "tox.ini", "Makefile"],
    },
  },

  mentoring: [
    {
      id: "py_e_m_001",
      question: "Describe a specific situation where you mentored a junior Python developer who was struggling with a complex concept (async programming, OOP design, or performance). What was your approach, what did you do differently when standard explanations failed, and what was the measurable outcome?",
      minWords: 100,
      scoringKeywords: ["mentor", "junior", "explain", "example", "pair", "code review", "feedback", "improve", "outcome", "growth", "patient", "approach", "understand", "result"],
    },
    {
      id: "py_e_m_002",
      question: "A team member consistently writes Python code that works but is unmaintainable — no type hints, no tests, deeply nested logic, magic numbers everywhere. Code reviews are not working. How do you handle this situation technically and interpersonally?",
      minWords: 100,
      scoringKeywords: ["standard", "guide", "style", "mypy", "pytest", "refactor", "example", "demonstrate", "pair", "goal", "metric", "1:1", "feedback", "constructive", "automation", "linter", "pre-commit", "enforce"],
    },
    {
      id: "py_e_m_003",
      question: "You are asked to design a 3-month Python upskilling program for QA engineers who know no Python. By month 3 they must be able to write Selenium automation scripts and API test frameworks independently. Design the curriculum, milestones and how you would measure success.",
      minWords: 100,
      scoringKeywords: ["curriculum", "week", "milestone", "basics", "syntax", "oop", "selenium", "requests", "pytest", "project", "assessment", "review", "hands-on", "practice", "mentor", "checkpoint", "measure", "deliverable"],
    },
  ],

  questionnaire: [
    { id: "py_e_q_001", question: "What Python automation frameworks or tools have you built from scratch? Describe the architecture and key design decisions.", minWords: 60, scoringKeywords: ["built", "framework", "architecture", "design", "decision", "pattern", "plugin", "extensible", "module", "package", "pytest", "selenium"] },
    { id: "py_e_q_002", question: "How do you handle Python dependency management and environment isolation across a large team with multiple services?", minWords: 60, scoringKeywords: ["pip", "virtualenv", "poetry", "pipenv", "conda", "docker", "requirements", "lock", "version", "conflict", "isolation", "reproducible", "pyproject.toml"] },
    { id: "py_e_q_003", question: "Describe your approach to Python performance optimisation. Give a real example where you improved performance significantly.", minWords: 60, scoringKeywords: ["profile", "cProfile", "timeit", "bottleneck", "algorithm", "complexity", "cache", "lru_cache", "numpy", "vectorize", "async", "thread", "process", "measure", "before", "after"] },
    { id: "py_e_q_004", question: "How do you ensure code quality in a Python project with 10+ contributors? What tools and processes do you enforce?", minWords: 60, scoringKeywords: ["mypy", "black", "ruff", "flake8", "pylint", "pre-commit", "CI", "github actions", "review", "coverage", "pytest", "gate", "branch", "merge", "standard"] },
    { id: "py_e_q_005", question: "What is your experience with Python async programming? When would you use asyncio vs threading vs multiprocessing?", minWords: 60, scoringKeywords: ["asyncio", "await", "async", "event loop", "coroutine", "thread", "GIL", "multiprocessing", "CPU bound", "IO bound", "concurrent", "parallel", "blocking", "non-blocking"] },
    { id: "py_e_q_006", question: "How do you approach testing in Python at scale? Describe your testing strategy for a service with 500+ endpoints.", minWords: 60, scoringKeywords: ["pytest", "unit", "integration", "e2e", "contract", "mock", "fixture", "factory", "coverage", "parallel", "xdist", "smoke", "regression", "boundary", "property-based", "hypothesis"] },
  ],
};
