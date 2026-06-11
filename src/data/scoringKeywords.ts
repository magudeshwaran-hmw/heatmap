export interface SkillKeywords {
  beginner: {
    practical: string[];
    toolId: string[];
  };
  intermediate: {
    scenario: string[];
    framework: string[];
    coding?: string[];
  };
  expert: {
    scenario: string[];
    mentoring: string[];
    questionnaire: string[];
  };
}

export const SCORING_KEYWORDS: Record<string, SkillKeywords> = {
  Python: {
    beginner: {
      practical: ['def','return','for','while','if','else','list','dict','print','len','append','range','str','int','float','bool','None','import','class','try','except'],
      toolId: ['pip','virtualenv','interpreter','syntax','module','script','indentation','pep8','jupyter','anaconda'],
    },
    intermediate: {
      scenario: ['debug','logging','profiler','memory','async','thread','optimize','cache','unittest','pytest','mock','coverage','decorator','generator','comprehension'],
      framework: ['class','module','package','import','interface','abstract','pattern','library','framework','dependency','virtualenv','requirements'],
    },
    expert: {
      scenario: ['architecture','microservice','scalability','bottleneck','profiling','GIL','multiprocessing','distributed','asyncio','concurrent','celery','kafka','redis'],
      mentoring: ['best practice','code review','pair programming','architecture decision','technical guidance','junior developer','knowledge transfer'],
      questionnaire: ['design pattern','SOLID','refactoring','technical debt','performance optimization','security','testing strategy'],
    },
  },
  Selenium: {
    beginner: {
      practical: ['driver','findElement','By.id','click','sendKeys','WebDriver','xpath','css','browser','selenium'],
      toolId: ['WebDriver','chromedriver','screenshot','assertion','wait','locator','element','driver','browser','test'],
    },
    intermediate: {
      scenario: ['PageObject','POM','framework','parallel','grid','explicit wait','implicit wait','fluent wait','TestNG','JUnit','cucumber','BDD'],
      framework: ['Page Object','class','locator','factory','abstract','interface','inheritance','reusable','maintainable','layer'],
      coding: ['driver','By','WebElement','ExpectedConditions','Actions','WebDriverWait','FluentWait','JavascriptExecutor'],
    },
    expert: {
      scenario: ['distributed','Selenium Grid','Docker','flaky','retry','reporting','CI/CD','coverage','remote','hub','node'],
      mentoring: ['test automation strategy','framework design','maintainability','scalability','best practices','team guidance'],
      questionnaire: ['test pyramid','automation ROI','flaky test','parallel execution','cross-browser','reporting dashboard'],
    },
  },
  Appium: {
    beginner: {
      practical: ['driver','AppiumDriver','By','click','sendKeys','MobileElement','desired capabilities','appPackage','appActivity'],
      toolId: ['Appium','iOS','Android','mobile','emulator','simulator','desired capabilities','Xcode','Android Studio'],
    },
    intermediate: {
      scenario: ['Page Object','hybrid','native','WebView','gesture','swipe','scroll','TouchAction','real device','device farm'],
      framework: ['MobileBy','AppiumDriver','DesiredCapabilities','TouchAction','MobileElement','platform','UDID','bundle'],
      coding: ['AppiumDriver','MobileElement','By','MobileBy','TouchAction','driver','desired','capabilities'],
    },
    expert: {
      scenario: ['device farm','parallel','cloud','BrowserStack','Sauce Labs','real device','CI/CD','performance','battery','network'],
      mentoring: ['mobile test strategy','device coverage','automation architecture','cross-platform','testing pyramid'],
      questionnaire: ['iOS vs Android','hybrid app','native app','performance testing mobile','security mobile testing'],
    },
  },
  JMeter: {
    beginner: {
      practical: ['thread group','sampler','listener','assertion','timer','HTTP','request','response','test plan','controller'],
      toolId: ['JMeter','thread group','sampler','listener','assertion','ramp-up','VU','concurrent','throughput','response time'],
    },
    intermediate: {
      scenario: ['distributed','remote','controller','slave','CSV','data driven','correlation','parameter','think time','pacing'],
      framework: ['test plan','thread group','HTTP sampler','listener','assertion','timer','pre-processor','post-processor','config element'],
      coding: ['BeanShell','Groovy','JSR223','regular expression','correlation','CSV Data Set','User Defined Variables'],
    },
    expert: {
      scenario: ['distributed load','cloud','CI/CD','Jenkins','Grafana','InfluxDB','real-time monitoring','scalability','performance baseline'],
      mentoring: ['performance strategy','NFR','baseline','capacity planning','bottleneck analysis','performance engineering'],
      questionnaire: ["Little's Law",'throughput','response time','percentile','p95','p99','concurrency','scalability'],
    },
  },
  Postman: {
    beginner: {
      practical: ['GET','POST','PUT','DELETE','request','response','header','body','URL','collection','environment','variable'],
      toolId: ['collection','environment','variable','request','response','header','body','test','script','newman'],
    },
    intermediate: {
      scenario: ['collection runner','Newman','CI/CD','environment','pre-request script','test script','authentication','OAuth','JWT','API chaining'],
      framework: ['collection','folder','request','environment','global variable','collection variable','schema','assertion','monitor'],
      coding: ['pm.test','pm.expect','pm.response','pm.environment','pm.collectionVariables','pm.request','JavaScript'],
    },
    expert: {
      scenario: ['API contract','schema validation','mocking','mock server','monitoring','performance','security','OAuth2','API gateway'],
      mentoring: ['API testing strategy','contract testing','versioning','documentation','swagger','openapi'],
      questionnaire: ['REST principles','HTTP methods','status codes','authentication','rate limiting','API security'],
    },
  },
  JIRA: {
    beginner: {
      practical: ['story','epic','task','bug','sprint','backlog','board','workflow','issue','project'],
      toolId: ['JIRA','sprint','epic','story','bug','board','backlog','workflow','issue','project','Kanban','Scrum'],
    },
    intermediate: {
      scenario: ['workflow','automation','integration','Confluence','filter','JQL','dashboard','report','roadmap','capacity'],
      framework: ['project','board','sprint','epic','story','task','sub-task','component','label','priority','version'],
      coding: ['JQL','query','filter','project','sprint','assignee','status','priority','label','component'],
    },
    expert: {
      scenario: ['JIRA administration','workflow customization','permission scheme','notification','scheme','plugin','add-on','API','webhook'],
      mentoring: ['agile coaching','sprint planning','velocity','estimation','retrospective','team health','process improvement'],
      questionnaire: ['agile','scrum','kanban','velocity','burndown','sprint planning','retrospective','DoD','DoR'],
    },
  },
  TestRail: {
    beginner: {
      practical: ['test case','test suite','test run','test plan','section','test result','pass','fail','milestone'],
      toolId: ['TestRail','test case','test suite','test run','milestone','test plan','section','result','defect'],
    },
    intermediate: {
      scenario: ['integration','JIRA','automation','API','reporting','milestone','configuration','test plan','matrix','coverage'],
      framework: ['test suite','section','test case','milestone','plan','run','result','coverage','traceability','requirement'],
      coding: ['API','endpoint','case','run','plan','result','milestone','configuration','GET','POST'],
    },
    expert: {
      scenario: ['enterprise setup','multi-project','role','permission','customization','integration','reporting','metrics','compliance'],
      mentoring: ['test management','coverage analysis','traceability','defect metrics','reporting strategy','quality gates'],
      questionnaire: ['test coverage','traceability matrix','defect metrics','reporting','test strategy','quality assurance'],
    },
  },
  Java: {
    beginner: {
      practical: ['public','class','static','void','main','System.out.println','String','int','ArrayList','for','while','if','else','new','return'],
      toolId: ['JVM','JDK','JRE','class','object','inheritance','interface','package','Maven','Gradle'],
    },
    intermediate: {
      scenario: ['collections','generics','multithreading','synchronized','exception','design pattern','SOLID','Maven','Spring','JUnit'],
      framework: ['Spring','Maven','Gradle','JUnit','TestNG','Mockito','interface','abstract','inheritance','polymorphism'],
      coding: ['ArrayList','HashMap','List','Map','Iterator','lambda','stream','Optional','CompletableFuture','ExecutorService'],
    },
    expert: {
      scenario: ['JVM tuning','GC','heap','Spring Boot','microservice','REST','JPA','Hibernate','performance','memory leak'],
      mentoring: ['design patterns','SOLID','code review','refactoring','clean code','testing strategy','architecture'],
      questionnaire: ['Java 8+','lambda','stream','Optional','functional','reactive','concurrency','JVM internals','memory model'],
    },
  },
  JavaScript: {
    beginner: {
      practical: ['var','let','const','function','return','console.log','array','object','if','else','for','forEach','document','DOM'],
      toolId: ['Node.js','npm','browser','DOM','event','callback','promise','async','await','ES6'],
    },
    intermediate: {
      scenario: ['closure','prototype','async/await','Promise','fetch','event loop','this','scope','hoisting','module'],
      framework: ['React','Vue','Angular','Node.js','Express','webpack','Babel','ESLint','Jest','Cypress'],
      coding: ['async','await','Promise','fetch','map','filter','reduce','destructuring','spread','rest','class','module'],
    },
    expert: {
      scenario: ['performance optimization','V8','event loop','memory leak','bundle size','SSR','hydration','Web Worker','Service Worker'],
      mentoring: ['JavaScript best practices','testing strategy','code review','architecture','TypeScript migration','performance'],
      questionnaire: ['event loop','prototype chain','closure','scope','hoisting','this binding','memory management','design patterns'],
    },
  },
  TypeScript: {
    beginner: {
      practical: ['type','interface','string','number','boolean','any','void','enum','class','function','let','const','arrow'],
      toolId: ['TypeScript','tsc','tsconfig','interface','type','generic','union','intersection','type assertion','strict'],
    },
    intermediate: {
      scenario: ['generics','utility types','decorators','namespaces','modules','strict mode','type narrowing','discriminated union'],
      framework: ['interface','type','generic','class','abstract','decorator','module','namespace','React','Angular'],
      coding: ['interface','type','generic','Partial','Required','Readonly','Pick','Omit','Record','Exclude'],
    },
    expert: {
      scenario: ['type system design','conditional types','mapped types','template literal types','variance','co/contravariance','declaration merging'],
      mentoring: ['TypeScript migration','strict mode adoption','type safety','generic design','architecture'],
      questionnaire: ['structural typing','type inference','conditional types','mapped types','decorators','advanced generics'],
    },
  },
  'C#': {
    beginner: {
      practical: ['using','class','namespace','static','void','Console.WriteLine','string','int','List','foreach','if','else','new','return'],
      toolId: ['.NET','C#','Visual Studio','NuGet','MSBuild','CLR','IL','assembly','namespace','LINQ'],
    },
    intermediate: {
      scenario: ['LINQ','async/await','generics','delegates','events','interfaces','dependency injection','Entity Framework','ASP.NET','NUnit'],
      framework: ['ASP.NET','Entity Framework','NUnit','xUnit','Moq','AutoMapper','DI','IoC','SOLID','design pattern'],
      coding: ['LINQ','async','await','Task','IEnumerable','List','Dictionary','lambda','delegate','event','interface'],
    },
    expert: {
      scenario: ['microservices','.NET Core','.NET 8','performance','memory','GC','threading','async patterns','Azure','cloud native'],
      mentoring: ['C# best practices','SOLID','design patterns','code review','architecture','testing strategy'],
      questionnaire: ['value vs reference types','boxing','garbage collection','async/await internals','LINQ optimization','generics'],
    },
  },
  SQL: {
    beginner: {
      practical: ['SELECT','FROM','WHERE','INSERT','UPDATE','DELETE','JOIN','ORDER BY','GROUP BY','HAVING','COUNT','SUM','AVG','MAX','MIN'],
      toolId: ['SQL','database','table','query','primary key','foreign key','index','constraint','NULL','schema'],
    },
    intermediate: {
      scenario: ['JOIN','subquery','window function','CTE','index','explain','query plan','normalization','transaction','ACID'],
      framework: ['schema','table','index','view','stored procedure','function','trigger','constraint','transaction','normalization'],
      coding: ['INNER JOIN','LEFT JOIN','RANK','ROW_NUMBER','PARTITION BY','CTE','WITH','HAVING','CASE WHEN','COALESCE'],
    },
    expert: {
      scenario: ['query optimization','index strategy','execution plan','partitioning','sharding','replication','backup','recovery','security'],
      mentoring: ['database design','normalization','query optimization','index strategy','performance tuning','capacity planning'],
      questionnaire: ['normalization','ACID','transactions','indexes','execution plans','partitioning','replication','sharding'],
    },
  },
  'API Testing': {
    beginner: {
      practical: ['GET','POST','PUT','DELETE','PATCH','HTTP','URL','endpoint','request','response','status code','header','body','JSON'],
      toolId: ['REST','SOAP','HTTP','status code','header','body','authentication','JSON','XML','Postman'],
    },
    intermediate: {
      scenario: ['authentication','OAuth','JWT','rate limiting','contract testing','mock','stub','schema validation','error handling','pagination'],
      framework: ['collection','environment','variable','assertion','pre-request','post-request','schema','monitor','report'],
      coding: ['pm.test','pm.expect','pm.response.json','status','headers','body','assertion','schema','JSON Schema'],
    },
    expert: {
      scenario: ['API gateway','contract testing','consumer-driven','Pact','microservice','GraphQL','gRPC','security testing','penetration'],
      mentoring: ['API testing strategy','contract testing','versioning','documentation','mocking strategy','performance'],
      questionnaire: ['REST principles','HATEOAS','versioning','security','rate limiting','caching','pagination','error handling'],
    },
  },
  'Mobile Testing': {
    beginner: {
      practical: ['iOS','Android','emulator','simulator','touch','gesture','swipe','scroll','orientation','network','battery'],
      toolId: ['Appium','XCTest','Espresso','TestFlight','Android Studio','Xcode','APK','IPA','real device','emulator'],
    },
    intermediate: {
      scenario: ['real device','device farm','BrowserStack','Sauce Labs','cloud testing','automation','hybrid','native','WebView','performance'],
      framework: ['Appium','XCTest','Espresso','MobileBy','TouchAction','desired capabilities','platform','automation name'],
      coding: ['AppiumDriver','MobileElement','TouchAction','By','driver','desired','capabilities','MobileBy','scroll'],
    },
    expert: {
      scenario: ['device coverage strategy','CI/CD','performance testing','battery testing','network simulation','accessibility','security'],
      mentoring: ['mobile test strategy','automation pyramid','device matrix','coverage optimization','CI/CD integration'],
      questionnaire: ['iOS vs Android differences','hybrid vs native','performance metrics','accessibility testing','security testing'],
    },
  },
  'Performance Testing': {
    beginner: {
      practical: ['load test','stress test','thread','VU','ramp-up','response time','throughput','error rate','JMeter','k6'],
      toolId: ['JMeter','Gatling','k6','Locust','BlazeMeter','thread','VU','throughput','response time','NFR'],
    },
    intermediate: {
      scenario: ['bottleneck','p95','p99','SLA','baseline','percentile','think time','pacing','correlation','parameterization'],
      framework: ['test plan','thread group','sampler','listener','assertion','ramp-up','steady state','cool-down'],
      coding: ['BeanShell','Groovy','JSR223','CSV','correlation','regular expression','JMeter properties'],
    },
    expert: {
      scenario: ['distributed load','cloud testing','capacity planning','NFR','performance engineering','APM','monitoring','CI/CD'],
      mentoring: ["Little's Law",'capacity planning','SLA definition','performance engineering culture','shift-left performance'],
      questionnaire: ["Little's Law",'percentile','p95','p99','throughput','concurrency','baseline','NFR','APM','profiling'],
    },
  },
  'Security Testing': {
    beginner: {
      practical: ['vulnerability','SQL injection','XSS','authentication','authorization','encryption','HTTPS','OWASP','penetration','vulnerability scan'],
      toolId: ['OWASP','Burp Suite','NMAP','ZAP','SQL injection','XSS','CSRF','penetration test','vulnerability','CVE'],
    },
    intermediate: {
      scenario: ['Burp Suite','OWASP Top 10','penetration testing','threat modeling','authentication bypass','session management','encryption'],
      framework: ['OWASP Top 10','threat model','attack surface','vulnerability','risk','impact','likelihood','CVSS'],
      coding: ['Burp Suite','ZAP','script','payload','injection','authentication','session','token','header'],
    },
    expert: {
      scenario: ['red team','blue team','threat intelligence','zero-day','CVE','CVSS','compliance','PCI-DSS','SOC2','ISO 27001'],
      mentoring: ['security culture','secure SDLC','DevSecOps','vulnerability management','risk assessment','compliance'],
      questionnaire: ['OWASP Top 10','threat modeling','penetration testing','DevSecOps','zero trust','compliance frameworks'],
    },
  },
  'Database Testing': {
    beginner: {
      practical: ['SELECT','INSERT','UPDATE','DELETE','constraint','NULL','foreign key','primary key','index','transaction'],
      toolId: ['SQL','database','schema','table','index','constraint','trigger','stored procedure','view','normalization'],
    },
    intermediate: {
      scenario: ['data integrity','referential integrity','constraint','index','query optimization','stored procedure','transaction','ACID'],
      framework: ['schema','table','index','constraint','stored procedure','trigger','view','transaction','ETL','data migration'],
      coding: ['SELECT','JOIN','GROUP BY','HAVING','window function','CTE','stored procedure','trigger','index','constraint'],
    },
    expert: {
      scenario: ['performance tuning','index strategy','partitioning','replication','backup','recovery','data migration','CDC'],
      mentoring: ['database design','normalization','query optimization','index strategy','data modeling','capacity planning'],
      questionnaire: ['normalization','ACID','CAP theorem','indexes','execution plans','partitioning','replication','sharding'],
    },
  },
  Banking: {
    beginner: {
      practical: ['transaction','account','balance','debit','credit','interest','loan','deposit','withdrawal','SWIFT','IBAN'],
      toolId: ['core banking','SWIFT','IBAN','transaction','account','interest','loan','deposit','ATM','card payment'],
    },
    intermediate: {
      scenario: ['payment gateway','SWIFT','ISO 20022','PCI-DSS','fraud detection','reconciliation','settlement','clearing'],
      framework: ['core banking','payment processing','regulatory compliance','risk management','audit trail','reporting'],
      coding: ['transaction','account','balance','interest','fee','currency','exchange rate','reconciliation','journal'],
    },
    expert: {
      scenario: ['digital transformation','open banking','PSD2','API banking','real-time payments','fraud prevention','regulatory compliance'],
      mentoring: ['banking domain','payment architecture','regulatory compliance','risk management','digital banking'],
      questionnaire: ['SWIFT','ISO 20022','PCI-DSS','open banking','PSD2','real-time payments','fraud detection','AML','KYC'],
    },
  },
  Healthcare: {
    beginner: {
      practical: ['patient','EHR','EMR','HL7','FHIR','diagnosis','medication','appointment','billing','insurance'],
      toolId: ['HL7','FHIR','EHR','EMR','ICD-10','CPT','HIPAA','patient','clinical','billing'],
    },
    intermediate: {
      scenario: ['HL7','FHIR','integration','interoperability','HIPAA','security','patient data','clinical workflow','EHR integration'],
      framework: ['HL7','FHIR','ICD-10','CPT','HIPAA','patient record','clinical decision','workflow','billing','insurance'],
      coding: ['FHIR','REST API','Patient resource','Observation','Encounter','HL7 message','segment','field'],
    },
    expert: {
      scenario: ['healthcare interoperability','FHIR R4','AI diagnostics','telehealth','clinical decision support','regulatory','FDA','CE marking'],
      mentoring: ['healthcare domain','HIPAA compliance','clinical workflow','interoperability','patient safety','data governance'],
      questionnaire: ['HL7 vs FHIR','HIPAA','patient privacy','clinical workflow','interoperability','medical device','FDA regulations'],
    },
  },
  'E-Commerce': {
    beginner: {
      practical: ['product','cart','checkout','payment','order','inventory','catalog','search','filter','discount','shipping'],
      toolId: ['shopping cart','checkout','payment gateway','product catalog','inventory','order management','SEO','CMS'],
    },
    intermediate: {
      scenario: ['payment gateway','fraud detection','inventory management','recommendation engine','A/B testing','conversion rate','performance'],
      framework: ['product catalog','shopping cart','checkout flow','payment processing','order management','inventory','shipping'],
      coding: ['product','cart','order','payment','inventory','discount','promotion','shipping','tax','currency'],
    },
    expert: {
      scenario: ['scalability','peak traffic','Black Friday','microservices','recommendation AI','personalization','omnichannel','marketplace'],
      mentoring: ['e-commerce architecture','conversion optimization','performance','scalability','payment security'],
      questionnaire: ['conversion rate','customer journey','SEO','mobile commerce','payment security','fraud prevention','personalization'],
    },
  },
  Insurance: {
    beginner: {
      practical: ['policy','premium','claim','coverage','deductible','underwriting','renewal','endorsement','beneficiary'],
      toolId: ['policy management','claims','underwriting','premium','coverage','risk assessment','actuary','renewal'],
    },
    intermediate: {
      scenario: ['claims processing','underwriting','risk assessment','fraud detection','regulatory compliance','Solvency II','IFRS 17'],
      framework: ['policy lifecycle','claims management','underwriting','risk','premium calculation','reinsurance','compliance'],
      coding: ['policy','claim','premium','coverage','deductible','risk score','actuarial','payment','renewal'],
    },
    expert: {
      scenario: ['insurtech','telematics','AI underwriting','claims automation','regulatory Solvency II','IFRS 17','open insurance'],
      mentoring: ['insurance domain','actuarial','risk management','regulatory compliance','claims strategy','digital transformation'],
      questionnaire: ['Solvency II','IFRS 17','Lloyd\'s','reinsurance','telematics','insurtech','fraud detection','risk modeling'],
    },
  },
  Telecom: {
    beginner: {
      practical: ['network','subscriber','call','SMS','data','roaming','billing','SIM','IMSI','MSISDN','GSM','LTE'],
      toolId: ['OSS','BSS','network','subscriber','CDR','billing','provisioning','SIM','IMSI','roaming'],
    },
    intermediate: {
      scenario: ['BSS','OSS','network testing','CDR','billing reconciliation','roaming','SLA','latency','throughput'],
      framework: ['OSS','BSS','CRM','billing','provisioning','network management','SLA','KPI','CDR','mediation'],
      coding: ['CDR','subscriber','network','call','SMS','data','billing','provisioning','roaming','SLA'],
    },
    expert: {
      scenario: ['5G','network slicing','NFV','SDN','edge computing','IoT','eSIM','cloud native','digital transformation'],
      mentoring: ['telecom domain','5G architecture','network testing','OSS/BSS','digital transformation','cloud migration'],
      questionnaire: ['5G','NFV','SDN','network slicing','eSIM','IoT','edge computing','MVNO','roaming architecture'],
    },
  },
  'Functional Testing': {
    beginner: {
      practical: ['test case','test plan','defect','bug','pass','fail','requirement','expected result','actual result','STLC'],
      toolId: ['test case','test plan','defect','STLC','SDLC','equivalence partitioning','boundary value','test suite','smoke test','regression'],
    },
    intermediate: {
      scenario: ['risk-based testing','estimation','defect density','DDE','RTM','test coverage','static testing','inspection','review'],
      framework: ['test strategy','test plan','RTM','test case','test suite','defect lifecycle','test metrics','STLC phases'],
    },
    expert: {
      scenario: ['test strategy','quality metrics','process improvement','test governance','risk management','compliance','audit'],
      mentoring: ['testing best practices','team mentoring','quality culture','process improvement','test automation strategy'],
      questionnaire: ['test strategy','quality metrics','defect prevention','process improvement','governance','compliance','metrics'],
    },
  },
  'Automation Testing': {
    beginner: {
      practical: ['script','automation','test','Selenium','findElement','click','assert','framework','Page Object','locator'],
      toolId: ['Selenium','TestNG','JUnit','Maven','Page Object','XPath','CSS selector','automation','framework','driver'],
    },
    intermediate: {
      scenario: ['Page Object Model','data-driven','keyword-driven','hybrid framework','CI/CD','Jenkins','parallel execution'],
      framework: ['Page Object','factory','abstract','driver','locator','element','wait','assertion','report','data provider'],
      coding: ['WebDriver','By','findElement','click','sendKeys','assert','wait','page','factory','test','annotation'],
    },
    expert: {
      scenario: ['framework architecture','self-healing','AI testing','distributed execution','maintenance strategy','reporting'],
      mentoring: ['automation strategy','framework design','ROI','team enablement','CI/CD integration','best practices'],
      questionnaire: ['automation ROI','test pyramid','self-healing','AI testing','parallel execution','reporting strategy'],
    },
  },
  'Regression Testing': {
    beginner: {
      practical: ['regression','re-test','baseline','defect fix','test suite','smoke','sanity','automated','prioritize','impact'],
      toolId: ['regression suite','test case','automation','baseline','smoke test','impact analysis','prioritization','CI/CD'],
    },
    intermediate: {
      scenario: ['impact analysis','risk-based selection','automation','CI/CD','test data','environment','flaky test','maintenance'],
      framework: ['test suite','prioritization','risk-based','impact analysis','automation','CI/CD','baseline','metrics'],
    },
    expert: {
      scenario: ['regression strategy','predictive analytics','AI test selection','shift-left','production regression','feature flags'],
      mentoring: ['regression strategy','automation coverage','impact analysis','team efficiency','quality gates'],
      questionnaire: ['regression strategy','automation ROI','risk-based selection','CI/CD integration','quality gates'],
    },
  },
  UAT: {
    beginner: {
      practical: ['user acceptance','business requirement','stakeholder','end user','sign-off','use case','user story','alpha','beta'],
      toolId: ['UAT','user story','acceptance criteria','sign-off','stakeholder','business analyst','end user','alpha','beta test'],
    },
    intermediate: {
      scenario: ['acceptance criteria','user journey','business process','stakeholder management','defect triage','sign-off','Go/No-Go'],
      framework: ['acceptance criteria','user story','test scenario','sign-off process','UAT environment','test data','stakeholder'],
    },
    expert: {
      scenario: ['UAT governance','risk management','compliance','audit trail','digital transformation','agile UAT','production validation'],
      mentoring: ['UAT strategy','stakeholder management','acceptance criteria','risk management','quality gates'],
      questionnaire: ['acceptance criteria','stakeholder management','UAT strategy','sign-off process','risk management','compliance'],
    },
  },
  Git: {
    beginner: {
      practical: ['git init','git add','git commit','git push','git pull','git branch','git merge','git clone','git status','git log'],
      toolId: ['repository','commit','branch','merge','pull request','remote','origin','HEAD','staging','working directory'],
    },
    intermediate: {
      scenario: ['branching strategy','merge conflict','rebase','cherry-pick','stash','tag','release','Gitflow','GitHub Flow','trunk-based'],
      framework: ['Gitflow','GitHub Flow','trunk-based development','feature branch','hotfix','release branch','tag','semantic versioning'],
      coding: ['git rebase','git cherry-pick','git stash','git tag','git bisect','git reflog','git submodule'],
    },
    expert: {
      scenario: ['monorepo','large repository','CI/CD integration','security','signed commits','code review','automation','hook'],
      mentoring: ['git workflow','branching strategy','code review process','CI/CD integration','team practices'],
      questionnaire: ['Gitflow vs trunk-based','monorepo','submodule','signed commits','git internals','DAG','pack files'],
    },
  },
  Jenkins: {
    beginner: {
      practical: ['pipeline','stage','step','job','build','agent','node','plugin','trigger','artifact','workspace','Groovy'],
      toolId: ['Jenkins','pipeline','stage','step','job','plugin','agent','Groovy','Jenkinsfile','build'],
    },
    intermediate: {
      scenario: ['Jenkinsfile','declarative','scripted','shared library','multibranch','Blue Ocean','SonarQube','Nexus','Docker'],
      framework: ['declarative pipeline','stage','step','agent','environment','parameters','triggers','post','archive','credentials'],
      coding: ['pipeline','agent','stages','stage','steps','step','post','environment','parameters','tools','when','parallel'],
    },
    expert: {
      scenario: ['Jenkins at scale','distributed builds','Kubernetes','cloud agents','security','RBAC','audit','compliance'],
      mentoring: ['CI/CD strategy','pipeline design','Jenkins best practices','security','scalability','maintenance'],
      questionnaire: ['Jenkins vs GitLab CI','Kubernetes agents','security model','shared libraries','pipeline optimization'],
    },
  },
  Docker: {
    beginner: {
      practical: ['docker build','docker run','docker pull','docker push','Dockerfile','image','container','FROM','RUN','CMD','COPY'],
      toolId: ['Docker','container','image','Dockerfile','registry','Docker Hub','volume','network','compose','layer'],
    },
    intermediate: {
      scenario: ['Docker Compose','networking','volume','multi-stage build','registry','security','Docker Swarm','Kubernetes'],
      framework: ['FROM','RUN','COPY','ADD','EXPOSE','ENV','CMD','ENTRYPOINT','WORKDIR','USER','ARG','VOLUME'],
      coding: ['FROM','RUN','COPY','EXPOSE','ENV','CMD','ENTRYPOINT','WORKDIR','USER','multi-stage','ARG'],
    },
    expert: {
      scenario: ['Docker security','rootless','distroless','Kubernetes','container orchestration','registry','CI/CD','GitOps','supply chain'],
      mentoring: ['containerization strategy','Docker best practices','security','Kubernetes migration','CI/CD integration'],
      questionnaire: ['container security','rootless Docker','distroless','image optimization','orchestration','registry security'],
    },
  },
  'Azure DevOps': {
    beginner: {
      practical: ['pipeline','board','repository','artifact','release','sprint','work item','backlog','test plan','build'],
      toolId: ['Azure DevOps','pipeline','board','repository','artifact','release','sprint','YAML','agent','trigger'],
    },
    intermediate: {
      scenario: ['YAML pipeline','stage','job','step','environment','approval','gate','artifact','service connection','variable group'],
      framework: ['YAML pipeline','stage','job','step','task','trigger','pool','environment','artifact','variable'],
      coding: ['trigger','pool','stages','stage','jobs','job','steps','task','variables','environment','artifacts'],
    },
    expert: {
      scenario: ['multi-stage deployment','Kubernetes','blue-green','canary','compliance','security scanning','governance','enterprise'],
      mentoring: ['DevOps transformation','pipeline design','deployment strategy','governance','security','compliance'],
      questionnaire: ['DevOps maturity','deployment strategies','blue-green','canary','compliance','security scanning','governance'],
    },
  },
  'ChatGPT/Prompt Engineering': {
    beginner: {
      practical: ['prompt','instruction','role','context','format','constraint','temperature','token','model','AI','GPT','LLM'],
      toolId: ['prompt','temperature','tokens','system message','user message','assistant','GPT-4','Claude','Gemini','fine-tuning'],
    },
    intermediate: {
      scenario: ['chain of thought','few-shot','zero-shot','RAG','context window','hallucination','grounding','evaluation','safety'],
      framework: ['system prompt','user message','few-shot examples','chain of thought','output format','constraints','role','context'],
      coding: ['prompt','messages','role','content','temperature','max_tokens','system','user','assistant','completion'],
    },
    expert: {
      scenario: ['LLM architecture','fine-tuning','RLHF','RAG system','multi-agent','hallucination mitigation','evaluation framework','safety'],
      mentoring: ['prompt engineering best practices','AI literacy','responsible AI','evaluation','bias mitigation','governance'],
      questionnaire: ['fine-tuning vs RAG','hallucination','evaluation metrics','AI safety','responsible AI','bias','governance'],
    },
  },
  'AI Test Automation': {
    beginner: {
      practical: ['AI','ML','test generation','self-healing','anomaly detection','visual testing','test oracle','automation'],
      toolId: ['Applitools','Testim','Mabl','Functionize','Healenium','self-healing','visual AI','test generation','AI testing'],
    },
    intermediate: {
      scenario: ['self-healing locator','visual regression','test generation','anomaly detection','ML model testing','LLM testing'],
      framework: ['AI testing platform','self-healing','visual AI','NLP test generation','test oracle','coverage optimization'],
      coding: ['Applitools Eyes','Testim','visual assertion','AI locator','self-healing','API','configuration'],
    },
    expert: {
      scenario: ['AI testing strategy','test oracle problem','coverage optimization','LLM validation','AI bias testing','model evaluation'],
      mentoring: ['AI testing adoption','team enablement','tool evaluation','ROI','best practices','quality engineering'],
      questionnaire: ['AI testing landscape','test oracle problem','self-healing limitations','LLM testing','responsible AI testing'],
    },
  },
};
