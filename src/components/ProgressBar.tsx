import React from 'react';
import { t } from '../i18n';

interface Props {
  total: number;
  current: number;
  onSelect: (idx: number) => void;
}

const ProgressBar: React.FC<Props> = ({ total, current, onSelect }) => {
  const circles = [];
  for (let i = 0; i < total; i++) {
    const isActive = i === current;
    circles.push(
      <div
        key={i}
        onClick={() => onSelect(i)}
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: isActive ? '#8B5CF6' : '#ddd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 12,
          cursor: 'pointer',
          marginRight: i < total - 1 ? 8 : 0,
        }}
        aria-label={`${t('Question')} ${i + 1}`}
      >
        Q{i + 1}
      </div>
    );
    if (i < total - 1) {
      circles.push(
        <div
          key={`line-${i}`}
          style={{
            flex: 1,
            height: 2,
            background: '#ccc',
            marginRight: 8,
          }}
        />
      );
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
      {circles}
    </div>
  );
};

export default ProgressBar;
