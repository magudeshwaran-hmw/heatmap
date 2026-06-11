import React, { useEffect, useState } from 'react';
import { generateAdaptiveQuestionAI, evaluateAdaptiveAnswerAI } from '../lib/expertPathAI';
import ScenarioCard from './ScenarioCard';
import ProgressBar from './ProgressBar';
import QuestionCard from './QuestionCard';
import { t } from '../i18n'; // assuming translation helper

interface AdaptiveQuestion {
  id: string;
  question: string;
  followUps?: string[];
}

interface Scenario {
  skill: string;
  scenario: string;
  question: string;
  followUps?: string[];
}

interface Props {
  expertProfile: any; // profile object used by AI
  onComplete: (answers: {question: string; answer: string; evaluation?: any}[]) => void;
}

const TOTAL_QUESTIONS = 4;

const ExpertDiscussionWorkspace: React.FC<Props> = ({ expertProfile, onComplete }) => {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [questions, setQuestions] = useState<AdaptiveQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>(Array(TOTAL_QUESTIONS).fill(''));
  const [evaluations, setEvaluations] = useState<any[]>(Array(TOTAL_QUESTIONS).fill(undefined));
  const [loading, setLoading] = useState(true);

  // Initialise by fetching the first scenario & question
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const res = await generateAdaptiveQuestionAI(expertProfile);
        // If the API returns a full set, we treat it as the first step
        const first: AdaptiveQuestion = {
          id: 'q0',
          question: res.question,
          followUps: res.followUps,
        };
        setScenario({
          skill: res.skill,
          scenario: res.scenario,
          question: res.question,
          followUps: res.followUps,
        });
        setQuestions([first]);
      } catch (e) {
        console.error('Failed to generate scenario', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [expertProfile]);

  // Fetch next question when moving forward and question not yet loaded
  const fetchNext = async (idx: number) => {
    if (questions[idx]) return; // already have
    try {
      const res = await generateAdaptiveQuestionAI(expertProfile);
      const q: AdaptiveQuestion = {
        id: `q${idx}`,
        question: res.question,
        followUps: res.followUps,
      };
      setQuestions(prev => {
        const copy = [...prev];
        copy[idx] = q;
        return copy;
      });
    } catch (e) {
      console.error('Failed to fetch next question', e);
    }
  };

  const handleAnswerChange = (text: string) => {
    setAnswers(prev => {
      const copy = [...prev];
      copy[currentIdx] = text;
      return copy;
    });
  };

  const handleNext = async () => {
    // Evaluate current answer
    const currentQ = questions[currentIdx];
    if (currentQ) {
      try {
        // Determine a default question type and experience band for evaluation
        const defaultQuestionType = 'Technical' as const; // could be derived from scenario if needed
        const expBand = '8-10 Years' as const; // fallback experience band
        const evalRes = await evaluateAdaptiveAnswerAI(currentQ.question, answers[currentIdx], defaultQuestionType, expBand);
        setEvaluations(prev => {
          const copy = [...prev];
          copy[currentIdx] = evalRes;
          return copy;
        });
      } catch (e) {
        console.error('Evaluation error', e);
      }
    }
    if (currentIdx + 1 < TOTAL_QUESTIONS) {
      setCurrentIdx(currentIdx + 1);
      await fetchNext(currentIdx + 1);
    } else {
      // Completed all questions – submit
      const payload = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i],
        evaluation: evaluations[i],
      }));
      onComplete(payload);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>{t('Loading discussion...')}</div>;
  }

  return (
    <div className="glass" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      {scenario && <ScenarioCard scenario={scenario} />}
      <ProgressBar total={TOTAL_QUESTIONS} current={currentIdx} onSelect={setCurrentIdx} />
      {questions[currentIdx] && (
        <QuestionCard
          question={questions[currentIdx]}
          answer={answers[currentIdx]}
          onChange={handleAnswerChange}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button
          disabled={currentIdx === 0}
          onClick={handlePrev}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #3B82F6',
            background: '#fff',
            color: '#3B82F6',
            cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {t('Previous')}
        </button>
        <button
          onClick={handleNext}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: currentIdx === TOTAL_QUESTIONS - 1 ? '#10B981' : '#3B82F6',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {currentIdx === TOTAL_QUESTIONS - 1 ? t('Submit') : t('Next')}
        </button>
      </div>
    </div>
  );
};

export default ExpertDiscussionWorkspace;
