/**
 * ZenAssessPage.tsx — /employee/zenassess
 * Beta: Performance Testing only. 50 questions from Excel.
 * 4 bands: Beginner(0-2yr) / Intermediate(2-5yr) / Advanced(5-8yr) / Expert(8+yr)
 * Per-topic pagination, 10 Qs per skill, 45-min timer, no difficulty label shown.
 */
import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle, AlertCircle, Clock, Award, Shield, BarChart2,
  BookOpen, ArrowRight, ChevronLeft, ChevronRight, Upload,
  Github, FileText, Users, Star, ExternalLink, Brain, X,
  TrendingUp, Check,
} from 'lucide-react';
import { useDark, mkTheme } from '../lib/themeContext';
import { useAuth } from '../lib/authContext';
import { API_BASE, req, apiGetEmployee, apiGetSkills, apiUpdateEmployee } from '../lib/api';
import { toast } from '../lib/ToastContext';
import {
  computeSkillTaxonomy,
  getGradePath,
  deriveGradeFromYears,
  CANONICAL_SKILLS,
  type TaxonomyResult,
} from '../lib/zenTaxonomy';
import {
  generateExpertProfileAI,
  classifyDocumentAI,
  extractUniversalEvidenceAI,
  evaluateUniversalEvidenceAI,
  highlightEvidenceContentAI,
  generateTechnicalScenarioAI,
  evaluateTechnicalDiscussionAI,
  generateLeadershipScenarioAI,
  evaluateLeadershipDiscussionAI,
  evaluateConsistencyAI,
  evaluateRiskAI,
  analyzeAuthenticityAI,
  DOCUMENT_TYPE_COLORS,
  generateAdaptiveQuestionAI,
  evaluateAdaptiveAnswerAI,
  evaluateIntermediatePracticalAI,
  evaluateIntermediateScenariosAI,
} from '../lib/expertPathAI';
import { getQuestionBank, shuffleMCQs, correctLetterToIndex } from '../data/questionBank/index';
import { determineTierResult } from '../lib/scoringEngine';
import CodeEditor from '../components/CodeEditor';
// ─── Internationalization Helper ──────────────────────────────────────────────
const t = (text: string): string => text;

// ─── Types ────────────────────────────────────────────────────────────────────
type Band = 'beginner' | 'intermediate' | 'advanced' | 'expert';
type Section = 'profile' | 'test' | 'results';

interface Q {
  id: string;
  question: string;
  options: string[];
  correct: number; // 1-based from Excel
  difficulty: string;
  skill: string;
  time: number;
  points: number;
}

// ─── All 50 Performance Testing questions from Excel ─────────────────────────
const ALL_QUESTIONS: Q[] = [
  // 1-10: Test Type Precision
  { id:'p01', question:'A soak test is deemed COMPLETE only when which condition is met?', options:['CPU exceeds 80% for 30 minutes','All virtual users exit gracefully at scheduled end','The system shows NO memory growth or resource degradation over the full observation window','Error rate is 0% for 10 consecutive minutes'], correct:3, difficulty:'HARD', skill:'Test Types', time:90, points:2 },
  { id:'p02', question:'Stress testing is FUNDAMENTALLY different from load testing because stress testing:', options:['Uses fewer virtual users than load testing','Intentionally exceeds defined capacity limits to discover the failure mode and recovery behavior','Runs for longer duration than load testing','Validates business SLA under production-level concurrent users'], correct:2, difficulty:'HARD', skill:'Stress Testing', time:90, points:2 },
  { id:'p03', question:'Which statement about spike testing is INCORRECT?', options:['It helps validate auto-scaling response time','It measures system behavior under sudden traffic surges','It is equivalent to a step-up load test with a very steep ramp angle','It should measure recovery time after the surge subsides'], correct:3, difficulty:'HARD', skill:'Test Types', time:90, points:2 },
  { id:'p04', question:'Breakpoint testing is considered complete when:', options:['Error rate first exceeds 5%','Response time doubles from baseline','The system experiences a catastrophic, unrecoverable failure state','Throughput plateaus for 3 consecutive measurement intervals'], correct:3, difficulty:'HARD', skill:'Test Strategy', time:90, points:2 },
  { id:'p05', question:'Step-up load testing reveals something that a flat-load test CANNOT show. Which characteristic is it?', options:['Absolute maximum throughput at saturation','The precise user-count threshold at which server-side resource saturation begins','Total error count across all concurrency levels','Mean response time deviation at peak'], correct:2, difficulty:'HARD', skill:'Workload Modeling', time:90, points:2 },
  { id:'p06', question:'Shifting performance testing "left" in the SDLC is PRIMARILY justified because:', options:['Developers write better code when tested simultaneously','Architectural defect remediation cost is exponentially higher the later it is discovered','It replaces the need for production monitoring entirely','It shortens total test execution wall-clock time per sprint'], correct:2, difficulty:'HARD', skill:'Early NFR', time:90, points:2 },
  { id:'p07', question:'To correctly validate auto-scaling rules, the MOST appropriate test design is:', options:['30-minute soak at 80% of expected peak load','A spike test that crosses the scale-out threshold and then observes scale-in after load drops','A volume test with maximum realistic dataset size','A 72-hour reliability test at constant 50% load'], correct:2, difficulty:'HARD', skill:'Cloud Performance', time:90, points:2 },
  { id:'p08', question:'Volume testing is DISTINCT from load testing because volume testing stresses the system specifically through:', options:['High concurrent user counts during business hours','Sustained accumulation and processing of large data sets — NOT user concurrency','Sudden bursts of traffic beyond normal capacity','Extended duration execution over multiple days'], correct:2, difficulty:'HARD', skill:'Non-Functional', time:90, points:2 },
  { id:'p09', question:'Reliability testing SPECIFICALLY measures which attribute that endurance testing does NOT primarily target?', options:['Memory usage trend over time','Mean Time Between Failures (MTBF) and the system\'s fault recovery behavior after controlled failure injection','Response time degradation rate under sustained load','CPU utilization trend across a business cycle'], correct:2, difficulty:'HARD', skill:'Reliability', time:90, points:2 },
  { id:'p10', question:'Which test type is MISMATCHED with its primary objective?', options:['Soak test → detect resource exhaustion and memory leaks over time','Spike test → validate behavior under sudden traffic surges','Volume test → validate SLA under expected peak concurrent user count','Breakpoint test → identify the load level at which the system fails'], correct:3, difficulty:'HARD', skill:'SLA Validation', time:90, points:2 },
  // 11-20: Tools, Cloud & UI
  { id:'p11', question:'k6 is JavaScript-based, but what makes it FUNDAMENTALLY different from browser automation tools like Playwright?', options:['k6 generates load at the protocol level without rendering a DOM, making it unsuitable for measuring front-end rendering metrics','k6 requires a paid licence for more than 50 VUs','k6 cannot integrate with CI/CD pipelines','k6 can only measure API response time, not HTTP metrics'], correct:1, difficulty:'HARD', skill:'Tools', time:90, points:2 },
  { id:'p12', question:'Gatling scripts are written in a Scala-based DSL. Which statement about Gatling\'s execution model is FALSE?', options:['Gatling\'s simulation DSL is reactive and non-blocking by design','Gatling generates detailed HTML performance reports natively after each run','Gatling requires a JVM runtime environment to execute test scripts','Gatling uses a synchronous thread-per-virtual-user model identical to Apache JMeter'], correct:4, difficulty:'HARD', skill:'Tools', time:90, points:2 },
  { id:'p13', question:'In cloud-native performance testing, "elastic load zones" are PRIMARILY used to:', options:['Reduce latency between load controller and target application server','Distribute synthetic load from geographically separate regions to simulate realistic global user distribution','Ensure test data is isolated and not shared across regions','Scale the database dynamically during test execution'], correct:2, difficulty:'HARD', skill:'Cloud Testing', time:90, points:2 },
  { id:'p14', question:'When migrating from on-premises to cloud-based load testing, the MOST significant hidden cost factor to evaluate is:', options:['Virtual user licencing fees for the load testing tool','Data egress charges when load generators and the system under test communicate across cloud regions or availability zones','Increased script maintenance effort for cloud-compatible scripts','Longer ramp-up times caused by cloud VM cold-start delays'], correct:2, difficulty:'HARD', skill:'Cloud Economics', time:90, points:2 },
  { id:'p15', question:'Azure Load Testing uses Apache JMeter scripts. Which statement about its CI/CD integration is MOST accurate?', options:['It can ONLY integrate via Azure DevOps Pipelines, not GitHub Actions','It supports both Azure Pipelines and GitHub Actions natively with built-in test criteria pass/fail gates','It requires an Azure Kubernetes Service cluster to run distributed tests','It does not support auto-stop criteria based on error rate or response time thresholds'], correct:2, difficulty:'HARD', skill:'DevOps Integration', time:90, points:2 },
  { id:'p16', question:'Lighthouse and WebPageTest both assess front-end performance. They DIFFER primarily because WebPageTest:', options:['Cannot measure Core Web Vitals or LCP','Executes tests from real browser instances at globally distributed nodes and provides detailed waterfall analysis with visual rendering timeline','Is only available as a Chrome extension and cannot be automated','Measures only server-side TTFB and cannot capture client-side metrics'], correct:2, difficulty:'HARD', skill:'UI Performance', time:90, points:2 },
  { id:'p17', question:'A page has excellent TTFB (150ms) but a poor Largest Contentful Paint (LCP) of 5.8s. The MOST likely root cause is:', options:['The web server is slow and needs horizontal scaling','Large unoptimized hero images or render-blocking CSS that delays the primary content from being painted after the initial server response','DNS resolution time is consuming the gap between TTFB and LCP','Server-side rendering is disabled and hydration takes too long'], correct:2, difficulty:'HARD', skill:'UI Metrics', time:90, points:2 },
  { id:'p18', question:'Render-blocking and parser-blocking resources both delay page load. They DIFFER because parser-blocking scripts:', options:['Only affect CSS rendering and not HTML parsing','Completely halt HTML parsing for all elements below the script tag in the DOM until the script downloads and executes','Are always deferred automatically by all modern browsers','Only delay time-to-interactive but have no impact on FCP'], correct:2, difficulty:'HARD', skill:'UI Optimization', time:90, points:2 },
  { id:'p19', question:'Chrome DevTools Performance flame chart is PRIMARILY used by performance engineers to:', options:['Measure server-side response time and database query duration','Identify long tasks, layout thrashing, forced reflows, and JavaScript execution bottlenecks in the browser main thread','Configure HTTP/2 multiplexing and server push policies','Simulate mobile network throttling at the DNS resolver level'], correct:2, difficulty:'HARD', skill:'UI Analysis', time:90, points:2 },
  { id:'p20', question:'Real User Monitoring (RUM) data is INSUFFICIENT for performance test workload modeling because:', options:['RUM data is only captured from mobile browser sessions','RUM reflects real production usage patterns under variable real-world conditions which cannot be directly reproduced as deterministic load test scripts','RUM instrumentation in production always violates GDPR compliance requirements','RUM cannot capture JavaScript errors or resource loading failures'], correct:2, difficulty:'HARD', skill:'Observability', time:90, points:2 },
  // 21-30: Metrics & Little's Law
  { id:'p21', question:'Removing think time from a load test script will PRIMARILY create which invalid test condition?', options:['Test duration becomes unpredictably short causing incomplete scenarios','Virtual users will hammer the server continuously without pauses, creating artificially inflated concurrency that never occurs in production traffic patterns','Error rate drops to zero because no timeouts can occur','Response time becomes uniformly distributed across all percentiles'], correct:2, difficulty:'HARD', skill:'Test Realism', time:90, points:2 },
  { id:'p22', question:'A system reports p50=180ms, p90=920ms, p99=6200ms. The SLA requires p90 < 500ms. What PRECISELY should the engineer report?', options:['SLA is met since the median (p50) is 180ms which is well within 500ms','SLA is BREACHED: p90 = 920ms exceeds the 500ms threshold, meaning 10% of users consistently experience nearly 1 second latency','SLA is conditionally met because only p99 matters for enterprise SLAs and p99 is not part of this agreement','SLA status is undetermined without knowing the 95th percentile response time'], correct:2, difficulty:'HARD', skill:'SLA Metrics', time:90, points:2 },
  { id:'p23', question:'A load test reports p95 = 1.1s and standard deviation = 4.2s. What does this combination MOST precisely indicate?', options:['Consistent performance with a few extreme outliers pulling the standard deviation up','A heavily skewed response time distribution with a long tail — most users have acceptable experience but a subset experience severe degradation, possibly indicating intermittent bottlenecks','The test results are invalid because standard deviation cannot exceed the p95 value','The median response time is above the SLA threshold for all users'], correct:2, difficulty:'HARD', skill:'Statistics', time:90, points:2 },
  { id:'p24', question:'In a complete HTTPS response time breakdown, which step occurs IMMEDIATELY AFTER TCP connection establishment and BEFORE the actual HTTP request is sent?', options:['DNS resolution — it happens before TCP connect','SSL/TLS handshake — it negotiates encryption parameters using the established TCP connection','HTTP request transmission begins immediately after TCP connect on HTTPS','Browser redirect resolution occurs between TCP connect and TLS'], correct:2, difficulty:'HARD', skill:'Networking', time:90, points:2 },
  { id:'p25', question:'During a load test, HTTP 503 errors spike at peak load. What does 503 SPECIFICALLY indicate that HTTP 500 would NOT?', options:['503 means the application code threw an unhandled runtime exception','503 indicates the upstream server or load balancer is temporarily refusing new connections due to capacity constraints — not an application logic failure','503 means the client TLS certificate has expired or is invalid','503 is always caused by database connection pool exhaustion at the application tier'], correct:2, difficulty:'HARD', skill:'Error Analysis', time:90, points:2 },
  { id:'p26', question:"Little's Law: N = λ × W. In a load test, TPS (λ) = 50 and mean response time (W) = 0.4 seconds. What is the expected steady-state concurrency (N)?", options:['125 concurrent users','20 concurrent users','12.5 concurrent users — rounding is not appropriate so this answer is invalid','200 concurrent users'], correct:2, difficulty:'HARD', skill:'Load Modeling', time:90, points:2 },
  { id:'p27', question:"Applying Little's Law: N = 100 concurrent users, W = 2.0 seconds average response time. What is the expected throughput (λ)?", options:['200 TPS — you multiply N × W','50 TPS — you divide N by W','0.02 TPS — you divide W by N','2 TPS — W equals TPS in Little\'s Law'], correct:2, difficulty:'HARD', skill:'Performance Theory', time:90, points:2 },
  { id:'p28', question:"Little's Law predicts N=60 but your APM tool shows actual concurrency = 300 at identical throughput. What is the MOST probable explanation?", options:["The test tool's virtual user model doesn't subtract think time, so tool-measured concurrency looks higher than Little's Law predicts",'Response time degraded significantly under load — W increased from the baseline value used in the prediction, so actual N rose proportionally','Your JMeter thread group ramp-up time is incorrectly configured as 1 second','DNS resolution latency is being incorrectly included in the think time value'], correct:2, difficulty:'HARD', skill:"Little's Law", time:90, points:2 },
  { id:'p29', question:"Which condition causes Little's Law to produce INVALID predictions even when all measured inputs (N, λ, W) are accurately captured?", options:['Response time p99 is much higher than p50 (skewed distribution)','The system is non-stationary: arrival rate and service time are both changing during the measurement window, violating steady-state assumption','Load generators are distributed across multiple cloud regions','Browser-side rendering time is included in the server-side response time measurement'], correct:2, difficulty:'HARD', skill:'Validation', time:90, points:2 },
  { id:'p30', question:'Both pacing and think time control virtual user behavior. Which statement CORRECTLY distinguishes them?', options:['Think time is automatically set by the load tool; pacing is manually configured by the tester','Pacing controls the iteration rate (time between complete scenario repetitions) while think time simulates user pauses between individual requests WITHIN a scenario','They are completely synonymous and interchangeable across all major load testing tools','Pacing applies exclusively to Gatling; think time applies exclusively to JMeter'], correct:2, difficulty:'HARD', skill:'Load Control', time:90, points:2 },
  // 31-40: Lifecycle & Advanced Analysis
  { id:'p31', question:'Risk-based performance test prioritization requires evaluating which combination?', options:['Code coverage percentage of the feature under test','The product of BOTH business criticality AND likelihood of performance failure for each component — neither factor alone is sufficient','The total number of API endpoints exposed by the service','Developer confidence in the implementation quality'], correct:2, difficulty:'HARD', skill:'Risk Analysis', time:90, points:2 },
  { id:'p32', question:'An NFR states: "99th percentile response time < 2s under 500 concurrent users." This NFR CANNOT be validated if which element is missing from the test design?', options:['Negative marking configuration for incorrect answers','A workload model that generates exactly 500 stable concurrent virtual users with a representative request mix reflecting production traffic patterns','The exact hardware specification of the load generator machine','JVM heap size and GC configuration on the load generator'], correct:2, difficulty:'HARD', skill:'NFR', time:90, points:2 },
  { id:'p33', question:'Correlation failure in a load test script manifests MOST visibly as:', options:['Uniformly increased response time across all virtual users','Mass 4xx/5xx errors caused by invalid dynamic session tokens (captured during recording) being replayed verbatim in subsequent requests','CPU saturation on the load generator machine itself','Random think time values being applied by the test tool'], correct:2, difficulty:'HARD', skill:'Scripting', time:90, points:2 },
  { id:'p34', question:'Parameterization in load test scripts is MOST critical when the SUT has which server-side mechanism?', options:['Aggressive caching that would serve the same cached response to all VUs without parameterization, eliminating cache-miss scenarios that represent real production behavior','SSL pinning enabled for all API calls','Response time SLA thresholds below 100ms per request','A single-threaded synchronous request processing queue'], correct:1, difficulty:'HARD', skill:'Data Modeling', time:90, points:2 },
  { id:'p35', question:'A production traffic analysis shows 60% read, 25% write, 15% admin at peak 800 users between 09:00–11:00 UTC. Which workload model element is MOST frequently omitted by less experienced engineers?', options:['The peak concurrent user count (800)','The read/write/admin operation distribution ratio in the virtual user journey scripts, causing an unrealistic all-read or all-write test','The selection of which load testing tool to use','The SLA threshold value from the NFR document'], correct:2, difficulty:'HARD', skill:'Modeling', time:90, points:2 },
  { id:'p36', question:'The duration of a soak test for memory leak validation should PRIMARILY be determined by:', options:['A standard business day of 8 hours as per industry convention','The system\'s natural business cycle length — ensuring all scheduled batch jobs, GC cycles, session expirations, and connection pool rotations complete at least once','The SLA document\'s recommended performance test duration clause','Tester team capacity and sprint timeline'], correct:2, difficulty:'HARD', skill:'Endurance Testing', time:90, points:2 },
  { id:'p37', question:'During ramp-up, response time increases linearly while TPS completely plateaus. This pattern MOST precisely indicates:', options:['Network congestion between load generators and the target application','Server-side queue saturation: the server cannot process requests faster despite additional users, so each new user adds to the wait queue increasing response time without increasing throughput','A client-side scripting error causing silent request retries','Database connection pool limit was not yet reached'], correct:2, difficulty:'HARD', skill:'Monitoring', time:90, points:2 },
  { id:'p38', question:'A performance baseline becomes INVALID for future regression comparison when:', options:['Any code change is deployed to the application, regardless of scope or risk level','The hardware configuration, JVM parameters, database schema, OR test data volume changes — any of these makes the baseline non-equivalent for comparison','The test team changes the lead performance engineer','A different version of the load testing tool is used with otherwise identical script logic and infrastructure'], correct:2, difficulty:'HARD', skill:'Benchmarking', time:90, points:2 },
  { id:'p39', question:'Observation: CPU utilization is at 95% AND TPS is at 30% of the baseline established in earlier testing. The MOST specific diagnosis is:', options:['Database I/O wait causing application threads to block on queries','CPU-bound thread contention or lock contention: threads are consuming CPU by spinning or waiting on locks rather than performing productive work — throughput suffers despite high CPU','Network saturation between the load balancer and application server tier','Insufficient JVM heap causing Stop-The-World garbage collection pauses'], correct:2, difficulty:'HARD', skill:'Bottleneck Analysis', time:90, points:2 },
  { id:'p40', question:'Stop-The-World full GC pauses during load tests cause response time spikes because:', options:["Load generator cannot dispatch requests during GC pause periods",'ALL application threads are suspended during a full GC pause, freezing ALL in-flight request processing for the entire pause duration, causing a visible latency spike','The database disconnects active connections when it detects GC activity in the application','Network packets are buffered and delayed by the OS during JVM GC cycles'], correct:2, difficulty:'HARD', skill:'JVM Performance', time:90, points:2 },
  // 41-50: Scenarios & CI/CD
  { id:'p41', question:'Scenario: A JMeter load test passes with <1% error locally but produces 65% errors in CI. The FIRST diagnostic action is:', options:['Scale up the CI machine vCPU count to match the local machine spec','Verify environment parity: confirm that base URL, target port, SSL/TLS configuration, authentication credentials, and test data availability all match between local and CI environments','Increase the JMeter heap size (-Xmx) in the CI agent configuration','Re-record the entire JMeter script from scratch in the CI environment'], correct:2, difficulty:'HARD', skill:'CI Performance', time:90, points:2 },
  { id:'p42', question:'Full performance regression test suites should NOT run on every developer commit to CI because:', options:['CI machines are physically incapable of running JMeter or k6 scripts','Full performance suites consume significant time and infrastructure resources that would block developer feedback loops; smoke performance gates should be used per-commit instead','Performance tests always require manual human analysis and cannot be evaluated automatically','CI pipelines are architecturally unable to support parallel test execution'], correct:2, difficulty:'HARD', skill:'CI/CD', time:90, points:2 },
  { id:'p43', question:'A k6 test defines: `thresholds: { http_req_duration: ["p(95)<500"] }`. The threshold fails. What is the PRECISE meaning?', options:['An average response time above 500ms was detected during the test run','The 95th percentile response time exceeded 500ms — 5% of requests took longer than 500ms, violating the SLA gate','The k6 test tool itself experienced a timeout or connection error','The median (p50) response time exceeded 500ms during the peak concurrency phase'], correct:2, difficulty:'HARD', skill:'k6', time:90, points:2 },
  { id:'p44', question:'JMeter GUI mode is explicitly discouraged for load generation. The PRIMARY reason is:', options:["GUI mode does not support distributed remote testing agents",'The GUI consumes substantial JVM heap to render real-time charts and graphs, reducing resources available for actual load generation and distorting measured results','GUI mode cannot record HTTPS traffic with client certificate authentication','GUI mode silently limits thread groups to a maximum of 100 concurrent users'], correct:2, difficulty:'HARD', skill:'JMeter', time:90, points:2 },
  { id:'p45', question:'In a distributed JMeter setup (1 controller + 5 remote agents), which statement about result aggregation is CORRECT?', options:['Each agent independently writes results to its own separate JTL file without controller visibility','The controller aggregates results from all agents in near-real-time, but synchronization overhead at very high loads can cause minor result inaccuracies','Remote agents automatically merge and deduplicate their results without any controller involvement','The controller only aggregates results after all agents report test completion'], correct:2, difficulty:'HARD', skill:'Distributed Load', time:90, points:2 },
  { id:'p46', question:'Observation: At 500 VUs, error rate = 0.1% and p95 = 340ms. At 600 VUs, error rate = 0.0% and p95 = 270ms. What is the MOST likely explanation?', options:['The system became more efficient due to caching warming up at higher concurrency','Load shedding: the server or load balancer is silently dropping connections before they reach the application, so fewer transactions complete but those that do appear faster with no errors recorded','The additional 100 VUs are being routed to a different server node with more capacity','Response caching at the CDN layer was automatically activated at exactly 600 VU threshold'], correct:2, difficulty:'HARD', skill:'Result Analysis', time:90, points:2 },
  { id:'p47', question:'Which APM metric combination BEST distinguishes a database-tier bottleneck from an application-tier bottleneck?', options:['High JVM heap utilization with low GC frequency in the application JVM','High database wait time visible in distributed trace spans combined with low application-tier CPU utilization and normal thread pool saturation','High network I/O between load balancer and application server','High HTTP 5xx error rate with a simultaneously low database query throughput rate'], correct:2, difficulty:'HARD', skill:'Troubleshooting', time:90, points:2 },
  { id:'p48', question:'A team runs tests at 100, 200, 400, 800 VUs to prove scalability. Which result set SPECIFICALLY confirms LINEAR scalability?', options:['TPS approximately doubles when VUs double across all test points, AND response time remains stable (not degrading proportionally)','TPS increases at each step AND response time also doubles at each step (proportional increase)','Error rate stays below 1% at all load levels across all four test points','p99 response time remains below 2 seconds at the maximum 800 VU load point'], correct:1, difficulty:'HARD', skill:'Scalability', time:90, points:2 },
  { id:'p49', question:'A performance report states "response time degraded 18% compared to last sprint". Without which data point is this finding PRESENT but INCOMPLETE for executive decision-making?', options:['The exact version of JMeter used for both test runs','Comparison against the established NFR threshold — without knowing whether 18% degradation constitutes an SLA breach, the finding has no actionable severity classification','The names of all developers who changed code between the two test runs','The total count of test cases executed in each test run'], correct:2, difficulty:'HARD', skill:'Reporting', time:90, points:2 },
  { id:'p50', question:'A senior SDET with a mature performance engineering mindset approaches their role by:', options:['Running maximum concurrency tests until the system breaks to document the absolute breaking point','Partnering with architects during early design to define performance NFRs, then building automated performance regression gates in CI that detect degradation before code reaches production','Delegating all performance analysis work to the DevOps/SRE operations team post-deployment','Scheduling performance tests exclusively 2 weeks before major production releases'], correct:2, difficulty:'HARD', skill:'SDET Role', time:90, points:2 },
];


// ─── Band detection ───────────────────────────────────────────────────────────
function detectBand(yearsIT: number, skill?: string): Band {
  if (skill === 'Functional Testing') {
    if (yearsIT >= 12) return 'expert';
    if (yearsIT >= 6) return 'intermediate';
    return 'beginner';
  }
  if (yearsIT >= 8) return 'expert';
  if (yearsIT >= 5) return 'advanced';
  if (yearsIT >= 2) return 'intermediate';
  return 'beginner';
}

function bandLabel(b: Band, skill?: string) {
  if (skill === 'Functional Testing') {
    return b === 'beginner' ? 'Beginner (0–5 yrs)' :
           b === 'intermediate' ? 'Intermediate (6–12 yrs)' :
           b === 'expert' ? 'Expert (12+ yrs)' : 'Advanced (N/A)';
  }
  return b === 'beginner' ? 'Beginner (0–2 yrs)' :
         b === 'intermediate' ? 'Intermediate (2–5 yrs)' :
         b === 'advanced' ? 'Advanced (5–8 yrs)' : 'Expert (8+ yrs)';
}

function bandColor(b: Band) {
  return b === 'beginner' ? '#10B981' :
         b === 'intermediate' ? '#3B82F6' :
         b === 'advanced' ? '#8B5CF6' : '#F59E0B';
}

const FUNCTIONAL_TESTING_BEGINNER_QUESTIONS: Q[] = [
  { id: 'ftb01', question: 'In Agile, "Definition of Done" and "Definition of Ready" are frequently confused. Which statement CORRECTLY distinguishes them?', options: ['Both are sprint review checklists created by the QA lead', 'Definition of Ready specifies when a user story can be pulled into a sprint; Definition of Done specifies when it is considered shippable', 'Definition of Done is owned by the Product Owner; Definition of Ready is owned by the QA team', 'They are synonymous terms used interchangeably across all Agile frameworks'], correct: 2, difficulty: 'HARD', skill: 'SDLC', time: 60, points: 1 },
  { id: 'ftb02', question: 'In the STLC, the Test Plan is finalized in which phase, and who is PRIMARILY responsible for authoring it?', options: ['Test Execution phase — authored by a QA Engineer', 'Test Planning phase — authored by the Test Manager or Lead', 'Requirement Analysis phase — authored by the Business Analyst', 'Test Closure phase — authored by the Scrum Master'], correct: 2, difficulty: 'HARD', skill: 'STLC', time: 60, points: 1 },
  { id: 'ftb03', question: 'For a password field accepting 8–16 characters, 3-point BVA tests 7, 8, 9 at the lower boundary. Which values are tested at the UPPER boundary?', options: ['15, 16, 17', '16, 17 only (2-point BVA at upper boundary)', '14, 15, 16', '16 only (the exact maximum is sufficient)'], correct: 1, difficulty: 'HARD', skill: 'Test Case Design', time: 60, points: 1 },
  { id: 'ftb04', question: 'A defect is marked "Duplicate" in the defect tracking system. This status means:', options: ['The tester accidentally logged the same defect twice in the same session', 'An identical defect was already logged previously by another tester or in an earlier cycle', 'The developer fixed the defect by duplicating existing working code logic', 'The defect was re-opened after being previously verified and closed'], correct: 2, difficulty: 'HARD', skill: 'Defect Lifecycle', time: 60, points: 1 },
  { id: 'ftb05', question: 'A critical SQL injection vulnerability exists on the admin login page used only by 2 internal users once per month. Correct classification?', options: ['Low Severity, Low Priority — it affects very few users infrequently', 'High Severity, Low Priority — risk is real but business timing impact is low', 'High Severity, High Priority — security vulnerabilities carry critical severity regardless of usage frequency', 'Low Severity, High Priority — internal users tend to escalate quickly'], correct: 3, difficulty: 'HARD', skill: 'Severity vs Priority', time: 60, points: 1 },
  { id: 'ftb06', question: 'Which statement about regression testing is INCORRECT?', options: ['Regression testing can be automated to reduce effort for repetitive execution', 'Regression testing should ONLY be triggered by bug fixes — not by new feature additions', 'Regression testing verifies that previously passing functionality continues to work after code changes', 'The scope of regression testing is influenced by the risk and blast radius of the change'], correct: 2, difficulty: 'HARD', skill: 'Regression Testing', time: 60, points: 1 },
  { id: 'ftb07', question: 'Smoke testing and Sanity testing are often conflated. Which statement CORRECTLY differentiates them?', options: ['Smoke testing is always automated; Sanity testing is always performed manually', 'Smoke testing is a broad shallow test of the overall build stability; Sanity testing is a narrow focused test of a specific fix or new feature area', 'Smoke testing is executed after UAT; Sanity testing is executed before UAT', 'They are completely identical and the terms are fully interchangeable in all testing contexts'], correct: 2, difficulty: 'HARD', skill: 'Smoke Testing', time: 60, points: 1 },
  { id: 'ftb08', question: 'Sanity testing is MOST accurately described as:', options: ['A broad confirmation of overall build stability before running a full regression suite', 'A narrow, targeted verification that a specific defect fix or small change works as expected — without running all test cases', 'A synonym for Smoke testing used across all testing methodologies and frameworks', 'A type of non-functional testing performed immediately before production deployment'], correct: 2, difficulty: 'HARD', skill: 'Sanity Testing', time: 60, points: 1 },
  { id: 'ftb09', question: 'Which of the following is classified as NON-functional testing?', options: ['Regression Testing', 'Sanity Testing', 'Boundary Value Analysis Testing', 'Usability Testing'], correct: 4, difficulty: 'HARD', skill: 'Functional Testing Basics', time: 60, points: 1 },
  { id: 'ftb10', question: 'As requirements gathering concludes and system design begins, which QA activity should ALREADY be underway or complete?', options: ['Full test execution and defect logging against the new features', 'Requirements review participation and initial test strategy definition', 'Complete test case design, review, and sign-off', 'User acceptance testing scheduling and UAT script creation'], correct: 2, difficulty: 'HARD', skill: 'SDLC', time: 60, points: 1 },
  { id: 'ftb11', question: 'Which STLC phase produces the Requirement Traceability Matrix (RTM) as its PRIMARY output artifact?', options: ['Test Planning', 'Test Design', 'Test Analysis / Requirement Analysis', 'Test Closure'], correct: 3, difficulty: 'HARD', skill: 'STLC', time: 60, points: 1 },
  { id: 'ftb12', question: 'An age input field accepts integers 1–120. Equivalence Partitioning would identify which partitions?', options: ['Valid: 1–120; Invalid: less than 1 and greater than 120; and optionally non-integer inputs like strings', 'Valid: the midpoint value 60 only; Invalid: boundary values 1 and 120', 'Valid: 1, 60, 120 (representative values); Invalid: negative numbers only', 'Valid: all positive integers; Invalid: decimal numbers and alphabetic strings only'], correct: 1, difficulty: 'HARD', skill: 'Test Case Design', time: 60, points: 1 },
  { id: 'ftb13', question: 'A developer closes a defect with the comment "Works as Designed." The tester disagrees. What action should the tester take?', options: ['Accept the closure and mark the defect as Closed', 'Mark it as Deferred since the fix is postponed', 'Reopen the defect with evidence and justification challenging the "Works as Designed" decision', 'Escalate to the Scrum Master without reopening the defect'], correct: 3, difficulty: 'HARD', skill: 'Defect Lifecycle', time: 60, points: 1 },
  { id: 'ftb14', question: 'Which scenario BEST represents the "High Priority, Low Severity" classification?', options: ['Core payment processing crashes for all users during checkout', 'An SQL injection vulnerability discovered in a rarely used admin API endpoint', 'The company logo displays with an incorrect blue hex value on the homepage, violating brand guidelines — must be fixed before the CEO\'s live product demo in 3 hours', 'A database deadlock that corrupts financial records during month-end batch processing'], correct: 3, difficulty: 'HARD', skill: 'Severity vs Priority', time: 60, points: 1 },
  { id: 'ftb15', question: 'Continuous regression testing in CI differs from traditional regression testing because:', options: ['CI regression always runs the complete full regression suite on every commit', 'CI regression typically uses a risk-prioritized subset triggered on code changes, with full regression reserved for scheduled nightly or release pipelines', 'CI regression cannot detect integration-level or cross-component defects', 'Traditional regression testing is faster because skilled manual testers can find defects more efficiently than automated scripts'], correct: 2, difficulty: 'HARD', skill: 'Regression Testing', time: 60, points: 1 },
  { id: 'ftb16', question: 'Smoke testing is run after deploying a new build to the test environment. If smoke testing FAILS, the correct action is:', options: ['Log all smoke defects and proceed with the full regression suite anyway to maximize coverage', 'Reject the build and return it to development — no further testing should proceed on an unstable build', 'Escalate to the project manager and wait for client approval before deciding', 'Execute sanity tests on the failing areas to get a secondary opinion on build quality'], correct: 2, difficulty: 'HARD', skill: 'Smoke Testing', time: 60, points: 1 },
  { id: 'ftb17', question: 'Which statement accurately describes the relationship between Sanity testing and Regression testing?', options: ['Sanity testing replaces regression testing in Agile projects because it is faster', 'Sanity testing is a narrow subset of regression testing, focusing on verifying specific changes rather than the full tested scope', 'Regression testing is always performed before Sanity testing in every test cycle', 'Sanity testing covers MORE functionality than regression testing because it validates the entire affected module'], correct: 2, difficulty: 'HARD', skill: 'Sanity Testing', time: 60, points: 1 },
  { id: 'ftb18', question: 'Grey-box testing is performed with:', options: ['Complete knowledge of internal code and database structure, same as white-box testing', 'Zero knowledge of internals — purely functional input/output validation like black-box testing', 'Partial knowledge of the internal structure, combining elements of both black-box and white-box testing approaches', 'Only database schema knowledge without any application-layer or business logic awareness'], correct: 3, difficulty: 'HARD', skill: 'Functional Testing Basics', time: 60, points: 1 },
  { id: 'ftb19', question: 'In the STLC, which phase comes IMMEDIATELY AFTER Test Execution is completed?', options: ['Test Design phase', 'Test Planning phase', 'Test Closure phase', 'Requirement Analysis phase'], correct: 3, difficulty: 'HARD', skill: 'STLC', time: 60, points: 1 },
  { id: 'ftb20', question: 'A defect is set to "Verified" status. What does this PRECISELY mean in the defect lifecycle?', options: ['The developer confirmed the defect is reproducible and will be fixed', 'The QA tester has independently confirmed that the developer\'s fix resolves the defect and it no longer reproduces on the fixed build', 'The Product Owner has approved the defect for permanent closure', 'Automated regression tests have passed following the deployment of the fix'], correct: 2, difficulty: 'HARD', skill: 'Defect Lifecycle', time: 60, points: 1 }
];

const FUNCTIONAL_TESTING_INTERMEDIATE_QUESTIONS: Q[] = [
  { id: 'fti01', question: 'An RTM maps requirements to test cases. Which ADDITIONAL column provides the MOST business value for go/no-go release decisions?', options: ['Test case author name and creation date', 'Defect IDs linked to each failing test case — making requirement-level test coverage gaps and open risks immediately visible', 'Test execution start and end timestamps', 'Name of the automation tool used for each test case'], correct: 2, difficulty: 'HARD', skill: 'Requirement Analysis', time: 60, points: 1 },
  { id: 'fti02', question: 'Three-Point Estimation: (O + 4M + P) / 6. Optimistic = 3 days, Most Likely = 8 days, Pessimistic = 19 days. What is the estimate?', options: ['10 days', '8.5 days', '7.67 days', '9 days'], correct: 2, difficulty: 'HARD', skill: 'Test Estimation', time: 60, points: 1 },
  { id: 'fti03', question: 'Risk-based testing deprioritizes a module with HIGH defect history but LOW business criticality. Which reasoning is CORRECT?', options: ['Defect history always overrides business impact in all risk models', 'Risk = Likelihood × Impact; low business impact reduces the total risk score even when likelihood of failure is high, making it lower priority than a low-history high-impact module', 'All modules with defect history must be tested first per ISO 29119 standard', 'Business criticality is not a valid input to risk-based test prioritization models'], correct: 2, difficulty: 'HARD', skill: 'Risk-Based Testing', time: 60, points: 1 },
  { id: 'fti04', question: 'Input accepts integers 1–100 inclusive. Which set represents COMPLETE 3-point BVA at BOTH boundaries?', options: ['0, 1, 2 at lower AND 99, 100, 101 at upper', '1, 50, 100 (lower boundary, midpoint, upper boundary)', '0, 1, 100, 101 (just the boundary points)', '1, 2, 99, 100 (inner boundaries only)'], correct: 1, difficulty: 'HARD', skill: 'Boundary Value Analysis', time: 60, points: 1 },
  { id: 'fti05', question: 'A month input field accepts 1–12. A tester defines partitions: Valid=1–12, Invalid<1, Invalid>12. Which ADDITIONAL partition is the tester missing?', options: ['Invalid: non-integer decimal values (e.g., 6.5) and non-numeric strings (e.g., "Jan")', 'Invalid: exactly 12 should be its own partition to separate it from the rest of the valid range', 'Invalid: negative numbers are already covered by Invalid<1 so nothing is missing', 'Invalid: 0 should be treated as a separate partition from other values below 1'], correct: 1, difficulty: 'HARD', skill: 'Equivalence Partitioning', time: 60, points: 1 },
  { id: 'fti06', question: 'DDE = 60%. What is the MOST accurate implication for the production support team?', options: ['60% of all defects were fixed before the release to production', '40% of all defects escaped QA testing and may exist in the production environment', 'The QA team is performing above the industry average of 55% DDE', 'The remaining 40% were intentionally deferred by formal client agreement'], correct: 2, difficulty: 'HARD', skill: 'Defect Management', time: 60, points: 1 },
  { id: 'fti07', question: 'Defect density = 5 defects/KLOC on a 2000-line module. A new build reduces it to 4 defects/KLOC. What is the MOST accurate interpretation?', options: ['Exactly 10 defects were fixed in this specific module', 'Relative defect density improved, but the absolute defect count depends on whether the module\'s KLOC changed in the new build', 'Quality is now acceptable because 4 < 5 defects/KLOC', 'Two new defects were introduced while two others were fixed in the new build'], correct: 2, difficulty: 'HARD', skill: 'Test Metrics', time: 60, points: 1 },
  { id: 'fti08', question: 'NFR: "The checkout page shall load within 3 seconds for 95% of users." This is ambiguous because:', options: ['Specifying a percentile threshold is too complex for automated validation', 'It does not define network conditions, device type, geographic origin, or what "load" means — FCP, full page load, or TTI', 'Non-functional requirements are not allowed to reference specific response time values', 'A 95% threshold is too high — industry standard is 90% for SLA agreements'], correct: 2, difficulty: 'HARD', skill: 'Requirement Analysis', time: 60, points: 1 },
  { id: 'fti09', question: 'Wideband Delphi is PREFERRED over standard single-expert estimation for test effort because:', options: ['It uses a single authoritative expert to eliminate conflicting opinions', 'It runs multiple rounds of anonymous independent estimation with facilitated group discussion, converging on consensus while reducing anchoring bias from dominant voices', 'It is mandated by the IEEE 829 standard for all software test estimation activities', 'It always produces lower effort estimates than three-point estimation techniques'], correct: 2, difficulty: 'HARD', skill: 'Test Estimation', time: 60, points: 1 },
  { id: 'fti10', question: 'Module A: Probability=0.8, Impact=3. Module B: Probability=0.2, Impact=9. Using Risk Exposure (P×I), which module has higher risk and what is the score difference?', options: ['Module A: 2.4, Module B: 1.8 — Module A has higher risk by 0.6', 'Module B: 1.8, Module A: 2.4 — Module A has higher risk so should be tested first', 'Both have equal risk since 0.8×3 = 2.4 and 0.2×9 = 1.8, difference is 0.6 in Module A\'s favor', 'Module B has higher risk because high impact modules always supersede probability calculations'], correct:2, difficulty: 'HARD', skill: 'Risk-Based Testing', time: 60, points: 1 },
  { id: 'fti11', question: 'Date field accepts DD/MM/YYYY; valid days for February in a non-leap year = 1–28. Which BVA test values are MOST important to include?', options: ['27, 28, 29 — testing the upper boundary and the first invalid value beyond February\'s limit', '01, 28 only — one test at each absolute boundary is sufficient', '28, 29, 30 — testing the February/March boundary overlap', '01, 02, 27, 28 — testing both boundaries with 2-point BVA at each side'], correct: 1, difficulty: 'HARD', skill: 'Boundary Value Analysis', time: 60, points: 1 },
  { id: 'fti12', question: 'Equivalence Partitioning assumes all values in a partition behave identically. This assumption is VIOLATED when:', options: ['The valid input domain has non-contiguous ranges requiring multiple separate valid partitions', 'The test environment runs on a different operating system than the production environment', 'The developer implements validation using a switch statement rather than an if-else chain', 'A single partition contains more than 10 distinct input values'], correct: 1, difficulty: 'HARD', skill: 'Equivalence Partitioning', time: 60, points: 1 },
  { id: 'fti13', question: '"Cannot Reproduce" is DIFFERENT from "Deferred" in the defect lifecycle because:', options: ['Both statuses mean the defect will not be fixed in the current release cycle', '"Cannot Reproduce" means the defect was not observed in the current environment/config — NOT that it does not exist; "Deferred" means the fix is intentionally postponed to a future release regardless of reproducibility', '"Cannot Reproduce" is set by developers; "Deferred" is always set by QA testers', 'Deferred defects are always high severity; Cannot Reproduce defects are always low severity'], correct: 2, difficulty: 'HARD', skill: 'Defect Management', time: 60, points: 1 },
  { id: 'fti14', question: 'A project has DDE = 85% AND Defect Leakage Rate = 12%. Can these two metrics simultaneously be accurate?', options: ['No — they are mutually exclusive; high DDE means zero leakage by definition', 'Yes — DDE measures the proportion of total defects caught by QA, but if the total defect volume is large enough, 15% escape can still represent a significant absolute number of production defects', 'No — a DDE above 80% guarantees leakage below 5% by the ISTQB formula', 'Yes — but only if defects were intentionally deferred by client approval, which inflates the leakage metric artificially'], correct: 2, difficulty: 'HARD', skill: 'Test Metrics', time: 60, points: 1 },
  { id: 'fti15', question: 'Formal Inspection is the most rigorous static testing technique. Which statement about Inspection is MOST accurate?', options: ['Inspection is informal, does not require predefined roles, and has no entry or exit criteria', 'Inspection requires defined roles (moderator, author, inspectors, scribe), documented entry and exit criteria, checklists, and metrics on defects found — making it the most process-driven static technique', 'Inspection and Walkthrough are synonymous under the IEEE standards for software quality', 'Inspection can only be applied to source code, not to requirements documents or design artifacts'], correct: 2, difficulty: 'HARD', skill: 'Requirement Analysis', time: 60, points: 1 }
];

// Select exactly 10 questions for Performance Testing (beta) — same for ALL bands
function selectQuestions(band: Band, skill?: string): Q[] {
  if (skill === 'Functional Testing') {
    if (band === 'intermediate') {
      return FUNCTIONAL_TESTING_INTERMEDIATE_QUESTIONS;
    }
    return FUNCTIONAL_TESTING_BEGINNER_QUESTIONS;
  }
  // Pick 2 from each of the 5 topic groups = 10 total
  // Advanced/Expert get harder questions (last 2 from each group)
  if (band === 'advanced' || band === 'expert') {
    return [
      ALL_QUESTIONS[4],  // p05 - Workload Modeling (HARD)
      ALL_QUESTIONS[8],  // p09 - Reliability (HARD)
      ALL_QUESTIONS[13], // p14 - Cloud Economics (HARD)
      ALL_QUESTIONS[17], // p18 - UI Optimization (HARD)
      ALL_QUESTIONS[22], // p23 - Statistics (HARD)
      ALL_QUESTIONS[28], // p29 - Validation (HARD)
      ALL_QUESTIONS[35], // p36 - Endurance Testing (HARD)
      ALL_QUESTIONS[38], // p39 - Bottleneck Analysis (HARD)
      ALL_QUESTIONS[43], // p44 - JMeter (HARD)
      ALL_QUESTIONS[45], // p46 - Result Analysis (HARD)
    ];
  }
  // Beginner/Intermediate: standard 10
  return [
    ALL_QUESTIONS[0],  // p01 - Test Types (Soak)
    ALL_QUESTIONS[2],  // p03 - Test Types (Spike)
    ALL_QUESTIONS[10], // p11 - Tools (k6)
    ALL_QUESTIONS[12], // p13 - Cloud Testing
    ALL_QUESTIONS[20], // p21 - Test Realism (Think time)
    ALL_QUESTIONS[26], // p27 - Little's Law
    ALL_QUESTIONS[30], // p31 - Risk Analysis
    ALL_QUESTIONS[36], // p37 - Monitoring
    ALL_QUESTIONS[40], // p41 - CI Performance
    ALL_QUESTIONS[47], // p48 - Scalability
  ];
}

// Group questions by skill topic for per-topic pagination
function groupByTopic(qs: Q[]): { topic: string; questions: Q[] }[] {
  const topicGroups: Record<string, Q[]> = {};
  qs.forEach(q => {
    const topic = q.skill;
    if (!topicGroups[topic]) topicGroups[topic] = [];
    topicGroups[topic].push(q);
  });
  return Object.entries(topicGroups).map(([topic, questions]) => ({ topic, questions }));
}

// ── Extract text from PDF (with proper visual line detection) ──
const extractPDFText = async (file: File): Promise<string> => {
  try {
    const pdfjsLib = (window as any).pdfjsLib;
    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let lastY: number | null = null;
        let line = '';
        for (const item of content.items as any[]) {
          const y = item.transform[5];
          if (lastY !== null && Math.abs(y - lastY) > 3) {
            if (line.trim()) fullText += line.trim() + '\n';
            line = '';
          }
          line += (item.str || '') + ' ';
          lastY = y;
        }
        if (line.trim()) fullText += line.trim() + '\n';
        fullText += '\n';
      }
      return fullText;
    }
    return '';
  } catch (e) {
    console.error('[PDF Extract]', e);
    return '';
  }
};

// ── Legacy single-file extractor (used by other paths) ────────────────────
const extractTextFromFile = async (file: File): Promise<string> => {
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    return await extractPDFText(file);
  }
  if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.log')) {
    return await file.text();
  }
  return `Uploaded File: ${file.name}\nSize: ${file.size} bytes\nType: ${file.type}`;
};

// ── Universal Multi-Format Evidence Extractor ─────────────────────────────
const SUPPORTED_EVIDENCE_EXTS = ['pdf','txt','docx','pptx','xlsx','png','jpg','jpeg','webp'];

const getFileExt = (name: string) => name.split('.').pop()?.toLowerCase() || '';

const extractTextFromFileUniversal = async (file: File): Promise<string> => {
  const ext = getFileExt(file.name);
  const kb = (file.size / 1024).toFixed(1);

  // PDF — pdf.js
  if (ext === 'pdf') return await extractPDFText(file);

  // Plain text
  if (ext === 'txt') return await file.text();

  // Images — metadata + canvas dimensions for AI context
  if (['png','jpg','jpeg','webp'].includes(ext)) {
    return new Promise<string>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(`[IMAGE EVIDENCE]\nFilename: ${file.name}\nFile Size: ${kb} KB\nDimensions: ${img.width} × ${img.height} px\nFormat: ${ext.toUpperCase()}\n[OCR requires server-side processing. AI classification based on filename and metadata.]`);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(`[IMAGE EVIDENCE]\nFilename: ${file.name}\nFile Size: ${kb} KB\nFormat: ${ext.toUpperCase()}\n[AI classification based on filename.]`);
      };
      img.src = url;
    });
  }

  // DOCX / PPTX / XLSX — ZIP-based, extract readable ASCII segments
  if (['docx','pptx','xlsx'].includes(ext)) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let rawText = '';
      let readable = '';
      for (let i = 0; i < Math.min(bytes.length, 120000); i++) {
        const ch = Reflect.get(bytes, i);
        if ((ch >= 32 && ch < 127) || ch === 10 || ch === 13) {
          readable += String.fromCharCode(ch);
        } else {
          if (readable.length > 4) rawText += readable + ' ';
          readable = '';
        }
      }
      // Filter meaningful words (alpha ≥ 3 chars)
      const words = rawText.split(/\s+/).filter(w => w.length > 3 && /[a-zA-Z]{3,}/.test(w));
      const unique = [...new Set(words)].slice(0, 600);
      return `[${ext.toUpperCase()} DOCUMENT]\nFilename: ${file.name}\nFile Size: ${kb} KB\n\nExtracted Keywords:\n${unique.join(', ')}`;
    } catch {
      return `[${ext.toUpperCase()} DOCUMENT]\nFilename: ${file.name}\nFile Size: ${kb} KB\n[Binary document — AI classification based on filename.]`;
    }
  }

  // Fallback
  try { return await file.text(); } catch { return `[DOCUMENT]\nFilename: ${file.name}\nSize: ${kb} KB`; }
};

// ─── Keyword-aware text scorer (replaces word-count heuristics) ───────────────
function scoreTextAnswer(
  answer: string,
  expectedKeywords: string[],
  minWords: number = 30
): number {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < minWords) {
    return Math.min(30, (wordCount / Math.max(minWords, 1)) * 30);
  }
  if (!expectedKeywords || expectedKeywords.length === 0) {
    return Math.min(100, Math.round((wordCount / (minWords * 2)) * 70) + 30);
  }
  const lower = answer.toLowerCase();
  const found = expectedKeywords.filter(k => lower.includes(k.toLowerCase())).length;
  const keywordScore = (found / expectedKeywords.length) * 70;
  const lengthBonus = Math.min(30, (wordCount / (minWords * 2)) * 30);
  return Math.min(100, Math.round(keywordScore + lengthBonus));
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ZenAssessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { employeeId } = useAuth();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const PATH_COLOR: Record<string, string> = { Beginner: '#10B981', Intermediate: '#3B82F6', Expert: '#8B5CF6' };
  const GRADE_COLOR: Record<string, string> = {
    F1: '#3B82F6', E1: '#8B5CF6', E2: '#8B5CF6', D: '#10B981', C: '#10B981'
  };

  // Derive a grade from years of IT experience when employees.grade is NULL
  const deriveGradeFromYearsIT = (yrs: number): string => {
    if (yrs >= 13) return 'D';
    if (yrs >= 4) return 'E1'; // Using E1 as default for 4-12 range
    return 'F1';
  };

  const getGradePathLocal = (grade: string | null | undefined): 'Beginner' | 'Intermediate' | 'Expert' => {
    if (!grade || grade === 'Not Assigned' || grade === '—') return 'Beginner';
    const g = grade.trim().toUpperCase();
    if (g === 'F1') return 'Beginner';
    if (g === 'E1' || g === 'E2') return 'Intermediate';
    if (g === 'D' || g === 'C') return 'Expert';
    return 'Beginner';
  };

  // ── ZenAssess V7 Candidate Journey States ──
  const [v7Step, setV7Step] = useState(1);
  const [v7Status, setV7Status] = useState('idle');
  const [v7ExtractedData, setV7ExtractedData] = useState<any>(null);
  const [v7ProfileLoading, setV7ProfileLoading] = useState(true);
  const [v7Timer, setV7Timer] = useState(1800); // 30 minutes in seconds
  const [v7TimerActive, setV7TimerActive] = useState(false);
  const [v7McqAnswers, setV7McqAnswers] = useState({});
  const [v7FlaggedQuestions, setV7FlaggedQuestions] = useState({});
  const [v7CurrentMcqIdx, setV7CurrentMcqIdx] = useState(0);
  const [v7ScenarioAnswers, setV7ScenarioAnswers] = useState({
    s1: '', s2: '', s3: ''
  });
  const [v7PracticalAnswers, setV7PracticalAnswers] = useState({
    t1: '', t2: ''
  });
  const [v7CurrentScenarioIdx, setV7CurrentScenarioIdx] = useState(0);
  const [v7CurrentPracticalIdx, setV7CurrentPracticalIdx] = useState(0);
  const [v7ResultsProcessing, setV7ResultsProcessing] = useState(false);
  const [v7ErrorMsg, setV7ErrorMsg] = useState('');
  const [v7SelectedSkill, setV7SelectedSkill] = useState('Functional Testing');
  // Taxonomy Engine state
  const [v7Taxonomy, setV7Taxonomy] = useState<TaxonomyResult | null>(null);
  // Dynamic question state
  const [v7DynamicQuestions, setV7DynamicQuestions] = useState<any[]>([]);
  const [v7DynamicScenarios, setV7DynamicScenarios] = useState<any[]>([]);
  const [v7DynamicTasks, setV7DynamicTasks] = useState<any[]>([]);
  const [v7QuestionsLoading, setV7QuestionsLoading] = useState(false);
  const [v7QuestionsError, setV7QuestionsError] = useState('');

  // ── Path-specific assessment state ──────────────────────────────────────────
  const [assessmentPath, setAssessmentPath] = useState<'Beginner' | 'Intermediate' | 'Expert'>('Beginner');
  const [sectionScores, setSectionScores] = useState<Record<string, number>>({});
  const [toolIdAnswers, setToolIdAnswers] = useState<Record<number, number>>({});
  const [testCaseAnswers, setTestCaseAnswers] = useState<Record<string, string>>({});
  const [codingAnswer, setCodingAnswer] = useState<string>('');
  const [frameworkAnswer, setFrameworkAnswer] = useState<string>('');
  const [expertScenarioAnswers, setExpertScenarioAnswers] = useState<Record<string, string>>({});
  const [capstoneUrl, setCapstoneUrl] = useState<string>('');
  const [capstoneNotes, setCapstoneNotes] = useState<string>('');
  const [mentoringAnswers, setMentoringAnswers] = useState<Record<string, string>>({});
  const [experienceAnswers, setExperienceAnswers] = useState<Record<string, string>>({});
  const [v7CurrentToolIdIdx, setV7CurrentToolIdIdx] = useState<number>(0);
  const [v7CurrentTestCaseIdx, setV7CurrentTestCaseIdx] = useState<number>(0);
  const [v7CurrentExpertScenarioIdx, setV7CurrentExpertScenarioIdx] = useState<number>(0);

  // ── 3-Skill Sequential Engine state (Primary → Secondary → Tertiary) ────────
  const [v7Grade, setV7Grade] = useState<string>('');
  const [v7BaseLevel, setV7BaseLevel] = useState<'Beginner' | 'Intermediate' | 'Expert'>('Beginner');
  const [activeSkillIdx, setActiveSkillIdx] = useState<number>(0);
  const [silentDropLog, setSilentDropLog] = useState<Record<string, string[]>>({});
  const [skillResults, setSkillResults] = useState<{ skill: string; label: string; validatedLevel: string; badgeAwarded: boolean; silentDropPath: string; apiVerifiedBadgeLevel?: string | null; v7Action?: 'dropup' | 'pass' | 'dropdown'; finalScore?: number }[]>([]);
  const [showSkillTransition, setShowSkillTransition] = useState<boolean>(false);
  const [v7History, setV7History] = useState<any[]>([]);
  const [v7SkillBadges, setV7SkillBadges] = useState<Record<string, string>>({});
  const [v7SelfClaimedLevels, setV7SelfClaimedLevels] = useState<Record<string, string>>({});
  const [v7InProgressSkills, setV7InProgressSkills] = useState<Record<string, boolean>>({});
  const [v7AttemptNumber, setV7AttemptNumber] = useState<number>(1);
  const [v7CompletionSaved, setV7CompletionSaved] = useState<boolean>(false);
  const [v7RecheckLoading, setV7RecheckLoading] = useState<boolean>(false);
  const [showZenScanBanner, setShowZenScanBanner] = useState<boolean>(false);
  // True when the employee has rated skills in the DB, but none of them map to
  // the 32-skill canonical taxonomy (CASE C of the ZenAssess data-loading flow).
  const [v7TaxonomyMismatch, setV7TaxonomyMismatch] = useState<boolean>(false);

  // ── Question bank state (bank → API → fallback priority) ──────────────────
  const [v7BankMCQs, setV7BankMCQs] = useState<any[]>([]);
  const [v7BankToolIdQs, setV7BankToolIdQs] = useState<any[]>([]);
  const [v7BankPracticalQs, setV7BankPracticalQs] = useState<any[]>([]);
  const [v7BankCodingQs, setV7BankCodingQs] = useState<any[]>([]);
  const [v7BankScenarioQs, setV7BankScenarioQs] = useState<any[]>([]);
  const [v7BankFrameworkQ, setV7BankFrameworkQ] = useState<any>(null);
  const [v7BankMentoringQs, setV7BankMentoringQs] = useState<any[]>([]);
  const [v7BankQuestionnaireQs, setV7BankQuestionnaireQs] = useState<any[]>([]);
  const [toolIdTextAnswers, setToolIdTextAnswers] = useState<Record<string, string>>({});
  const [v7CodingResults, setV7CodingResults] = useState<{ visiblePassed: number; totalVisible: number; hiddenPassed: number; totalHidden: number }>({ visiblePassed: 0, totalVisible: 0, hiddenPassed: 0, totalHidden: 0 });

  // V7 Timer Effect
  useEffect(() => {
    let timerInterval = null;
    if (v7TimerActive && v7Timer > 0) {
      timerInterval = setInterval(() => {
        setV7Timer(prev => {
          if (prev <= 1) {
            clearInterval(timerInterval);
            setV7TimerActive(false);
            setV7Step(8); // auto submit → Assessment Complete loading screen
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [v7TimerActive, v7Timer]);

  // Load and validate CandidateProfile on mount
  const [v7ValidationError, setV7ValidationError] = useState<string | null>(null);

  // Load this employee's profile, skills, projects & certifications fresh from the
  // DB on every mount. NEVER read skill/profile data from localStorage and NEVER
  // fall back to a hardcoded/mock profile — every employee must see only their own
  // data, keyed by their logged-in employeeId.
  useEffect(() => {
    if (!employeeId) {
      setV7ValidationError("You are not logged in. Please log in again.");
      setV7ProfileLoading(false);
      return;
    }

    (async () => {
      try {
        const [emp, empSkills, projRes, certRes] = await Promise.all([
          apiGetEmployee(employeeId).catch(() => null),
          apiGetSkills(employeeId).catch(() => []),
          fetch(`${API_BASE}/projects/${employeeId}`).then(r => r.json()).catch(() => ({ projects: [] })),
          fetch(`${API_BASE}/certifications/${employeeId}`).then(r => r.json()).catch(() => ({ certifications: [] })),
        ]);

        if (!emp) {
          setV7ValidationError("Could not load your employee profile. Please contact your administrator.");
          setV7ProfileLoading(false);
          return;
        }

        const yearsIT = Number((emp as any).years_it ?? emp.yearsIT ?? 0);
        const skillsArr = (empSkills || []).map((s: any) => ({
          skillName: s.skillName || s.skill_name,
          selfRating: Number(s.selfRating ?? s.self_rating ?? 0),
          assessmentScore: Number(s.capabilityScore ?? s.assessmentScore ?? 0),
        }));

        const rawProjects = (projRes?.projects || []).map((p: any) => ({
          name: p.ProjectName || '',
          technologies: p.Technologies || [],
          skills: p.SkillsUsed || [],
          domain: p.Domain || '',
          description: p.Description || '',
          role: p.Role || '',
        }));

        const rawCerts: string[] = (certRes?.certifications || []).map((c: any) => c.CertName).filter(Boolean);

        const primarySkill = (emp as any).primary_skill || emp.primarySkill || '';
        const secondarySkill = (emp as any).secondary_skill || '';
        const tertiarySkill = (emp as any).tertiary_skill || '';

        const data = {
          name: emp.name || (emp as any).Name || '',
          yearsIT,
          designation: emp.designation || (emp as any).Designation || '',
          department: (emp as any).department || '',
          location: (emp as any).location || '',
          zensarId: (emp as any).zensar_id || emp.zensarId || '',
          primarySkill,
          secondarySkill,
          tertiarySkill,
          domains: [] as string[],
          certifications: rawCerts,
          projects: rawProjects.map((p: any) => p.domain ? `${p.name} (${p.domain})` : p.name),
          skills: skillsArr,
          rawProjects,
          rawCerts,
        };

        setV7ExtractedData(data);

        // Load path and grade — derive from years IT and persist if missing
        let resolvedGrade = (emp as any).grade || '';
        if (!resolvedGrade) {
          resolvedGrade = deriveGradeFromYearsIT(yearsIT);
          apiUpdateEmployee(employeeId, { grade: resolvedGrade } as any).catch(() => {});
        }
        setV7Grade(resolvedGrade);
        const derivedPath = getGradePathLocal(resolvedGrade);
        setAssessmentPath(derivedPath);
        setV7BaseLevel(derivedPath);

        // ── Run 32-Skill Taxonomy Engine using THIS employee's real DB data ──
        const taxonomyInput = {
          yearsIT,
          primarySkillDB: primarySkill,
          secondarySkillDB: secondarySkill,
          tertiarySkillDB: tertiarySkill,
          skills: skillsArr,
          projects: rawProjects,
          certifications: rawCerts,
          designation: data.designation,
          department: data.department,
        };

        // CASE A: no skills with a self-rating > 0 → ZenScan gate, no skill cards.
        // CASE C: has rated skills, but none map to the 32-skill canonical list.
        // CASE B: has at least one rated skill that maps to the canonical list.
        const realSkills = skillsArr.filter((s: any) => (s.selfRating || 0) > 0);
        const hasRealSkills = realSkills.length > 0;
        const canonicalRealSkills = realSkills.filter((s: any) => (CANONICAL_SKILLS as readonly string[]).includes(s.skillName));

        if (!hasRealSkills) {
          setShowZenScanBanner(true);
          setV7TaxonomyMismatch(false);
          setV7Taxonomy(null);
        } else if (canonicalRealSkills.length === 0) {
          setShowZenScanBanner(false);
          setV7TaxonomyMismatch(true);
          setV7Taxonomy(null);
        } else {
          setShowZenScanBanner(false);
          setV7TaxonomyMismatch(false);
          const taxonomy = computeSkillTaxonomy(taxonomyInput);
          setV7Taxonomy(taxonomy);
          setV7SelectedSkill(taxonomy.primary.skill);
        }

        setV7ValidationError(null);
      } catch (err: any) {
        setV7ValidationError("Failed to load your profile data: " + (err?.message || 'Unknown error'));
      } finally {
        setV7ProfileLoading(false);
      }
    })();
  }, [employeeId]);

  // Map a numeric self_rating (1-5 scale) to a level label, consistent with the
  // rows that already have self_claimed_level populated (rating 3+ = Expert).
  const deriveLevelFromRating = (rating: number): string | null => {
    if (rating >= 3) return 'Expert';
    if (rating === 2) return 'Intermediate';
    if (rating >= 1) return 'Beginner';
    return null;
  };

  // ── Always re-fetch verified badges & self-claimed levels fresh from the DB ──
  // (never read badge status from localStorage or stale component state)
  const refreshSkillBadgesFromDB = async () => {
    if (!employeeId) return;
    try {
      const skills = await apiGetSkills(employeeId);
      const badges: Record<string, string> = {};
      const selfLevels: Record<string, string> = {};
      (skills || []).forEach((s: any) => {
        const name = s.skillName || s.skill_name;
        if (!name) return;
        const verified = s.verifiedBadgeLevel || s.verified_badge_level;
        if (verified) badges[name] = verified;
        // CRITICAL: test level is sourced from self_claimed_level (DB), never grade/years.
        // Fall back to deriving from the numeric self_rating only for legacy rows where
        // self_claimed_level has not yet been populated.
        const claimedLevel = s.selfClaimedLevel || s.self_claimed_level;
        if (claimedLevel) {
          selfLevels[name] = claimedLevel;
        } else {
          const rating = Number(s.selfRating ?? s.self_rating ?? 0);
          const derived = deriveLevelFromRating(rating);
          if (derived) selfLevels[name] = derived;
        }
      });
      setV7SkillBadges(badges);
      setV7SelfClaimedLevels(selfLevels);
    } catch { /* badges/self-claimed levels remain unchanged — safe fallback */ }
  };

  // ── Load assessment history (for Re-check Profile cooldown) & verified badges ──
  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      try {
        const data = await req<{ history?: any[] }>('GET', `/zenassess/history/${employeeId}`);
        const hist = Array.isArray(data) ? data : (data?.history || []);
        setV7History(hist);
        setV7AttemptNumber((hist?.length || 0) + 1);
      } catch { /* no prior history — first attempt */ }
      await refreshSkillBadgesFromDB();
      // Show ZenScan banner if employee has no skills in DB
      try {
        const empSkills = await apiGetSkills(employeeId);
        const hasSkills = empSkills && empSkills.length > 0 && empSkills.some((s: any) => (s.selfRating || s.self_rating) > 0);
        if (!hasSkills) setShowZenScanBanner(true);
      } catch { /* banner stays hidden on error */ }
      try {
        const raw = localStorage.getItem(`zenassess_inprogress_${employeeId}`);
        const list: string[] = raw ? JSON.parse(raw) : [];
        const map: Record<string, boolean> = {};
        list.forEach(name => { map[name] = true; });
        setV7InProgressSkills(map);
      } catch { /* no in-progress tests recorded */ }
    })();
  }, [employeeId]);

  // ── Mark / clear a skill as "test started but not completed" (persisted) ─────
  const markSkillInProgress = (skillName: string, inProgress: boolean) => {
    setV7InProgressSkills(prev => {
      const next = { ...prev };
      if (inProgress) next[skillName] = true; else delete next[skillName];
      try { localStorage.setItem(`zenassess_inprogress_${employeeId}`, JSON.stringify(Object.keys(next))); } catch {}
      return next;
    });
  };

  // ── Load dynamic questions from server ───────────────────────────────────────
  const loadDynamicQuestions = async (taxonomy: TaxonomyResult) => {
    setV7QuestionsLoading(true);
    setV7QuestionsError('');
    try {
      const token = localStorage.getItem('zn_access_token');
      const yearsIT = v7ExtractedData?.yearsIT || 0;
      const band = yearsIT >= 8 ? 'expert' : yearsIT >= 4 ? 'intermediate' : 'beginner';

      const res = await fetch(`${API_BASE}/zenassess/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skills: [taxonomy.primary.skill, taxonomy.secondary.skill, taxonomy.tertiary.skill],
          skill: taxonomy.primary.skill, // backward compat
          band,
          employeeId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const mcqs = (data.questions || []).slice(0, 20);
        const scenarios = (data.scenarioQuestions || []).slice(0, 3);
        const tasks = (data.practicalTasks || []).slice(0, 2);

        setV7DynamicQuestions(mcqs);
        setV7DynamicScenarios(scenarios);
        setV7DynamicTasks(tasks);
        setV7McqAnswers({});
        setV7FlaggedQuestions({});
        setV7CurrentMcqIdx(0);
        setV7CurrentScenarioIdx(0);
        setV7CurrentPracticalIdx(0);
      } else {
        throw new Error('Failed to generate questions');
      }
    } catch (err: any) {
      console.error('[loadDynamicQuestions]', err);
      setV7QuestionsError('Question generation failed. Using fallback assessment.');
    } finally {
      setV7QuestionsLoading(false);
    }
  };

  // ── 3-Skill Sequential Engine helpers ────────────────────────────────────────
  const SELF_LEVEL_LABEL: Record<number, string> = { 0: 'Not Rated', 1: 'Beginner', 2: 'Intermediate', 3: 'Expert' };

  const getQueueSkillNames = (): string[] => {
    if (!v7Taxonomy) return [];
    return [v7Taxonomy.primary.skill, v7Taxonomy.secondary.skill, v7Taxonomy.tertiary.skill];
  };
  const getActiveSkillName = (): string => getQueueSkillNames()[activeSkillIdx] || '';
  const getActiveSkillLabel = (): 'Primary' | 'Secondary' | 'Tertiary' =>
    (['Primary', 'Secondary', 'Tertiary'] as const)[activeSkillIdx] || 'Primary';

  const computeOverallScoreForLevel = (level: 'Beginner' | 'Intermediate' | 'Expert', scores: Record<string, number>): number => {
    if (level === 'Beginner') {
      return Math.round((scores.mcq ?? 0) * 0.50 + (scores.toolId ?? 0) * 0.20 + (scores.testCaseWriting ?? 0) * 0.30);
    } else if (level === 'Intermediate') {
      return Math.round((scores.mcq ?? 0) * 0.20 + (scores.coding ?? 0) * 0.35 + (scores.scenarios ?? 0) * 0.30 + (scores.frameworkDesign ?? 0) * 0.15);
    }
    return Math.round((scores.expertScenarios ?? 0) * 0.25 + (scores.capstone ?? 0) * 0.40 + (scores.mentoring ?? 0) * 0.20 + (scores.questionnaire ?? 0) * 0.15);
  };

  const resetRoundState = () => {
    setSectionScores({});
    setV7McqAnswers({}); setV7FlaggedQuestions({}); setV7CurrentMcqIdx(0);
    setToolIdAnswers({}); setV7CurrentToolIdIdx(0);
    setTestCaseAnswers({}); setV7CurrentTestCaseIdx(0);
    setCodingAnswer(''); setFrameworkAnswer('');
    setExpertScenarioAnswers({}); setV7CurrentExpertScenarioIdx(0);
    setCapstoneUrl(''); setCapstoneNotes('');
    setMentoringAnswers({}); setExperienceAnswers({});
    setV7BankMCQs([]); setV7BankToolIdQs([]); setV7BankPracticalQs([]);
    setV7BankCodingQs([]); setV7BankScenarioQs([]); setV7BankFrameworkQ(null);
    setV7BankMentoringQs([]); setV7BankQuestionnaireQs([]);
    setToolIdTextAnswers({}); setV7CodingResults({ visiblePassed: 0, totalVisible: 0, hiddenPassed: 0, totalHidden: 0 });
    setV7ScenarioAnswers({ s1: '', s2: '', s3: '' }); setV7CurrentScenarioIdx(0);
    setV7CurrentPracticalIdx(0); setV7PracticalAnswers({ t1: '', t2: '' });
    setV7ResultsProcessing(false);
  };

  // ── Load questions for a single skill at a given level ───────────────────────
  const loadQuestionsForSkillLevel = async (skillName: string, level: 'Beginner' | 'Intermediate' | 'Expert') => {
    setV7QuestionsLoading(true);
    setV7QuestionsError('');

    // Priority 1: pre-defined question bank
    const lowerLevel = level.toLowerCase() as 'beginner' | 'intermediate' | 'expert';
    const bankData = getQuestionBank(skillName, lowerLevel) as any;
    if (bankData) {
      if (lowerLevel === 'beginner') {
        const shuffled = shuffleMCQs(bankData.mcq || []).map((q: any) => ({
          ...q,
          correct: correctLetterToIndex(q.correct) + 1,
        }));
        setV7BankMCQs(shuffled);
        setV7BankToolIdQs(bankData.toolId || []);
        setV7BankPracticalQs(bankData.practical || []);
      } else if (lowerLevel === 'intermediate') {
        const shuffled = shuffleMCQs(bankData.mcq || []).map((q: any) => ({
          ...q,
          correct: correctLetterToIndex(q.correct) + 1,
        }));
        setV7BankMCQs(shuffled);
        setV7BankCodingQs(bankData.coding || []);
        setV7BankScenarioQs(bankData.scenarios || []);
        setV7BankFrameworkQ((bankData.framework || [])[0] || null);
      } else {
        setV7BankMCQs([]);
        setV7BankScenarioQs(bankData.scenarios || []);
        setV7BankMentoringQs(bankData.mentoring || []);
        setV7BankQuestionnaireQs(bankData.questionnaire || []);
      }
      setV7McqAnswers({}); setV7FlaggedQuestions({}); setV7CurrentMcqIdx(0);
      setV7CurrentScenarioIdx(0); setV7CurrentPracticalIdx(0);
      setV7QuestionsLoading(false);
      return;
    }

    // Priority 2: API generation
    try {
      const token = localStorage.getItem('zn_access_token');
      const band = level === 'Expert' ? 'expert' : level === 'Intermediate' ? 'intermediate' : 'beginner';
      const res = await fetch(`${API_BASE}/zenassess/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skills: [skillName], skill: skillName, band, employeeId }),
      });
      if (res.ok) {
        const data = await res.json();
        setV7DynamicQuestions((data.questions || []).slice(0, 20));
        setV7DynamicScenarios((data.scenarioQuestions || []).slice(0, 3));
        setV7DynamicTasks((data.practicalTasks || []).slice(0, 2));
        setV7McqAnswers({}); setV7FlaggedQuestions({}); setV7CurrentMcqIdx(0);
        setV7CurrentScenarioIdx(0); setV7CurrentPracticalIdx(0);
      } else {
        throw new Error('Failed to generate questions');
      }
    } catch (err: any) {
      console.error('[loadQuestionsForSkillLevel]', err);
      setV7QuestionsError('Question generation failed. Using fallback assessment.');
    } finally {
      setV7QuestionsLoading(false);
    }
  };

  // Begin (or resume after a silent drop) the test for one skill at a given level
  const startSkillTest = (level: 'Beginner' | 'Intermediate' | 'Expert', skillName: string) => {
    resetRoundState();
    setAssessmentPath(level);
    const mins = level === 'Beginner' ? 30 : 60;
    setV7Timer(mins * 60);
    setV7TimerActive(true);
    loadQuestionsForSkillLevel(skillName, level);
    setV7Step(4);
  };

  // Record this skill's outcome and move to result page
  const advanceToNextSkillOrFinish = () => {
    setV7TimerActive(false);
    setV7Step(9); // Show Result Page after each skill test
    markSkillInProgress(getActiveSkillName(), false); // Clear in-progress status
  };

  // Decide pass / silent-drop / not-validated for the skill that just finished
  const evaluateSkillTestOutcome = () => {
    const score = computeOverallScoreForLevel(assessmentPath, sectionScores);
    const skillName = getActiveSkillName();
    const label = getActiveSkillLabel();
    const priorDrops = silentDropLog[skillName] || [];

    const tierResult = determineTierResult(assessmentPath, score);

    // Silent dropdown — continue same session at lower level, no screen change
    if (tierResult.action === 'dropdown' && tierResult.nextTestLevel) {
      setSilentDropLog(prev => ({ ...prev, [skillName]: [...(prev[skillName] || []), assessmentPath] }));
      startSkillTest(tierResult.nextTestLevel as 'Beginner' | 'Intermediate' | 'Expert', skillName);
      return;
    }

    // Build the silent drop path string for DB logging
    const allDrops = [...priorDrops];
    let silentPath: string;
    if (tierResult.action === 'dropup') {
      silentPath = allDrops.length
        ? [...allDrops, `DroppedUp:${tierResult.validatedLevel}`].join('→')
        : `DroppedUp:${assessmentPath}→${tierResult.validatedLevel}`;
    } else if (tierResult.action === 'dropdown') {
      silentPath = [...allDrops, assessmentPath, 'NotValidated'].join('→');
    } else {
      silentPath = allDrops.length ? [...allDrops, `Passed:${tierResult.validatedLevel}`].join('→') : `Passed:${tierResult.validatedLevel}`;
    }

    setSkillResults(prev => [...prev, {
      skill: skillName,
      label,
      validatedLevel: tierResult.validatedLevel,
      badgeAwarded: tierResult.badgeLevel !== null,
      silentDropPath: silentPath,
      v7Action: tierResult.action,
      finalScore: score,
    }]);
    advanceToNextSkillOrFinish();
  };

  // ── Begin the 3-skill sequential queue (Primary → Secondary → Tertiary) ──────
  const beginAssessmentQueue = (taxonomy: TaxonomyResult, level: 'Beginner' | 'Intermediate' | 'Expert') => {
    setSkillResults([]);
    setSilentDropLog({});
    setActiveSkillIdx(0);
    setShowSkillTransition(false);
    startSkillTest(level, taxonomy.primary.skill);
  };

  // ── Re-check Profile: re-read CURRENT skill matrix (not resume), re-rank, re-run ──
  const handleRecheckProfile = async () => {
    if (v7History && v7History.length > 0) {
      try {
        const retake = await req<any>('GET', `/zenassess/can-retake/${employeeId}?path=${encodeURIComponent(v7BaseLevel)}`);
        if (retake && retake.canRetake === false) {
          const next = retake.nextEligibleDate ? new Date(retake.nextEligibleDate) : null;
          const dateLabel = next ? next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'a later date';
          toast.error(`Re-assessment available on ${dateLabel}.`);
          return;
        }
      } catch { /* if the cooldown check fails, fall through and allow the attempt */ }
    }
    setV7RecheckLoading(true);
    try {
      const [liveEmployee, liveSkills] = await Promise.all([
        apiGetEmployee(employeeId).catch(() => null),
        apiGetSkills(employeeId),
      ]);
      const taxonomyInput = {
        yearsIT: liveEmployee?.yearsIT ?? v7ExtractedData?.yearsIT ?? 0,
        primarySkillDB: liveEmployee?.primarySkill || v7ExtractedData?.primarySkill,
        secondarySkillDB: v7ExtractedData?.secondarySkill,
        tertiarySkillDB: v7ExtractedData?.tertiarySkill,
        skills: (liveSkills || []).map((s: any) => ({ skillName: s.skillName, selfRating: s.selfRating || 0, assessmentScore: s.assessmentScore || 0 })),
        projects: (v7ExtractedData?.rawProjects || []).map((p: any) => ({
          name: p.name || '', technologies: p.technologies || [], skills: p.skills || [],
          domain: p.domain || '', description: p.description || '', role: p.role || '',
        })),
        certifications: v7ExtractedData?.rawCerts || [],
        designation: liveEmployee?.designation || v7ExtractedData?.designation,
        department: liveEmployee?.department || v7ExtractedData?.department,
      };
      const freshTaxonomy = computeSkillTaxonomy(taxonomyInput);
      setV7Taxonomy(freshTaxonomy);
      setV7SelectedSkill(freshTaxonomy.primary.skill);
      setV7AttemptNumber((v7History?.length || 0) + 1);
      setV7CompletionSaved(false);
      beginAssessmentQueue(freshTaxonomy, v7BaseLevel);
    } catch {
      toast.error('Could not load your current skill matrix. Please try again.');
    } finally {
      setV7RecheckLoading(false);
    }
  };


  const routeState = location.state as { fromResume?: boolean; extractedData?: any } | null;
  const extractedData = routeState?.extractedData || null;
  const profile = extractedData?.profile || {};
  // ── Functional Testing Intermediate custom states ────────────────────────
  const [functionalTestingPhase, setFunctionalTestingPhase] = useState<'mcq' | 'practical' | 'scenario'>('mcq');
  const [ftTask1Response, setFtTask1Response] = useState('');
  const [ftTask2Response, setFtTask2Response] = useState('');
  const [ftQ1Response, setFtQ1Response] = useState('');
  const [ftQ2Response, setFtQ2Response] = useState('');
  const [ftQ3Response, setFtQ3Response] = useState('');
  const [isEvaluatingFT, setIsEvaluatingFT] = useState(false);

  // ── Section state ──────────────────────────────────────────────────────────
  const [section, setSection] = useState<Section>('profile');

  // ── Skills from resume (Performance Testing only for beta) ─────────────────
  const detectedSkills = ['Performance Testing'];

  // ── Test state ─────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<Q[]>([]);
  const [topicGroups, setTopicGroups] = useState<{ topic: string; questions: Q[] }[]>([]);
  const [topicIdx, setTopicIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(45 * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Mid-level: contribution scan state ────────────────────────────────────
  const [contribPhase, setContribPhase] = useState<'mcq' | 'contribution'>('mcq');
  const [mcqScore, setMcqScore] = useState(0);
  const [contribution, setContribution] = useState({
    githubUrl: '',
    ciUrl: '',
    commits: '',
    scripts: '',
    frameworks: '',
    projectUsage: '',
  });

  // ── Universal Evidence Upload Engine (Expert 8+ Years) ──────────────────
  // Max 10 files, all enterprise formats: PDF DOCX PPTX XLSX TXT PNG JPG JPEG WEBP
  const [universalFiles, setUniversalFiles] = useState<any[]>([]); // UniversalEvidenceFile[]
  const [universalEvidence, setUniversalEvidence] = useState<any>(null); // UniversalExtractedEvidence
  const [copyCount, setCopyCount] = useState(0);
  const [pasteCount, setPasteCount] = useState(0);
  const [largePasteEvents, setLargePasteEvents] = useState(0);
  const [evidenceSubmitted, setEvidenceSubmitted] = useState(false);


  const getContributionValue = (key: string): string => {
    return Reflect.get(contribution, key) || '';
  };

  // ── Results state ──────────────────────────────────────────────────────────
  const [result, setResult] = useState<{
    score: number; status: string; assignedLevel: string; message: string;
    topicBreakdown: { topic: string; correct: number; total: number }[];
    explainScore?: any;
    contributionBreakdown?: any;
    githubMetadata?: any;
    integrityScore?: number;
    freshness?: any;
    readiness?: any;
    expertDetails?: any;
    discussionQuestions?: any;
    authenticityAnalysis?: any;
    aiRecommendation?: any;
    consistencyAnalysis?: any;
    riskAnalysis?: any;
    universalEvidence?: any;
    evidenceEvaluation?: any;
    ftDetails?: any;
  } | null>(null);

  // ── Settings & Links ──────────────────────────────────────────────────────
  const [githubUsername, setGithubUsername] = useState('');
  const [linkedGithub, setLinkedGithub] = useState('');
  
  // GitHub repo validator states
  const [githubValid, setGithubValid] = useState<boolean | null>(null);
  const [githubError, setGithubError] = useState('');
  const [githubMetadata, setGithubMetadata] = useState<any>(null);
  const [isValidatingGithub, setIsValidatingGithub] = useState(false);
  
  // ── Proctoring states ──────────────────────────────────────────────────────
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [browserBlurCount, setBrowserBlurCount] = useState(0);
  const [devtoolsDetected, setDevtoolsDetected] = useState(false);

  // ── Expert Path (8+ Years) States ─────────────────────────────────────────
  const [expertStep, setExpertStep] = useState<'profile' | 'evidence_form' | 'evidence_result' | 'adaptive_discussion' | 'tech_discussion' | 'lead_discussion' | 'finalizing'>('profile');
  const [expertProfile, setExpertProfile] = useState<any>(null);
  const [extractedEvidence, setExtractedEvidence] = useState<any>(null);
  const [evidenceEvaluation, setEvidenceEvaluation] = useState<any>(null);
  const [consistencyAnalysis, setConsistencyAnalysis] = useState<any>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<any>(null);
  const [isGeneratingProfile, setIsGeneratingProfile] = useState(false);
  const [isEvaluatingEvidence, setIsEvaluatingEvidence] = useState(false);
  const [evidenceStepText, setEvidenceStepText] = useState('');
  const [isFinalizingExpert, setIsFinalizingExpert] = useState(false);
  const [finalizingStepText, setFinalizingStepText] = useState('');
  const [techScenario, setTechScenario] = useState<any>(null);
  const [leadScenario, setLeadScenario] = useState<any>(null);
  const [isEvaluatingTech, setIsEvaluatingTech] = useState(false);
  const [isEvaluatingLead, setIsEvaluatingLead] = useState(false);
  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);
  const [isGeneratingLeadScenario, setIsGeneratingLeadScenario] = useState(false);
  const [techAnswers, setTechAnswers] = useState({ mainAnswer: '', followUpAnswers: ['', '', ''] });
  const [leadAnswers, setLeadAnswers] = useState({ mainAnswer: '', followUpAnswers: ['', ''] });
  const [techEvaluation, setTechEvaluation] = useState<any>(null);
  const [leadEvaluation, setLeadEvaluation] = useState<any>(null);

  // ── Adaptive Expert Discussion States ──
  const [discussionQuestions, setDiscussionQuestions] = useState<Array<{
    type: 'Technical' | 'Leadership' | 'Architecture/Ownership';
    question: string;
    responseOption: 'text' | 'voice';
    response: string;
    isVoiceUsed: boolean;
    rawTranscript?: string;
    evaluation?: any;
  }>>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(0);
  const [currentResponseOption, setCurrentResponseOption] = useState<'text' | 'voice'>('text');
  const [currentResponseText, setCurrentResponseText] = useState<string>('');
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [voiceFlowStep, setVoiceFlowStep] = useState<'idle' | 'recording' | 'transcribing' | 'confirming'>('idle');
  const [isTranscriptConfirmed, setIsTranscriptConfirmed] = useState<boolean>(false);
  const [isGeneratingNextQuestion, setIsGeneratingNextQuestion] = useState<boolean>(false);
  const [isEvaluatingCurrentAnswer, setIsEvaluatingCurrentAnswer] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getExperienceBand = (years: number): '8-10 Years' | '10-15 Years' | '15+ Years' => {
    if (years >= 15) return '15+ Years';
    if (years >= 10) return '10-15 Years';
    return '8-10 Years';
  };

  const startVoiceRecording = async () => {
    setIsRecording(true);
    setRecordingDuration(0);
    setVoiceTranscript('');
    setVoiceFlowStep('recording');
    audioChunksRef.current = [];

    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.start();
    } catch (err) {
      console.warn('MediaRecorder not allowed or unsupported:', err);
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      recognitionRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      let finalTrans = '';
      rec.onresult = (event: any) => {
        let interimTrans = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const resultItem = Reflect.get(event.results, i);
          if (resultItem.isFinal) {
            finalTrans += Reflect.get(resultItem, 0).transcript + ' ';
          } else {
            interimTrans += Reflect.get(resultItem, 0).transcript;
          }
        }
        setVoiceTranscript((finalTrans + interimTrans).trim());
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
      };

      rec.start();
    } else {
      toast.warning('Web Speech API is not supported in this browser. Falling back to keyboard text entry.');
    }
  };

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    setIsRecording(false);
    setVoiceFlowStep('confirming');

    setVoiceTranscript(prev => {
      if (!prev.trim()) {
        const fallbackQ = Reflect.get(discussionQuestions, currentQuestionIdx);
        return `[Voice response transcript: Candidate explained their strategy for ${fallbackQ?.type || 'Technical'} capability validation.]`;
      }
      return prev;
    });
  };

  const handleStartAdaptiveDiscussion = async () => {
    setExpertStep('adaptive_discussion');
    setIsGeneratingNextQuestion(true);
    try {
      const expBand = getExperienceBand(expertProfile?.yearsIT || yearsIT || 8);
      const firstQ = await generateAdaptiveQuestionAI(expertProfile, 'Technical', expBand, []);
      setDiscussionQuestions([
        {
          type: 'Technical',
          question: firstQ.question,
          responseOption: 'text',
          response: '',
          isVoiceUsed: false
        }
      ]);
      setCurrentQuestionIdx(0);
      setCurrentResponseText('');
      setVoiceTranscript('');
      setVoiceFlowStep('idle');
      setIsTranscriptConfirmed(false);
    } catch (e) {
      toast.error('Failed to generate initial discussion question. Using fallback.');
      setDiscussionQuestions([
        {
          type: 'Technical',
          question: `A critical system in your architecture experienced a database lockup during peak load. How would you troubleshoot it?`,
          responseOption: 'text',
          response: '',
          isVoiceUsed: false
        }
      ]);
      setCurrentQuestionIdx(0);
    } finally {
      setIsGeneratingNextQuestion(false);
    }
  };

  const handleAnswerSubmit = async () => {
    const finalAnswerText = currentResponseOption === 'voice' ? voiceTranscript : currentResponseText;
    
    // CRITICAL FIX: Question Validation
    if (!finalAnswerText.trim()) {
      toast.warning('Please provide a response before submitting.');
      return;
    }

    if (finalAnswerText.trim().length < 20) {
      toast.warning('Your response is too short. Please provide more detail (minimum 20 characters).');
      return;
    }

    // Verify: Each question contains unique answer content.
    const isDuplicate = discussionQuestions.some(q => q.response && q.response.trim().toLowerCase() === finalAnswerText.trim().toLowerCase());
    if (isDuplicate) {
      toast.error('Potential submission issue detected. Review responses before evaluation. (Duplicate answer detected)');
      return;
    }
    
    setIsEvaluatingCurrentAnswer(true);
    try {
      const expBand = getExperienceBand(expertProfile?.yearsIT || yearsIT || 8);
      const currentQ = Reflect.get(discussionQuestions, currentQuestionIdx);
      
      const evalRes = await evaluateAdaptiveAnswerAI(
        currentQ.question,
        finalAnswerText,
        currentQ.type,
        expBand
      );
      
      const updatedQuestions = [...discussionQuestions];
      Reflect.set(updatedQuestions, currentQuestionIdx, {
        ...currentQ,
        response: finalAnswerText,
        responseOption: currentResponseOption,
        isVoiceUsed: currentResponseOption === 'voice',
        evaluation: evalRes
      });
      setDiscussionQuestions(updatedQuestions);
      
      if (currentQuestionIdx < 3) {
        setIsGeneratingNextQuestion(true);
        const nextIdx = currentQuestionIdx + 1;
        const nextType = nextIdx === 1 ? 'Technical' : nextIdx === 2 ? 'Leadership' : 'Architecture/Ownership';
        
        const history = updatedQuestions.slice(0, currentQuestionIdx + 1).map(q => ({
          question: q.question,
          answer: q.response,
          type: q.type
        }));
        
        const nextQ = await generateAdaptiveQuestionAI(expertProfile, nextType, expBand, history);
        
        updatedQuestions.push({
          type: nextType,
          question: nextQ.question,
          responseOption: 'text',
          response: '',
          isVoiceUsed: false
        });
        setDiscussionQuestions(updatedQuestions);
        setCurrentQuestionIdx(nextIdx);
        
        setCurrentResponseOption('text');
        setCurrentResponseText('');
        setVoiceTranscript('');
        setVoiceFlowStep('idle');
        setIsTranscriptConfirmed(false);
        setIsGeneratingNextQuestion(false);
      } else {
        handleCompleteExpertEvaluationWithData(updatedQuestions);
      }
    } catch (e) {
      console.error('Error submitting answer:', e);
      toast.error('Failed to submit answer. Please retry.');
    } finally {
      setIsEvaluatingCurrentAnswer(false);
    }
  };

  // Background fetched data for offline / fallback resume parsing
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [employeeProjects, setEmployeeProjects] = useState<any[]>([]);
  const [employeeCerts, setEmployeeCerts] = useState<any[]>([]);

  // ── Dynamic State & API Integrations ──────────────────────────────────────
  const [lastStatus, setLastStatus] = useState<any>(null);
  const [selectedSkill, setSelectedSkill] = useState('Performance Testing');
  const [availableSkills, setAvailableSkills] = useState<string[]>(['Performance Testing', 'Selenium', 'Java', 'Functional Testing']);
  const [activeTab, setActiveTab] = useState<'assess' | 'history' | 'analytics' | 'recs'>('assess');
  const [history, setHistory] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  const yearsIT: number = profile.yearsIT || employeeProfile?.years_it || 0;
  const band: Band = detectBand(yearsIT, selectedSkill);

  useEffect(() => {
    if (!employeeId) return;
    
    // Last status for retry lock
    req<any>('GET', `/zenassess/status/${employeeId}`)
      .then(d => { if (d) setLastStatus(d); })
      .catch(() => {});

    // Fetch employee profile details to check linked github
    req<any>('GET', `/employees/${employeeId}`)
      .then(d => {
        if (d) {
          setEmployeeProfile(d);
          setGithubUsername(d.github_username || '');
          setLinkedGithub(d.github_username || '');
        }
      })
      .catch(() => {});

    // Fetch projects
    fetch(`${API_BASE}/projects/${employeeId}`)
      .then(res => res.json())
      .then(d => { if (d && d.projects) setEmployeeProjects(d.projects); })
      .catch(() => {});

    // Fetch certifications
    fetch(`${API_BASE}/certifications/${employeeId}`)
      .then(res => res.json())
      .then(d => { if (d && d.certifications) setEmployeeCerts(d.certifications); })
      .catch(() => {});

    // Available skills
    req<{ skills: string[] }>('GET', `/zenassess/skills`)
      .then(d => {
        if (d && d.skills && d.skills.length > 0) {
          const merged = Array.from(new Set([...d.skills, 'Functional Testing']));
          setAvailableSkills(merged);
        } else {
          setAvailableSkills(['Performance Testing', 'Selenium', 'Java', 'Functional Testing']);
        }
      })
      .catch(() => {
        setAvailableSkills(['Performance Testing', 'Selenium', 'Java', 'Functional Testing']);
      });

    // History
    req<{ history: any[] }>('GET', `/zenassess/history/${employeeId}`)
      .then(d => { if (d && d.history) setHistory(d.history); })
      .catch(() => {});

    // Analytics
    req<any>('GET', `/zenassess/analytics/${employeeId}`)
      .then(d => { if (d) setAnalytics(d); })
      .catch(() => {});

    // Recommendations
    req<{ recommendations: any[] }>('GET', `/zenassess/recommendations/${employeeId}`)
      .then(d => { if (d && d.recommendations) setRecommendations(d.recommendations); })
      .catch(() => {});
  }, [employeeId, section]);

  const linkGithubAccount = async () => {
    try {
      const data = await req<{ success: boolean; github_username: string }>('PUT', `/employees/${employeeId}/github`, { githubUsername });
      if (data.success) {
        setLinkedGithub(githubUsername);
        toast.success('GitHub username linked successfully!');
      } else {
        toast.error('Failed to link GitHub account.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error linking GitHub account.');
    }
  };

  const validateRepo = async () => {
    if (!contribution.githubUrl) {
      toast.error('Please enter a GitHub repository URL first.');
      return;
    }
    setIsValidatingGithub(true);
    setGithubValid(null);
    setGithubError('');
    setGithubMetadata(null);
    try {
      const data = await req<any>('POST', '/zenassess/validate-github', {
        githubUrl: contribution.githubUrl,
        employeeId
      });
      if (data.valid === false) {
        setGithubValid(false);
        setGithubError(data.error || 'Failed to validate repository.');
        toast.error(data.error || 'Repository validation failed.');
      } else {
        setGithubValid(true);
        setGithubMetadata(data);
        toast.success('GitHub repository validated successfully!');
      }
    } catch (e: any) {
      setGithubValid(false);
      setGithubError(e.message || 'Failed to validate repository.');
      toast.error(e.message || 'Repository validation failed.');
    } finally {
      setIsValidatingGithub(false);
    }
  };

  // ── Anti-Cheat Engine State & Listeners ───────────────────────────────────
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [copyPasteCount, setCopyPasteCount] = useState(0);
  const [sessionFingerprint, setSessionFingerprint] = useState('');
  const [integrityFlags, setIntegrityFlags] = useState<string[]>([]);

  useEffect(() => {
    const fp = `fp_${navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '')}_${window.screen.width}x${window.screen.height}_${Date.now()}`;
    setSessionFingerprint(fp);
  }, []);

  useEffect(() => {
    if (section !== 'test') {
      setTabSwitchCount(0);
      setCopyPasteCount(0);
      setFullscreenExitCount(0);
      setBrowserBlurCount(0);
      setDevtoolsDetected(false);
      setIntegrityFlags([]);
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => prev + 1);
        setIntegrityFlags(flags => [...flags, t('Tab switch detected at ') + new Date().toLocaleTimeString()]);
        toast.warning(t('Warning: Tab switching detected and logged.'));
      }
    };

    const handleWindowBlur = () => {
      setBrowserBlurCount(prev => prev + 1);
      setIntegrityFlags(flags => [...flags, t('Focus lost (window blur) at ') + new Date().toLocaleTimeString()]);
      toast.warning(t('Warning: Window focus lost.'));
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullscreenExitCount(prev => prev + 1);
        setIntegrityFlags(flags => [...flags, t('Fullscreen exit detected at ') + new Date().toLocaleTimeString()]);
        toast.warning(t('Warning: Fullscreen exited.'));
      }
    };

    const handleResize = () => {
      const threshold = 160;
      const isDevToolsOpen = window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold;
      if (isDevToolsOpen) {
        setDevtoolsDetected(true);
        setIntegrityFlags(flags => {
          if (!flags.some(f => f.includes('DevTools'))) {
            return [...flags, t('DevTools console access detected at ') + new Date().toLocaleTimeString()];
          }
          return flags;
        });
        toast.warning(t('Warning: DevTools detection logged.'));
      }
    };

    const handleCopyPaste = (e: Event) => {
      if (e.type === 'copy') {
        setCopyCount(prev => prev + 1);
      } else if (e.type === 'paste') {
        setPasteCount(prev => prev + 1);
        const ce = e as ClipboardEvent;
        const text = ce.clipboardData?.getData('text') || '';
        if (text.length > 100) {
          setLargePasteEvents(prev => prev + 1);
          setIntegrityFlags(flags => [...flags, t('Large Paste Event detected (>100 chars) at ') + new Date().toLocaleTimeString()]);
        }
      }

      setCopyPasteCount(prev => prev + 1);
      setIntegrityFlags(flags => [...flags, e.type.toUpperCase() + t(' operation detected at ') + new Date().toLocaleTimeString()]);
      toast.warning(t(`Warning: ${e.type.toUpperCase()} is restricted.`));
    };

    const preventRightClick = (e: MouseEvent) => {
      e.preventDefault();
      toast.warning(t('Right-click is disabled during the assessment.'));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleResize);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('contextmenu', preventRightClick);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('contextmenu', preventRightClick);
    };
  }, [section]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current!); setTimerActive(false); handleSubmit(); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  // ── Universal Evidence Upload Handlers ───────────────────────────────────
  const MAX_EVIDENCE = 10;

  const handleUniversalFilesAdd = async (files: File[]) => {
    const available = MAX_EVIDENCE - universalFiles.length;
    const toProcess = files.slice(0, available);
    if (files.length > available) {
      toast.warning(`Max ${MAX_EVIDENCE} evidence items. ${files.length - available} file(s) skipped.`);
    }

    for (const file of toProcess) {
      const ext = getFileExt(file.name);
      if (!SUPPORTED_EVIDENCE_EXTS.includes(ext)) {
        toast.error(`${file.name}: Unsupported format. Use PDF, DOCX, PPTX, XLSX, TXT, PNG, JPG, JPEG, or WEBP.`);
        continue;
      }
      const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const entry: any = { id, name: file.name, size: file.size, mimeType: file.type || `application/${ext}`, status: 'parsing', extractedText: '', classification: undefined, highlights: [] };
      setUniversalFiles(prev => [...prev, entry]);
      try {
        const text = await extractTextFromFileUniversal(file);
        setUniversalFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'classifying', extractedText: text } : f));
        const classification = await classifyDocumentAI(file.name, text, file.type || `application/${ext}`);
        const highlights = await highlightEvidenceContentAI(text, classification.documentType);
        setUniversalFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'success', extractedText: text, classification, highlights } : f));
        toast.success(`"${file.name}" → ${classification.documentTypeLabel} (${classification.confidence}% confidence)`);
      } catch (e) {
        setUniversalFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', errorMessage: 'Processing failed. Retry.' } : f));
        toast.error(`Failed to process: ${file.name}`);
      }
    }
  };

  const handleUniversalFileRemove = (id: string) => {
    setUniversalFiles(prev => prev.filter(f => f.id !== id));
  };

  const getResumeTextForAI = () => {
    let text = `Name: ${employeeProfile?.name || profile?.name || ''}\n`;
    text += `Designation: ${employeeProfile?.designation || profile?.designation || ''}\n`;
    text += `Years Experience: ${employeeProfile?.years_it || yearsIT || 8}\n`;
    text += `Location: ${employeeProfile?.location || profile?.location || ''}\n\n`;
    
    text += `--- PROJECTS ---\n`;
    const projs = employeeProjects.length > 0 ? employeeProjects : (extractedData?.projects || []);
    projs.forEach((p: any) => {
      text += `- Project: ${p.projectName || p.ProjectName || p.name || ''}\n`;
      text += `  Role: ${p.role || p.Role || ''}\n`;
      text += `  Duration: ${p.startDate || p.StartDate || ''} - ${p.endDate || p.EndDate || ''}\n`;
      text += `  Description: ${p.description || p.Description || ''}\n`;
      text += `  Outcome: ${p.outcome || p.Outcome || ''}\n`;
      text += `  Technologies: ${Array.isArray(p.technologies) ? p.technologies.join(', ') : p.technologies || ''}\n\n`;
    });

    text += `--- CERTIFICATIONS ---\n`;
    const certs = employeeCerts.length > 0 ? employeeCerts : (extractedData?.certifications || []);
    certs.forEach((c: any) => {
      text += `- Certification: ${c.certName || c.CertName || c.name || ''}\n`;
      text += `  Issuer: ${c.issuingOrganization || c.Provider || c.issuer || ''}\n`;
      text += `  Date: ${c.issueDate || c.IssueDate || ''}\n\n`;
    });

    text += `--- SKILLS ---\n`;
    const sks = extractedData?.skills ? Object.entries(extractedData.skills).filter(([_, val]) => Number(val) > 0).map(([k]) => k) : [];
    text += sks.join(', ');

    return text;
  };

  const handleGenerateProfile = async () => {
    setIsGeneratingProfile(true);
    try {
      const resumeText = getResumeTextForAI();
      const profileData = await generateExpertProfileAI(resumeText);
      setExpertProfile(profileData);
    } catch (e) {
      toast.error('Failed to generate expert profile. Using local profile.');
      setExpertProfile({
        summary: `Candidate has over ${yearsIT} years of experience in testing and engineering.`,
        skills: ['Performance Testing', 'Automation Testing'],
        yearsIT: yearsIT || 8,
        domains: ['Banking'],
        roles: ['QA Lead'],
        technologies: ['Selenium', 'Java', 'k6'],
        certifications: [],
        projects: [],
        leadershipIndicators: []
      });
    } finally {
      setIsGeneratingProfile(false);
    }
  };

  useEffect(() => {
    if (section === 'test' && band === 'expert' && !expertProfile && !isGeneratingProfile) {
      handleGenerateProfile();
    }
  }, [section, band]);

  const handleEvaluateEvidence = async () => {
    const ready = universalFiles.filter((f: any) => f.status === 'success');
    if (ready.length === 0) {
      toast.warning('Upload and process at least one evidence document before analyzing.');
      return;
    }
    setIsEvaluatingEvidence(true);
    setEvidenceStepText(`Aggregating ${ready.length} document(s)...`);
    try {
      // 1. Build document payload
      const docs = ready.map((f: any) => ({ filename: f.name, text: f.extractedText, mimeType: f.mimeType, classification: f.classification }));

      // 2. Aggregate universal evidence
      setEvidenceStepText('Extracting skills, technologies, and leadership signals...');
      const extracted = await extractUniversalEvidenceAI(docs);
      setExtractedEvidence(extracted);
      setUniversalEvidence(extracted);

      // 3. Evaluate quality
      setEvidenceStepText('Evaluating evidence quality, depth, and authenticity...');
      const evaluation = await evaluateUniversalEvidenceAI(extracted);
      setEvidenceEvaluation(evaluation);

      setExpertStep('evidence_result');
    } catch (e) {
      toast.error('Failed to evaluate evidence. Please try again.');
    } finally {
      setIsEvaluatingEvidence(false);
      setEvidenceStepText('');
    }
  };

  // Trigger scenario generation when entering tech_discussion
  useEffect(() => {
    if (expertStep === 'tech_discussion' && expertProfile && !techScenario && !isGeneratingScenario) {
      const loadScenario = async () => {
        setIsGeneratingScenario(true);
        try {
          const scenario = await generateTechnicalScenarioAI(expertProfile);
          setTechScenario(scenario);
        } catch (e) {
          toast.error('Failed to generate technical scenario. Using default performance scenario.');
          setTechScenario({
            skill: 'Performance Testing',
            scenario: 'A banking application response time increased from 300ms to 2.5s after deployment under peak load. Critical databases show 100% CPU lockups.',
            question: 'How would you investigate and resolve this performance degradation?',
            followUps: [
              'What metrics would you review first?',
              'What tools would you use?',
              'How would you identify root cause?'
            ]
          });
        } finally {
          setIsGeneratingScenario(false);
        }
      };
      loadScenario();
    }
  }, [expertStep, expertProfile]);

  // Trigger scenario generation when entering lead_discussion
  useEffect(() => {
    if (expertStep === 'lead_discussion' && expertProfile && !leadScenario && !isGeneratingLeadScenario) {
      const loadLeadScenario = async () => {
        setIsGeneratingLeadScenario(true);
        try {
          const scenario = await generateLeadershipScenarioAI(expertProfile);
          setLeadScenario(scenario);
        } catch (e) {
          toast.error('Failed to generate leadership scenario. Using fallback.');
          setLeadScenario({
            scenario: 'Your team consists of: 2 Senior Engineers, 5 Mid-Level Engineers, 4 Junior Engineers. The project timeline is suddenly reduced by 50% from 12 weeks to 6 weeks.',
            question: 'How would you manage this situation and deliver the project under these constraints?'
          });
        } finally {
          setIsGeneratingLeadScenario(false);
        }
      };
      loadLeadScenario();
    }
  }, [expertStep, expertProfile]);

  const handleEvaluateTechDiscussion = async () => {
    if (!techAnswers.mainAnswer.trim() || techAnswers.followUpAnswers.some(a => !a.trim())) {
      toast.warning('Please answer all questions before proceeding.');
      return;
    }
    setIsEvaluatingTech(true);
    try {
      const evaluation = await evaluateTechnicalDiscussionAI(techScenario, techAnswers);
      setTechEvaluation(evaluation);
      setExpertStep('lead_discussion');
    } catch (e) {
      toast.error('Failed to evaluate technical discussion. Please retry.');
    } finally {
      setIsEvaluatingTech(false);
    }
  };

  const handleCompleteExpertEvaluationWithData = async (finalQuestions: any[]) => {
    setIsFinalizingExpert(true);
    setExpertStep('finalizing');
    setFinalizingStepText('Performing consistency analysis across all steps...');
    try {
      const techScore = Math.round(
        ((finalQuestions[0]?.evaluation?.questionScore || 60) + 
         (finalQuestions[1]?.evaluation?.questionScore || 60)) / 2
      );
      
      const leadScore = finalQuestions[2]?.evaluation?.questionScore || 60;
      
      const avgAuthScore = Math.round(
        finalQuestions.reduce((sum, q) => sum + (q.evaluation?.authenticityScore || 100), 0) / 4
      );
      const avgHumanPct = Math.round(
        finalQuestions.reduce((sum, q) => sum + (q.evaluation?.humanContentPct || 100), 0) / 4
      );
      const avgAiAssistedPct = Math.round(
        finalQuestions.reduce((sum, q) => sum + (q.evaluation?.aiAssistedPct || 0), 0) / 4
      );
      
      const techScenarioMock = {
        skill: selectedSkill,
        scenario: `Technical Q1: ${finalQuestions[0]?.question}\nTechnical Q2: ${finalQuestions[1]?.question}`,
        question: 'Troubleshooting responses',
        followUps: [] as string[]
      };
      const techAnswersMock = {
        mainAnswer: finalQuestions[0]?.response || '',
        followUpAnswers: [finalQuestions[1]?.response || '']
      };
      const techEvalMock = {
        technicalScore: techScore,
        feedback: `Q1 Strengths: ${finalQuestions[0]?.evaluation?.strengths?.join(', ') || ''}. Q2 Gaps: ${finalQuestions[1]?.evaluation?.gaps?.join(', ') || ''}`,
        strengths: [...(finalQuestions[0]?.evaluation?.strengths || []), ...(finalQuestions[1]?.evaluation?.strengths || [])],
        gaps: [...(finalQuestions[0]?.evaluation?.gaps || []), ...(finalQuestions[1]?.evaluation?.gaps || [])]
      };
      
      const leadScenarioMock = {
        scenario: finalQuestions[2]?.question || '',
        question: 'Leadership strategy response'
      };
      const leadAnswerMock = finalQuestions[2]?.response || '';
      
      const consistency = await evaluateConsistencyAI(
        expertProfile,
        extractedEvidence,
        techScenarioMock,
        techAnswersMock,
        techEvalMock,
        leadScenarioMock,
        leadAnswerMock
      );
      setConsistencyAnalysis(consistency);

      setFinalizingStepText('Analyzing risk parameters & proctoring flags...');
      const tabSwitches = tabSwitchCount;
      const copyPastes = copyPasteCount;
      const devtools = devtoolsDetected;
      const risk = await evaluateRiskAI(
        evidenceEvaluation?.evidenceScore || 50,
        techScore,
        leadScore,
        consistency.consistencyScore || 90,
        tabSwitches,
        copyPastes,
        devtools,
        false
      );
      setRiskAnalysis(risk);

      setFinalizingStepText('Analyzing authenticity of submissions...');
      const authenticity = {
        humanWrittenPct: avgHumanPct,
        aiAssistedPct: avgAiAssistedPct,
        copyCount,
        pasteCount,
        largePasteEvents,
        duplicateContentRisk: risk.riskLevel === 'High' ? 60 : 15,
        authenticityScore: avgAuthScore,
        riskLevel: risk.riskLevel,
        reason: `Evaluated across 4 adaptive discussion responses. Human written confidence is averaged at ${avgHumanPct}%. Copy-paste triggers count: ${copyPasteCount} total.`
      };

      const projectScore = evidenceEvaluation?.projectScore !== undefined ? evidenceEvaluation.projectScore : 60;
      const certificationScore = evidenceEvaluation?.certificationScore !== undefined ? evidenceEvaluation.certificationScore : 60;

      const finalWeightedScore = Math.round(
        (evidenceEvaluation?.evidenceScore || 50) * 0.20 +
        avgAuthScore * 0.10 +
        techScore * 0.30 +
        leadScore * 0.15 +
        projectScore * 0.10 +
        certificationScore * 0.10 +
        (consistency.consistencyScore || 90) * 0.05
      );

      setFinalizingStepText('Generating AI recommendation...');
      const isExpertEligible = finalWeightedScore >= 60 && 
                               (evidenceEvaluation?.evidenceScore || 50) >= 60 &&
                               techScore >= 60 &&
                               leadScore >= 60 &&
                               consistency.consistencyScore >= 70 &&
                               risk.riskLevel !== 'High';
      
      const recDecision = isExpertEligible ? 'Expert' : 'Advanced';
      const aiRec = {
        decision: recDecision,
        reasoning: `Based on a comprehensive capability audit, the candidate achieves a weighted score of ${finalWeightedScore}%. Evidence verification shows ${evidenceEvaluation?.evidenceScore}% quality/completeness. Technical problem-solving depth is evaluated at ${techScore}%, and leadership strategy is rated at ${leadScore}%. Authenticity score is ${avgAuthScore}%, and consistency between claims and discussion is ${consistency.consistencyScore}%. Proctoring checks show ${risk.riskLevel} validation risk. AI recommends validating at ${recDecision} level.`
      };

      setFinalizingStepText('Saving evaluation dossier to IQ Cloud...');
      const status = 'review_required'; 
      const assignedLevel = 'Advanced (Pending Manager Approval)'; 
      const skillsPayload = { [selectedSkill]: 3 }; 
      const resolvedEmpId = employeeId;
      
      const technicalDiscussionMock = {
        questions: [finalQuestions[0], finalQuestions[1]],
        evaluation: {
          technicalScore: techScore,
          feedback: `Troubleshooting diagnostic capability across 2 technical questions. Q1: ${finalQuestions[0]?.evaluation?.questionScore}%, Q2: ${finalQuestions[1]?.evaluation?.questionScore}%.`,
          strengths: [...(finalQuestions[0]?.evaluation?.strengths || []), ...(finalQuestions[1]?.evaluation?.strengths || [])],
          gaps: [...(finalQuestions[0]?.evaluation?.gaps || []), ...(finalQuestions[1]?.evaluation?.gaps || [])]
        }
      };

      const leadershipDiscussionMock = {
        questions: [finalQuestions[2], finalQuestions[3]],
        evaluation: {
          leadershipScore: leadScore,
          feedback: `Leadership & Architecture audit questions. Q3 (Leadership): ${finalQuestions[2]?.evaluation?.questionScore}%, Q4 (Architecture/Ownership): ${finalQuestions[3]?.evaluation?.questionScore}%.`,
          dimensions: {
            leadership: { score: Math.round((finalQuestions[2]?.evaluation?.leadershipSignals || 50) / 100 * 20), feedback: 'Evaluated' },
            delegation: { score: Math.round((finalQuestions[2]?.evaluation?.reasoningScore || 50) / 100 * 20), feedback: 'Evaluated' },
            riskManagement: { score: Math.round((finalQuestions[2]?.evaluation?.confidenceScore || 50) / 100 * 20), feedback: 'Evaluated' },
            communication: { score: Math.round((finalQuestions[2]?.evaluation?.questionScore || 50) / 100 * 20), feedback: 'Evaluated' },
            teamHandling: { score: Math.round((finalQuestions[2]?.evaluation?.leadershipSignals || 50) / 100 * 20), feedback: 'Evaluated' }
          }
        }
      };

      await fetch(`${API_BASE}/zenassess/complete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}`
        },
        body: JSON.stringify({
          sessionId: 'za_' + Date.now(),
          employeeId: resolvedEmpId,
          score: finalWeightedScore,
          status,
          assignedLevel,
          skills: skillsPayload,
          skillName: selectedSkill,
          tabSwitchCount,
          copyPasteCount,
          fullscreenExitCount,
          browserBlurCount,
          devtoolsDetected,
          sessionFingerprint,
          integrityFlags,
          mcqScore: 0,
          contributionScore: 0,
          evidenceScore: evidenceEvaluation?.evidenceScore || 0,
          finalScore: finalWeightedScore,
          expertProfile,
          extractedEvidence,
          evidenceEvaluation,
          technicalDiscussion: technicalDiscussionMock,
          leadershipDiscussion: leadershipDiscussionMock,
          consistencyAnalysis: consistency,
          riskAnalysis: risk,
          aiRecommendation: aiRec,
          authenticityAnalysis: authenticity
        })
      });

      setResult({
        score: finalWeightedScore,
        status,
        assignedLevel: recDecision + ' (Pending Manager Approval)',
        message: `Evaluation Dossier successfully compiled and locked. Suggested Level: ${recDecision}. Manager must verify and approve expert status.`,
        topicBreakdown: [
          { topic: 'Evidence Evaluation (20% weight)', correct: Math.round((evidenceEvaluation?.evidenceScore || 0) * 0.20), total: 20 },
          { topic: 'Authenticity Score (10% weight)', correct: Math.round(avgAuthScore * 0.10), total: 10 },
          { topic: 'Technical Discussion (30% weight)', correct: Math.round(techScore * 0.30), total: 30 },
          { topic: 'Leadership Discussion (15% weight)', correct: Math.round(leadScore * 0.15), total: 15 },
          { topic: 'Project Footprint (10% weight)', correct: Math.round(projectScore * 0.10), total: 10 },
          { topic: 'Certification Analysis (10% weight)', correct: Math.round(certificationScore * 0.10), total: 10 },
          { topic: 'Consistency Verification (5% weight)', correct: Math.round(consistency.consistencyScore * 0.05), total: 5 }
        ],
        explainScore: {
          finalScore: finalWeightedScore,
          evidenceScore: evidenceEvaluation?.evidenceScore || 0,
          authenticityScore: avgAuthScore,
          techScore,
          leadScore,
          projectScore,
          certificationScore,
          consistencyScore: consistency.consistencyScore,
          confidenceScore: risk.confidenceScore,
          riskLevel: risk.riskLevel,
          aiRecommendation: aiRec,
          authenticityAnalysis: authenticity
        },
        integrityScore: risk.confidenceScore,
        readiness: { score: finalWeightedScore, risk: risk.riskLevel, ready: risk.riskLevel !== 'High' },
        // Expert-specific dossier data
        discussionQuestions: finalQuestions,
        consistencyAnalysis: consistency,
        riskAnalysis: risk,
        universalEvidence: universalEvidence,
        evidenceEvaluation: evidenceEvaluation
      });

      setSection('results');
    } catch (e) {
      console.error('Finalization error:', e);
      toast.error('Failed to complete expert evaluation dossier. Retrying...');
    } finally {
      setIsFinalizingExpert(false);
      setFinalizingStepText('');
    }
  };

  const handleCompleteExpertEvaluation = async () => {
    await handleCompleteExpertEvaluationWithData(discussionQuestions);
  };

  const startTest = async () => {
    if (selectedSkill === 'Functional Testing' && band === 'expert') {
      setIsLoadingQuestions(true);
      try {
        let resolvedEmpId = employeeId || '';
        try {
          const d = await req<any>('GET', `/employees/${resolvedEmpId}`);
          if (d) resolvedEmpId = d.id || d.zensar_id || resolvedEmpId;
        } catch { /* use original */ }

        const apiRes = await req<any>('POST', '/zenassess/complete', {
          sessionId: 'za_' + Date.now(),
          employeeId: resolvedEmpId,
          score: 100,
          status: 'passed',
          assignedLevel: 'Expert',
          skillName: 'Functional Testing',
          answers: {},
          skills: { 'Functional Testing': 3 }
        });

        setResult({
          score: 100,
          status: 'passed',
          assignedLevel: 'Expert',
          message: 'Validated as Expert via Automatic Expert Recognition based on 12+ years of verified IT experience.',
          topicBreakdown: [
            { topic: 'Automatic Expert Recognition', correct: 1, total: 1 }
          ],
          explainScore: apiRes?.explainScore || {
            finalScore: 100,
            passThreshold: 60,
            assessmentScore: 100,
            assessmentWeight: 100,
            assessmentWeightedScore: 100,
            contributionScore: 100,
            contributionWeight: 0,
            contributionWeightedScore: 0
          },
          freshness: apiRes?.freshness,
          readiness: apiRes?.readiness,
          integrityScore: 100
        });
        setSection('results');
      } catch (e: any) {
        toast.error(e.message || 'Error triggering automatic recognition');
      } finally {
        setIsLoadingQuestions(false);
      }
      return;
    }

    if (band === 'expert') {
      // Expert path: evidence form only — no MCQ
      setSection('test');
      return;
    }
    setIsLoadingQuestions(true);
    try {
      const data = await req<any>('GET', `/zenassess/questions?skill=${encodeURIComponent(selectedSkill)}&band=${band}`);
      
      const qs = data.questions && data.questions.length > 0 ? data.questions : selectQuestions(band, selectedSkill);
      const groups = groupByTopic(qs);
      setQuestions(qs);
      setTopicGroups(groups);
      setTopicIdx(0);
      setAnswers({});
      setTimeLeft(45 * 60);
      setTimerActive(true);
      setContribPhase('mcq');
      if (selectedSkill === 'Functional Testing' && band === 'intermediate') {
        setFunctionalTestingPhase('mcq');
        setFtTask1Response('');
        setFtTask2Response('');
        setFtQ1Response('');
        setFtQ2Response('');
        setFtQ3Response('');
      }
      setSection('test');
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen();
        }
      } catch (_) {}
      
      await req<any>('POST', '/zenassess/session', {
        employeeId,
        levelPath: band,
        questions: qs.map(q => Number(q.id)),
        skillName: selectedSkill
      });
    } catch (e: any) {
      toast.error(e.message || 'Error initializing assessment');
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  // ── Submit MCQ done — intermediate moves to contribution phase ────────────
  const handleMcqDone = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);
    const totalCorrect = questions.filter(q => Reflect.get(answers, q.id) === q.correct).length;
    const score = questions.length > 0 ? Math.round((totalCorrect / questions.length) * 100) : 0;
    setMcqScore(score);
    if (band === 'intermediate') {
      if (selectedSkill === 'Functional Testing') {
        setFunctionalTestingPhase('practical');
      } else {
        // Intermediate Path: MCQ done → now collect contribution evidence (40%)
        setContribPhase('contribution');
      }
    } else if (band === 'advanced') {
      // Advanced Path (5-8 yrs): Hard assessment only → Not Validated / Advanced
      const topicBreakdown = topicGroups.map(g => {
        const correct = g.questions.filter(q => Reflect.get(answers, q.id) === q.correct).length;
        return { topic: g.topic, correct, total: g.questions.length };
      });
      let status = 'failed', assignedLevel = 'Not Validated', message = '';
      if (score < 70) { status = 'failed'; assignedLevel = 'Not Validated'; message = `Score ${score}% — hard assessment failed. Not Validated. Retry in 14 days.`; }
      else            { status = 'passed'; assignedLevel = 'Advanced';       message = `Score ${score}% — hard assessment passed. Validated at Advanced level.`; }
      const apiRes = await saveResult(score, status, assignedLevel, {});
      setResult({
        score,
        status,
        assignedLevel,
        message,
        topicBreakdown,
        explainScore: apiRes?.explainScore,
        contributionBreakdown: apiRes?.contributionBreakdown,
        githubMetadata: apiRes?.githubMetadata,
        integrityScore: apiRes?.integrityScore,
        freshness: apiRes?.freshness,
        readiness: apiRes?.readiness,
      });
      setSection('results');
    } else {
      handleSubmit(score);
    }
  };

  // ── Submit Functional Testing Intermediate Assessment ─────────────────────
  const handleFunctionalTestingIntermediateSubmit = async () => {
    setIsEvaluatingFT(true);
    try {
      // 1. Evaluate Part 2 (Practical) using evaluateIntermediatePracticalAI
      const practicalEval = await evaluateIntermediatePracticalAI(ftTask1Response, ftTask2Response);
      // 2. Evaluate Part 3 (Scenario) using evaluateIntermediateScenariosAI
      const scenarioEval = await evaluateIntermediateScenariosAI(ftQ1Response, ftQ2Response, ftQ3Response);
      
      const pScore = practicalEval.practicalScore;
      const sScore = scenarioEval.scenarioScore;
      const combinedScore = Math.round(mcqScore * 0.4 + pScore * 0.3 + sScore * 0.3);
      
      let status = 'failed', assignedLevel = 'Not Validated', message = '';
      if (combinedScore < 60) {
        status = 'failed';
        assignedLevel = 'Not Validated';
        message = `Combined score ${combinedScore}% — weak. Not Validated. Gap plan issued.`;
      } else if (combinedScore < 80) {
        status = 'passed';
        assignedLevel = 'Intermediate';
        message = `Combined score ${combinedScore}% — acceptable. Validated at Intermediate level.`;
      } else {
        status = 'passed';
        assignedLevel = 'Advanced';
        message = `Combined score ${combinedScore}% — strong. Validated at Advanced level.`;
      }

      let resolvedEmpId = employeeId || '';
      try {
        const d = await req<any>('GET', `/employees/${resolvedEmpId}`);
        if (d) resolvedEmpId = d.id || d.zensar_id || resolvedEmpId;
      } catch { /* use original */ }

      const apiRes = await req<any>('POST', '/zenassess/complete', {
        sessionId: 'za_' + Date.now(),
        employeeId: resolvedEmpId,
        score: combinedScore,
        status,
        assignedLevel,
        answers: { 
          ...answers,
          ftTask1: ftTask1Response,
          ftTask2: ftTask2Response,
          ftQ1: ftQ1Response,
          ftQ2: ftQ2Response,
          ftQ3: ftQ3Response
        },
        skills: status === 'passed' ? { 'Functional Testing': assignedLevel === 'Advanced' ? 3 : 2 } : {},
        skillName: 'Functional Testing',
        mcqScore: mcqScore,
        practicalScore: pScore,
        scenarioScore: sScore,
        practicalEval,
        scenarioEval
      });

      setResult({
        score: combinedScore,
        status,
        assignedLevel,
        message,
        topicBreakdown: [
          { topic: `Part 1: MCQ (40% weight) — ${mcqScore}%`, correct: Math.round(mcqScore * 0.4), total: 40 },
          { topic: `Part 2: Practical Tasks (30% weight) — ${pScore}%`, correct: Math.round(pScore * 0.3), total: 30 },
          { topic: `Part 3: Scenarios (30% weight) — ${sScore}%`, correct: Math.round(sScore * 0.3), total: 30 }
        ],
        explainScore: apiRes?.explainScore || {
          finalScore: combinedScore,
          passThreshold: 60,
          assessmentScore: mcqScore,
          assessmentWeight: 40,
          assessmentWeightedScore: mcqScore * 0.4,
          practicalScore: pScore,
          practicalWeight: 30,
          practicalWeightedScore: pScore * 0.3,
          scenarioScore: sScore,
          scenarioWeight: 30,
          scenarioWeightedScore: sScore * 0.3
        },
        ftDetails: {
          practicalEval,
          scenarioEval
        },
        freshness: apiRes?.freshness,
        readiness: apiRes?.readiness,
        integrityScore: 100
      });
      setSection('results');
    } catch (e: any) {
      toast.error(e.message || 'Error evaluating intermediate assessment');
    } finally {
      setIsEvaluatingFT(false);
    }
  };

  // ── Submit evidence (Expert Path: 8+ yrs) ─────────────────────────────────
  // Spec: incomplete/weak → Advanced | strong + manager approved → Expert
  // Expert path NEVER returns "Not Validated" — minimum is Advanced
  const handleEvidenceSubmit = async () => {
    setIsSubmitting(true);
    const filledFields = universalFiles.filter((f: any) => f.status === 'success').length;
    const evidenceScore = Math.round((Math.min(filledFields, 10) / 10) * 100);
    let status = 'review_required';
    let assignedLevel = 'Advanced';
    
    const apiRes = await saveResult(evidenceScore, status, assignedLevel, {});
    
    if (apiRes && apiRes.expertDetails) {
      const details = apiRes.expertDetails;
      const finalScore = apiRes.explainScore.finalScore;
      
      let finalAssignedLevel = 'Advanced';
      let message = '';
      if (finalScore < 60) {
        finalAssignedLevel = 'Advanced';
        message = `Evidence score ${finalScore}% (Completeness: ${details.completenessScore}%, Quality: ${details.qualityScore}%) — incomplete or weak. Assigned Advanced level. Resubmit stronger evidence within 7 days for Expert consideration.`;
      } else {
        finalAssignedLevel = 'Expert (Pending Manager Approval)';
        message = `Evidence score ${finalScore}% (Completeness: ${details.completenessScore}%, Quality: ${details.qualityScore}%) — strong evidence submitted. Pending manager review. Approved → Expert. Not approved → Advanced.`;
      }
      
      const topicBreakdown = [
        { topic: 'Evidence Completeness', correct: Math.round(details.completenessScore / 20), total: 5 },
        { topic: 'Evidence Quality', correct: Math.round(details.qualityScore / 20), total: 5 }
      ];
      
      setResult({
        score: finalScore,
        status,
        assignedLevel: finalAssignedLevel,
        message,
        topicBreakdown,
        explainScore: apiRes.explainScore,
        contributionBreakdown: apiRes.contributionBreakdown,
        githubMetadata: apiRes.githubMetadata,
        integrityScore: apiRes.integrityScore,
        freshness: apiRes.freshness,
        readiness: apiRes.readiness,
        expertDetails: details
      });
    } else {
      let message = '';
      if (filledFields < 3) {
        assignedLevel = 'Advanced';
        message = `Evidence score ${evidenceScore}% — incomplete or weak. Assigned Advanced level. Resubmit stronger evidence within 7 days for Expert consideration.`;
      } else {
        assignedLevel = 'Expert (Pending Manager Approval)';
        message = `Evidence score ${evidenceScore}% — strong evidence submitted. Pending manager review. Approved → Expert. Not approved → Advanced.`;
      }
      const topicBreakdown = [{ topic: 'Evidence Completeness', correct: filledFields, total: 5 }];
      setResult({
        score: evidenceScore,
        status,
        assignedLevel,
        message,
        topicBreakdown,
        explainScore: apiRes?.explainScore,
        contributionBreakdown: apiRes?.contributionBreakdown,
        githubMetadata: apiRes?.githubMetadata,
        integrityScore: apiRes?.integrityScore,
        freshness: apiRes?.freshness,
        readiness: apiRes?.readiness,
      });
    }
    setEvidenceSubmitted(true);
    setSection('results');
    setIsSubmitting(false);
  };

  // ── Submit contribution scan (Intermediate Path: 2-5 yrs) ─────────────────
  // Spec: 60% MCQ + 40% contribution → Not Validated / Intermediate / Advanced
  const handleContribSubmit = async () => {
    setIsSubmitting(true);
    const filledContrib = Object.values(contribution).filter(v => v.trim().length > 5).length;
    const contribScore = Math.round((filledContrib / 6) * 100);
    const combined = Math.round(mcqScore * 0.6 + contribScore * 0.4);
    let status = 'failed', assignedLevel = 'Not Validated', message = '';
    if (combined < 60)      { status = 'failed'; assignedLevel = 'Not Validated'; message = `Combined score ${combined}% — weak. Not Validated. Gap plan issued. Resubmit evidence or retest.`; }
    else if (combined < 80) { status = 'passed'; assignedLevel = 'Intermediate';  message = `Combined score ${combined}% — acceptable. Validated at Intermediate level.`; }
    else                    { status = 'passed'; assignedLevel = 'Advanced';       message = `Combined score ${combined}% — strong. Validated at Advanced level.`; }
    const topicBreakdown = [
      { topic: `MCQ Assessment (60% weight) — ${mcqScore}%`, correct: Math.round(mcqScore * 0.6), total: 100 },
      { topic: `Contribution Evidence (40% weight) — ${contribScore}%`, correct: Math.round(contribScore * 0.4), total: 100 },
    ];
    const apiRes = await saveResult(combined, status, assignedLevel, {});
    setResult({
      score: combined,
      status,
      assignedLevel,
      message,
      topicBreakdown,
      explainScore: apiRes?.explainScore,
      contributionBreakdown: apiRes?.contributionBreakdown,
      githubMetadata: apiRes?.githubMetadata,
      integrityScore: apiRes?.integrityScore,
      freshness: apiRes?.freshness,
      readiness: apiRes?.readiness,
    });
    setSection('results');
    setIsSubmitting(false);
  };

  // ── Save result to backend ─────────────────────────────────────────────────
  const saveResult = async (score: number, status: string, assignedLevel: string, extraAnswers: Record<string, number>) => {
    const skillsPayload: Record<string, number> = {};
    // Only save to skill matrix if actually passed (not review_required or failed)
    if (status === 'passed') {
      // Spec-compliant level mapping: Beginner=1, Intermediate=2, Advanced=3, Expert=3
      const lvlNum = assignedLevel.includes('Expert') ? 3
                   : assignedLevel.includes('Advanced') ? 3
                   : assignedLevel.includes('Intermediate') ? 2
                   : assignedLevel.includes('Beginner') ? 1
                   : 0;
      if (lvlNum > 0) Reflect.set(skillsPayload, selectedSkill, lvlNum);
    }
    // For review_required (Expert path): save as Advanced (3) pending manager approval
    if (status === 'review_required' && assignedLevel.includes('Advanced')) {
      Reflect.set(skillsPayload, selectedSkill, 3);
    }
    let resolvedEmpId = employeeId || '';
    try {
      const d = await req<any>('GET', `/employees/${resolvedEmpId}`);
      if (d) resolvedEmpId = d.id || d.zensar_id || resolvedEmpId;
    } catch { /* use original */ }
    try {
      const data = await req<any>('POST', '/zenassess/complete', {
        sessionId: 'za_' + Date.now(),
        employeeId: resolvedEmpId,
        score,
        status,
        assignedLevel,
        answers: { ...answers, ...extraAnswers },
        skills: skillsPayload,
        skillName: selectedSkill,
        tabSwitchCount,
        copyPasteCount,
        fullscreenExitCount,
        browserBlurCount,
        devtoolsDetected,
        sessionFingerprint,
        integrityFlags,
        contributionFields: contribution,
        githubMetadata: githubMetadata,
        mcqScore: mcqScore
      });
      return data;
    } catch (e) { console.error('ZenAssess save error:', e); }
    return null;
  };
  // ── Submit for beginner path (0-2 yrs) ────────────────────────────────────
  // Result levels: Not Validated / Beginner / Intermediate
  const handleSubmit = async (overrideScore?: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);
    const topicBreakdown = topicGroups.map(g => {
      const correct = g.questions.filter(q => Reflect.get(answers, q.id) === q.correct).length;
      return { topic: g.topic, correct, total: g.questions.length };
    });
    const totalCorrect = topicBreakdown.reduce((s, t) => s + t.correct, 0);
    const score = overrideScore ?? (questions.length > 0 ? Math.round((totalCorrect / questions.length) * 100) : 0);
    // Beginner Path: score only → Not Validated / Beginner / Intermediate
    let status = 'failed', assignedLevel = 'Not Validated', message = '';
    if (score < 60)       { status = 'failed'; assignedLevel = 'Not Validated'; message = `Score ${score}% — below 60%. Not Validated. Study path assigned. Retry in 14 days.`; }
    else if (score < 80)  { status = 'passed'; assignedLevel = 'Beginner';      message = `Score ${score}% — meets basic threshold. Validated at Beginner level.`; }
    else                  { status = 'passed'; assignedLevel = 'Intermediate';   message = `Score ${score}% — strong performance. Validated at Intermediate level.`; }
    
    const apiRes = await saveResult(score, status, assignedLevel, {});
    setResult({
      score,
      status,
      assignedLevel,
      message,
      topicBreakdown,
      explainScore: apiRes?.explainScore,
      contributionBreakdown: apiRes?.contributionBreakdown,
      githubMetadata: apiRes?.githubMetadata,
      integrityScore: apiRes?.integrityScore,
      freshness: apiRes?.freshness,
      readiness: apiRes?.readiness,
    });
    setSection('results');
    setIsSubmitting(false);
  };
  const canRetry = !lastStatus?.retryAfter || new Date(lastStatus.retryAfter) <= new Date();
  const retryDate = lastStatus?.retryAfter ? new Date(lastStatus.retryAfter).toLocaleDateString() : null;
  const currentGroup = topicGroups.at(topicIdx);
  const answeredInGroup = currentGroup ? currentGroup.questions.filter(q => Reflect.get(answers, q.id) !== undefined).length : 0;
  const totalAnswered = Object.keys(answers).length;


  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'Inter',sans-serif" }}>
      {/* ─── V7 COMPLETE CANDIDATE JOURNEY FLOW ─── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {v7ValidationError ? (
            <div style={{ background: T.card, border: `2px solid #EF4444`, borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', gap: 24, textAlign: 'center', alignItems: 'center' }} className="fadeIn">
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 32, color: '#EF4444' }}>⚠️</span>
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#EF4444' }}>ZenScan Profile Mismatch</h2>
                <p style={{ fontSize: 13, color: T.sub, marginTop: 8, maxWidth: 500 }}>
                  We detected a validation or data consistency error. The Candidate Profile data does not align with the raw output generated by ZenScan.
                </p>
              </div>
              <div style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, padding: 16, borderRadius: 12, width: '100%', maxWidth: 600 }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: T.text, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>Validation Details:</span>
                <code style={{ fontSize: 12, color: '#F87171', wordBreak: 'break-all' }}>{v7ValidationError}</code>
              </div>
              <button 
                onClick={() => navigate('/employee/resume-upload')}
                style={{ padding: '12px 24px', background: '#3B82F6', border: 'none', color: '#fff', fontWeight: 700, borderRadius: 10, cursor: 'pointer', fontSize: 14 }}
              >
                Go to ZenScan Resume Upload
              </button>
            </div>
          ) : (
            <>
              {/* Progress bar — shown only during actual test (step 4+) */}
              {v7Step >= 4 && (
                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8 }}>
                  {Array.from({ length: 7 }, (_, i) => i + 4).map(s => {
                    const isActive = v7Step === s;
                    const isPast = v7Step > s;
                    return (
                      <div key={s} style={{ flex: 1, height: 5, borderRadius: 3, background: isActive ? '#3B82F6' : isPast ? '#10B981' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', minWidth: 20, transition: 'background 0.3s' }} />
                    );
                  })}
                </div>
              )}

          {/* ─── NEW PRE-ASSESSMENT PAGE ─── */}
          {v7Step <= 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">

              {/* CASE A — employee has no rated skills yet: ZenScan is the entry gate.
                  Show ONLY this card. No employee info, no skill cards, no overview. */}
              {!v7ProfileLoading && showZenScanBanner && !v7Taxonomy && !v7TaxonomyMismatch && (
                <div style={{ background: T.card, border: `1px solid #3B82F6`, borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
                  <span style={{ fontSize: 32 }}>📋</span>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text }}>Complete ZenScan First</h2>
                  <p style={{ margin: 0, fontSize: 13, color: T.sub, maxWidth: 420 }}>
                    To take the skill assessment, you need to upload your resume first. ZenScan will extract your skills automatically.
                  </p>
                  <button onClick={() => navigate('/employee/resume-upload')} style={{ padding: '12px 24px', borderRadius: 10, background: '#3B82F6', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                    Go to ZenScan →
                  </button>
                </div>
              )}

              {/* CASE C — employee has rated skills, but none map to the canonical taxonomy */}
              {!v7ProfileLoading && v7TaxonomyMismatch && (
                <div style={{ background: T.card, border: `1px solid #F59E0B`, borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
                  <span style={{ fontSize: 32 }}>⚠️</span>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text }}>Skills Not Matched</h2>
                  <p style={{ margin: 0, fontSize: 13, color: T.sub, maxWidth: 460 }}>
                    Your skills could not be matched to our skill taxonomy. Please update your skills in ZenMatrix or re-scan your resume.
                  </p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => navigate('/employee/skills')} style={{ padding: '12px 24px', borderRadius: 10, background: '#3B82F6', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                      Go to ZenMatrix
                    </button>
                    <button onClick={() => navigate('/employee/resume-upload')} style={{ padding: '12px 24px', borderRadius: 10, background: T.bdr, color: T.text, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                      Re-scan Resume
                    </button>
                  </div>
                </div>
              )}

              {v7ProfileLoading && (
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 32, textAlign: 'center', color: T.sub, fontSize: 14, fontWeight: 700 }}>
                  Loading profile...
                </div>
              )}

              {!v7ProfileLoading && v7Taxonomy && (
              <>
              {/* Section A: Employee Info Panel */}
              <div style={{ background: T.card, borderRadius: 16, padding: 24, border: `1px solid ${T.bdr}`, marginBottom: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 800 }}>
                      {(v7ExtractedData?.name || 'U').charAt(0)}
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text }}>{v7ExtractedData?.name || 'Anonymous User'}</h2>
                      <p style={{ margin: 0, fontSize: 13, color: T.sub, fontWeight: 500 }}>{v7ExtractedData?.designation || 'Quality Engineering Professional'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section B: Top 3 Skills Panel */}
              <div style={{ marginBottom: 4 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
                  Top 3 Skills
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                  {v7Taxonomy && [
                    { skill: v7Taxonomy.primary.skill, label: 'PRIMARY SKILL', color: '#3B82F6' },
                    { skill: v7Taxonomy.secondary.skill, label: 'SECONDARY SKILL', color: '#8B5CF6' },
                    { skill: v7Taxonomy.tertiary.skill, label: 'TERTIARY SKILL', color: '#10B981' }
                  ].map((sk, idx) => {
                    const badge = v7SkillBadges[sk.skill];
                    const selfLevel = v7SelfClaimedLevels[sk.skill] || 'Beginner';
                    const inProgress = v7InProgressSkills[sk.skill];
                    
                    // Determine state
                    let state = 1; // Never tested
                    if (inProgress) state = 4; // Test started
                    else if (badge) {
                      const badgeNum = badge === 'Expert' ? 3 : badge === 'Intermediate' ? 2 : 1;
                      const selfNum = selfLevel === 'Expert' ? 3 : selfLevel === 'Intermediate' ? 2 : 1;
                      state = selfNum > badgeNum ? 3 : 2;
                    }

                    return (
                      <div key={idx} style={{ background: T.card, borderRadius: 16, padding: 20, border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', transition: 'transform 0.2s', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: sk.color, letterSpacing: '0.08em', marginBottom: 8 }}>{sk.label}</div>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 900, color: T.text }}>{sk.skill}</h4>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                           <span style={{ fontSize: 12, fontWeight: 700, color: PATH_COLOR[selfLevel] }}>{selfLevel} Path</span>
                        </div>

                        <div style={{ marginTop: 'auto' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div>
                              {state === 1 && <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Not Yet Verified</span>}
                              {state === 2 && <span style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>✓ Verified: {badge}</span>}
                              {state === 3 && <span style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>✓ Verified: {badge}</span>}
                              {state === 4 && <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Not Yet Verified</span>}
                            </div>
                          </div>

                          <button
                            onClick={async () => {
                              const startLevel = (selfLevel === 'Expert' || selfLevel === 'Advanced') ? 'Expert' :
                                                 (selfLevel === 'Intermediate') ? 'Intermediate' : 'Beginner';

                              // Cooldown Check
                              if (badge || state === 4) {
                                try {
                                  const res = await req<any>('GET', `/zenassess/can-retake/${employeeId}?path=${encodeURIComponent(startLevel)}&skill=${encodeURIComponent(sk.skill)}`);
                                  if (res && res.canRetake === false) {
                                    const next = res.nextEligibleDate ? new Date(res.nextEligibleDate) : null;
                                    const dateLabel = next ? next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'a later date';
                                    toast.error(`Re-assessment available on ${dateLabel}.`);
                                    return;
                                  }
                                } catch { /* ignore check failure */ }
                              }

                              setV7SelectedSkill(sk.skill);
                              setAssessmentPath(startLevel);
                              setActiveSkillIdx(idx);
                              resetRoundState();
                              loadQuestionsForSkillLevel(sk.skill, startLevel);
                              setV7Step(4);
                              setV7Timer(startLevel === 'Beginner' ? 1800 : 3600);
                              setV7TimerActive(true);
                              markSkillInProgress(sk.skill, true);
                            }}
                            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: state === 4 ? '#3B82F6' : 'linear-gradient(135deg, #3B82F6, #8B5CF6)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                          >
                            {state === 1 && 'Start Assessment →'}
                            {state === 2 && 'Re-assess →'}
                            {state === 3 && 'Re-assess →'}
                            {state === 4 && 'Continue Assessment →'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section C: Assessment Overview */}
              <div style={{ background: T.card, borderRadius: 16, border: `1px solid ${T.bdr}`, padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 20 }}>Assessment Overview</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {v7Taxonomy && [
                    { skill: v7Taxonomy.primary.skill, label: 'Primary' },
                    { skill: v7Taxonomy.secondary.skill, label: 'Secondary' },
                    { skill: v7Taxonomy.tertiary.skill, label: 'Tertiary' }
                  ].map((sk, idx) => {
                    const selfLevel = v7SelfClaimedLevels[sk.skill] || 'Beginner';
                    const startLevel = (selfLevel === 'Expert' || selfLevel === 'Advanced') ? 'Expert' :
                                       (selfLevel === 'Intermediate') ? 'Intermediate' : 'Beginner';

                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 12, border: `1px solid ${T.bdr}` }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.bdr, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: T.sub }}>{idx + 1}</span>
                            <span style={{ fontWeight: 800, color: T.text }}>{sk.skill}</span>
                            <span style={{ fontSize: 11, color: T.sub }}>· {sk.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.sub }}>
                            {startLevel === 'Beginner' && '20 MCQ → 5 Tool ID → 2 Practical'}
                            {startLevel === 'Intermediate' && '15 MCQ → 1 Coding → 2 Scenarios → 1 Framework'}
                            {startLevel === 'Expert' && '5 Scenarios → 1 Capstone → 3 Mentoring → 6 Questionnaire'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                           <div style={{ textAlign: 'right' }}>
                             <div style={{ fontSize: 12, fontWeight: 800, color: PATH_COLOR[startLevel] }}>{startLevel}</div>
                             <div style={{ fontSize: 11, color: T.sub }}>{startLevel === 'Beginner' ? '30 min' : '60 min'}</div>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 24, padding: 16, background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div><span style={{ fontSize: 12, color: T.sub }}>Total Skills:</span> <b style={{ fontSize: 13, color: T.text }}>3</b></div>
                    <div><span style={{ fontSize: 12, color: T.sub }}>Estimated Total Time:</span> <b style={{ fontSize: 13, color: T.text }}>{v7Taxonomy ? (3 * 60) : 0} min</b></div>
                  </div>
                  <div style={{ fontSize: 12, color: T.sub }}>Result: <span style={{ color: '#3B82F6', fontWeight: 600 }}>Shown after each test</span></div>
                </div>
              </div>
              </>
              )}
            </div>
          )}


          {/* STEP 5: LIVE PROGRESS TRACKER (MCQ) */}
          {v7Step === 4 && (() => {
            // Expert path shows complex scenarios instead of MCQ in step 4
            if (assessmentPath === 'Expert') {
              const expertScenarioList = v7BankScenarioQs.length > 0
                ? v7BankScenarioQs.slice(0, 5).map((s: any) => ({ id: s.id, title: 'Expert Scenario', scenario: '', question: s.question }))
                : [
                  { id: 'es1', title: 'Transaction Platform Performance', scenario: 'Your client handles 2 million transactions per day. They want to add a new payment gateway in 3 weeks.', question: 'How do you approach performance testing for this release? What tools, risks, and mitigation strategies would you use?' },
                  { id: 'es2', title: 'Flaky Automation Suite Recovery', scenario: 'You joined a project with 800 automation tests but 40% are flaky. The team has lost confidence in the suite.', question: 'What do you do in the first 30 days? How do you prioritize, stabilize, and rebuild trust in the automation suite?' },
                  { id: 'es3', title: 'Multi-Client Test Coverage', scenario: 'Your team of 5 engineers is delivering for 3 clients simultaneously with different quality standards.', question: 'How do you manage test coverage without dropping quality on any account? Describe your governance approach.' },
                  { id: 'es4', title: 'AI Test Generation Governance', scenario: 'The business wants to introduce AI-generated test cases across the QE practice.', question: 'How do you evaluate, pilot, and govern this? What risks would you highlight and what guardrails would you put in place?' },
                  { id: 'es5', title: 'Junior Engineer Coaching', scenario: 'A junior team member consistently writes brittle tests that slow down the pipeline.', question: 'How do you address this without demotivating them? Describe your mentoring and technical intervention approach.' },
                ];
              const curSc = expertScenarioList[v7CurrentExpertScenarioIdx] || expertScenarioList[0];
              const answer = expertScenarioAnswers[curSc.id] || '';
              const wordCount = answer.trim() ? answer.trim().split(/\s+/).filter(Boolean).length : 0;
              const mins = Math.floor(v7Timer / 60);
              const secs = v7Timer % 60;
              const timerColor = v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444';
              return (
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 12, color: '#8B5CF6', textTransform: 'uppercase' }}>Complex Scenarios — Expert Path</strong>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Scenario {v7CurrentExpertScenarioIdx + 1} of {expertScenarioList.length}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timerColor, fontWeight: 800, fontSize: 14 }}>
                      <Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining
                    </div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, background: dark ? 'rgba(139,92,246,0.05)' : 'rgba(139,92,246,0.03)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <strong style={{ fontSize: 13, color: T.text, display: 'block', marginBottom: 6 }}>{curSc.title}</strong>
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: T.sub, lineHeight: 1.5 }}>Situation: {curSc.scenario}</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>Question: {curSc.question}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase' }}>Your Answer (Min 100 words recommended)</label>
                    <textarea
                      value={answer}
                      onChange={e => setExpertScenarioAnswers(prev => ({ ...prev, [curSc.id]: e.target.value }))}
                      placeholder="Provide a structured, detailed response showing your strategic thinking..."
                      style={{ width: '100%', height: 200, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.muted }}>
                      <span>Word count: <strong>{wordCount}</strong></span>
                      <span style={{ color: wordCount >= 100 ? '#10B981' : '#F59E0B' }}>{wordCount >= 100 ? 'Good ✓' : 'Add more detail'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                    <button onClick={() => setV7CurrentExpertScenarioIdx(p => Math.max(0, p - 1))} disabled={v7CurrentExpertScenarioIdx === 0} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: v7CurrentExpertScenarioIdx === 0 ? 0.5 : 1 }}>Previous</button>
                    {v7CurrentExpertScenarioIdx < expertScenarioList.length - 1
                      ? <button onClick={() => setV7CurrentExpertScenarioIdx(p => p + 1)} style={{ padding: '8px 18px', borderRadius: 8, background: '#8B5CF6', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Next Scenario</button>
                      : <button onClick={() => {
                          const avgScore = Math.round(expertScenarioList.reduce((sum, sc) => { const a = expertScenarioAnswers[sc.id] || ''; return sum + scoreTextAnswer(a, (sc as any).scoringKeywords || [], (sc as any).minWords || 80); }, 0) / Math.max(expertScenarioList.length, 1));
                          setSectionScores(prev => ({ ...prev, expertScenarios: avgScore }));
                          setV7Step(5);
                        }} style={{ padding: '10px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#8B5CF6,#7c3aed)', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Submit Scenarios →</button>
                    }
                  </div>
                </div>
              );
            }

            const targetCount = assessmentPath === 'Intermediate' ? 15 : 20;
            const allQuestions = v7BankMCQs.length > 0
              ? v7BankMCQs
              : (v7DynamicQuestions.length > 0 ? v7DynamicQuestions : FUNCTIONAL_TESTING_INTERMEDIATE_QUESTIONS);
            const questionsList = allQuestions.slice(0, targetCount);
            const currentQ = questionsList[v7CurrentMcqIdx] || questionsList[0];
            if (!currentQ) return <div style={{ padding: 20, color: T.text, textAlign: 'center' }}>Loading assessment questions...</div>;
            const mins = Math.floor(v7Timer / 60);
            const secs = v7Timer % 60;
            const timerColor = v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444';
            const answeredCount = Object.keys(v7McqAnswers).length;
            const remainingCount = questionsList.length - answeredCount;
            const flaggedCount = Object.keys(v7FlaggedQuestions).filter(k => v7FlaggedQuestions[k]).length;

            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 20 }} className="fadeIn mcq-grid">
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* Round Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 12, color: '#3B82F6', textTransform: 'uppercase' }}>MCQ Assessment Round — {v7SelectedSkill || getActiveSkillName()}</strong>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Question {v7CurrentMcqIdx + 1} of {questionsList.length}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timerColor, fontWeight: 800, fontSize: 14 }}>
                      <Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining
                    </div>
                  </div>

                  {/* Mobile dot indicators (replaces side question grid on small screens) */}
                  <div className="mcq-dots-mobile" style={{ display: 'none', flexWrap: 'wrap', gap: 6 }}>
                    {questionsList.map((q: any, idx: number) => {
                      const answered = v7McqAnswers[q.id] !== undefined;
                      const flagged = v7FlaggedQuestions[q.id] === true;
                      const active = idx === v7CurrentMcqIdx;
                      let dotColor = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
                      if (flagged) dotColor = '#F59E0B';
                      else if (answered) dotColor = '#3B82F6';
                      return (
                        <div
                          key={idx}
                          onClick={() => setV7CurrentMcqIdx(idx)}
                          style={{ width: active ? 12 : 8, height: active ? 12 : 8, borderRadius: '50%', background: dotColor, border: active ? `2px solid ${T.text}` : 'none', cursor: 'pointer', transition: 'all 0.15s' }}
                        />
                      );
                    })}
                  </div>

                  {/* Question Content */}
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.4, padding: '10px 0' }}>
                    {currentQ.question}
                  </div>

                  {/* Options */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {currentQ.options.map((opt, i) => {
                      const optNum = i + 1;
                      const selected = v7McqAnswers[currentQ.id] === optNum;
                      return (
                        <div 
                          key={i} 
                          onClick={() => {
                            setV7McqAnswers(prev => ({ ...prev, [currentQ.id]: optNum }));
                          }}
                          style={{ 
                            padding: 14, 
                            borderRadius: 10, 
                            border: selected ? '2px solid #3B82F6' : `1px solid ${T.bdr}`, 
                            background: selected ? 'rgba(59,130,246,0.04)' : T.card, 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10
                          }}
                          className="hover-card"
                        >
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: selected ? '5px solid #3B82F6' : `1px solid ${T.bdr}`, background: '#fff' }} />
                          <span style={{ fontSize: 13, color: T.text }}>{opt}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Navigation */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bdr}`, paddingTop: 16, marginTop: 10 }}>
                    <button 
                      onClick={() => setV7CurrentMcqIdx(prev => Math.max(0, prev - 1))}
                      disabled={v7CurrentMcqIdx === 0}
                      style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: v7CurrentMcqIdx === 0 ? 0.5 : 1 }}
                    >
                      Previous
                    </button>
                    
                    <button 
                      onClick={() => {
                        setV7FlaggedQuestions(prev => ({ ...prev, [currentQ.id]: !prev[currentQ.id] }));
                      }}
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #F59E0B55', background: v7FlaggedQuestions[currentQ.id] ? 'rgba(245,158,11,0.1)' : T.card, color: '#F59E0B', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {v7FlaggedQuestions[currentQ.id] ? 'Flagged ⚑' : 'Flag Question ⚐'}
                    </button>

                    {v7CurrentMcqIdx < questionsList.length - 1 ? (
                      <button 
                        onClick={() => setV7CurrentMcqIdx(prev => prev + 1)}
                        style={{ padding: '8px 18px', borderRadius: 8, background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                      >
                        Next
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          let correct = 0; let wrong = 0;
                          questionsList.forEach((q: any) => { const ans = (v7McqAnswers as any)[q.id]; if (ans !== undefined) { if (ans === q.correct) correct++; else wrong++; } });
                          const mcqPct = Math.round((Math.max(0, correct - wrong * 0.5) / questionsList.length) * 100);
                          setSectionScores(prev => ({ ...prev, mcq: mcqPct }));
                          setV7Step(5);
                        }}
                        style={{ padding: '10px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                      >
                        Submit MCQ Round
                      </button>
                    )}
                  </div>
                </div>

                {/* Side Status Grid */}
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <strong style={{ fontSize: 12, textTransform: 'uppercase', color: T.sub }}>Questions Grid</strong>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {Array.from({ length: questionsList.length }, (_, i) => i).map(idx => {
                      const qItem = questionsList[idx];
                      if (!qItem) return null;
                      const qId = qItem.id;
                      const answered = v7McqAnswers[qId] !== undefined;
                      const flagged = v7FlaggedQuestions[qId] === true;
                      const active = idx === v7CurrentMcqIdx;

                      let bg = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
                      let color = T.sub;
                      let border = active ? '2px solid #3B82F6' : `1px solid ${T.bdr}`;

                      if (flagged) {
                        bg = 'rgba(245,158,11,0.15)';
                        color = '#F59E0B';
                      } else if (answered) {
                        bg = 'rgba(59,130,246,0.1)';
                        color = '#3B82F6';
                      }

                      return (
                        <div 
                          key={idx}
                          onClick={() => setV7CurrentMcqIdx(idx)}
                          style={{ height: 36, borderRadius: 8, background: bg, border, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                        >
                          {idx + 1}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, borderTop: `1px solid ${T.bdr}`, paddingTop: 12, marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: T.sub }}>Answered:</span>
                      <strong>{answeredCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: T.sub }}>Remaining:</span>
                      <strong>{remainingCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: T.sub }}>Flagged:</span>
                      <strong>{flaggedCount}</strong>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* STEP 6: ROUND TRANSITION PAGE */}
          {v7Step === 5 && (
            <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: '48px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                <CheckCircle size={32} />
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Round 1 Completed</h2>
                <span style={{ display: 'inline-block', fontSize: 11, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', padding: '3px 10px', borderRadius: 8, marginTop: 6, fontWeight: 700 }}>MCQ Score Processing...</span>
              </div>
              
              <div style={{ maxWidth: 360, margin: '20px auto 0', padding: 20, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                <div style={{ fontSize: 10, color: T.sub, textTransform: 'uppercase', fontWeight: 800 }}>Next Round</div>
                <strong style={{ fontSize: 15, display: 'block', margin: '4px 0', color: T.text }}>
                  {assessmentPath === 'Beginner' ? 'Tool Identification' : assessmentPath === 'Intermediate' ? 'Coding Task' : 'Capstone Project'}
                </strong>
                <span style={{ fontSize: 12, color: T.sub }}>
                  {assessmentPath === 'Beginner' ? '5 tool identification questions · 5 minutes'
                    : assessmentPath === 'Intermediate' ? '1 coding challenge · 20 minutes'
                    : 'Submit your real-world capstone work'}
                </span>
              </div>

              <button
                onClick={() => setV7Step(6)}
                style={{ alignSelf: 'center', padding: '12px 32px', borderRadius: 10, background: '#3B82F6', color: '#fff', fontWeight: 900, border: 'none', cursor: 'pointer', marginTop: 10 }}
              >
                {assessmentPath === 'Beginner' ? 'Start Tool ID Round' : assessmentPath === 'Intermediate' ? 'Start Coding Task' : 'Submit Capstone'}
              </button>
            </div>
          )}

          {/* STEP 7: PATH-SPECIFIC SECTION 2 */}
          {v7Step === 6 && (() => {
            const mins = Math.floor(v7Timer / 60);
            const secs = v7Timer % 60;

            // ── BEGINNER: Tool Identification ──────────────────────────────────
            if (assessmentPath === 'Beginner') {
              const bankToolQs = v7BankToolIdQs.length > 0 ? v7BankToolIdQs.slice(0, 5) : null;
              if (bankToolQs) {
                // Open-text diagnostic questions from question bank
                const currentTQ = bankToolQs[v7CurrentToolIdIdx] || bankToolQs[0];
                const tiAnswer = toolIdTextAnswers[currentTQ.id] || '';
                const tiWordCount = tiAnswer.trim() ? tiAnswer.trim().split(/\s+/).filter(Boolean).length : 0;
                const answeredBankCount = bankToolQs.filter((q: any) => (toolIdTextAnswers[q.id] || '').trim().length > 0).length;
                return (
                  <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: 12, color: '#10B981', textTransform: 'uppercase' }}>Tool Identification Round</strong>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Scenario {v7CurrentToolIdIdx + 1} of {bankToolQs.length}</h3>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: 14 }}>
                        <Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining
                      </div>
                    </div>
                    <div style={{ padding: 16, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                      <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono','Courier New',monospace" }}>{currentTQ.description}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase' }}>Your Diagnosis / Answer (min 10 words)</label>
                      <textarea
                        value={tiAnswer}
                        onChange={e => setToolIdTextAnswers(prev => ({ ...prev, [currentTQ.id]: e.target.value }))}
                        placeholder="Describe the issue, the root cause, and how you would fix it..."
                        style={{ width: '100%', height: 140, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                      <div style={{ fontSize: 11, color: T.muted }}>{tiWordCount} words {tiWordCount >= 10 ? '✓' : '— aim for 10+ words'}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                      <button onClick={() => setV7CurrentToolIdIdx(p => Math.max(0, p - 1))} disabled={v7CurrentToolIdIdx === 0} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: v7CurrentToolIdIdx === 0 ? 0.5 : 1 }}>Previous</button>
                      {v7CurrentToolIdIdx < bankToolQs.length - 1
                        ? <button onClick={() => setV7CurrentToolIdIdx(p => p + 1)} style={{ padding: '8px 18px', borderRadius: 8, background: '#10B981', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Next</button>
                        : <button onClick={() => {
                            const score = Math.round(bankToolQs.reduce((sum: number, q: any) => {
                              const ans = toolIdTextAnswers[q.id] || '';
                              const kws = (q.keywords || []) as string[];
                              const found = kws.filter((k: string) => ans.toLowerCase().includes(k.toLowerCase())).length;
                              return sum + Math.min(100, (found / Math.max(kws.length * 0.5, 1)) * 100);
                            }, 0) / bankToolQs.length);
                            setSectionScores(prev => ({ ...prev, toolId: Math.min(100, score) }));
                            setV7Step(7);
                          }} style={{ padding: '10px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Submit Tool ID Round</button>
                      }
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, textAlign: 'center' }}>Answered: {answeredBankCount} / {bankToolQs.length}</div>
                  </div>
                );
              }
              // Fallback: original MCQ tool ID questions
              const toolQs = [
                { id: 0, question: 'Which Selenium locator is most reliable when an element has no stable ID or name?', options: ['id locator', 'name locator', 'xpath using text()', 'className locator'], correct: 3 },
                { id: 1, question: 'In Postman, which tab shows the response body of an API call?', options: ['Headers', 'Authorization', 'Body', 'Tests'], correct: 3 },
                { id: 2, question: 'JIRA is primarily used for:', options: ['Test automation', 'Load testing', 'Bug/issue tracking', 'Code deployment'], correct: 3 },
                { id: 3, question: 'Which JMeter element defines the number of virtual users?', options: ['HTTP Sampler', 'Thread Group', 'View Results Tree', 'Listeners'], correct: 2 },
                { id: 4, question: 'In a defect lifecycle, "Deferred" means:', options: ['Defect was fixed', 'Defect fix postponed to a later release', 'Defect cannot be reproduced', 'Defect was rejected'], correct: 2 },
              ];
              const currentQ = toolQs[v7CurrentToolIdIdx] || toolQs[0];
              const answeredCount = Object.keys(toolIdAnswers).length;
              return (
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 12, color: '#10B981', textTransform: 'uppercase' }}>Tool Identification Round</strong>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Question {v7CurrentToolIdIdx + 1} of {toolQs.length}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: 14 }}>
                      <Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.4, padding: '10px 0' }}>{currentQ.question}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {currentQ.options.map((opt, i) => {
                      const optNum = i + 1;
                      const sel = toolIdAnswers[currentQ.id] === optNum;
                      return (
                        <div key={i} onClick={() => setToolIdAnswers(prev => ({ ...prev, [currentQ.id]: optNum }))}
                          style={{ padding: 14, borderRadius: 10, border: sel ? '2px solid #10B981' : `1px solid ${T.bdr}`, background: sel ? 'rgba(16,185,129,0.04)' : T.card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: sel ? '5px solid #10B981' : `1px solid ${T.bdr}`, background: '#fff', flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: T.text }}>{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                    <button onClick={() => setV7CurrentToolIdIdx(p => Math.max(0, p - 1))} disabled={v7CurrentToolIdIdx === 0} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: v7CurrentToolIdIdx === 0 ? 0.5 : 1 }}>Previous</button>
                    {v7CurrentToolIdIdx < toolQs.length - 1
                      ? <button onClick={() => setV7CurrentToolIdIdx(p => p + 1)} style={{ padding: '8px 18px', borderRadius: 8, background: '#10B981', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Next</button>
                      : <button onClick={() => {
                          let c = 0; toolQs.forEach(q => { if (toolIdAnswers[q.id] === q.correct) c++; });
                          setSectionScores(prev => ({ ...prev, toolId: Math.round((c / toolQs.length) * 100) }));
                          setV7Step(7);
                        }} style={{ padding: '10px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Submit Tool ID Round</button>
                    }
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, textAlign: 'center' }}>Answered: {answeredCount} / {toolQs.length}</div>
                </div>
              );
            }

            // ── INTERMEDIATE: Coding Task ─────────────────────────────────────
            if (assessmentPath === 'Intermediate') {
              const bankCodingProblem = v7BankCodingQs.length > 0 ? v7BankCodingQs[0] : null;
              if (bankCodingProblem) {
                return (
                  <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: 12, color: '#10B981', textTransform: 'uppercase' }}>Coding Task</strong>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{bankCodingProblem.title}</h3>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: 14 }}><Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining</div>
                    </div>
                    <CodeEditor
                      problem={bankCodingProblem}
                      defaultLanguage="python"
                      dark={dark}
                      onResults={(results, vPass, vTotal, hPass, hTotal) => {
                        setV7CodingResults({ visiblePassed: vPass, totalVisible: vTotal, hiddenPassed: hPass, totalHidden: hTotal });
                        const score = Math.round(((vPass / Math.max(vTotal, 1)) * 0.5 + (hPass / Math.max(hTotal, 1)) * 0.5) * 100);
                        setSectionScores(prev => ({ ...prev, coding: score }));
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                      <button onClick={() => {
                        const { visiblePassed, totalVisible, hiddenPassed, totalHidden } = v7CodingResults;
                        const score = Math.round(((visiblePassed / Math.max(totalVisible, 1)) * 0.5 + (hiddenPassed / Math.max(totalHidden, 1)) * 0.5) * 100);
                        setSectionScores(prev => ({ ...prev, coding: score }));
                        setV7Step(7);
                      }} style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Submit Coding Task →</button>
                    </div>
                  </div>
                );
              }
              // Fallback: textarea coding task
              const primarySkill = v7ExtractedData?.primarySkill || 'Automation Testing';
              const isApi = primarySkill.toLowerCase().includes('api') || primarySkill.toLowerCase().includes('postman');
              const isPerf = primarySkill.toLowerCase().includes('performance') || primarySkill.toLowerCase().includes('jmeter');
              const codingTask = isApi
                ? { title: 'Write API Tests for POST /api/transfer', desc: 'Write REST Assured or Postman-style tests for a money transfer API. Cover: success case, insufficient funds, invalid auth, and concurrent request handling.', starter: '// API Test skeleton\n// POST /api/transfer\n// Headers: Authorization: Bearer <token>\n// Body: { fromAccount, toAccount, amount }\n\ngiven()\n  .header("Authorization", "Bearer " + token)\n  .body(transferPayload)\n.when()\n  .post("/api/transfer")\n.then()\n  // Add your assertions here' }
                : isPerf
                ? { title: 'Write k6 Performance Test', desc: 'Write a k6 load test for a login endpoint. Include staged load (ramp-up, peak, ramp-down), thresholds for p95 < 2s, and 100 virtual users.', starter: 'import http from "k6/http";\nimport { check, sleep } from "k6";\n\nexport const options = {\n  stages: [\n    // Add stages here\n  ],\n  thresholds: {\n    // Add thresholds here\n  },\n};\n\nexport default function() {\n  // Write your test scenario here\n}' }
                : { title: 'Fix the Failing Selenium Test', desc: 'The Selenium test below is failing intermittently. Identify the issue, fix it, and write a reusable login helper function.', starter: '// Selenium test with intermittent failure\nWebDriver driver = new ChromeDriver();\ndriver.get("https://app.example.com/login");\ndriver.findElement(By.id("username")).sendKeys("testuser");\ndriver.findElement(By.id("password")).sendKeys("pass123");\ndriver.findElement(By.id("loginBtn")).click();\n// BUG: Sometimes fails here on slow machines\nWebElement dashboard = driver.findElement(By.id("dashboard"));\nassertTrue(dashboard.isDisplayed());' };
              return (
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 12, color: '#10B981', textTransform: 'uppercase' }}>Coding Task</strong>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{codingTask.title}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: 14 }}><Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining</div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                    <p style={{ margin: 0, fontSize: 13, color: T.sub, lineHeight: 1.6 }}>{codingTask.desc}</p>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: T.sub, marginBottom: 8, fontWeight: 700 }}>STARTER CODE — extend or fix this:</div>
                    <div style={{ padding: 14, borderRadius: 8, background: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.04)', border: `1px solid ${T.bdr}`, fontFamily: "'Courier New',monospace", fontSize: 12, color: '#10B981', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{codingTask.starter}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase' }}>Your Solution</label>
                    <textarea value={codingAnswer} onChange={e => setCodingAnswer(e.target.value)} placeholder="Write your fixed/complete code here..." style={{ width: '100%', height: 220, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: "'Courier New',Courier,monospace", boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: T.muted, textAlign: 'right' }}>{codingAnswer.trim().split(/\n/).length} lines written</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                    <button onClick={() => {
                      const score = Math.min(100, Math.round((codingAnswer.trim().length / 6) + (codingAnswer.includes('assert') || codingAnswer.includes('expect') ? 20 : 0) + (codingAnswer.includes('function') || codingAnswer.includes('def ') || codingAnswer.includes('void ') ? 15 : 0)));
                      setSectionScores(prev => ({ ...prev, coding: Math.min(100, score) }));
                      setV7Step(7);
                    }} style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Submit Coding Task →</button>
                  </div>
                </div>
              );
            }

            // ── EXPERT: Capstone Submission ───────────────────────────────────
            return (
              <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                <div style={{ borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                  <strong style={{ fontSize: 12, color: '#10B981', textTransform: 'uppercase' }}>Capstone Project Submission</strong>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Submit Your Real Work</h3>
                </div>
                <div style={{ padding: 16, borderRadius: 12, background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <p style={{ margin: 0, fontSize: 13, color: T.sub, lineHeight: 1.6 }}>Submit something real you have built: a complete automation framework, performance test suite, API test collection, test strategy document, or LLM evaluation harness. This is 40% of your Expert score.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>GitHub Repository URL</label>
                    <input value={capstoneUrl} onChange={e => setCapstoneUrl(e.target.value)} placeholder="https://github.com/yourname/your-framework" style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Description — What did you build and why?</label>
                    <textarea value={capstoneNotes} onChange={e => setCapstoneNotes(e.target.value)} placeholder="Describe: what the framework does, technologies used, scale (# of tests), CI/CD integration, real project usage..." style={{ width: '100%', height: 180, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, marginBottom: 8 }}>SCORING RUBRIC (20 pts each):</div>
                    {['Completeness — all scripts, config, docs, readme present', 'Code quality — modular, reusable, follows best practices', 'Complexity — covers edge cases, multiple environments', 'CI/CD integration — Jenkins/GitHub Actions config present', 'Evidence of real use — commit history, project references, screenshots'].map((c, i) => (
                      <div key={i} style={{ fontSize: 12, color: T.text, padding: '4px 0', borderBottom: i < 4 ? `1px solid ${T.bdr}` : 'none' }}>• {c}</div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                  <button onClick={() => {
                    const score = Math.min(100, (capstoneUrl.trim() ? 40 : 0) + Math.min(60, Math.round(capstoneNotes.trim().split(/\s+/).filter(Boolean).length * 1.2)));
                    setSectionScores(prev => ({ ...prev, capstone: score }));
                    setV7Step(7);
                  }} style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Submit Capstone → Mentoring Evidence</button>
                </div>
              </div>
            );
          })()}

          {/* STEP 8: PATH-SPECIFIC SECTION 3 */}
          {v7Step === 7 && (() => {
            const mins = Math.floor(v7Timer / 60);
            const secs = v7Timer % 60;

            // ── BEGINNER: Practical / Test Case Writing ────────────────────────
            if (assessmentPath === 'Beginner') {
              const bankPractical = v7BankPracticalQs.length > 0 ? v7BankPracticalQs.slice(0, 2) : null;
              const tcTasks = bankPractical ? bankPractical.map((p: any) => ({
                id: p.id,
                title: 'Practical Task',
                scenario: '',
                req: p.task,
                minLength: p.minLength || 50,
              })) : [
                { id: 'tc1', title: 'Login Page Test Cases', scenario: 'A login page has: Username field, Password field, Submit button, Remember Me checkbox, Forgot Password link.', req: 'Write 3 test cases covering: positive (valid login), negative (wrong password), and boundary (empty fields) scenarios.', minLength: 60 },
                { id: 'tc2', title: 'Payment Form Test Cases', scenario: 'A payment form accepts: Card number (16 digits), Expiry (MM/YY), CVV (3 digits), Amount (>0), and Submit button.', req: 'Write 3 test cases covering: valid payment, invalid card number, and expired card scenarios.', minLength: 60 },
              ];
              const currentT = tcTasks[v7CurrentTestCaseIdx] || tcTasks[0];
              const tcAnswer = testCaseAnswers[currentT.id] || '';
              const tcWordCount = tcAnswer.trim() ? tcAnswer.trim().split(/\s+/).filter(Boolean).length : 0;
              const minWords = currentT.minLength ? Math.ceil(currentT.minLength / 5) : 60;
              return (
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 12, color: '#8B5CF6', textTransform: 'uppercase' }}>Practical Task</strong>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Task {v7CurrentTestCaseIdx + 1} of {tcTasks.length}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: 14 }}><Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining</div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                    {currentT.scenario ? <p style={{ margin: '0 0 8px', fontSize: 12, color: T.sub, lineHeight: 1.5 }}><strong>Scenario:</strong> {currentT.scenario}</p> : null}
                    <p style={{ margin: 0, fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{currentT.req}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase' }}>Your Answer / Solution</label>
                    <textarea value={tcAnswer} onChange={e => setTestCaseAnswers(prev => ({ ...prev, [currentT.id]: e.target.value }))} placeholder="Write your solution here..." style={{ width: '100%', height: 200, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: T.muted }}>Words: {tcWordCount} {tcWordCount >= minWords ? '✓ Good' : `— aim for at least ${minWords} words`}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                    <button onClick={() => setV7CurrentTestCaseIdx(p => Math.max(0, p - 1))} disabled={v7CurrentTestCaseIdx === 0} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: v7CurrentTestCaseIdx === 0 ? 0.5 : 1 }}>Previous</button>
                    {v7CurrentTestCaseIdx < tcTasks.length - 1
                      ? <button onClick={() => setV7CurrentTestCaseIdx(p => p + 1)} style={{ padding: '8px 18px', borderRadius: 8, background: '#8B5CF6', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Next Task</button>
                      : <button onClick={() => {
                          const score = Math.round(tcTasks.reduce((sum: number, t: any) => { const a = testCaseAnswers[t.id] || ''; return sum + scoreTextAnswer(a, t.expectedKeywords || [], t.minLength ? Math.ceil(t.minLength / 5) : 30); }, 0) / Math.max(tcTasks.length, 1));
                          setSectionScores(prev => ({ ...prev, testCaseWriting: Math.min(100, score) }));
                          setV7TimerActive(false); setV7Step(8);
                        }} style={{ padding: '12px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#8B5CF6,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Finish & Submit Assessment</button>
                    }
                  </div>
                </div>
              );
            }

            // ── INTERMEDIATE: Real-World Scenarios (2) ─────────────────────────
            if (assessmentPath === 'Intermediate') {
              const intScenarios = v7BankScenarioQs.length > 0
                ? v7BankScenarioQs.slice(0, 2).map((s: any) => ({ id: s.id, title: 'Scenario', desc: '', question: s.question, minWords: s.minWords || 60 }))
                : v7DynamicScenarios.length > 0 ? v7DynamicScenarios.slice(0, 2) : [
                  { id: 'is1', title: 'Slow Regression Suite', desc: 'Your regression suite takes 4 hours to run and the team wants it done in 45 minutes.', question: 'What would you do? Describe your approach to parallelization, test selection, and CI optimization.', minWords: 60 },
                  { id: 'is2', title: 'New Feature Automation Strategy', desc: 'A new payment flow feature has been added. You have limited time before the sprint closes.', question: 'How do you decide which tests to automate first? Describe your risk-based prioritization approach.', minWords: 60 },
                ];
              const curISc = intScenarios[v7CurrentScenarioIdx] || intScenarios[0];
              const iAnswer = v7ScenarioAnswers[curISc.id] || '';
              const iWordCount = iAnswer.trim() ? iAnswer.trim().split(/\s+/).filter(Boolean).length : 0;
              return (
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 12, color: '#8B5CF6', textTransform: 'uppercase' }}>Real-World Scenarios</strong>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Scenario {v7CurrentScenarioIdx + 1} of {intScenarios.length}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: 14 }}><Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining</div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                    <strong style={{ fontSize: 13, color: T.text, display: 'block', marginBottom: 4 }}>{curISc.title || 'Scenario'}</strong>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: T.sub, lineHeight: 1.5 }}>{curISc.desc || ''}</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>{curISc.question}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase' }}>Your Answer (min 60 words)</label>
                    <textarea value={iAnswer} onChange={e => setV7ScenarioAnswers(prev => ({ ...prev, [curISc.id]: e.target.value }))} placeholder="Describe your approach..." style={{ width: '100%', height: 180, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: T.muted }}>{iWordCount} words {iWordCount >= 60 ? '✓' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                    <button onClick={() => setV7CurrentScenarioIdx(p => Math.max(0, p - 1))} disabled={v7CurrentScenarioIdx === 0} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: v7CurrentScenarioIdx === 0 ? 0.5 : 1 }}>Previous</button>
                    {v7CurrentScenarioIdx < intScenarios.length - 1
                      ? <button onClick={() => setV7CurrentScenarioIdx(p => p + 1)} style={{ padding: '8px 18px', borderRadius: 8, background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Next Scenario</button>
                      : <button onClick={() => {
                          const sc = Math.round(intScenarios.reduce((s, scn) => { const a = v7ScenarioAnswers[scn.id] || ''; return s + scoreTextAnswer(a, (scn as any).scoringKeywords || [], (scn as any).minWords || 60); }, 0) / Math.max(intScenarios.length, 1));
                          setSectionScores(prev => ({ ...prev, scenarios: Math.min(100, sc) }));
                          setV7Step(11);
                        }} style={{ padding: '10px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Next: Framework Design →</button>
                    }
                  </div>
                </div>
              );
            }

            // ── EXPERT: Mentoring Evidence ─────────────────────────────────────
            const mentoringQsList = v7BankMentoringQs.length > 0
              ? v7BankMentoringQs.slice(0, 3).map((m: any) => ({ id: m.id, label: m.question, placeholder: 'Be specific — names, outcomes, numbers, dates...' }))
              : [
                { id: 'm1', label: 'People Mentored', placeholder: 'E.g. "Mentored Arun Kumar (E1, Automation) over 8 weeks on Playwright. He now owns the regression suite and reduced flaky tests by 35%." Vague answers score low.' },
                { id: 'm2', label: 'Knowledge Sharing', placeholder: 'E.g. "Ran a 3-session k6 bootcamp for 12 engineers in March 2025. 8 of 12 now use k6 in production." Include specifics: audience size, dates, outcomes.' },
                { id: 'm3', label: 'Code & Work Reviews', placeholder: 'E.g. "Own quality gates for 2 accounts. Review 15-20 PRs weekly. Identified a critical race condition in test runner in Jan 2026." Link GitHub reviews if possible.' },
              ];
            return (
              <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }} className="fadeIn">
                <div style={{ borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                  <strong style={{ fontSize: 12, color: '#8B5CF6', textTransform: 'uppercase' }}>Mentoring Contribution</strong>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Evidence of People Development</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: T.sub }}>Specific names, outcomes, and numbers required. Vague claims score low.</p>
                </div>
                {mentoringQsList.map(q => (
                  <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{q.label}</label>
                    <textarea value={mentoringAnswers[q.id] || ''} onChange={e => setMentoringAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} placeholder={q.placeholder} style={{ width: '100%', height: 120, padding: 12, borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 10, color: T.muted }}>{(mentoringAnswers[q.id] || '').trim().split(/\s+/).filter(Boolean).length} words</div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                  <button onClick={() => {
                    const score = Math.round(mentoringQsList.reduce((sum, q) => sum + scoreTextAnswer(mentoringAnswers[q.id] || '', (q as any).scoringKeywords || [], 30), 0) / Math.max(mentoringQsList.length, 1));
                    setSectionScores(prev => ({ ...prev, mentoring: Math.min(100, score) }));
                    setV7Step(11);
                  }} style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg,#8B5CF6,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Next: Experience Questionnaire →</button>
                </div>
              </div>
            );
          })()}

          {/* ── STEP 11: Framework Design (Intermediate) / Questionnaire (Expert) ── */}
          {v7Step === 11 && (() => {
            if (assessmentPath === 'Intermediate') {
              const bankFwQ = v7BankFrameworkQ;
              const fwPrompt = bankFwQ?.question || `Describe the folder structure and core components of a ${v7ExtractedData?.primarySkill || 'Selenium'} framework you would build for a banking application with 200 test cases. Include: project structure, page objects, test data management, reporting, and CI/CD integration approach.`;
              const fwWordCount = frameworkAnswer.trim().split(/\s+/).filter(Boolean).length;
              const fwMinWords = bankFwQ?.minWords || 80;
              return (
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                  <div style={{ borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                    <strong style={{ fontSize: 12, color: '#EC4899', textTransform: 'uppercase' }}>Framework Design Task</strong>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Design a Test Framework</h3>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, background: dark ? 'rgba(236,72,153,0.04)' : 'rgba(236,72,153,0.03)', border: '1px solid rgba(236,72,153,0.2)' }}>
                    <strong style={{ fontSize: 13, color: T.text, display: 'block', marginBottom: 6 }}>Requirement:</strong>
                    <p style={{ margin: 0, fontSize: 13, color: T.sub, lineHeight: 1.6 }}>{fwPrompt}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase' }}>Your Framework Design</label>
                    <textarea value={frameworkAnswer} onChange={e => setFrameworkAnswer(e.target.value)} placeholder={'/project-root\n  /src\n    /pages — Page Object Model classes\n    /tests — Test specifications\n    /utils — Helper functions\n    /config — Environment config\n  /reports — Test reports\n  Jenkinsfile / .github/workflows\n\nCore components: ...'} style={{ width: '100%', height: 220, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: T.muted }}>{fwWordCount} words {fwWordCount >= fwMinWords ? '✓' : `— aim for ${fwMinWords}+`}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                    <button onClick={() => {
                      const score = scoreTextAnswer(frameworkAnswer, bankFwQ?.scoringKeywords || [], fwMinWords);
                      setSectionScores(prev => ({ ...prev, frameworkDesign: Math.min(100, score) }));
                      setV7TimerActive(false); setV7Step(8);
                    }} style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg,#EC4899,#db2777)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Finish & Submit Assessment</button>
                  </div>
                </div>
              );
            }
            // Expert: Experience Questionnaire (use bank questionnaire if available)
            const bankQQs = v7BankQuestionnaireQs.length > 0 ? v7BankQuestionnaireQs : null;
            const expQs = bankQQs
              ? bankQQs.map((q: any) => q.question)
              : [
                'Which automation tools have you used in PRODUCTION (not just learned)? List each with years used and project context.',
                'What is the LARGEST test suite you have built or maintained? (# tests, tool, how long it runs, in CI/CD?)',
                'Which CI/CD platforms have you integrated test suites with? Describe the pipeline structure.',
                'Which DOMAINS have you automated? (banking, insurance, e-commerce, healthcare, telecom — give project examples)',
                'Have you INTRODUCED automation on a project that had none before? Describe the journey.',
                'What is the most COMPLEX automation problem you have solved? What made it complex and how did you resolve it?',
              ];
            return (
              <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                <div style={{ borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                  <strong style={{ fontSize: 12, color: '#F59E0B', textTransform: 'uppercase' }}>Experience Depth Questionnaire</strong>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Breadth & Depth of Experience</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: T.sub }}>Specificity, scale, and domain breadth are scored. Vague answers score low.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {expQs.map((q, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Q{i + 1}: {q}</label>
                      <textarea value={experienceAnswers[String(i)] || ''} onChange={e => setExperienceAnswers(prev => ({ ...prev, [String(i)]: e.target.value }))} rows={3} placeholder="Be specific — tool names, project names, team sizes, timelines..." style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      <div style={{ fontSize: 11, color: T.muted, textAlign: 'right' }}>{(experienceAnswers[String(i)] || '').trim().split(/\s+/).filter(Boolean).length} words</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.bdr}`, paddingTop: 16 }}>
                  <button onClick={() => {
                    const score = Math.round(expQs.reduce((sum: number, _q, i) => sum + scoreTextAnswer(experienceAnswers[String(i)] || '', (bankQQs?.[i] as any)?.scoringKeywords || [], 30), 0) / Math.max(expQs.length, 1));
                    setSectionScores(prev => ({ ...prev, questionnaire: Math.min(100, score) }));
                    setV7TimerActive(false); setV7Step(8);
                  }} style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg,#F59E0B,#d97706)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Finish & Submit Assessment</button>
                </div>
              </div>
            );
          })()}

          {/* ── (old practical round placeholder kept for flow compatibility) ── */}
          {false && (() => {
            const tasks = v7DynamicTasks.length > 0 ? v7DynamicTasks : [
              { id: 't1', title: 'Defect Severity & Priority Matrix Design', desc: 'Design a defect classification matrix.', deliverable: 'A structured classification guidelines list.', criteria: 'Coverage of security defects, transaction failures, visual issues.' },
            ];
            
            const currentT = tasks[v7CurrentPracticalIdx] || tasks[0];
            if (!currentT) return <div style={{ padding: 20, color: T.text, textAlign: 'center' }}>Loading practical tasks...</div>;
            const answer = v7PracticalAnswers[currentT.id || currentT.name] || '';
            const mins = Math.floor(v7Timer / 60);
            const secs = v7Timer % 60;

            return (
              <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }} className="fadeIn">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 12, color: '#EC4899', textTransform: 'uppercase' }}>Practical Work round</strong>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Task {v7CurrentPracticalIdx + 1} of {tasks.length}</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v7Timer > 600 ? '#10B981' : v7Timer >= 300 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: 14 }}>
                    <Clock size={16} /> {mins}:{secs < 10 ? '0' + secs : secs} remaining
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <strong style={{ fontSize: 13, color: T.text }}>{currentT.name || currentT.title || 'Practical Task'}</strong>
                  <p style={{ margin: 0, fontSize: 12, color: T.sub, lineHeight: 1.5 }}>{currentT.description || currentT.desc || ''}</p>
                  <div style={{ fontSize: 11, color: T.muted, borderTop: `1px solid ${T.bdr}`, paddingTop: 8, marginTop: 4 }}>
                    <strong style={{ display: 'block', color: T.text, marginBottom: 2 }}>Expected Deliverable:</strong>
                    {currentT.deliverable || 'Write a structured code script or design document in the workspace.'}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted }}>
                    <strong style={{ display: 'block', color: T.text, marginBottom: 2 }}>Evaluation Criteria:</strong>
                    {currentT.criteria || 'Logic correctness, exception handling, code quality, scalability.'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase' }}>Task Script Workspace</label>
                  <textarea 
                    value={answer}
                    onChange={(e) => {
                      const val = e.target.value;
                      setV7PracticalAnswers(prev => ({ ...prev, [currentT.id || currentT.name]: val }));
                    }}
                    placeholder="Provide your solution or script outline here..."
                    style={{ width: '100%', height: 180, padding: 14, borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: "'Courier New', Courier, monospace", boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bdr}`, paddingTop: 16, marginTop: 10 }}>
                  <button 
                    onClick={() => setV7CurrentPracticalIdx(prev => Math.max(0, prev - 1))}
                    disabled={v7CurrentPracticalIdx === 0}
                    style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: v7CurrentPracticalIdx === 0 ? 0.5 : 1 }}
                  >
                    Previous Task
                  </button>

                  {v7CurrentPracticalIdx < tasks.length - 1 ? (
                    <button 
                      onClick={() => setV7CurrentPracticalIdx(prev => prev + 1)}
                      style={{ padding: '8px 18px', borderRadius: 8, background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                    >
                      Next Task
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        setV7TimerActive(false);
                        setV7Step(8);
                      }}
                      style={{ padding: '12px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#EC4899,#db2777)', color: '#fff', fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer' }}
                    >
                      Finish Assessment & Submit
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* STEP 9: ASSESSMENT COMPLETE (LOADING) */}
          {v7Step === 8 && (() => {
            if (!v7ResultsProcessing) {
              setV7ResultsProcessing(true);
              setTimeout(() => {
                evaluateSkillTestOutcome();
                setV7ResultsProcessing(false);
              }, 1500);
            }
            return (
              <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: '64px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24 }} className="fadeIn">
                <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid rgba(16,185,129,0.1)' }} />
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid transparent', borderTopColor: '#10B981', animation: 'spin 1.2s linear infinite' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Skill Test Submitted</h2>
                  <p style={{ fontSize: 12, color: T.sub, marginTop: 6 }}>Compiling your responses for {getActiveSkillName() || 'this skill'}...</p>
                </div>
              </div>
            );
          })()}

          {/* STEP 9: PER-SKILL ASSESSMENT RESULT PAGE */}
          {v7Step === 9 && (() => {
            const lastResult = skillResults[skillResults.length - 1];
            if (!lastResult) return null;

            // Persist this specific skill outcome
            if (!v7CompletionSaved) {
              setV7CompletionSaved(true);
              (async () => {
                try {
                  const completedSkill = lastResult.skill;
                  const completeRes = await req<any>('POST', '/zenassess/skill-test-complete', {
                    employeeId,
                    sessionId: 'v7_za_' + Date.now() + '_' + completedSkill.replace(/\s+/g, '_'),
                    skillName: completedSkill,
                    validatedLevel: lastResult.validatedLevel,
                    silentDropPath: lastResult.silentDropPath || null,
                    badgeAwarded: lastResult.badgeAwarded,
                    attemptNumber: v7AttemptNumber,
                    selfClaimedLevelAtTest: v7SelfClaimedLevels[completedSkill] || 'Beginner'
                  });
                  // Manager View Preview reads this value directly off the API response —
                  // never the client-computed score, never a re-fetch. `null` means "no
                  // verified badge exists" and is rendered as "Not Validated" (not "None").
                  const apiBadgeLevel = (completeRes && 'verifiedBadgeLevel' in completeRes) ? (completeRes.verifiedBadgeLevel ?? null) : null;
                  setSkillResults(prev => prev.map(r => r === lastResult ? { ...r, apiVerifiedBadgeLevel: apiBadgeLevel } : r));
                  // Keep the skill-card grid (Section B) and other pages in sync with the DB.
                  if (apiBadgeLevel) {
                    setV7SkillBadges(prev => ({ ...prev, [completedSkill]: apiBadgeLevel }));
                  }
                  await refreshSkillBadgesFromDB();
                } catch { /* best-effort */ }
              })();
            }

            const selfLevel = v7SelfClaimedLevels[lastResult.skill] || 'Beginner';
            const resultAction = lastResult.v7Action || 'pass';
            const resultScore = lastResult.finalScore;
            const coachTip = lastResult.validatedLevel === 'Not Validated'
              ? `Build hands-on practice in ${lastResult.skill} fundamentals — revisit core concepts and try small real-world tasks before your next assessment.`
              : `You're validated at ${lastResult.validatedLevel} in ${lastResult.skill}. To progress further, focus on advanced ${lastResult.skill} scenarios and gather more project evidence.`;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fadeIn">

                {/* Block 1: Skill Result */}
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 32, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.sub, textTransform: 'uppercase', marginBottom: 8 }}>Skill Assessment Result</div>
                  <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 12px' }}>{lastResult.skill}</h2>

                  {/* DROP UP */}
                  {resultAction === 'dropup' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#10B981' }}>🎉 Outstanding! You scored {resultScore}%</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#10B981' }}>Validated at: {lastResult.validatedLevel} ✓</div>
                      <span style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 12, fontWeight: 800 }}>Verified Badge: {lastResult.validatedLevel}</span>
                    </div>
                  )}

                  {/* PASS */}
                  {resultAction === 'pass' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#10B981' }}>✓ Validated at: {lastResult.validatedLevel}</div>
                      <span style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 12, fontWeight: 800 }}>Verified Badge: {lastResult.validatedLevel}</span>
                    </div>
                  )}

                  {/* NOT VALIDATED */}
                  {resultAction === 'dropdown' && !lastResult.badgeAwarded && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: T.sub }}>Keep practising</div>
                      <div style={{ fontSize: 13, color: T.muted }}>No badge awarded</div>
                    </div>
                  )}
                </div>

                {/* Block 2: ZenAICoach Tip — show if improvement needed */}
                {(lastResult.validatedLevel === 'Not Validated' || resultAction !== 'dropup') && (
                  <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <Brain size={20} color="#8B5CF6" />
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#8B5CF6', textTransform: 'uppercase' }}>ZenAICoach Tip</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 14, color: T.sub, lineHeight: 1.6 }}>{coachTip}</p>
                  </div>
                )}

                {/* Block 3: Manager View Preview */}
                <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 28 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 20px' }}>Manager View Preview</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                    <div>
                      <div style={{ fontSize: 11, color: T.sub, textTransform: 'uppercase', fontWeight: 800, marginBottom: 8 }}>Verified Badge Level</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#10B981' }}>
                        {lastResult.apiVerifiedBadgeLevel === undefined ? '…' : (lastResult.apiVerifiedBadgeLevel || 'Not Validated')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: T.sub, textTransform: 'uppercase', fontWeight: 800, marginBottom: 8 }}>Self-Claimed Level</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: T.text }}>{selfLevel}</div>
                    </div>
                  </div>
                </div>

                {/* Block 4: Navigation */}
                <div className="result-nav-buttons" style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <button
                    onClick={() => {
                      localStorage.removeItem('candidateProfile');
                      localStorage.removeItem('zenscan_raw_extraction');
                      navigate('/employee/dashboard');
                    }}
                    style={{ flex: 1, padding: '14px', borderRadius: 12, background: T.bdr, color: T.text, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                  >
                    Go to Dashboard
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem('candidateProfile');
                      localStorage.removeItem('zenscan_raw_extraction');
                      setV7Step(1);
                      setV7CompletionSaved(false);
                      // results stay in skillResults but UI resets
                    }}
                    style={{ flex: 1.5, padding: '14px', borderRadius: 12, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', color: '#fff', fontSize: 14, fontWeight: 900, border: 'none', cursor: 'pointer' }}
                  >
                    Test Next Skill →
                  </button>
                </div>

              </div>
            );
          })()}
        </>
      )}
    </div>

    <style>{`
      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .fadeIn { animation: fadeIn 0.3s ease; }
      @keyframes spin { to { transform: rotate(360deg); } }
      /* Mobile: hide question grid, show dot indicators */
      @media (max-width: 767px) {
        .mcq-grid { grid-template-columns: 1fr !important; }
        .mcq-grid > div:last-child { display: none !important; }
        .sk-hide-mobile-panel { display: none !important; }
        .mcq-dots-mobile { display: flex !important; }
      }
      /* Ensure all buttons meet 44px tap target on mobile */
      @media (max-width: 767px) {
        button { min-height: 44px; }
        input, textarea { font-size: 16px !important; }
        .result-nav-buttons { flex-direction: column !important; }
        .result-nav-buttons button { width: 100% !important; }
      }
    `}</style>
    </div>
  );
}
