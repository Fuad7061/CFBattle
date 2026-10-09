import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import VerticalApp from './vertical/VerticalApp.jsx';

const params = new URLSearchParams(window.location.search);
const isVertical = params.get('view') === 'vertical';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isVertical ? <VerticalApp /> : <App />}
  </React.StrictMode>
);
