import React from 'react';

export const Button = ({ onClick, disabled, className, children }) => {
  return (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};
