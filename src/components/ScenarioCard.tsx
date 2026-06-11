import React from 'react';
import { t } from '../i18n';

interface Scenario {
  skill: string;
  scenario: string;
  question: string;
  followUps?: string[];
}

interface Props {
  scenario: Scenario;
}

const ScenarioCard: React.FC<Props> = ({ scenario }) => {
  return (
    <div className="glass" style={{ padding: 20, borderRadius: 16, marginBottom: 24, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#3B82F6' }}>{t('Scenario')}</h3>
      <p style={{ margin: '8px 0', color: '#555' }}>{scenario.scenario}</p>
      <p style={{ fontWeight: 600, marginTop: 12 }}>{t('Prompt')}</p>
      <p style={{ color: '#333' }}>{scenario.question}</p>
    </div>
  );
};

export default ScenarioCard;
