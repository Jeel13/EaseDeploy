import React from 'react';

export const Input = ({ value, onChange, disabled, type, placeholder }) => {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
};
