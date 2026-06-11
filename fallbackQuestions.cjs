// Local fallback question bank used by /api/zenassess question generation when the
// AI-based generator (Ollama) is unavailable or returns an unusable response.
//
// getQuestions(skill, band) normalizes an arbitrary skill name to one of the known
// domains below and returns a bundle of MCQs, practical tasks, scenario questions,
// and expert-band content (capstone + mentoring) for that domain.

const DIFFICULTY_BY_BAND = { beginner: 'BASIC', intermediate: 'HARD', expert: 'EXPERT' };

function normalizeSkillKey(skill) {
  if (!skill) return 'Functional Testing';
  const lower = String(skill).toLowerCase();
  if (lower.includes('python') || lower.includes('django') || lower.includes('flask') || lower.includes('fastapi')) return 'Python';
  if (lower.includes('devops') || lower.includes('jenkins') || lower.includes('cicd') || lower.includes('ci/cd') || lower.includes('docker') || lower.includes('kubernetes') || lower.includes('terraform')) return 'DevOps';
  if (lower.includes('performance') || lower.includes('jmeter') || lower.includes('k6') || lower.includes('loadrunner') || lower.includes('load test')) return 'Performance Testing';
  if (lower.includes('automation') || lower.includes('selenium') || lower.includes('playwright') || lower.includes('cypress') || lower.includes('appium')) return 'Automation Testing';
  if (lower.includes('cloud') || lower.includes('aws') || lower.includes('azure') || lower.includes('gcp')) return 'Cloud';
  if (lower.includes('security') || lower.includes('cybersecurity') || lower.includes('penetration') || lower.includes('pentest')) return 'Cybersecurity';
  if (lower.includes('data engineering') || lower.includes('spark') || lower.includes('kafka') || lower.includes('etl') || lower.includes('database')) return 'Data Engineering';
  if (lower.includes('machine learning') || lower.includes('generative ai') || lower.includes('artificial intelligence') || lower.includes('ai/ml') || lower.includes('nlp') || lower.includes('vision') || lower.includes('analytics') || lower.includes('tableau') || lower.includes('power bi')) return 'AI/ML';
  return 'Functional Testing';
}

function buildMcqs(skill, band, items) {
  const difficulty = DIFFICULTY_BY_BAND[band] || 'BASIC';
  return items.map((item, idx) => ({
    id: `fb_${skill.replace(/[^a-zA-Z0-9]/g, '_')}_${band}_${idx + 1}`,
    question: item[0],
    options: item[1],
    correct: item[2],
    difficulty,
    skill,
    time: 60,
    points: 1
  }));
}

const BANKS = {
  'Functional Testing': {
    mcqs: [
      ['What is the main objective of functional testing?',
        ['Verify the application behaves according to functional requirements', 'Measure how fast the application responds under load', 'Ensure the source code follows style guidelines', 'Validate the database schema design'], 1],
      ['Which technique reduces the number of test cases by grouping inputs into classes that should behave similarly?',
        ['Equivalence Partitioning', 'Pairwise Testing', 'Mutation Testing', 'Fuzz Testing'], 1],
      ['In a defect lifecycle, what status indicates a tester has confirmed the fix resolves the issue?',
        ['Closed', 'New', 'Reopened', 'Deferred'], 1],
      ['Which test level focuses on verifying that individually tested modules work together correctly?',
        ['Integration Testing', 'Unit Testing', 'Acceptance Testing', 'Smoke Testing'], 1],
      ['What does a requirements traceability matrix primarily help ensure?',
        ['Every requirement has corresponding test coverage', 'The application loads within an acceptable time', 'The UI matches the brand style guide', 'The code passes static analysis'], 1],
      ['Which type of testing is performed to confirm a build is stable enough for further testing?',
        ['Smoke Testing', 'Regression Testing', 'Stress Testing', 'Penetration Testing'], 1],
      ['What is the purpose of a test plan document?',
        ['To define scope, approach, resources, and schedule of testing activities', 'To list every line of code that needs refactoring', 'To document production deployment steps', 'To track attendance during a sprint'], 1],
      ['Which of the following best describes regression testing?',
        ['Re-running existing tests to ensure recent changes haven\'t broken existing functionality', 'Testing a system\'s behavior under extreme load', 'Testing how quickly a feature can be developed', 'Testing the visual layout across browsers'], 1],
    ],
    practicalTasks: [
      { id: 'ft_p1', name: 'Test Case Design for Login Module', title: 'Test Case Design for Login Module', description: 'Design a complete set of positive and negative test cases for a login feature that supports email/password and OTP-based authentication, covering validation, lockout, and session handling.', deliverable: 'A structured test case document with preconditions, steps, expected results, and priority for each case.', criteria: 'Coverage of boundary conditions, negative scenarios, security checks, and traceability to requirements.' },
      { id: 'ft_p2', name: 'Defect Report Writing', title: 'Defect Report Writing', description: 'Given a scenario where a checkout page fails to apply a discount coupon under specific conditions, write a clear, reproducible defect report.', deliverable: 'A defect report including steps to reproduce, expected vs actual results, severity, priority, and environment details.', criteria: 'Clarity, reproducibility, correct severity/priority classification, and completeness of supporting information.' },
    ],
    scenarioQuestions: [
      { skill: 'Functional Testing', scenario: 'A new release introduces a redesigned checkout flow. Regression tests for the old flow are now failing intermittently in the CI pipeline.', question: 'How would you investigate whether these failures indicate real defects or test issues caused by the redesign, and how would you prioritize your response?', followUps: ['What evidence would convince you it is a flaky test versus a genuine regression?', 'How would you communicate this risk to release stakeholders?'] },
      { skill: 'Functional Testing', scenario: 'During UAT, business users report that a feature works "sometimes" but cannot consistently reproduce the issue.', question: 'Describe your approach to isolating and documenting an intermittent defect that the reporting user cannot reliably reproduce.', followUps: ['What data would you collect to identify a pattern?', 'How would you decide whether to block the release on this issue?'] },
    ],
    expertCapstone: { question: 'Design an end-to-end functional test strategy for a banking application migrating from a monolithic core to microservices, covering risk-based prioritization, environment strategy, data management, and exit criteria.' },
    expertMentoring: [
      { question: 'A junior tester on your team keeps writing test cases that only cover the happy path. How would you coach them to think about negative and edge-case scenarios?' },
      { question: 'One of your testers disagrees with a severity classification you assigned to a defect, and the disagreement keeps recurring. How would you resolve this and align the team going forward?' },
    ],
  },

  'Automation Testing': {
    mcqs: [
      ['Which design pattern is most commonly used to separate UI locators from test logic in automation frameworks?',
        ['Page Object Model', 'Singleton Pattern', 'Observer Pattern', 'Factory Pattern'], 1],
      ['What is the main advantage of explicit waits over implicit waits in tools like Selenium?',
        ['They wait for a specific condition on a specific element, reducing flaky failures', 'They make the test run faster regardless of page state', 'They eliminate the need for locators', 'They automatically retry failed assertions'], 1],
      ['What is the primary purpose of running automated smoke tests after a deployment?',
        ['To quickly verify critical functionality before running the full suite', 'To measure code coverage percentage', 'To generate documentation automatically', 'To replace manual exploratory testing entirely'], 1],
      ['Which locator strategy is generally most resilient to UI changes?',
        ['Unique data-* attributes or test IDs', 'Absolute XPath based on DOM position', 'CSS class names tied to styling', 'Element index in a list'], 1],
      ['What does "test flakiness" refer to?',
        ['A test that produces inconsistent pass/fail results without code changes', 'A test that always fails on the first run', 'A test that takes too long to execute', 'A test that cannot be version-controlled'], 1],
      ['What is a key benefit of behavior-driven development (BDD) frameworks like Cucumber?',
        ['They let specifications be written in human-readable language shared with stakeholders', 'They automatically generate performance test data', 'They eliminate the need for a test environment', 'They replace the need for version control'], 1],
      ['When should you typically NOT automate a test case?',
        ['When the test runs only once and the feature changes frequently', 'When the test must run on every build', 'When the test covers a critical business workflow', 'When the test needs to run across multiple browsers'], 1],
      ['What is the purpose of a CI pipeline "test stage" gate?',
        ['To prevent code that fails automated tests from being promoted further', 'To compile the application for production', 'To assign tickets to the QA team', 'To generate release notes automatically'], 1],
    ],
    practicalTasks: [
      { id: 'at_p1', name: 'Automation Framework Design', title: 'Automation Framework Design', description: 'Outline the architecture of a Selenium/Playwright-based automation framework for a web application, including folder structure, page object layer, reporting, and CI integration.', deliverable: 'A framework design document or diagram showing layers, libraries, and execution flow.', criteria: 'Maintainability, reusability, reporting strategy, and CI/CD integration approach.' },
      { id: 'at_p2', name: 'Flaky Test Investigation', title: 'Flaky Test Investigation', description: 'Given a test suite where 10% of tests fail intermittently in CI but pass locally, outline your investigation and stabilization plan.', deliverable: 'A written plan covering root-cause hypotheses, diagnostic steps, and stabilization techniques.', criteria: 'Systematic diagnosis, awareness of common flakiness causes (timing, environment, data), and practical fixes.' },
    ],
    scenarioQuestions: [
      { skill: 'Automation Testing', scenario: 'Your regression suite takes six hours to run, slowing down the release cadence the team wants to adopt.', question: 'How would you reduce execution time while maintaining confidence in release quality?', followUps: ['How would you decide what to parallelize versus what to remove?', 'How would you measure whether your changes preserved adequate coverage?'] },
      { skill: 'Automation Testing', scenario: 'A newly automated suite passes locally for every engineer but consistently fails in the CI environment.', question: 'Walk through how you would diagnose the difference between local and CI environments to resolve these failures.', followUps: ['What environment factors commonly cause this kind of discrepancy?', 'How would you prevent this from recurring on future projects?'] },
    ],
    expertCapstone: { question: 'Design a complete test automation strategy for a multi-platform product (web, mobile, API) including tool selection, framework architecture, CI/CD integration, reporting, and maintenance ownership.' },
    expertMentoring: [
      { question: 'A team member keeps writing automation scripts with hard-coded waits that make the suite slow and flaky. How would you coach them toward better practices?' },
      { question: 'Your team is split on whether to invest more in UI automation or shift effort toward API-level automation. How would you guide the discussion to a decision?' },
    ],
  },

  'Performance Testing': {
    mcqs: [
      ['What is the primary purpose of load testing?',
        ['To determine how a system behaves under expected concurrent user volumes', 'To find security vulnerabilities in the application', 'To check whether the UI is accessible to screen readers', 'To validate that business requirements are correctly implemented'], 1],
      ['In JMeter, which component simulates a group of virtual users executing the same test plan?',
        ['Thread Group', 'Listener', 'Assertion', 'Config Element'], 1],
      ['What does "throughput" typically measure in a performance test report?',
        ['The number of requests processed per unit of time', 'The total memory consumed by the application', 'The number of test cases automated', 'The percentage of code covered by tests'], 1],
      ['What is the difference between load testing and stress testing?',
        ['Load testing checks behavior at expected volumes; stress testing pushes the system beyond its limits to find the breaking point', 'Load testing checks UI responsiveness; stress testing checks database design', 'Load testing is manual; stress testing is always automated', 'There is no meaningful difference between the two'], 1],
      ['Which metric indicates the time taken for the first byte of a response to reach the client?',
        ['Time to First Byte (TTFB)', 'Throughput', 'Error rate', 'Concurrency'], 1],
      ['What is a "soak test" (endurance test) designed to detect?',
        ['Memory leaks and degradation that appear only under sustained load over long periods', 'Whether the UI renders correctly on mobile devices', 'Whether unit tests pass after a refactor', 'Whether API documentation is accurate'], 1],
      ['If response times degrade only under high concurrency, which layer should typically be investigated first?',
        ['Database connections and query performance', 'Front-end CSS styling', 'Unit test coverage', 'Code comments and documentation'], 1],
      ['What does a percentile such as the 95th percentile response time reveal that an average cannot?',
        ['The response time experienced by the slowest 5% of requests, revealing tail latency hidden by averages', 'The fastest possible response time achievable', 'The total number of requests sent during the test', 'The number of servers used in the test environment'], 1],
    ],
    practicalTasks: [
      { id: 'pt_p1', name: 'Performance Test Plan for an E-commerce Checkout', title: 'Performance Test Plan for an E-commerce Checkout', description: 'Create a performance test plan for a checkout API expected to handle 5,000 concurrent users during a flash sale, including workload model, ramp-up strategy, and key metrics to monitor.', deliverable: 'A test plan document covering scenarios, load profile, tools, environment, and pass/fail (SLA) criteria.', criteria: 'Realistic workload modeling, clear SLAs, monitoring strategy, and risk identification.' },
      { id: 'pt_p2', name: 'Bottleneck Analysis from Test Results', title: 'Bottleneck Analysis from Test Results', description: 'Given a load test report showing response times degrading sharply above 2,000 concurrent users while CPU stays under 50%, outline how you would diagnose the root cause.', deliverable: 'A written analysis listing hypotheses, the diagnostic data you would gather, and the tools you would use.', criteria: 'Systematic elimination of causes (DB, network, thread pools, external dependencies) and use of relevant metrics.' },
    ],
    scenarioQuestions: [
      { skill: 'Performance Testing', scenario: 'A production system passes all performance tests in staging but experiences severe slowdowns during a real high-traffic event.', question: 'How would you investigate the gap between staging results and production behavior, and what would you change in your testing approach going forward?', followUps: ['What environmental differences commonly cause this gap?', 'How would you build more representative test conditions next time?'] },
      { skill: 'Performance Testing', scenario: 'Stakeholders want to cut the performance testing cycle from two weeks to three days ahead of a major release.', question: 'How would you redesign the performance testing approach to fit the shortened timeline while still managing risk responsibly?', followUps: ['What would you prioritize, and what would you defer or de-scope?', 'How would you communicate the residual risk to stakeholders?'] },
    ],
    expertCapstone: { question: 'Design a complete performance engineering strategy for a high-traffic banking platform migrating to microservices, covering test types, environment strategy, tooling, monitoring/observability integration, and SLA definition.' },
    expertMentoring: [
      { question: 'A team member consistently runs performance tests against an under-provisioned environment and draws conclusions that don\'t hold in production. How would you coach them to design more representative tests?' },
      { question: 'Your team disagrees on what response-time SLA to set for a new service with no historical baseline. How would you guide them to a defensible decision?' },
    ],
  },

  'Python': {
    mcqs: [
      ["What does `type([])` return in Python?",
        ["<class 'list'>", "<class 'tuple'>", "<class 'dict'>", "<class 'set'>"], 1],
      ['Which keyword is used to define a generator function in Python?',
        ['yield', 'return', 'async', 'lambda'], 1],
      ['What does `len({1, 2, 2, 3})` evaluate to?',
        ['3', '4', '2', 'Error'], 1],
      ["What is the purpose of Python's `with` statement when working with files?",
        ["To ensure resources like file handles are properly closed even if an exception occurs", "To declare a variable as global", "To define a class method", "To start a new thread"], 1],
      ['Which of these correctly describes a Python decorator?',
        ['A function that takes another function and extends its behavior without modifying it directly', 'A way to declare static class variables', 'A built-in data structure for key-value pairs', 'A keyword used to import external modules'], 1],
      ['What does `*args` allow a function to accept?',
        ['A variable number of positional arguments', 'Only keyword arguments', 'Exactly one argument', 'A fixed number of arguments defined at compile time'], 1],
      ['What is the output of `[x**2 for x in range(3)]`?',
        ['[0, 1, 4]', '[1, 4, 9]', '[0, 1, 2]', '[0, 2, 4]'], 1],
      ['Which library is most commonly used for data manipulation and analysis with DataFrames in Python?',
        ['pandas', 'requests', 'matplotlib', 'flask'], 1],
    ],
    practicalTasks: [
      { id: 'py_p1', name: 'Refactor a Data Processing Script', title: 'Refactor a Data Processing Script', description: 'Given a script that reads a large CSV, filters rows, and writes results, refactor it to be more memory-efficient and testable (e.g., using generators and functions).', deliverable: 'Refactored code (or pseudocode/outline) with explanation of the changes and trade-offs.', criteria: 'Improved readability, memory efficiency, separation of concerns, and testability.' },
      { id: 'py_p2', name: 'Design a REST API Endpoint', title: 'Design a REST API Endpoint', description: 'Design a Flask or FastAPI endpoint that accepts a paginated list request, validates query parameters, and returns a structured JSON response with proper error handling.', deliverable: 'An outline or code sketch of the endpoint, including validation, pagination logic, and error responses.', criteria: 'Correct use of HTTP semantics, input validation, clear error handling, and pagination design.' },
    ],
    scenarioQuestions: [
      { skill: 'Python', scenario: 'A scheduled Python batch job that processes millions of records started timing out after the input data volume tripled.', question: 'How would you approach diagnosing and resolving the performance issue without a complete rewrite?', followUps: ['What profiling techniques would you use to find the bottleneck?', 'How would you validate that your fix doesn\'t change the output correctness?'] },
      { skill: 'Python', scenario: "Your team's codebase mixes synchronous and asynchronous code in ways that cause intermittent deadlocks.", question: 'How would you assess and address the architectural issues causing these deadlocks?', followUps: ['What patterns would you introduce to prevent this going forward?', 'How would you roll out the change safely across a live system?'] },
    ],
    expertCapstone: { question: 'Design the architecture for a Python-based data pipeline service that ingests data from multiple sources, transforms it, and exposes results via an API — covering scalability, error handling, testing strategy, and deployment.' },
    expertMentoring: [
      { question: 'A junior developer keeps writing deeply nested conditional logic that is hard to test and review. How would you help them learn to write cleaner, more modular code?' },
      { question: 'Two engineers on your team disagree about whether to adopt type hints across the codebase. How would you facilitate a resolution?' },
    ],
  },

  'DevOps': {
    mcqs: [
      ['What is the primary goal of a CI/CD pipeline?',
        ['To automate building, testing, and deploying code changes reliably and frequently', 'To replace the need for code reviews', 'To monitor production servers for hardware failures', 'To manage employee onboarding workflows'], 1],
      ['What does "Infrastructure as Code" (IaC) enable teams to do?',
        ['Define and provision infrastructure through versioned, repeatable configuration files', 'Write application code faster using AI assistance', 'Automatically fix security vulnerabilities in dependencies', 'Replace the need for testing environments'], 1],
      ['In Docker, what is the difference between an image and a container?',
        ['An image is a read-only template; a container is a running instance of that image', 'An image runs processes; a container only stores files', 'A container can only run on Linux; an image can run anywhere', 'There is no meaningful difference'], 1],
      ['What is the purpose of a Kubernetes "liveness probe"?',
        ['To determine whether a container is running properly and restart it if it isn\'t', 'To measure the CPU usage of a pod', 'To assign external IP addresses to services', 'To schedule batch jobs at specific times'], 1],
      ['Which practice helps reduce the risk of deploying a faulty change to all users at once?',
        ['Canary or blue-green deployments', 'Disabling all monitoring during deployment', 'Deploying directly to production without staging', 'Skipping automated tests to deploy faster'], 1],
      ['What is the main purpose of a configuration management tool like Ansible or Terraform?',
        ['To consistently provision and configure infrastructure and reduce manual drift', 'To write and run unit tests', 'To design user interfaces', 'To manage source code branching strategies'], 1],
      ['What does "observability" in a production system primarily refer to?',
        ["The ability to understand a system's internal state from its external outputs (logs, metrics, traces)", 'The visual design of a monitoring dashboard', 'The number of servers in a cluster', 'The frequency of code deployments'], 1],
      ['Why are immutable infrastructure practices (replacing servers instead of patching them) valued in DevOps?',
        ['They reduce configuration drift and make deployments more predictable and reproducible', 'They eliminate the need for monitoring', 'They make rollback impossible, forcing careful releases', 'They reduce the cost of cloud compute to zero'], 1],
    ],
    practicalTasks: [
      { id: 'do_p1', name: 'Design a CI/CD Pipeline', title: 'Design a CI/CD Pipeline', description: 'Design a CI/CD pipeline for a microservices application that includes build, automated testing, security scanning, and progressive deployment stages.', deliverable: 'A pipeline diagram or stage-by-stage outline with the tools and gates at each step.', criteria: 'Coverage of build, test, security, and deployment stages; rollback strategy; and appropriate use of gates.' },
      { id: 'do_p2', name: 'Incident Postmortem Outline', title: 'Incident Postmortem Outline', description: 'Given a scenario where a deployment caused a 30-minute production outage, outline the structure of a blameless postmortem document.', deliverable: 'An outline covering timeline, root cause, impact, contributing factors, and follow-up action items.', criteria: 'Blameless tone, focus on systemic causes, clear and actionable follow-ups.' },
    ],
    scenarioQuestions: [
      { skill: 'DevOps', scenario: "Deployments that used to take 10 minutes now take over an hour, and the team isn't sure why.", question: 'How would you investigate the cause of the slowdown and what changes would you propose to restore fast, reliable deployments?', followUps: ['What metrics would you look at first?', 'How would you prevent this kind of regression from going unnoticed in the future?'] },
      { skill: 'DevOps', scenario: 'A critical production secret (API key) was accidentally committed to a public repository.', question: 'Walk through the steps you would take immediately and the longer-term changes you would recommend to prevent recurrence.', followUps: ['Who would you need to involve and in what order?', 'What controls would you put in place to catch this earlier next time?'] },
    ],
    expertCapstone: { question: 'Design a complete DevOps transformation plan for an organization moving from quarterly manual releases to continuous delivery — covering tooling, pipeline design, culture change, and risk management.' },
    expertMentoring: [
      { question: 'A team member resists adopting infrastructure-as-code because they are comfortable with manual server configuration. How would you help them transition?' },
      { question: 'Your team is facing alert fatigue from a noisy monitoring setup, and engineers have started ignoring pages. How would you address this with the team?' },
    ],
  },

  'Cloud': {
    mcqs: [
      ['What is the main difference between IaaS, PaaS, and SaaS?',
        ['They represent increasing levels of abstraction — from raw infrastructure to fully managed software', 'They are different pricing tiers of the same service', 'They refer to different programming languages supported by cloud providers', 'They are regional naming conventions for data centers'], 1],
      ['What is the purpose of an auto-scaling group in cloud infrastructure?',
        ['To automatically adjust the number of running instances based on demand', 'To encrypt data at rest', 'To manage user authentication', 'To define network routing rules'], 1],
      ['What does a Virtual Private Cloud (VPC) provide?',
        ['An isolated network environment within a public cloud where you control IP ranges, subnets, and routing', 'A way to run code without provisioning servers', 'A managed relational database service', 'A content delivery network for static assets'], 1],
      ['Which cloud concept describes paying only for the compute resources you actually consume?',
        ['Pay-as-you-go (consumption-based) pricing', 'Fixed annual licensing', 'Perpetual licensing', 'Flat-rate hosting'], 1],
      ['What is the primary benefit of using managed services (e.g., managed databases) over self-hosted equivalents?',
        ['The cloud provider handles operational tasks like patching, backups, and scaling', 'They are always cheaper regardless of scale', 'They eliminate the need for monitoring', 'They guarantee zero downtime'], 1],
      ['What does "multi-region deployment" primarily help achieve?',
        ['Improved availability and lower latency for geographically distributed users', 'Lower compute costs in all cases', 'Simplified compliance with all regulations automatically', 'Elimination of the need for backups'], 1],
      ["In a shared responsibility model, what is typically the cloud customer's responsibility?",
        ['Securing their data, identity/access management, and application configuration', 'Securing the physical data center', 'Maintaining the hypervisor', 'Patching the underlying network hardware'], 1],
      ['What is a common reason to use a Content Delivery Network (CDN)?',
        ['To cache and serve content from locations closer to end users, reducing latency', 'To run database migrations', 'To manage user permissions', 'To compile application source code'], 1],
    ],
    practicalTasks: [
      { id: 'cl_p1', name: 'Design a Scalable Web Architecture', title: 'Design a Scalable Web Architecture', description: 'Design a cloud architecture for a web application expected to scale from 1,000 to 1,000,000 users, covering compute, storage, networking, and cost considerations.', deliverable: 'An architecture diagram or written outline describing components, scaling strategy, and trade-offs.', criteria: 'Sound scalability approach, appropriate service choices, cost-awareness, and resilience considerations.' },
      { id: 'cl_p2', name: 'Cost Optimization Review', title: 'Cost Optimization Review', description: 'Given a cloud bill that has grown 40% in a quarter without a corresponding increase in usage, outline how you would investigate and reduce costs.', deliverable: 'A written plan covering analysis steps, likely cost drivers, and recommended optimizations.', criteria: 'Systematic cost analysis, awareness of common waste sources, and balance between cost and reliability.' },
    ],
    scenarioQuestions: [
      { skill: 'Cloud', scenario: 'An application hosted in a single cloud region experienced a multi-hour outage when that region had connectivity issues.', question: 'How would you redesign the architecture to reduce the impact of single-region failures, and what trade-offs would you weigh?', followUps: ['How would you estimate the cost/benefit of multi-region resilience?', 'How would you test your disaster recovery plan without disrupting production?'] },
      { skill: 'Cloud', scenario: 'A migration from on-premises to the cloud is behind schedule because teams keep discovering undocumented dependencies.', question: 'How would you get the migration back on track while reducing the risk of further surprises?', followUps: ['What discovery techniques would you use to find hidden dependencies?', 'How would you sequence the migration to minimize risk?'] },
    ],
    expertCapstone: { question: 'Design a cloud migration and modernization strategy for a large enterprise moving core systems from on-premises data centers to the cloud — covering assessment, sequencing, security, cost management, and rollback planning.' },
    expertMentoring: [
      { question: 'A team member provisions cloud resources manually through the console instead of using infrastructure-as-code, causing inconsistencies. How would you guide them toward better practices?' },
      { question: 'Your team is debating whether to adopt a multi-cloud strategy. How would you help them weigh the trade-offs and reach a decision?' },
    ],
  },

  'Cybersecurity': {
    mcqs: [
      ['What does the principle of "least privilege" mean in access control?',
        ['Users and systems should be granted only the minimum access necessary to perform their function', 'Every user should have administrator access by default', 'Passwords should be the only form of authentication', 'Access should never be reviewed once granted'], 1],
      ['What is a SQL injection attack?',
        ['An attack where malicious SQL code is inserted into input fields to manipulate a database query', 'An attack that floods a server with traffic to make it unavailable', 'An attack that intercepts network traffic between two parties', 'An attack that exploits weak encryption algorithms'], 1],
      ['What is the purpose of multi-factor authentication (MFA)?',
        ['To require two or more independent forms of verification, reducing the risk of compromised credentials', 'To speed up the login process', 'To allow users to share accounts more easily', 'To eliminate the need for passwords entirely'], 1],
      ['What does "encryption at rest" protect against?',
        ['Unauthorized access to stored data if storage media is compromised', 'Network latency issues', 'Application crashes', 'Slow database queries'], 1],
      ['What is the main purpose of a penetration test?',
        ['To proactively find and demonstrate exploitable vulnerabilities before attackers do', 'To monitor employee productivity', 'To optimize application performance', 'To design the user interface'], 1],
      ['What is "phishing"?',
        ['A social engineering attack that tricks users into revealing sensitive information or installing malware', 'A method of encrypting network traffic', 'A technique for load-balancing web servers', 'A type of database indexing strategy'], 1],
      ['What does a Web Application Firewall (WAF) primarily help protect against?',
        ['Common web application attacks such as SQL injection and cross-site scripting', 'Hardware failures in data centers', 'Slow database queries', 'Incorrect business logic in application code'], 1],
      ['Why is regular patch management considered a critical security practice?',
        ['It closes known vulnerabilities that attackers commonly exploit before they can be abused', 'It improves the visual design of applications', 'It reduces cloud hosting costs', 'It replaces the need for access controls'], 1],
    ],
    practicalTasks: [
      { id: 'cy_p1', name: 'Threat Model a New Feature', title: 'Threat Model a New Feature', description: 'Given a new feature that lets users upload and share documents, create a threat model identifying potential attack vectors and mitigations.', deliverable: 'A threat model document listing assets, threats (e.g., using STRIDE), and recommended mitigations.', criteria: 'Comprehensive identification of realistic threats and practical, prioritized mitigations.' },
      { id: 'cy_p2', name: 'Incident Response Runbook', title: 'Incident Response Runbook', description: 'Draft an incident response runbook for a suspected data breach involving customer records.', deliverable: 'A runbook outlining detection, containment, eradication, recovery, and communication steps.', criteria: 'Clear sequencing, appropriate stakeholder involvement, and regulatory/compliance awareness.' },
    ],
    scenarioQuestions: [
      { skill: 'Cybersecurity', scenario: 'Your security monitoring tools flag unusual outbound traffic from a production database server at 3 AM.', question: 'Walk through how you would triage this alert and decide whether it represents a real incident.', followUps: ['What information would you gather before escalating?', 'How would you avoid both under-reacting and over-reacting to the alert?'] },
      { skill: 'Cybersecurity', scenario: "A third-party library used across your organization's applications is found to have a critical vulnerability with a public exploit available.", question: 'How would you coordinate a response across multiple teams and applications under time pressure?', followUps: ['How would you prioritize which systems to patch first?', 'How would you verify the fix was applied everywhere it was needed?'] },
    ],
    expertCapstone: { question: 'Design a security strategy for a financial services platform that must comply with strict regulatory requirements — covering identity and access management, data protection, monitoring/detection, incident response, and third-party risk management.' },
    expertMentoring: [
      { question: 'A developer on your team pushes back on security requirements, viewing them as slowing down delivery. How would you help them see security as part of quality rather than an obstacle?' },
      { question: 'Your team disagrees about how to prioritize a backlog of vulnerability findings with limited remediation time. How would you help them reach a risk-based decision?' },
    ],
  },

  'Data Engineering': {
    mcqs: [
      ['What is the main difference between ETL and ELT?',
        ['ETL transforms data before loading it into the target system; ELT loads raw data first and transforms it within the target', 'ETL is only used for streaming data; ELT is only for batch data', 'ETL requires no database; ELT always requires a data warehouse', 'There is no practical difference between the two'], 1],
      ['What is the purpose of data partitioning in large datasets?',
        ['To split data into manageable segments that improve query performance and parallel processing', 'To encrypt sensitive columns automatically', 'To remove duplicate records', 'To visualize data trends'], 1],
      ['What does "schema-on-read" mean in the context of data lakes?',
        ['The structure of the data is interpreted at the time it is read/queried rather than enforced at write time', 'The schema must be defined before any data can be stored', 'Data is automatically converted to JSON on write', 'Schemas cannot be changed once created'], 1],
      ['What is the role of a message broker like Kafka in a data pipeline?',
        ['To reliably ingest, buffer, and distribute streams of data between producers and consumers', 'To render dashboards for business users', 'To compile application source code', 'To manage user authentication'], 1],
      ['What does "data lineage" help teams understand?',
        ['Where data originates, how it moves and transforms, and where it ends up', 'How fast a query executes', 'How much storage a table consumes', 'Which users have logged into a system'], 1],
      ['Why is idempotency an important property for data pipeline jobs?',
        ["So that re-running a job after a failure doesn't produce duplicate or inconsistent data", 'So that jobs always run faster on retry', 'So that jobs can skip validation steps', 'So that schemas never need to change'], 1],
      ['What is a common purpose of a data quality check (e.g., null checks, range checks) in a pipeline?',
        ['To catch bad or unexpected data early before it propagates downstream', 'To compress data for storage efficiency', 'To encrypt data in transit', 'To generate user interface components'], 1],
      ['What is the main advantage of a columnar storage format (e.g., Parquet) for analytical workloads?',
        ['It allows queries to read only the relevant columns, improving performance and reducing I/O for analytics', 'It is required for all transactional (OLTP) systems', 'It eliminates the need for indexes entirely', 'It guarantees data is always encrypted'], 1],
    ],
    practicalTasks: [
      { id: 'de_p1', name: 'Design a Batch + Streaming Pipeline', title: 'Design a Batch + Streaming Pipeline', description: 'Design a data pipeline that ingests both real-time event streams and nightly batch files, then produces a unified dataset for analytics.', deliverable: 'A pipeline architecture outline covering ingestion, processing, storage, and orchestration.', criteria: 'Sound handling of both streaming and batch sources, clear orchestration strategy, and data quality considerations.' },
      { id: 'de_p2', name: 'Diagnose a Failing Pipeline', title: 'Diagnose a Failing Pipeline', description: 'Given a nightly ETL job that has started silently producing incomplete data after a recent schema change in a source system, outline your diagnostic and remediation approach.', deliverable: 'A written plan covering detection, root-cause analysis, remediation, and prevention.', criteria: 'Systematic diagnosis, awareness of schema-evolution risks, and practical preventive controls (e.g., schema validation, alerting).' },
    ],
    scenarioQuestions: [
      { skill: 'Data Engineering', scenario: 'A critical daily report has been showing incorrect totals for the past week, and nobody noticed until a business user complained.', question: 'How would you investigate the root cause and what changes would you make to catch such issues earlier in the future?', followUps: ['What monitoring or alerting would you put in place?', 'How would you communicate the impact to affected stakeholders?'] },
      { skill: 'Data Engineering', scenario: 'Your data warehouse costs have grown significantly as the company scales, and leadership wants them under control without losing analytical capability.', question: 'How would you approach reducing costs while preserving the value the data platform provides?', followUps: ['What trade-offs would you present to leadership?', 'How would you measure whether your changes were successful?'] },
    ],
    expertCapstone: { question: 'Design a modern data platform strategy for an organization consolidating data from dozens of source systems — covering ingestion, storage, transformation, governance, data quality, and self-service analytics enablement.' },
    expertMentoring: [
      { question: 'A team member writes pipelines that work but are difficult for others to understand or modify. How would you help them write more maintainable, well-documented pipelines?' },
      { question: 'Your team is debating whether to centralize all transformations in the warehouse (ELT) or keep some transformation logic in the pipeline (ETL). How would you help them reach a decision?' },
    ],
  },

  'AI/ML': {
    mcqs: [
      ['What is the main difference between supervised and unsupervised learning?',
        ['Supervised learning uses labeled data to learn a mapping from inputs to outputs; unsupervised learning finds patterns in unlabeled data', 'Supervised learning requires no data; unsupervised learning requires millions of labeled examples', 'Supervised learning is only used for images; unsupervised learning is only used for text', 'There is no meaningful difference between the two'], 1],
      ['What does "overfitting" mean in machine learning?',
        ['A model learns the training data too well, including its noise, and performs poorly on new data', 'A model is too simple to capture patterns in the data', 'A model trains too quickly to be useful', 'A model uses too little data to be evaluated'], 1],
      ['What is the purpose of a validation set during model training?',
        ['To tune hyperparameters and estimate generalization performance without touching the test set', 'To permanently store the final trained model', 'To label raw data automatically', "To visualize the model's architecture"], 1],
      ['What is a key risk of deploying a machine learning model without monitoring for data drift?',
        ["The model's performance can silently degrade as real-world data diverges from training data", 'The model will automatically retrain itself with no oversight', 'The model will become faster over time', 'The model will require less compute over time'], 1],
      ["What does \"precision\" measure in a classification model's evaluation?",
        ['The proportion of positive predictions that are actually correct', 'The proportion of actual positives that were correctly identified', 'The total number of predictions made', 'The time taken to train the model'], 1],
      ['What is the purpose of using embeddings in natural language processing?',
        ['To represent words or text as dense numerical vectors that capture semantic meaning', 'To compress images for faster loading', 'To encrypt text data for secure storage', 'To format text for display in a user interface'], 1],
      ['What is a common technique to reduce overfitting in deep learning models?',
        ['Regularization techniques such as dropout or weight decay', 'Removing the validation set from the workflow', 'Increasing the learning rate to the maximum possible value', 'Training on a smaller, less diverse dataset'], 1],
      ['Why is explainability important when deploying ML models in regulated industries like finance or healthcare?',
        ['Stakeholders and regulators often need to understand and justify why a model made a particular decision', 'It makes the model train faster', 'It eliminates the need for testing', 'It guarantees 100% model accuracy'], 1],
    ],
    practicalTasks: [
      { id: 'ai_p1', name: 'Design an ML Model Evaluation Plan', title: 'Design an ML Model Evaluation Plan', description: 'Given a model that predicts customer churn, design an evaluation plan covering metrics selection, validation strategy, and fairness considerations.', deliverable: 'A written plan describing metrics (e.g., precision/recall/AUC), validation approach, and bias/fairness checks.', criteria: 'Appropriate metric selection for the business problem, sound validation methodology, and awareness of fairness/bias risks.' },
      { id: 'ai_p2', name: 'Diagnose Model Performance Drop', title: 'Diagnose Model Performance Drop', description: "A deployed recommendation model's click-through rate has dropped 20% over the past month with no code changes. Outline your investigation approach.", deliverable: 'A written plan covering hypotheses (e.g., data drift, pipeline issues, seasonality) and how you would test each.', criteria: 'Systematic, prioritized investigation that distinguishes model issues from data/pipeline/business changes.' },
    ],
    scenarioQuestions: [
      { skill: 'AI/ML', scenario: 'A model that performed well in testing is producing biased recommendations for a subset of users in production.', question: 'How would you investigate and address this issue, balancing speed of response with the need for a thorough fix?', followUps: ['How would you detect this kind of issue earlier in the development lifecycle?', 'How would you communicate the issue and remediation plan to stakeholders?'] },
      { skill: 'AI/ML', scenario: 'Leadership wants to deploy a generative AI feature quickly, but your team is concerned about hallucinations and data privacy.', question: 'How would you balance the push for speed with the need to manage these risks responsibly?', followUps: ['What guardrails would you propose implementing first?', 'How would you measure whether the feature is safe enough to expand?'] },
    ],
    expertCapstone: { question: 'Design an end-to-end MLOps strategy for an organization deploying multiple machine learning models into production — covering data pipelines, training/retraining workflows, model monitoring, governance, and incident response for model failures.' },
    expertMentoring: [
      { question: 'A data scientist on your team builds highly accurate models that are difficult to deploy and maintain in production. How would you help them think more holistically about the ML lifecycle?' },
      { question: 'Your team is debating whether to build a custom model in-house or use a third-party AI API. How would you help them evaluate the trade-offs and decide?' },
    ],
  },
};

function getQuestions(skill, band) {
  const key = normalizeSkillKey(skill);
  const bank = BANKS[key] || BANKS['Functional Testing'];
  const normalizedBand = (band || 'beginner').toLowerCase();

  return {
    mcqs: buildMcqs(key, normalizedBand, bank.mcqs),
    practicalTasks: bank.practicalTasks,
    scenarioQuestions: bank.scenarioQuestions,
    expertScenarios: bank.scenarioQuestions,
    expertCapstone: bank.expertCapstone,
    expertMentoring: bank.expertMentoring,
  };
}

module.exports = { getQuestions, normalizeSkillKey };
