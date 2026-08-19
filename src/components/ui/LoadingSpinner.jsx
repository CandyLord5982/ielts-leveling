import React from 'react';
import styled from 'styled-components';

const LoadingSpinner = ({ size = 'md', text = 'Đang tải...' }) => {
  const sizeMap = {
    sm: '24px',
    md: '48px',
    lg: '64px',
    xl: '80px'
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80dvh]">
      <StyledWrapper size={sizeMap[size]}>
        <div className="loader" />
      </StyledWrapper>
      {text && (
        <p className="mt-4 text-gray-600 font-medium">{text}</p>
      )}
    </div>
  );
}

const StyledWrapper = styled.div`
  .loader {
    width: ${props => props.size || '48px'};
    height: ${props => props.size || '48px'};
    margin: auto;
    position: relative;
  }

  .loader:before {
    content: '';
    width: ${props => props.size || '48px'};
    height: 5px;
    background: #999;
    position: absolute;
    top: 70px;
    left: 0;
    border-radius: 50%;
    animation: shadow324 0.5s linear infinite;
  }

  .loader:after {
    content: '';
    width: 100%;
    height: 100%;
    background: rgb(61, 106, 255);
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 4px;
    animation: jump7456 0.5s linear infinite;
  }

  @keyframes jump7456 {
    15% {
      border-bottom-right-radius: 3px;
    }

    25% {
      transform: translateY(5px) rotate(22.5deg);
    }

    50% {
      transform: translateY(10px) scale(1, .9) rotate(45deg);
      border-bottom-right-radius: 40px;
    }

    75% {
      transform: translateY(5px) rotate(67.5deg);
    }

    100% {
      transform: translateY(0) rotate(90deg);
    }
  }

  @keyframes shadow324 {
    0%,
    100% {
      transform: scale(1, 1);
    }

    50% {
      transform: scale(1.2, 1);
    }
  }
`;

export default LoadingSpinner;
