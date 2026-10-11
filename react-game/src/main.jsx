import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import VerticalApp from './vertical/VerticalApp.jsx';
import PointsRaceApp from './points-race/PointsRaceApp.jsx';

const params = new URLSearchParams(window.location.search);
const view = params.get('view');

const renderApp = () => {
  if (view === 'points-race') return <PointsRaceApp />;
  if (view === 'vertical') return <VerticalApp />;
  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {renderApp()}
  </React.StrictMode>
);
