import React, { useState, useEffect } from 'react';
import { t } from '../i18n';

interface Question {
  question: string;
  followUps?: string[];
}

interface QuestionCardProps {
  question: Question;
  answer: string;
  onChange: (text: string) => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, answer, onChange }) => {
  const [visible, setVisible] = useState(false);

  // Trigger fade‑in when the question changes
  useEffect(() => {
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, [question]);

  return (
    <div
      className="glass"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease-in-out',
        padding: 24,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)',
        marginTop: 20,
      }}
    >
      <h3 style={{ margin: '0 0 12px', color: '#8B5CF6', fontSize: 18 }}>{question.question}</h3>
      <textarea
        value={answer}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('Your answer...')}
        rows={5}
        style={{
          width: '100%',
          resize: 'vertical',
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid rgba(139,92,246,0.25)',
          background: 'rgba(255,255,255,0.05)',
          color: '#fff',
          fontFamily: "'Inter',sans-serif",
          fontSize: 14,
        }}
      />
    </div>
  );
};

export default QuestionCard;
