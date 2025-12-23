import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// 全局错误捕获，用于处理 React 渲染前的错误
window.onerror = function(message, source, lineno, colno, error) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; background: #fee; color: #c00; padding: 20px; z-index: 9999; white-space: pre-wrap; border-bottom: 1px solid #f00;';
  errorDiv.textContent = `Global Error: ${message}\nLocation: ${source}:${lineno}:${colno}\nStack: ${error?.stack}`;
  document.body.appendChild(errorDiv);
  return false;
};

window.onunhandledrejection = function(event) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 100%; background: #fe9; color: #330; padding: 20px; z-index: 9999; white-space: pre-wrap; border-top: 1px solid #cc0;';
  errorDiv.textContent = `Unhandled Rejection: ${event.reason}`;
  document.body.appendChild(errorDiv);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);