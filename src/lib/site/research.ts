/**
 * Single source of truth for every third-party research claim shown on the site.
 * Each entry was checked against its primary source (October 2026). UI copy must
 * reference these records rather than restating figures inline.
 */
export type ResearchCategory =
  | "Recruitment discrimination"
  | "Candidate trust"
  | "AI recruitment regulation"
  | "Responsible AI guidance"
  | "Audit methodology";

export interface ResearchEntry {
  id: string;
  title: string;
  publisher: string;
  date: string; // display date as published
  isoDate: string; // for sorting
  geography: string;
  population?: string;
  sampleSize?: string;
  method: string;
  keyFinding: string;
  /** Headline statistic for stat cards, worded to match the source. */
  stat?: { value: string; label: string };
  limitations: string[];
  url: string;
  category: ResearchCategory;
}

export const RESEARCH: ResearchEntry[] = [
  {
    id: "ciphr-2025-turned-down",
    title: "Nearly half of UK adults have experienced workplace discrimination",
    publisher: "Ciphr (survey by OnePoll)",
    date: "10 February 2025",
    isoDate: "2025-02-10",
    geography: "United Kingdom",
    population: "UK adults (18+), nationally representative by age, gender and region",
    sampleSize: "4,000",
    method: "Online survey; fieldwork 31 Jul–5 Aug and 5–13 Nov 2024",
    keyFinding: "39% believe they have been turned down for a job they were qualified for due to discrimination of some kind during the recruitment process.",
    stat: { value: "39%", label: "of 4,000 surveyed UK adults believe they were turned down for a job they were qualified for because of discrimination" },
    limitations: [
      "Self-reported perception, not legally established discrimination.",
      "Commissioned by an HR software vendor.",
      "Does not measure any specific screening tool or AI system.",
    ],
    url: "https://www.ciphr.com/press-releases/nearly-half-of-uk-adults-have-experienced-workplace-discrimination",
    category: "Recruitment discrimination",
  },
  {
    id: "ciphr-2025-ethnic-minority",
    title: "Workplace discrimination statistics (infographic)",
    publisher: "Ciphr (survey by OnePoll)",
    date: "February 2025, updated 6 March 2025",
    isoDate: "2025-03-06",
    geography: "United Kingdom",
    population: "Respondents from ethnic minorities (excluding white minorities), within a survey of UK adults",
    sampleSize: "4,000 (whole survey)",
    method: "Online survey",
    keyFinding: "65% of surveyed respondents from ethnic minorities (excluding white minorities) say they have experienced some form of discrimination when applying for a new job.",
    stat: { value: "65%", label: "of surveyed respondents from ethnic minorities (excluding white minorities) report discrimination when applying for a job" },
    limitations: [
      "Self-reported experience, not legally established discrimination.",
      "Subgroup sample size is smaller than the 4,000 total.",
      "Does not attribute the experience to any particular hiring method or technology.",
    ],
    url: "https://www.ciphr.com/infographics/workplace-discrimination-statistics",
    category: "Recruitment discrimination",
  },
  {
    id: "ico-2024-ai-recruitment",
    title: "ICO intervention into AI recruitment tools leads to better data protection for job seekers",
    publisher: "Information Commissioner's Office (UK)",
    date: "6 November 2024",
    isoDate: "2024-11-06",
    geography: "United Kingdom",
    population: "Providers and developers of AI-powered sourcing, screening and selection tools",
    method: "Consensual regulatory audits",
    keyFinding:
      "The ICO audited several providers and developers of AI recruitment tools and made almost 300 recommendations. Concerns included tools that let recruiters filter out candidates with certain protected characteristics and tools inferring gender and ethnicity from a candidate's name.",
    stat: { value: "~300", label: "recommendations made by the UK ICO after auditing AI recruitment-tool providers and developers" },
    limitations: ["Covers the audited organisations only; findings are not a census of the market.", "Focuses on data protection rather than measuring hiring outcomes."],
    url: "https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2024/11/ico-intervention-into-ai-recruitment-tools-leads-to-better-data-protection-for-job-seekers",
    category: "AI recruitment regulation",
  },
  {
    id: "ico-2024-overview-report",
    title: "AI tools used in recruitment (overview report)",
    publisher: "Information Commissioner's Office (UK)",
    date: "6 November 2024",
    isoDate: "2024-11-06",
    geography: "United Kingdom",
    population: "Developers and providers of AI sourcing, screening and selection tools",
    method: "Overview report drawing on consensual audit engagements",
    keyFinding: "Sets out the regulator's observations and recommendations for AI recruitment tools, noting their use can create risks for people's privacy and information rights.",
    limitations: ["Regulatory guidance rather than outcome measurement."],
    url: "https://ico.org.uk/action-weve-taken/audits-and-overview-reports/2024/11/ai-tools-in-recruitment/",
    category: "AI recruitment regulation",
  },
  {
    id: "prospects-ise-2026",
    title: "Students use AI to compete, yet oppose AI assessment",
    publisher: "Institute of Student Employers (article by Prospects at Jisc)",
    date: "4 June 2026",
    isoDate: "2026-06-04",
    geography: "United Kingdom",
    population: "Students and graduates",
    sampleSize: "5,000 (Prospects Early Careers Survey)",
    method: "Survey",
    keyFinding: "46% had used AI to write a CV or cover letter, but only 38% thought it was acceptable for AI to be used to screen the CV.",
    stat: { value: "38%", label: "of 5,000 surveyed students and graduates thought it was OK for AI to screen CVs" },
    limitations: ["Early-career population only.", "Measures attitudes, not outcomes or accuracy of AI screening."],
    url: "https://ise.org.uk/knowledge/insights/569/students_use_ai_to_compete_yet_oppose_ai_assessment",
    category: "Candidate trust",
  },
  {
    id: "dsit-2024-responsible-ai-recruitment",
    title: "Responsible AI in Recruitment guide",
    publisher: "Department for Science, Innovation and Technology (UK)",
    date: "25 March 2024",
    isoDate: "2024-03-25",
    geography: "United Kingdom",
    method: "Government guidance",
    keyFinding: "Non-technical guidance on assuring AI tools used across the hiring process, noting risks such as perpetuating existing biases.",
    limitations: ["Guidance, not a statutory requirement or empirical study."],
    url: "https://www.gov.uk/government/publications/responsible-ai-in-recruitment-guide",
    category: "Responsible AI guidance",
  },
  {
    id: "bertrand-mullainathan-2004",
    title: "Are Emily and Greg More Employable Than Lakisha and Jamal? A Field Experiment on Labor Market Discrimination",
    publisher: "American Economic Review 94(4): 991–1013 (Bertrand & Mullainathan)",
    date: "2004",
    isoDate: "2004-09-01",
    geography: "United States (Boston and Chicago)",
    population: "Responses to help-wanted adverts",
    method: "Field experiment with fictitious CVs (correspondence test)",
    keyFinding: "CVs with White-sounding names received 50 percent more callbacks for interviews than otherwise comparable CVs with African-American-sounding names.",
    limitations: ["Human recruiters, not AI tools.", "US labour market in 2001–2002.", "Names act as a signal; the study does not infer any real person's identity."],
    url: "https://www.aeaweb.org/articles?id=10.1257/0002828042002561",
    category: "Audit methodology",
  },
  {
    id: "nyc-ll144",
    title: "Automated Employment Decision Tools (Local Law 144 of 2021)",
    publisher: "NYC Department of Consumer and Worker Protection",
    date: "Enforced from 5 July 2023",
    isoDate: "2023-07-05",
    geography: "New York City, United States",
    method: "Local law and rules",
    keyFinding: "Employers may not use an automated employment decision tool unless it has had an independent bias audit within one year of use, a summary of results is public, and candidates receive notice.",
    limitations: ["Applies only within New York City's jurisdiction."],
    url: "https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page",
    category: "AI recruitment regulation",
  },
  {
    id: "eu-ai-act",
    title: "Regulation (EU) 2024/1689 (Artificial Intelligence Act)",
    publisher: "European Parliament and Council of the EU",
    date: "13 June 2024",
    isoDate: "2024-06-13",
    geography: "European Union",
    method: "Regulation",
    keyFinding: "Annex III lists AI systems intended for recruitment or selection — including analysing and filtering applications and evaluating candidates — as high-risk.",
    limitations: ["Obligations phase in over several years; applies within the EU's scope."],
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    category: "AI recruitment regulation",
  },
  {
    id: "uniform-guidelines-1607",
    title: "Uniform Guidelines on Employee Selection Procedures, 29 CFR 1607.4(D)",
    publisher: "US federal agencies (EEOC et al.)",
    date: "1978",
    isoDate: "1978-08-25",
    geography: "United States",
    method: "Federal regulation",
    keyFinding: "Origin of the \"four-fifths\" rule: a selection rate below 80% of the highest group's rate is generally regarded as evidence of adverse impact — a rule of thumb, not a definitive test.",
    limitations: ["US guidance; it is not a UK legal test.", "Sensitive to small samples, which is why DeepTrace pairs it with confidence intervals and significance tests."],
    url: "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XIV/part-1607/section-1607.4",
    category: "Audit methodology",
  },
  {
    id: "equality-act-2010",
    title: "Equality Act 2010",
    publisher: "UK Parliament (legislation.gov.uk)",
    date: "2010",
    isoDate: "2010-04-08",
    geography: "Great Britain",
    method: "Primary legislation",
    keyFinding: "Defines the protected characteristics and prohibits direct and indirect discrimination, including in recruitment.",
    limitations: ["Whether discrimination occurred is a legal question that statistics alone cannot settle."],
    url: "https://www.legislation.gov.uk/ukpga/2010/15/contents",
    category: "Responsible AI guidance",
  },
];

export const HEADLINE_STATS = ["ciphr-2025-turned-down", "ciphr-2025-ethnic-minority", "prospects-ise-2026", "ico-2024-ai-recruitment"].map(
  (id) => RESEARCH.find((r) => r.id === id)!,
);

export const RESEARCH_CATEGORIES: ResearchCategory[] = [
  "Recruitment discrimination",
  "Candidate trust",
  "AI recruitment regulation",
  "Responsible AI guidance",
  "Audit methodology",
];
